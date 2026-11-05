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
import { ObjectId, type Collection, type Db, type Document } from 'mongodb'
import { config, assertConfig } from './config'
import { COL, closeDb, db, ensureIndexes } from './db'
import { useMongoAuthState, type MongoAuthState } from './auth-state'
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

const contactNames = new Map<string, string>()
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

async function writeStatus(set: Record<string, unknown>, unset: Record<string, ''> = {}) {
  const { session } = await collections()
  const update: Record<string, unknown> = {
    $set: clean({ ...set, workerId: config.workerId, workerAt: Date.now() }),
  }
  if (Object.keys(unset).length) update.$unset = unset
  await session.updateOne({ _id: 'session' }, update, { upsert: true })
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

    case 'pair': {
      const active = requireSocket()
      if (active.authState.creds.registered) throw new Error('Sesi sudah terdaftar di WhatsApp. Logout dulu untuk menautkan ulang.')
      const code = await active.requestPairingCode(String(payload.phone || '').replace(/[^0-9]/g, ''))
      await writeStatus({ pairingCode: code, pairingPhone: String(payload.phone || '') })
      return { code }
    }

    case 'logout': {
      const active = requireSocket()
      await active.logout().catch(() => null)
      if (authState) await authState.clear()
      authState = null
      meId = null
      await writeStatus({ status: 'disconnected', me: null, qr: null, pairingCode: null, connectedAt: null })
      scheduleReconnect(2500)
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
      scheduleReconnect(500)
      return { ok: true }
    }

    default:
      throw new Error(`Perintah tidak dikenal: ${type}`)
  }
}

async function commandLoop() {
  if (commandsRunning) return
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

function scheduleReconnect(delay = 3000) {
  if (stopping) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    start().catch((err) => {
      console.error('[worker] gagal memulai ulang:', err)
      scheduleReconnect(Math.min(30_000, 3000 * (reconnectAttempts + 1)))
    })
  }, delay)
}

async function start() {
  if (starting || stopping) return
  starting = true
  reconnectAttempts += 1
  try {
    const database = await db()
    if (!authState) authState = await useMongoAuthState(database, config.sessionId)

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

    await writeStatus({ status: 'connecting' })

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
        await writeStatus({ qr, qrUpdatedAt: Date.now(), status: 'connecting' })
        log('QR baru siap dipindai')
      }
      if (connection === 'open') {
        reconnectAttempts = 0
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
          pairingCode: null,
          connectedAt: Date.now(),
          lastError: null,
        })
        log('tersambung sebagai', me.number || me.id)
      }
      if (connection === 'close') {
        meId = null
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        const reason = (lastDisconnect?.error as Error | undefined)?.message || 'koneksi terputus'
        const loggedOut = statusCode === DisconnectReason.loggedOut
        await writeStatus({ status: loggedOut ? 'disconnected' : 'close', lastError: reason, qr: null })
        log(`koneksi tertutup (${statusCode || '?'}) ${reason}`)
        if (loggedOut) {
          if (authState) await authState.clear()
          authState = null
          await writeStatus({ me: null, pairingCode: null, connectedAt: null, status: 'disconnected' })
          // Start a fresh session so a new QR becomes available for relinking.
          scheduleReconnect(2500)
        } else {
          scheduleReconnect(Math.min(20_000, 2000 * Math.max(1, reconnectAttempts)))
        }
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

  const { database } = await collections()
  // Reset commands that were left mid-flight by a previous crash.
  await database
    .collection(COL.commands)
    .updateMany({ status: 'processing' }, { $set: { status: 'pending', updatedAt: Date.now() } })

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

  await writeStatus({ status: 'connecting', startedAt: Date.now(), lastError: null }, { qr: '' })

  heartbeatTimer = setInterval(() => {
    writeStatus({}).catch(() => null)
  }, 15_000)
  commandTimer = setInterval(() => {
    commandLoop().catch(() => null)
  }, 900)

  await start()
  commandLoop().catch(() => null)
  log(`worker ${config.workerId} aktif · db=${config.dbName} · session=${config.sessionId}`)
}

async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  log(`menerima ${signal}, menutup worker…`)
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (commandTimer) clearInterval(commandTimer)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  try {
    sock?.end(undefined)
  } catch {
    /* noop */
  }
  await sleep(400)
  await closeDb().catch(() => null)
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

