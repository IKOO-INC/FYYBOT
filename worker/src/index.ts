import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidGroup,
  makeCacheableSignalKeyStore,
  type Contact,
  type GroupMetadata,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys'
import type { Boom } from '@hapi/boom'
import pino from 'pino'
import os from 'node:os'
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import QRCode from 'qrcode'
import { ObjectId, type Collection, type Db, type Document } from 'mongodb'
import { config, assertConfig } from './config'
import { COL, closeDb, db, ensureIndexes } from './db'
import { useMongoAuthState, type MongoAuthState } from './auth-state'
import { backoffDelay } from './backoff'
import {
  binaryToBuffer,
  messagePreview,
  messageTimestamp,
  normalizeMessage,
  type MediaInfo,
} from './normalize'

assertConfig()

const logger = pino({ level: config.logLevel })
const log = (...args: unknown[]) => console.log('[worker]', ...args)

let sock: WASocket | null = null
let authState: MongoAuthState | null = null
let starting = false
let stopping = false
let meId: string | null = null
let reconnectAttempts = 0
let reconnectTimer: NodeJS.Timeout | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let commandTimer: NodeJS.Timeout | null = null
let commandsRunning = false
let qrCount = 0
const LOCK_ID = 'worker'
let lockFailures = 0
// Keamanan sesi
let gaveUp = false
let expectLogout = false
let authRejectAt: number[] = []
const AUTH_REJECT_WINDOW_MS = 10 * 60_000

const contactNames = new Map<string, string>()
const chatNameCheckedAt = new Map<string, number>()
let groupSyncAt = 0
const groupCache = new Map<string, { data: GroupMetadata; ts: number }>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function phoneOf(jid?: string | null) {
  if (!jid) return null
  return jid.split('@')[0]?.split(':')[0] || null
}

function clean<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item
  }
  return out as T
}

async function collections(): Promise<{
  database: Db
  session: Collection<any>
  chats: Collection<any>
  messages: Collection<any>
  contacts: Collection<any>
  commands: Collection<any>
  media: Collection<any>
  uploads: Collection<any>
}> {
  const database = await db()
  return {
    database,
    session: database.collection(COL.session),
    chats: database.collection(COL.chats),
    messages: database.collection(COL.messages),
    contacts: database.collection(COL.contacts),
    commands: database.collection(COL.commands),
    media: database.collection(COL.media),
    uploads: database.collection(COL.uploads),
  }
}

async function writeStatus(
  set: Record<string, unknown>,
  unset: Record<string, ''> = {},
  inc: Record<string, number> = {},
) {
  const { session } = await collections()
  // MongoDB menolak ($set + $unset pada field yang sama → "conflict at 'qr'").
  // Buang key yang ada di `unset` (dan `inc`) dari `$set`.
  const removed = new Set([...Object.keys(unset), ...Object.keys(inc)])
  const writable = Object.fromEntries(Object.entries(set).filter(([key]) => !removed.has(key)))
  const update: Record<string, unknown> = {
    $set: clean({
      ...writable,
      workerId: config.workerId,
      workerVersion: config.version,
      workerAt: Date.now(),
    }),
  }
  if (Object.keys(unset).length) update.$unset = unset
  if (Object.keys(inc).length) update.$inc = inc
  await session.updateOne({ _id: 'session' }, update, { upsert: true })
}

/**
 * QR dari Baileys hanya ditulis saat event `connection.update` membawa `qr`.
 * Setiap QR punya masa berlaku (60 detik untuk yang pertama, 20 detik untuk
 * berikutnya). Kalau tidak ada QR baru sebelum kedaluwarsa, QR lama dibersihkan
 * agar panel tidak pernah menampilkan QR basi.
 */
async function sweepEphemeral() {
  try {
    const { session } = await collections()
    const now = Date.now()
    await session.updateOne(
      { _id: 'session', qr: { $type: 'string' }, qrExpiresAt: { $lt: now - 2500 } },
      { $unset: { qr: '', qrExpiresAt: '' } },
    )
    await session.updateOne(
      { _id: 'session', pairingCode: { $type: 'string' }, pairingExpiresAt: { $lt: now - 2000 } },
      { $unset: { pairingCode: '', pairingAt: '', pairingExpiresAt: '' } },
    )
  } catch (err) {
    logger.debug({ err }, 'ephemeral sweep failed')
  }
}

/* ------------------------------------------------------------------ */
/* Single-worker lock (wa_locks)                                       */
/* ------------------------------------------------------------------ */

type LockDoc = {
  _id: string
  owner?: string
  host?: string
  expiresAt?: number
  updatedAt?: number
}

async function locksCollection() {
  const { database } = await collections()
  return database.collection<LockDoc>(COL.locks)
}

async function acquireLock(): Promise<boolean> {
  if (config.disableLock) return true
  const locks = await locksCollection()
  const now = Date.now()
  const existing = await locks.findOne({ _id: LOCK_ID })
  if (existing && existing.owner !== config.workerId && Number(existing.expiresAt || 0) > now) {
    return false
  }
  await locks.updateOne(
    { _id: LOCK_ID },
    { $set: { owner: config.workerId, host: os.hostname(), expiresAt: now + config.lockTtlMs, updatedAt: now } },
    { upsert: true },
  )
  return true
}

async function renewLock(): Promise<boolean> {
  if (config.disableLock) return true
  const locks = await locksCollection()
  const result = await locks.updateOne(
      { _id: LOCK_ID, owner: config.workerId },
      { $set: { expiresAt: Date.now() + config.lockTtlMs, updatedAt: Date.now() } },
    )
  return result.matchedCount === 1
}

async function releaseLock() {
  if (config.disableLock) return
  try {
    const locks = await locksCollection()
    await locks.deleteOne({ _id: LOCK_ID, owner: config.workerId })
  } catch {
    /* ignore */
  }
}

async function waitForLock(timeoutMs: number) {
  const started = Date.now()
  let attempts = 0
  while (Date.now() - started < timeoutMs) {
    if (await acquireLock()) return true
    attempts += 1
    if (attempts === 1) {
      log('worker lain sedang memegang lock, menunggu giliran…')
    }
    await sleep(5000)
  }
  return false
}

async function waitForSocket(timeoutMs = 20_000) {
  const started = Date.now()
  while (!sock && !stopping && Date.now() - started < timeoutMs) {
    await sleep(300)
  }
  if (!sock) throw new Error('Worker belum siap membuat socket WhatsApp. Coba lagi beberapa detik.')
  return sock
}

/* ------------------------------------------------------------------ */
/* Chats & contacts                                                    */
/* ------------------------------------------------------------------ */

async function ensureChat(jid: string, opts: { name?: string; isGroup?: boolean } = {}) {
  const { chats } = await collections()
  const patch = clean({
    isGroup: opts.isGroup ?? isJidGroup(jid) ?? false,
    updatedAt: Date.now(),
  })
  const update: Record<string, unknown> = { $set: patch, $setOnInsert: { unread: 0, lastTs: 0 } }
  await chats.updateOne({ _id: jid }, update, { upsert: true })
  if (opts.name) {
    const existing = await chats.findOne({ _id: jid }, { projection: { name: 1 } })
    const current = typeof existing?.name === 'string' ? existing.name : ''
    if (!current || current === jid || /^\d+$/.test(current)) {
      await chats.updateOne({ _id: jid }, { $set: { name: opts.name } })
    }
  }
}

async function touchChat(opts: {
  jid: string
  ts: number
  preview: string
  type: string
  fromMe: boolean
  isGroup: boolean
  name?: string
  incUnread?: boolean
}) {
  const { chats } = await collections()
  const existing = await chats.findOne({ _id: opts.jid })
  const patch: Record<string, unknown> = { updatedAt: Date.now() }

  if (!existing || opts.ts >= Number(existing.lastTs || 0)) {
    patch.lastTs = opts.ts
    patch.lastText = opts.preview
    patch.lastFromMe = opts.fromMe
    patch.lastType = opts.type
  }
  if (opts.name) {
    const current = typeof existing?.name === 'string' ? existing.name : ''
    if (!current || current === opts.jid || /^\d+$/.test(current)) patch.name = opts.name
  }

  const update: Record<string, unknown> = {
    $set: clean(patch),
    $setOnInsert: clean({ unread: 0, isGroup: opts.isGroup, name: opts.name || undefined }),
  }
  if (opts.incUnread) update.$inc = { unread: 1 }
  await chats.updateOne({ _id: opts.jid }, update, { upsert: true })
}

async function rememberContact(jid: string, name?: string | null) {
  if (!jid || !name) return
  contactNames.set(jid, name)
  const { contacts } = await collections()
  await contacts.updateOne(
    { _id: jid },
    { $set: { name, updatedAt: Date.now() } },
    { upsert: true },
  )
}

async function cachedGroupMetadata(jid: string) {
  const cached = groupCache.get(jid)
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.data
  if (!sock) return undefined
  try {
    const data = await sock.groupMetadata(jid)
    groupCache.set(jid, { data, ts: Date.now() })
    if (data?.subject) {
      const { chats } = await collections()
      await chats.updateOne({ _id: jid }, { $set: { name: data.subject, isGroup: true } }, { upsert: true })
    }
    return data
  } catch {
    return cached?.data
  }
}

/* ------------------------------------------------------------------ */
/* Sinkronisasi nama chat (grup + 1:1)                                 */
/* ------------------------------------------------------------------ */

/**
 * Ambil semua grup yang diikuti (satu panggilan) lalu isi `wa_chats.name`.
 * Ini yang membuat grup tidak lagi tampil sebagai angka panjang meski
 * belum ada pesan baru di grup tersebut.
 */
async function syncAllGroupNames(reason: 'open' | 'manual' = 'manual') {
  if (!sock) return { groups: 0, total: 0, skipped: true }
  if (reason === 'open' && Date.now() - groupSyncAt < 30 * 60_000) {
    return { groups: 0, total: 0, skipped: true }
  }
  groupSyncAt = Date.now()

  const map = await sock.groupFetchAllParticipating().catch((err) => {
    logger.debug({ err }, 'groupFetchAllParticipating gagal')
    return null
  })
  if (!map) return { groups: 0, total: 0, skipped: false }

  const groups = Object.values(map).filter((group) => group?.id && group?.subject)
  if (!groups.length) return { groups: 0, total: 0, skipped: false }

  const { chats } = await collections()
  const ops = groups.map((group) => ({
    updateOne: {
      filter: { _id: group.id },
      // tanpa upsert: jangan bikin baris chat kosong untuk grup yang belum ada
      update: { $set: { name: group.subject, isGroup: true, updatedAt: Date.now() } },
      upsert: false,
    },
  }))

  let updated = 0
  for (let index = 0; index < ops.length; index += 200) {
    const result = await chats.bulkWrite(ops.slice(index, index + 200), { ordered: false }).catch(() => null)
    updated += result?.modifiedCount || 0
  }
  log(`sinkron nama grup (${reason}): ${updated} diperbarui dari ${groups.length} grup`)
  return { groups: updated, total: groups.length, skipped: false }
}

/** Isi nama chat 1:1 dari `pushName` pesan terakhir bila wa_contacts kosong. */
async function backfillNamesFromMessages(limit = 400) {
  const { messages, chats } = await collections()
  const rows = await messages
    .aggregate<{ _id: string; name?: string }>([
      { $match: { senderName: { $type: 'string' }, jid: { $not: /@g\.us$/ } } },
      { $sort: { ts: -1 } },
      { $group: { _id: '$jid', name: { $first: '$senderName' } } },
      { $limit: limit },
    ])
    .toArray()

  const ops = rows
    .filter((row) => row._id && row.name && !/^\d+$/.test(String(row.name)))
    .map((row) => ({
      updateOne: {
        filter: {
          _id: row._id,
          $or: [{ name: { $exists: false } }, { name: null }, { name: '' }, { name: /^\d+$/ }],
        },
        update: { $set: { name: String(row.name) } },
      },
    }))

  if (!ops.length) return { updated: 0, total: rows.length }
  let updated = 0
  for (let index = 0; index < ops.length; index += 200) {
    const result = await chats.bulkWrite(ops.slice(index, index + 200), { ordered: false }).catch(() => null)
    updated += result?.modifiedCount || 0
  }
  log(`backfill nama 1:1 dari pesan: ${updated} chat`)
  return { updated, total: rows.length }
}

/* ------------------------------------------------------------------ */
/* Snapshot JSON per chat (data/chats/<jid>.json)                      */
/* ------------------------------------------------------------------ */

const chatSnapshotTimers = new Map<string, NodeJS.Timeout>()

function scheduleChatSnapshot(jid: string) {
  if (!config.chatJson) return
  const existing = chatSnapshotTimers.get(jid)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    chatSnapshotTimers.delete(jid)
    void writeChatSnapshot(jid).catch((err) => logger.debug({ err }, 'snapshot chat gagal'))
  }, 2000)
  timer.unref?.()
  chatSnapshotTimers.set(jid, timer)
}

/**
 * Tulis N pesan terakhir sebuah chat ke satu file JSON.
 * Tujuan: arsip/backup murah di PC + bahan ekspor. Panel yang jalan di Vercel
 * tetap membaca MongoDB (file lokal PC tidak bisa diakses dari internet).
 */
async function writeChatSnapshot(jid: string) {
  if (!config.chatJson) return
  const { messages, chats } = await collections()
  const docs = await messages
    .find({ jid }, { projection: { raw: 0 } })
    .sort({ ts: -1 })
    .limit(Math.max(10, config.chatJsonLimit))
    .toArray()
  const chat = await chats.findOne({ _id: jid }, { projection: { name: 1, isGroup: 1 } })
  const payload = {
    jid,
    name: chat?.name || null,
    isGroup: Boolean(chat?.isGroup),
    updatedAt: Date.now(),
    count: docs.length,
    messages: docs.reverse(),
  }
  await fsp.mkdir(config.chatJsonDir, { recursive: true })
  const file = path.join(config.chatJsonDir, `${jid.replace(/[^a-zA-Z0-9@._-]/g, '_')}.json`)
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(payload), 'utf8')
  await fsp.rename(tmp, file)
}

/**
 * Pastikan chat punya nama yang manusiawi. Dipanggil saat ada pesan masuk:
 * grup memakai `groupMetadata.subject`, 1:1 memakai cache kontak.
 * Dibatasi 1 percobaan / 10 menit per chat supaya tidak membanjiri WhatsApp.
 */
async function ensureChatName(jid: string) {
  const last = chatNameCheckedAt.get(jid) || 0
  if (Date.now() - last < 10 * 60_000) return
  chatNameCheckedAt.set(jid, Date.now())
  try {
    const { chats } = await collections()
    const doc = await chats.findOne({ _id: jid }, { projection: { name: 1 } })
    const current = typeof doc?.name === 'string' ? doc.name : ''
    if (current && !/^\d+$/.test(current)) return
    if (isJidGroup(jid)) {
      if (!sock) return
      const meta = await sock.groupMetadata(jid).catch(() => null)
      if (meta?.subject) {
        await chats.updateOne({ _id: jid }, { $set: { name: meta.subject, isGroup: true } })
        log(`nama grup diperbarui: ${meta.subject}`)
      }
      return
    }
    const name = contactNames.get(jid)
    if (name) await chats.updateOne({ _id: jid }, { $set: { name } })
  } catch (err) {
    logger.debug({ err }, 'ensureChatName failed')
  }
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

const mediaQueue: Array<() => Promise<void>> = []
let mediaActive = 0

function enqueueMedia(task: () => Promise<void>) {
  mediaQueue.push(task)
  pumpMedia()
}

function pumpMedia() {
  while (mediaActive < 3 && mediaQueue.length) {
    const task = mediaQueue.shift()
    if (!task) break
    mediaActive += 1
    task()
      .catch((err) => logger.debug({ err }, 'media task failed'))
      .finally(() => {
        mediaActive -= 1
        pumpMedia()
      })
  }
}

async function storeMediaFromMessage(message: WAMessage, docId: string, info: MediaInfo) {
  if (!sock) return
  const stream = await downloadMediaMessage(
    message,
    'buffer',
    {},
    { logger, reuploadRequest: sock.updateMediaMessage },
  )
  const buffer = Buffer.isBuffer(stream) ? stream : Buffer.from(stream as Uint8Array)
  const { messages, media } = await collections()
  if (buffer.length > config.maxMediaBytes) {
    await messages.updateOne(
      { _id: docId },
      { $set: { 'media.downloaded': false, 'media.size': buffer.length, 'media.tooLarge': true } },
    )
    return
  }
  await media.updateOne(
    { _id: docId },
    {
      $set: {
        jid: message.key?.remoteJid || '',
        messageId: message.key?.id || '',
        kind: info.kind,
        mimetype: info.mimetype || 'application/octet-stream',
        size: buffer.length,
        data: buffer.toString('base64'),
        createdAt: Date.now(),
      },
    },
    { upsert: true },
  )
  await messages.updateOne({ _id: docId }, { $set: { 'media.downloaded': true, 'media.size': buffer.length } })
  log(`media tersimpan ${docId} (${Math.round(buffer.length / 1024)} KB)`)
}

/* ------------------------------------------------------------------ */
/* Incoming messages                                                   */
/* ------------------------------------------------------------------ */

async function storeMessage(message: WAMessage, opts: { notify?: boolean; history?: boolean } = {}) {
  const jid = message.key?.remoteJid
  const id = message.key?.id
  if (!jid || !id) return
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return

  const info = normalizeMessage(message.message)
  if (info.ignored) return

  const fromMe = Boolean(message.key.fromMe)
  const ts = messageTimestamp(message)
  const isGroup = Boolean(isJidGroup(jid))

  const { messages, chats } = await collections()

  if (info.type === 'revoked' && info.revokeTargetId) {
    await messages.updateOne(
      { _id: `${jid}:${info.revokeTargetId}` },
      { $set: { revoke: true, text: 'Pesan ini telah dihapus', type: 'revoked' } },
    )
    return
  }

  const participant = message.key.participant || (isGroup ? null : fromMe ? meId : jid)
  const senderName = message.pushName || contactNames.get(participant || jid) || null

  if (!fromMe && message.pushName && participant && !isGroup) {
    await rememberContact(participant, message.pushName)
  }

  const docId = `${jid}:${id}`
  const doc = clean({
    _id: docId,
    jid,
    id,
    fromMe,
    participant: participant || null,
    senderName,
    ts,
    type: info.type,
    text: info.text || '',
    media: info.media
      ? {
          ...info.media,
          downloaded: false,
        }
      : null,
    quoted: info.quoted || null,
    status: fromMe ? 'sent' : undefined,
    revoke: false,
    raw: info.media?.hasMedia ? message.message : undefined,
  })

  const result = await messages.updateOne(
    { _id: docId },
    { $set: doc, $setOnInsert: { createdAt: Date.now() } },
    { upsert: true },
  )
  const isNew = Boolean(result.upsertedCount)

  if (isNew) {
    await touchChat({
      jid,
      ts,
      preview: messagePreview(info),
      type: info.type,
      fromMe,
      isGroup,
      name: !isGroup ? contactNames.get(jid) || undefined : undefined,
      incUnread: !fromMe && Boolean(opts.notify),
    })
    void ensureChatName(jid)
    scheduleChatSnapshot(jid)
  }

  const freshEnough = !opts.history || Date.now() - ts < 2 * 24 * 60 * 60 * 1000
  if (info.media?.hasMedia && config.autoDownloadMedia && isNew && freshEnough) {
    enqueueMedia(() => storeMediaFromMessage(message, docId, info.media!))
  }

  if (!fromMe && opts.notify) {
    await chats.updateOne({ _id: jid }, { $set: { updatedAt: Date.now() } }, { upsert: false }).catch(() => null)
  }
}

async function storeHistory(payload: {
  chats?: Array<{ id: string; name?: string | null; conversationTimestamp?: number | null }>
  contacts?: Contact[]
  messages?: WAMessage[]
}) {
  const { chats: chatCol, contacts: contactCol } = await collections()

  for (const contact of payload.contacts || []) {
    const name = contact.name || contact.notify || contact.verifiedName
    if (!contact.id || !name) continue
    contactNames.set(contact.id, name)
    await contactCol.updateOne(
      { _id: contact.id },
      { $set: { name, notify: contact.notify || null, updatedAt: Date.now() } },
      { upsert: true },
    )
  }

  for (const chat of payload.chats || []) {
    if (!chat.id || chat.id === 'status@broadcast' || chat.id.endsWith('@newsletter')) continue
    await chatCol.updateOne(
      { _id: chat.id },
      {
        $set: clean({
          isGroup: chat.id.endsWith('@g.us'),
          name: chat.name || undefined,
          updatedAt: Date.now(),
        }),
        $setOnInsert: {
          unread: 0,
          lastTs: Number(chat.conversationTimestamp || 0) * 1000,
        },
      },
      { upsert: true },
    )
  }

  const byJid = new Map<string, WAMessage[]>()
  for (const message of payload.messages || []) {
    const jid = message.key?.remoteJid
    if (!jid || !message.key?.id) continue
    if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue
    const list = byJid.get(jid) || []
    list.push(message)
    byJid.set(jid, list)
  }

  for (const [, list] of byJid) {
    const recent = list
      .sort((a, b) => messageTimestamp(b) - messageTimestamp(a))
      .slice(0, config.historyMessageLimit)
    for (const message of recent) {
      await storeMessage(message, { notify: false, history: true })
    }
  }
  log(`history sync: ${payload.chats?.length || 0} chat, ${payload.messages?.length || 0} pesan`)
}

/* ------------------------------------------------------------------ */
/* Commands from the web panel                                         */
/* ------------------------------------------------------------------ */

function requireSocket() {
  if (!sock) throw new Error('Worker belum terhubung ke WhatsApp')
  return sock
}

function assertOnline() {
  const active = requireSocket()
  if (!meId) throw new Error('WhatsApp belum terhubung. Scan QR di halaman Koneksi.')
  return active
}

async function persistSentMessage(sent: WAMessage, fallback: { text?: string; type?: string }) {
  if (!sent?.key?.id || !sent.key.remoteJid) return
  const info = normalizeMessage(sent.message)
  const ts = messageTimestamp(sent)
  const { messages, chats } = await collections()
  const docId = `${sent.key.remoteJid}:${sent.key.id}`
  await messages.updateOne(
    { _id: docId },
    {
      $set: clean({
        _id: docId,
        jid: sent.key.remoteJid,
        id: sent.key.id,
        fromMe: true,
        participant: sent.key.participant || null,
        ts,
        type: info.type === 'unknown' ? fallback.type || 'chat' : info.type,
        text: info.text || fallback.text || '',
        media: info.media ? { ...info.media, downloaded: false } : null,
        quoted: info.quoted || null,
        status: 'sent',
      }),
      $setOnInsert: { createdAt: Date.now() },
    },
    { upsert: true },
  )
  await touchChat({
    jid: sent.key.remoteJid,
    ts,
    preview: messagePreview(info) || fallback.text || '',
    type: info.type,
    fromMe: true,
    isGroup: Boolean(isJidGroup(sent.key.remoteJid)),
  })
  if (info.media?.hasMedia) {
    enqueueMedia(() => storeMediaFromMessage(sent, docId, info.media!))
  }
}

async function downloadMediaOnDemand(payload: { jid: string; messageId: string }) {
  const { messages } = await collections()
  const doc = await messages.findOne({ _id: `${payload.jid}:${payload.messageId}` })
  if (!doc) throw new Error('Pesan tidak ditemukan')
  const existing = await (await collections()).media.findOne({ _id: `${payload.jid}:${payload.messageId}` })
  if (existing) return { cached: true }

  if (!doc.raw) throw new Error('Media ini tidak tersedia untuk diunduh ulang')
  const fake: WAMessage = {
    key: {
      remoteJid: payload.jid,
      id: payload.messageId,
      fromMe: Boolean(doc.fromMe),
      participant: (doc.participant as string | undefined) || undefined,
    },
    message: binaryToBuffer(doc.raw) as WAMessage['message'],
    messageTimestamp: Math.floor(Number(doc.ts || Date.now()) / 1000),
  }
  const info = normalizeMessage(fake.message)
  if (!info.media?.hasMedia) throw new Error('Pesan ini tidak memiliki media')
  await storeMediaFromMessage(fake, `${payload.jid}:${payload.messageId}`, info.media)
  return { cached: false }
}

async function executeCommand(command: Document) {
  const type = String(command.type || '')
  const payload = (command.payload || {}) as Record<string, any>

  switch (type) {
    case 'send-text': {
      const active = assertOnline()
      const sent = (await active.sendMessage(payload.jid, { text: String(payload.text || '') }))!
      await persistSentMessage(sent, { text: payload.text, type: 'chat' })
      return { messageId: sent?.key?.id || null }
    }

    case 'send-media': {
      const active = assertOnline()
      const { uploads } = await collections()
      if (!ObjectId.isValid(String(payload.uploadId))) throw new Error('Upload tidak valid')
      const upload = await uploads.findOne({ _id: new ObjectId(String(payload.uploadId)) })
      if (!upload) throw new Error('File sudah kedaluwarsa, coba unggah ulang')
      const buffer = Buffer.from(String(upload.data), 'base64')
      const mimetype = String(payload.mimetype || upload.mimetype || 'application/octet-stream')
      const fileName = String(payload.fileName || upload.name || 'file')
      const caption = String(payload.caption || '')
      const kind = String(payload.kind || 'document')

      let content: Record<string, unknown>
      if (kind === 'image') content = { image: buffer, mimetype, caption }
      else if (kind === 'sticker') content = { sticker: buffer }
      else if (kind === 'video') content = { video: buffer, mimetype, caption }
      else if (kind === 'audio') content = { audio: buffer, mimetype, ptt: false }
      else content = { document: buffer, mimetype, fileName, caption }

      const sent = (await active.sendMessage(payload.jid, content as never))!
      await persistSentMessage(sent, { text: caption, type: kind })
      return { messageId: sent?.key?.id || null }
    }

    case 'read': {
      const active = requireSocket()
      const { messages, chats } = await collections()
      const last = await messages
        .find({ jid: payload.jid, fromMe: { $ne: true } })
        .sort({ ts: -1 })
        .limit(1)
        .toArray()
      const keys = last
        .filter((m) => m.id)
        .map((m) => ({
          remoteJid: String(payload.jid),
          id: String(m.id),
          fromMe: false,
          participant: (m.participant as string) || undefined,
        }))
      if (keys.length) await active.readMessages(keys)
      await chats.updateOne({ _id: payload.jid }, { $set: { unread: 0 } })
      return { read: keys.length }
    }

    case 'typing': {
      const active = requireSocket()
      await active.sendPresenceUpdate('composing', payload.jid)
      setTimeout(() => {
        active.sendPresenceUpdate('paused', payload.jid).catch(() => null)
      }, 2500)
      return { ok: true }
    }

    case 'react': {
      const active = assertOnline()
      await active.sendMessage(payload.jid, {
        react: {
          text: String(payload.emoji || ''),
          key: {
            remoteJid: payload.jid,
            id: payload.messageId,
            fromMe: Boolean(payload.fromMe),
          },
        },
      })
      return { ok: true }
    }

    case 'download-media':
      return downloadMediaOnDemand({ jid: payload.jid, messageId: payload.messageId })

    case 'sync-names': {
      await waitForSocket(8000)
      const groups = await syncAllGroupNames('manual')
      const chatsBackfill = await backfillNamesFromMessages()
      return { ok: true, groups, chats: chatsBackfill }
    }

    case 'avatar': {
      const active = await waitForSocket(8000)
      const target = String(payload.jid || '')
      if (!target) throw new Error('jid wajib diisi')
      const { contacts } = await collections()
      // 'preview' jauh lebih kecil (cocok untuk daftar chat); fallback ke 'image'.
      const url =
        (await active.profilePictureUrl(target, 'preview').catch(() => null)) ||
        (await active.profilePictureUrl(target, 'image').catch(() => null))
      if (!url) {
        await contacts.updateOne({ _id: target }, { $set: { avatar: null, avatarAt: Date.now() } }, { upsert: true })
        return { ok: true, empty: true }
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Gagal mengambil foto profil (${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length > 400 * 1024) throw new Error('Foto profil terlalu besar')
      const mimetype = res.headers.get('content-type') || 'image/jpeg'
      await contacts.updateOne(
        { _id: target },
        {
          $set: { avatar: buffer.toString('base64'), avatarMime: mimetype, avatarAt: Date.now() },
          $unset: { avatarRequestedAt: '' },
        },
        { upsert: true },
      )
      return { ok: true, size: buffer.length, mimetype }
    }

    case 'pair': {
      // Pastikan socket memang sedang berjalan; kalau worker sempat menyerah,
      // bangkitkan dulu supaya kode pairing bisa dibuat.
      if (!sock) {
        resetBackoff()
        scheduleReconnect(200)
      }
      const active = await waitForSocket(12_000)
      if (active.authState.creds.registered) {
        throw new Error('Sesi sudah terdaftar di WhatsApp. Putuskan sesi dulu untuk menautkan ulang.')
      }
      const phone = String(payload.phone || '').replace(/[^0-9]/g, '')
      const code = await active.requestPairingCode(phone)
      const issuedAt = Date.now()
      const expiresAt = issuedAt + config.pairingTtlMs
      await writeStatus({
        pairingCode: code,
        pairingPhone: phone,
        pairingAt: issuedAt,
        pairingExpiresAt: expiresAt,
      })
      log(`pairing code dibuat untuk ${phone} (berlaku ${Math.round(config.pairingTtlMs / 1000)} dtk)`)
      return { code, phone, issuedAt, expiresAt, expiresIn: Math.round(config.pairingTtlMs / 1000) }
    }

    case 'logout': {
      const active = requireSocket()
      // Tandai logout yang disengaja supaya handler 'close' tidak menganggapnya
      // sebagai penolakan sesi (401) dan langsung memblokir reconnect.
      expectLogout = true
      await active.logout().catch(() => null)
      if (authState) {
        await authState.flush(3000).catch(() => null)
        await authState.clear().catch((err) => logger.debug({ err }, 'clear auth failed'))
      }
      authState = null
      meId = null
      await writeStatus({
        status: 'disconnected',
        me: null,
        qr: null,
        qrExpiresAt: null,
        pairingCode: null,
        pairingAt: null,
        pairingExpiresAt: null,
        connectedAt: null,
        lastError: null,
      })
      resetBackoff()
      scheduleReconnect(1200)
      return { ok: true }
    }

    case 'restart': {
      if (sock) {
        try {
          sock.end(undefined)
        } catch {
          /* noop */
        }
      }
      // Permintaan manual: reset hitungan backoff & status "menyerah".
      resetBackoff()
      await writeStatus({ lastError: null }).catch(() => null)
      scheduleReconnect(500)
      return { ok: true }
    }

    default:
      throw new Error(`Perintah tidak dikenal: ${type}`)
  }
}

async function commandLoop() {
  if (commandsRunning || stopping) return
  commandsRunning = true
  try {
    const { commands } = await collections()
    for (let i = 0; i < 5; i += 1) {
      const command = await commands.findOneAndUpdate(
        { status: 'pending' },
        { $set: { status: 'processing', updatedAt: Date.now(), workerId: config.workerId } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      )
      if (!command) break
      try {
        const result = await executeCommand(command)
        await commands.updateOne(
          { _id: command._id },
          { $set: { status: 'done', result: result ?? null, updatedAt: Date.now() } },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.debug({ err }, 'command failed')
        await commands.updateOne(
          { _id: command._id },
          { $set: { status: 'error', error: message, updatedAt: Date.now() } },
        )
      }
    }
  } catch (err) {
    logger.debug({ err }, 'command loop failed')
  } finally {
    commandsRunning = false
  }
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

function nextBackoffDelay() {
  return backoffDelay(reconnectAttempts + 1, {
    baseMs: 2000,
    maxMs: config.backoffMaxMs,
    jitter: 0.2,
  })
}

/**
 * Jadwalkan percobaan koneksi berikutnya.
 * - tanpa argumen: backoff eksponensial (2s → 4s → 8s … maksimal backoffMaxMs)
 * - dengan angka: delay tetap, dipakai untuk aksi manual (restart/logout)
 */
function scheduleReconnect(delay?: number) {
  if (stopping) return
  // Sudah menyerah: hanya aksi manual (restart/logout) yang boleh menjadwalkan.
  if (gaveUp && delay === undefined) return
  const wait = delay ?? nextBackoffDelay()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (stopping) return
    start().catch((err) => {
      console.error('[worker] gagal memulai ulang:', err)
      scheduleReconnect()
    })
  }, wait)
  log(
    `menyambung ulang dalam ${Math.round(wait / 1000)}s ` +
      `(percobaan ${reconnectAttempts + 1}/${config.reconnectMaxAttempts})`,
  )
}

/** Reset hitungan backoff — dipakai saat koneksi sukses atau user minta ulang. */
function resetBackoff() {
  reconnectAttempts = 0
  gaveUp = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

/** Berhenti mencoba: worker tetap hidup menunggu perintah panel, lalu coba lagi nanti. */
function giveUp(message: string) {
  gaveUp = true
  log(message)
  writeStatus({ status: 'close', lastError: message, qr: null, qrExpiresAt: null }).catch(() => null)
  scheduleGiveUpRetry()
}

function scheduleGiveUpRetry() {
  if (stopping) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  const minutes = Math.round(config.retryAfterGiveUpMs / 60_000)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (stopping) return
    log(`jeda panjang selesai — mencoba menyambung lagi (attempt direset)`)
    resetBackoff()
    start().catch(() => scheduleGiveUpRetry())
  }, config.retryAfterGiveUpMs)
  log(
    `berhenti mencoba. Coba lagi otomatis dalam ${minutes} menit, ` +
      `atau tekan "Minta QR baru" di panel untuk memaksa sekarang.`,
  )
}

async function start() {
  if (starting || stopping) return
  starting = true
  reconnectAttempts += 1
  try {
    const database = await db()
    if (!authState) {
      authState = await useMongoAuthState(database, config.sessionId, {
        saveDebounceMs: config.saveCredsDebounceMs,
        onError: (err, context) => logger.debug({ err, context }, 'auth write failed'),
      })
    }

    const version = await fetchLatestBaileysVersion().catch(() => undefined)
    log(`menghubungkan (${version?.version?.join('.') || 'default'} | attempt ${reconnectAttempts})`)

    sock = makeWASocket({
      ...(version?.version ? { version: version.version } : {}),
      auth: {
        creds: authState.state.creds,
        keys: makeCacheableSignalKeyStore(authState.state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: config.syncFullHistory,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 500,
      getMessage: async () => undefined,
      cachedGroupMetadata,
    })

    qrCount = 0
    await writeStatus({ status: 'connecting', qr: null, qrExpiresAt: null })

    sock.ev.on('creds.update', async () => {
      try {
        await authState?.saveCreds()
      } catch (err) {
        logger.debug({ err }, 'saveCreds failed')
      }
    })

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        qrCount += 1
        const ttl = qrCount === 1 ? config.qrTtlFirstMs : config.qrTtlNextMs
        const issuedAt = Date.now()
        await writeStatus(
          { qr, qrUpdatedAt: issuedAt, qrExpiresAt: issuedAt + ttl, status: 'connecting' },
          {},
          { qrSeq: 1 },
        )
        log(`QR #${qrCount} dari Baileys siap dipindai (berlaku ${Math.round(ttl / 1000)} dtk)`)
        if (config.terminalQr) {
          try {
            const ascii = await QRCode.toString(qr, { type: 'terminal', small: true })
            console.log(
              `\n=== SCAN QR WHATSAPP (berlaku ${Math.round(ttl / 1000)} dtk) ===\n` +
                `WhatsApp → ⋮ → Perangkat tertaut → Tautkan perangkat\n`,
            )
            console.log(ascii)
          } catch (err) {
            logger.debug({ err }, 'gagal mencetak QR di terminal')
          }
        }
      }
      if (connection === 'open') {
        resetBackoff()
        authRejectAt = []
        qrCount = 0
        meId = sock?.user?.id || null
        const me = {
          id: sock?.user?.id || null,
          lid: sock?.user?.lid || null,
          name: sock?.user?.name || null,
          number: phoneOf(sock?.user?.id || null),
          platform: (sock?.user as { platform?: string } | undefined)?.platform || null,
        }
        await writeStatus({
          status: 'open',
          me,
          qr: null,
          qrUpdatedAt: null,
          qrExpiresAt: null,
          pairingCode: null,
          pairingAt: null,
          pairingExpiresAt: null,
          connectedAt: Date.now(),
          lastError: null,
        })
        log('tersambung sebagai', me.number || me.id)
        console.log(`\n✅ WhatsApp tersambung sebagai ${me.name || me.number || me.id}. Sesi tersimpan di MongoDB.\n`)

        // Sinkronkan nama grup + nama 1:1 di latar belakang (tidak menahan koneksi).
        void (async () => {
          try {
            await syncAllGroupNames('open')
            await backfillNamesFromMessages()
          } catch (err) {
            logger.debug({ err }, 'sinkron nama saat connect gagal')
          }
        })()
      }
      if (connection === 'close') {
        if (stopping) return
        meId = null
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        const reason = (lastDisconnect?.error as Error | undefined)?.message || 'koneksi terputus'
        qrCount = 0
        log(`koneksi tertutup (${statusCode || '?'}) ${reason}`)

        const clearedSession = {
          me: null,
          qr: null,
          qrExpiresAt: null,
          pairingCode: null,
          pairingAt: null,
          pairingExpiresAt: null,
          connectedAt: null,
        }

        // 1) Sesi diambil alih proses/perangkat lain (440): jangan berebut.
        if (statusCode === DisconnectReason.connectionReplaced) {
          await writeStatus({
            status: 'close',
            lastError: 'Koneksi WhatsApp diambil alih sesi lain (440). Worker ini berhenti agar tidak bentrok.',
            qr: null,
            qrExpiresAt: null,
          }).catch(() => null)
          log('keluar karena sesi dipakai proses lain (440) — lock dilepas')
          await releaseLock().catch(() => null)
          await closeDb().catch(() => null)
          process.exit(0)
        }

        // 2) Sesi ditolak WhatsApp (401/403): hapus state lama, jangan retry berulang.
        const rejected =
          statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.forbidden
        if (rejected) {
          const intended = expectLogout
          expectLogout = false
          if (authState) {
            await authState.flush(3000).catch(() => null)
            await authState.clear().catch((err) => logger.debug({ err }, 'clear auth failed'))
          }
          authState = null
          authRejectAt = authRejectAt.filter((ts) => Date.now() - ts < AUTH_REJECT_WINDOW_MS)

          if (intended) {
            await writeStatus({
              ...clearedSession,
              status: 'disconnected',
              lastError: 'Sesi diputus (logout). Pindai QR atau minta pairing code untuk menautkan ulang.',
            })
            resetBackoff()
            scheduleReconnect(1500)
            return
          }

          authRejectAt.push(Date.now())
          const repeated = authRejectAt.length >= 2
          const message = repeated
            ? 'WhatsApp menolak sesi berulang kali (401/403). Sesi lama sudah dihapus — tunggu beberapa jam, lalu tautkan ulang lewat panel.'
            : 'WhatsApp menolak sesi ini (401/403). Sesi lama sudah dihapus; tekan "Minta QR baru" untuk menautkan ulang.'
          await writeStatus({ ...clearedSession, status: 'disconnected', lastError: message })
          gaveUp = true
          log(message)
          return
        }

        // 3) Gangguan jaringan/server: backoff eksponensial, berhenti setelah N percobaan.
        await writeStatus({ status: 'close', lastError: reason, qr: null, qrExpiresAt: null })
        if (reconnectAttempts >= config.reconnectMaxAttempts) {
          giveUp(
            `Gagal menyambung setelah ${config.reconnectMaxAttempts} percobaan (${reason}). ` +
              'Worker berhenti mencoba sampai diminta ulang dari panel.',
          )
          return
        }
        scheduleReconnect()
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const message of messages) {
        try {
          await storeMessage(message, { notify: type === 'notify' })
        } catch (err) {
          logger.debug({ err }, 'storeMessage failed')
        }
      }
    })

    sock.ev.on('messaging-history.set', async (payload) => {
      try {
        await storeHistory(payload as never)
      } catch (err) {
        logger.debug({ err }, 'history sync failed')
      }
    })

    sock.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        const name = contact.name || contact.notify || contact.verifiedName
        if (!contact.id || !name) continue
        await rememberContact(contact.id, name)
        await ensureChat(contact.id, { name, isGroup: false })
      }
    })

    sock.ev.on('contacts.update', async (contacts) => {
      for (const contact of contacts) {
        const name = contact.name || contact.notify
        if (!contact.id || !name) continue
        await rememberContact(contact.id, name)
      }
    })

    sock.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        if (!chat.id) continue
        await ensureChat(chat.id, { name: chat.name || undefined, isGroup: Boolean(isJidGroup(chat.id)) })
        const patch: Record<string, unknown> = {}
        if (typeof chat.unreadCount === 'number' && chat.unreadCount >= 0) patch.unread = chat.unreadCount
        if (typeof chat.archived === 'boolean') patch.archived = chat.archived
        if (chat.pinned) patch.pinned = chat.pinned
        if (Object.keys(patch).length) {
          const { chats: chatCol } = await collections()
          await chatCol.updateOne({ _id: chat.id }, { $set: patch })
        }
      }
    })

    sock.ev.on('chats.update', async (chats) => {
      const { chats: chatCol } = await collections()
      for (const chat of chats) {
        if (!chat.id) continue
        const patch: Record<string, unknown> = {}
        if (typeof chat.unreadCount === 'number' && chat.unreadCount >= 0) patch.unread = chat.unreadCount
        if (typeof chat.archived === 'boolean') patch.archived = chat.archived
        if (chat.pinned) patch.pinned = chat.pinned
        if (typeof chat.name === 'string' && chat.name) patch.name = chat.name
        if (Object.keys(patch).length) await chatCol.updateOne({ _id: chat.id }, { $set: patch }, { upsert: true })
      }
    })

    sock.ev.on('groups.upsert', async (groups) => {
      const { chats: chatCol } = await collections()
      for (const group of groups) {
        groupCache.set(group.id, { data: group, ts: Date.now() })
        await chatCol.updateOne(
          { _id: group.id },
          { $set: { name: group.subject || group.id, isGroup: true, updatedAt: Date.now() }, $setOnInsert: { unread: 0, lastTs: 0 } },
          { upsert: true },
        )
      }
    })

    sock.ev.on('groups.update', async (groups) => {
      const { chats: chatCol } = await collections()
      for (const group of groups) {
        if (!group.id) continue
        if (group.subject) {
          await chatCol.updateOne({ _id: group.id }, { $set: { name: group.subject, isGroup: true } }, { upsert: true })
        }
      }
    })

    sock.ev.on('messages.update', async (updates) => {
      const { messages } = await collections()
      for (const update of updates) {
        const jid = update.key?.remoteJid
        const id = update.key?.id
        if (!jid || !id) continue
        const status = update.update?.status
        if (typeof status !== 'number') continue
        // 2 = server ack, 3 = delivered, 4 = read, 5 = played
        const mapped = status >= 4 ? 'read' : status === 3 ? 'delivered' : status === 2 ? 'sent' : status === 0 ? 'error' : 'pending'
        await messages.updateOne({ _id: `${jid}:${id}` }, { $set: { status: mapped, ack: status } })
      }
    })

    sock.ev.on('message-receipt.update', async (receipts) => {
      const { messages } = await collections()
      for (const receipt of receipts) {
        const jid = receipt.key?.remoteJid
        const id = receipt.key?.id
        if (!jid || !id) continue
        if (receipt.receipt?.readTimestamp) {
          await messages.updateOne({ _id: `${jid}:${id}` }, { $set: { status: 'read', ack: 4 } })
        } else if (receipt.receipt?.receiptTimestamp) {
          await messages.updateOne({ _id: `${jid}:${id}` }, { $set: { status: 'delivered', ack: 3 } })
        }
      }
    })

    sock.ev.on('messages.delete', async (event) => {
      const { messages } = await collections()
      const keys = ('keys' in event ? event.keys : [event]) as Array<{ remoteJid?: string; id?: string }>
      for (const key of keys) {
        if (!key?.remoteJid || !key.id) continue
        await messages.updateOne(
          { _id: `${key.remoteJid}:${key.id}` },
          { $set: { revoke: true, text: 'Pesan ini telah dihapus', type: 'revoked' } },
        )
      }
    })
  } finally {
    starting = false
  }
}

async function bootstrap() {
  await ensureIndexes()

  const hasLock = await waitForLock(config.lockWaitMs)
  if (!hasLock) {
    log('worker lain masih aktif memegang sesi. Keluar tanpa mengganggu sesi tersebut.')
    await closeDb().catch(() => null)
    process.exit(0)
  }
  log(`lock didapat oleh ${config.workerId}`)

  const { database } = await collections()
  // Reset commands that were left mid-flight by a previous crash.
  await database
    .collection(COL.commands)
    .updateMany({ status: 'processing' }, { $set: { status: 'pending', updatedAt: Date.now() } })

  // Perintah lama (mis. minta QR saat worker mati) tidak boleh dieksekusi
  // sekarang: QR/kode pairing-nya sudah tidak ditunggu siapa pun.
  await database.collection(COL.commands).updateMany(
    { status: 'pending', createdAt: { $lt: Date.now() - 120_000 } },
    {
      $set: {
        status: 'error',
        error: 'Worker tidak aktif saat perintah dikirim. Minta ulang setelah worker menyala.',
        updatedAt: Date.now(),
      },
    },
  )

  // Warm contact name cache.
  const contacts = await database
    .collection(COL.contacts)
    .find({ name: { $exists: true } })
    .limit(3000)
    .toArray()
  for (const contact of contacts) {
    if (typeof contact._id === 'string' && typeof contact.name === 'string') {
      contactNames.set(contact._id, contact.name)
    }
  }

  // Backfill nama chat lama yang masih berupa nomor, memakai wa_contacts.
  try {
    const { chats } = await collections()
    const ops = contacts
      .filter((contact) => typeof contact._id === 'string' && typeof contact.name === 'string')
      .slice(0, 500)
      .map((contact) => ({
        updateOne: {
          filter: {
            _id: contact._id,
            $or: [{ name: { $exists: false } }, { name: null }, { name: '' }, { name: /^\d+$/ }],
          },
          update: { $set: { name: contact.name } },
        },
      }))
    if (ops.length) {
      const result = await chats.bulkWrite(ops as never[], { ordered: false }).catch(() => null)
      if (result?.modifiedCount) log(`nama ${result.modifiedCount} chat diperbarui dari kontak`)
    }
  } catch (err) {
    logger.debug({ err }, 'backfill chat names failed')
  }

  await writeStatus({
    status: 'connecting',
    startedAt: Date.now(),
    lastError: null,
    qr: null,
    qrExpiresAt: null,
    qrSeq: 0,
  })

  heartbeatTimer = setInterval(() => {
    writeStatus({}).catch(() => null)
    renewLock()
      .then((held) => {
        if (held) {
          lockFailures = 0
          return
        }
        lockFailures += 1
        log(`lock worker hilang (${lockFailures}/3)`)
        if (lockFailures >= 3) {
          console.error('[worker] lock diambil worker lain, proses berhenti agar tidak bentrok.')
          process.exit(1)
        }
      })
      .catch(() => null)
  }, 15_000)
  commandTimer = setInterval(() => {
    commandLoop().catch(() => null)
  }, 900)
  const qrSweepTimer = setInterval(() => {
    sweepEphemeral().catch(() => null)
  }, config.qrSweepMs)
  qrSweepTimer.unref?.()

  await start()
  commandLoop().catch(() => null)

  if (config.maxRuntimeMs > 0) {
    const runtimeTimer = setTimeout(() => {
      const minutes = Math.round(config.maxRuntimeMs / 60_000)
      log(`batas waktu ${minutes} menit tercapai — menutup worker agar bisa dijalankan ulang.`)
      void shutdown('runtime-limit')
    }, config.maxRuntimeMs)
    runtimeTimer.unref?.()
  }

  log(`worker ${config.workerId} aktif · db=${config.dbName} · session=${config.sessionId}`)
}

async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  log(`menerima ${signal}, menutup worker dengan rapi…`)

  // Jangan biarkan proses menggantung bila socket/Mongo tidak merespons.
  const watchdog = setTimeout(() => {
    console.error('[worker] shutdown melebihi batas waktu — keluar paksa')
    process.exit(1)
  }, config.shutdownDrainMs + 4000)
  watchdog.unref?.()

  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (commandTimer) clearInterval(commandTimer)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  heartbeatTimer = null
  commandTimer = null
  reconnectTimer = null

  // 1) Tutup socket supaya tidak ada event/penulisan baru.
  try {
    sock?.end(undefined)
  } catch {
    /* noop */
  }

  // 2) Tunggu tulisan auth (Signal keys + creds) benar-benar selesai di MongoDB.
  //    Ini yang mencegah sesi rusak kalau worker dimatikan tepat saat menyimpan.
  let flushed = true
  if (authState) {
    flushed = await authState.flush(config.shutdownDrainMs).catch(() => false)
    if (!flushed) {
      log(`peringatan: ${authState.pending()} tulisan auth belum selesai saat shutdown`)
    }
    // Simpan creds terakhir (mis. hasil pairing) lalu tunggu sekali lagi.
    await authState.saveCreds().catch(() => null)
    await authState.flush(1500).catch(() => false)
  }

  // 3) Tandai status + lepas lock + tutup koneksi (semua dibatasi waktu,
  //    supaya shutdown tidak menggantung saat Mongo bermasalah).
  const finalize = (async () => {
    await writeStatus({
      status: 'close',
      lastError: flushed
        ? `Worker berhenti (${signal}).`
        : `Worker berhenti (${signal}) — sebagian data sesi mungkin belum tersimpan.`,
      qr: null,
      qrExpiresAt: null,
      pairingCode: null,
    }).catch(() => null)
    await releaseLock().catch(() => null)
    await closeDb().catch(() => null)
  })()

  await Promise.race([finalize, sleep(config.shutdownDrainMs + 1000)])
  clearTimeout(watchdog)
  log('state tersimpan, worker berhenti.')
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandled rejection:', reason)
})

bootstrap().catch((err) => {
  console.error('[worker] gagal start:', err)
  process.exit(1)
})

