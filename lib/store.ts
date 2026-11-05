import { ObjectId, type Collection } from 'mongodb'
import { COLLECTIONS, ensureIndexes, getDb } from './mongo'
import type { ChatDoc, ChatSummary, CommandDoc, CommandType, MessageDoc, SessionDoc } from './types'

const STATUS_ID = 'session'
let indexesReady: Promise<void> | null = null

async function db() {
  const database = await getDb()
  if (!indexesReady) indexesReady = ensureIndexes(database)
  return database
}

export function jidToPhone(jid?: string | null) {
  if (!jid) return null
  const user = jid.split('@')[0]?.split(':')[0]
  return user || null
}

export async function getSessionDoc(): Promise<SessionDoc> {
  const database = await db()
  const doc = await database.collection<SessionDoc>(COLLECTIONS.session).findOne({ _id: STATUS_ID })
  return (
    doc || {
      status: 'disconnected',
      me: null,
    }
  )
}

export interface SessionView extends SessionDoc {
  online: boolean
  workerAlive: boolean
  heartbeatAge: number | null
}

export async function getSessionView(): Promise<SessionView> {
  const doc = await getSessionDoc()
  const now = Date.now()
  const heartbeatAge = doc.workerAt ? now - doc.workerAt : null
  const workerAlive = heartbeatAge !== null && heartbeatAge < 45_000
  return {
    ...doc,
    online: doc.status === 'open' && workerAlive,
    workerAlive,
    heartbeatAge,
  }
}

/** Jeda minimum antar-permintaan auto-start (mencegah spam dispatch). */
export const WORKER_TRIGGER_COOLDOWN_MS = 3 * 60_000

/**
 * Klaim slot auto-start worker secara atomik. Mengembalikan `allowed: false`
 * bila ada permintaan lain dalam masa cooldown.
 */
export async function claimWorkerTrigger(
  cooldownMs = WORKER_TRIGGER_COOLDOWN_MS,
): Promise<{ allowed: boolean; lastAt: number | null; waitSeconds: number }> {
  const database = await db()
  const col = database.collection<SessionDoc>(COLLECTIONS.session)
  const now = Date.now()

  await col.updateOne({ _id: STATUS_ID }, { $setOnInsert: { status: 'disconnected' } }, { upsert: true })

  const claimed = await col.updateOne(
    {
      _id: STATUS_ID,
      $or: [{ workerTriggerAt: { $exists: false } }, { workerTriggerAt: null }, { workerTriggerAt: { $lt: now - cooldownMs } }],
    },
    { $set: { workerTriggerAt: now, workerTriggerBy: 'panel' } },
  )

  const doc = await col.findOne({ _id: STATUS_ID }, { projection: { workerTriggerAt: 1 } })
  const lastAt = doc?.workerTriggerAt ?? null
  const waitSeconds = lastAt ? Math.max(0, Math.ceil((lastAt + cooldownMs - now) / 1000)) : 0

  return { allowed: claimed.modifiedCount === 1, lastAt, waitSeconds }
}

export async function recordWorkerTrigger(result: { ok: boolean; error?: string | null }) {
  const database = await db()
  await database.collection<SessionDoc>(COLLECTIONS.session).updateOne(
    { _id: STATUS_ID },
    {
      $set: {
        workerTriggerOk: result.ok,
        workerTriggerError: result.ok ? null : result.error || 'Gagal memicu workflow',
        workerTriggerAt: Date.now(),
      },
    },
  )
}

type ContactDoc = {
  _id: string
  name?: string | null
  notify?: string | null
  verifiedName?: string | null
  avatar?: string | null
  avatarMime?: string | null
  avatarAt?: number | null
  avatarRequestedAt?: number | null
}

const AVATAR_TTL_MS = 6 * 60 * 60_000
const AVATAR_REQUEST_COOLDOWN_MS = 10 * 60_000
const NAME_LOOKS_RAW = /^[\d\-+\s]+$/

/** Nama kontak yang tersimpan worker, dipakai saat wa_chats belum punya nama. */
async function contactNamesFor(jids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!jids.length) return map
  const database = await db()
  const rows = await database
    .collection<ContactDoc>(COLLECTIONS.contacts)
    .find({ _id: { $in: jids } }, { projection: { name: 1, notify: 1, verifiedName: 1 } })
    .toArray()
  for (const row of rows) {
    const name = row.name || row.notify || row.verifiedName
    if (name && !NAME_LOOKS_RAW.test(name)) map.set(row._id, name)
  }
  return map
}

/** Foto profil (data URL) untuk daftar JID — hanya yang sudah tersimpan worker. */
export async function getAvatars(jids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(jids.filter(Boolean))).slice(0, 80)
  if (!unique.length) return {}
  const database = await db()
  const rows = await database
    .collection<ContactDoc>(COLLECTIONS.contacts)
    .find({ _id: { $in: unique }, avatar: { $type: 'string' } }, { projection: { avatar: 1, avatarMime: 1 } })
    .toArray()
  const out: Record<string, string> = {}
  for (const row of rows) {
    if (!row.avatar) continue
    out[row._id] = `data:${row.avatarMime || 'image/jpeg'};base64,${row.avatar}`
  }
  return out
}

/**
 * Minta worker mengambil foto profil yang belum ada / sudah kedaluwarsa.
 * Ada cooldown supaya tidak menembak WhatsApp berulang untuk JID yang sama.
 */
export async function requestAvatars(jids: string[], max = 12): Promise<number> {
  const unique = Array.from(new Set(jids.filter(Boolean))).slice(0, 80)
  if (!unique.length) return 0
  const database = await db()
  const col = database.collection<ContactDoc>(COLLECTIONS.contacts)
  const now = Date.now()
  const stale = {
    $or: [
      { avatarAt: { $exists: false } },
      { avatarAt: null },
      { avatarAt: { $lt: now - AVATAR_TTL_MS } },
    ],
  }

  const rows = await col
    .find(
      { _id: { $in: unique }, ...stale, $and: [{ $or: [{ avatarRequestedAt: { $exists: false } }, { avatarRequestedAt: null }, { avatarRequestedAt: { $lt: now - AVATAR_REQUEST_COOLDOWN_MS } }] }] },
      { projection: { _id: 1 } },
    )
    .limit(max)
    .toArray()

  let queued = 0
  for (const row of rows) {
    const claimed = await col.updateOne(
      { _id: row._id, ...stale },
      { $set: { avatarRequestedAt: now } },
    )
    if (!claimed.modifiedCount) continue
    await enqueueCommand('avatar', { jid: row._id })
    queued += 1
  }
  return queued
}

export async function countUnread(): Promise<number> {
  const database = await db()
  const rows = await database
    .collection<ChatDoc>(COLLECTIONS.chats)
    .aggregate<{ total: number }>([
      { $match: { unread: { $gt: 0 }, archived: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$unread' } } },
    ])
    .toArray()
  return rows[0]?.total || 0
}

export async function listChats(opts: { filter?: string; q?: string; limit?: number } = {}): Promise<ChatSummary[]> {
  const database = await db()
  const { filter = 'all', q = '', limit = 200 } = opts
  const query: Record<string, unknown> = {}
  if (filter === 'unread') query.unread = { $gt: 0 }
  if (filter === 'groups') query.isGroup = true
  if (filter === 'archived') query.archived = true
  else query.archived = { $ne: true }

  if (q.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    query.$or = [{ name: rx }, { lastText: rx }, { _id: rx }]
  }

  const docs = await database
    .collection<ChatDoc>(COLLECTIONS.chats)
    .find(query)
    .sort({ lastTs: -1, updatedAt: -1 })
    .limit(Math.min(limit, 300))
    .toArray()

  const needName = docs
    .filter((c) => !c.name || NAME_LOOKS_RAW.test(c.name) || /@/.test(c.name))
    .map((c) => c._id)
  const names = await contactNamesFor(needName)

  return docs.map((c) => {
    const fallback = c.name && !NAME_LOOKS_RAW.test(c.name) ? c.name : null
    const resolved = fallback || names.get(c._id) || jidToPhone(c._id) || c._id
    return {
    jid: c._id,
    name: resolved,
    isGroup: Boolean(c.isGroup),
    unread: c.unread || 0,
    lastTs: c.lastTs || 0,
    lastText: c.lastText || '',
    lastFromMe: Boolean(c.lastFromMe),
    lastType: c.lastType || 'chat',
    pinned: c.pinned || 0,
    archived: Boolean(c.archived),
    }
  })
}

export async function getChat(jid: string): Promise<ChatSummary | null> {
  const database = await db()
  const c = await database.collection<ChatDoc>(COLLECTIONS.chats).findOne({ _id: jid })
  if (!c) return null
  const usable = c.name && !NAME_LOOKS_RAW.test(c.name) ? c.name : null
  const fromContact = usable ? null : (await contactNamesFor([jid])).get(jid) || null
  return {
    jid: c._id,
    name: usable || fromContact || jidToPhone(c._id) || c._id,
    isGroup: Boolean(c.isGroup),
    unread: c.unread || 0,
    lastTs: c.lastTs || 0,
    lastText: c.lastText || '',
    lastFromMe: Boolean(c.lastFromMe),
    lastType: c.lastType || 'chat',
    pinned: c.pinned || 0,
    archived: Boolean(c.archived),
  }
}

export async function listMessages(
  jid: string,
  opts: { before?: number; limit?: number } = {},
): Promise<{ messages: MessageDoc[]; hasMore: boolean }> {
  const database = await db()
  const limit = Math.min(opts.limit || 40, 100)
  const query: Record<string, unknown> = { jid }
  if (opts.before) query.ts = { $lt: opts.before }
  const docs = await database
    .collection<MessageDoc>(COLLECTIONS.messages)
    .find(query)
    .sort({ ts: -1 })
    .limit(limit + 1)
    .toArray()
  const hasMore = docs.length > limit
  const messages = docs.slice(0, limit).reverse()
  return { messages, hasMore }
}

export async function enqueueCommand(type: CommandType, payload: Record<string, unknown> = {}) {
  const database = await db()
  const now = Date.now()
  const doc: Omit<CommandDoc, '_id'> = { type, payload, status: 'pending', createdAt: now, updatedAt: now }
  const res = await database.collection<CommandDoc>(COLLECTIONS.commands).insertOne(doc)
  return String(res.insertedId)
}

export async function waitForCommand(id: string, timeoutMs = 12_000) {
  const database = await db()
  const started = Date.now()
  let command: CommandDoc | null = null
  while (Date.now() - started < timeoutMs) {
    command = await database
      .collection<CommandDoc>(COLLECTIONS.commands)
      .findOne({ _id: new ObjectId(id) })
    if (command && (command.status === 'done' || command.status === 'error')) return command
    await new Promise((r) => setTimeout(r, 220))
  }
  return command
}

export async function mediaExists(msgId: string) {
  const database = await db()
  return (database.collection(COLLECTIONS.media) as Collection<any>).findOne(
    { _id: msgId },
    { projection: { mimetype: 1, size: 1 } },
  )
}

export async function getMediaDoc(msgId: string) {
  const database = await db()
  return (database.collection(COLLECTIONS.media) as Collection<any>).findOne(
    { _id: msgId },
    { projection: { mimetype: 1, data: 1, size: 1, kind: 1 } },
  )
}

export async function getUploadDoc(id: string) {
  const database = await db()
  if (!ObjectId.isValid(id)) return null
  return database.collection(COLLECTIONS.uploads).findOne({ _id: new ObjectId(id) })
}

export async function addContactName(jid: string, name: string) {
  const database = await db()
  await (database.collection(COLLECTIONS.contacts) as Collection<any>).updateOne(
    { _id: jid },
    { $set: { name, updatedAt: Date.now() } },
    { upsert: true },
  )
}
