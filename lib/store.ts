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

/* ------------------------------------------------------------------ */
/* Alias JID: WhatsApp memberi ID internal (@lid) di samping nomor      */
/* (@s.whatsapp.net) untuk orang yang sama. Semua pembacaan di bawah    */
/* memperlakukan keduanya sebagai SATU percakapan.                      */
/* ------------------------------------------------------------------ */

type AliasDoc = { _id: string; alias?: string | null; updatedAt?: number }

export function isLidJid(jid: string) {
  return jid.endsWith('@lid')
}

/** Semua JID yang merujuk orang yang sama (termasuk dirinya sendiri). */
export async function aliasJids(jid: string): Promise<string[]> {
  if (!jid) return []
  const database = await db()
  const rows = await database
    .collection<AliasDoc>(COLLECTIONS.jidMap)
    .find({ _id: { $in: [jid] } }, { projection: { alias: 1 } })
    .toArray()
  const out = new Set<string>([jid])
  for (const row of rows) {
    if (row.alias) out.add(row.alias)
  }
  // satu hop lagi (kalau peta tersimpan terbalik)
  if (out.size > 1) {
    const more = await database
      .collection<AliasDoc>(COLLECTIONS.jidMap)
      .find({ _id: { $in: Array.from(out) } }, { projection: { alias: 1 } })
      .toArray()
    for (const row of more) if (row.alias) out.add(row.alias)
  }
  return Array.from(out).slice(0, 4)
}

/** JID yang dipakai untuk mengirim: LID bila ada (paling cepat sampai). */
export async function preferredJid(jid: string): Promise<string> {
  const all = await aliasJids(jid)
  return all.find(isLidJid) || jid
}

/** Grup baris chat berdasarkan orang yang sama. */
async function aliasGroups(jids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>() // jid → canonical
  if (!jids.length) return map
  const database = await db()
  const rows = await database
    .collection<AliasDoc>(COLLECTIONS.jidMap)
    .find({ _id: { $in: jids } }, { projection: { alias: 1 } })
    .toArray()
  const direct = new Map(rows.filter((r) => r.alias).map((r) => [r._id, String(r.alias)]))

  for (const jid of jids) {
    if (isLidJid(jid)) {
      map.set(jid, jid)
      continue
    }
    const alias = direct.get(jid)
    map.set(jid, alias && isLidJid(alias) ? alias : jid)
  }
  return map
}

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

/** Nama pengirim terakhir per chat 1:1 (cadangan saat wa_contacts kosong). */
async function latestSenderNames(jids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const targets = jids.filter((jid) => jid && !jid.endsWith('@g.us'))
  if (!targets.length) return map
  const database = await db()
  const rows = await database
    .collection<{ _id: string; name?: string }>(COLLECTIONS.messages)
    .aggregate<{ _id: string; name?: string }>([
      { $match: { jid: { $in: targets }, senderName: { $type: 'string' } } },
      { $sort: { ts: -1 } },
      { $group: { _id: '$jid', name: { $first: '$senderName' } } },
    ])
    .toArray()
  for (const row of rows) {
    if (row.name && !NAME_LOOKS_RAW.test(row.name)) map.set(row._id, row.name)
  }
  return map
}

/** Foto profil (data URL) untuk daftar JID — hanya yang sudah tersimpan worker. */
export async function getAvatars(jids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(jids.filter(Boolean))).slice(0, 80)
  if (!unique.length) return {}

  // Foto bisa tersimpan di JID nomor maupun LID — cari di keduanya.
  const expanded = new Map<string, string[]>()
  for (const jid of unique) expanded.set(jid, await aliasJids(jid))
  const lookup = Array.from(new Set(Array.from(expanded.values()).flat()))

  const database = await db()
  const rows = await database
    .collection<ContactDoc>(COLLECTIONS.contacts)
    .find({ _id: { $in: lookup }, avatar: { $type: 'string' } }, { projection: { avatar: 1, avatarMime: 1 } })
    .toArray()

  const byJid = new Map<string, string>()
  for (const row of rows) {
    if (!row.avatar) continue
    byJid.set(row._id, `data:${row.avatarMime || 'image/jpeg'};base64,${row.avatar}`)
  }

  const out: Record<string, string> = {}
  for (const [jid, aliases] of expanded) {
    const found = aliases.map((alias) => byJid.get(alias)).find(Boolean)
    if (found) out[jid] = found
  }
  return out
}

/**
 * Minta worker mengambil foto profil yang belum ada / sudah kedaluwarsa.
 * Ada cooldown supaya tidak menembak WhatsApp berulang untuk JID yang sama.
 */
export async function requestAvatars(jids: string[], max = 24): Promise<number> {
  const unique = Array.from(new Set(jids.filter(Boolean))).slice(0, 80)
  if (!unique.length) return 0
  const database = await db()
  const col = database.collection<ContactDoc>(COLLECTIONS.contacts)
  const now = Date.now()

  const docs = await col
    .find(
      { _id: { $in: unique } },
      { projection: { _id: 1, avatar: 1, avatarAt: 1, avatarRequestedAt: 1 } },
    )
    .toArray()
  const byId = new Map(docs.map((doc) => [doc._id, doc]))

  let queued = 0
  for (const jid of unique) {
    if (queued >= max) break
    const doc = byId.get(jid)
    const hasFreshAvatar = Boolean(doc?.avatar) && Boolean(doc?.avatarAt) && now - Number(doc?.avatarAt) < AVATAR_TTL_MS
    if (hasFreshAvatar) continue
    if (doc?.avatarRequestedAt && now - Number(doc.avatarRequestedAt) < AVATAR_REQUEST_COOLDOWN_MS) continue

    try {
      if (doc) {
        await col.updateOne({ _id: jid }, { $set: { avatarRequestedAt: now } })
      } else {
        // Kontak belum pernah tersimpan: buat dokumen penanda supaya perintah
        // `avatar` tetap dikirim (dulu kasus ini terlewat dan foto tak pernah muncul).
        await col.updateOne(
          { _id: jid },
          { $set: { avatarRequestedAt: now, updatedAt: now } },
          { upsert: true },
        )
      }
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue
      throw err
    }

    await enqueueCommand('avatar', { jid })
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

  const canonicalOf = await aliasGroups(docs.map((doc) => doc._id))

  // Gabungkan baris yang orangnya sama (nomor + LID) menjadi satu percakapan.
  const grouped = new Map<string, { doc: ChatDoc; jids: string[] }>()
  for (const doc of docs) {
    const canonical = canonicalOf.get(doc._id) || doc._id
    const existing = grouped.get(canonical)
    if (!existing) {
      grouped.set(canonical, { doc: { ...doc }, jids: [doc._id] })
      continue
    }
    existing.jids.push(doc._id)
    const base = existing.doc
    // unread jangan dijumlah (bisa dobel) — ambil yang terbesar
    base.unread = Math.max(base.unread || 0, doc.unread || 0)
    base.archived = Boolean(base.archived) && Boolean(doc.archived)
    base.pinned = Math.max(base.pinned || 0, doc.pinned || 0)
    if ((doc.lastTs || 0) > (base.lastTs || 0)) {
      base.lastTs = doc.lastTs
      base.lastText = doc.lastText
      base.lastFromMe = doc.lastFromMe
      base.lastType = doc.lastType
    }
    if (!base.name || NAME_LOOKS_RAW.test(String(base.name))) {
      if (doc.name && !NAME_LOOKS_RAW.test(doc.name)) base.name = doc.name
    }
  }

  const rows = Array.from(grouped.entries()).map(([canonical, value]) => ({ canonical, ...value }))
  const allJids = rows.flatMap((row) => row.jids)

  const needName = allJids.filter((jid) => {
    const row = rows.find((item) => item.jids.includes(jid))
    return !row?.doc.name || NAME_LOOKS_RAW.test(String(row.doc.name))
  })
  const names = await contactNamesFor(needName)
  const senderNames = await latestSenderNames(
    needName.filter((jid) => !names.has(jid) && !jid.endsWith('@g.us')),
  )

  return rows.map(({ canonical, doc, jids }) => {
    const usable = doc.name && !NAME_LOOKS_RAW.test(doc.name) ? doc.name : null
    const contactName = jids.map((jid) => names.get(jid)).find(Boolean) || null
    const senderName = jids.map((jid) => senderNames.get(jid)).find(Boolean) || null
    const phone = jids.map((jid) => jidToPhone(jid)).find(Boolean) || jidToPhone(canonical)
    return {
      jid: canonical,
      jids,
      name: usable || contactName || senderName || phone || canonical,
      isGroup: Boolean(doc.isGroup),
      unread: doc.unread || 0,
      lastTs: doc.lastTs || 0,
      lastText: doc.lastText || '',
      lastFromMe: Boolean(doc.lastFromMe),
      lastType: doc.lastType || 'chat',
      pinned: doc.pinned || 0,
      archived: Boolean(doc.archived),
    }
  })
}

export async function getChat(jid: string): Promise<ChatSummary | null> {
  const database = await db()
  const jids = await aliasJids(jid)
  const canonical = isLidJid(jid) ? jid : jids.find(isLidJid) || jid
  const docs = await database
    .collection<ChatDoc>(COLLECTIONS.chats)
    .find({ _id: { $in: jids } })
    .toArray()
  if (!docs.length) return null

  const latest = docs.reduce((best, doc) => ((doc.lastTs || 0) > (best.lastTs || 0) ? doc : best), docs[0])
  const named = docs.find((doc) => doc.name && !NAME_LOOKS_RAW.test(doc.name))
  const names = await contactNamesFor(jids.filter((item) => !named))
  const contactName = jids.map((item) => names.get(item)).find(Boolean) || null
  const senderNames = await latestSenderNames(
    jids.filter((item) => !contactName && !item.endsWith('@g.us')),
  )
  const senderName = jids.map((item) => senderNames.get(item)).find(Boolean) || null
  const phone = jids.map((item) => jidToPhone(item)).find(Boolean) || jidToPhone(canonical)

  return {
    jid: canonical,
    jids,
    name: named?.name || contactName || senderName || phone || canonical,
    isGroup: docs.some((doc) => doc.isGroup),
    unread: Math.max(...docs.map((doc) => doc.unread || 0)),
    lastTs: latest.lastTs || 0,
    lastText: latest.lastText || '',
    lastFromMe: Boolean(latest.lastFromMe),
    lastType: latest.lastType || 'chat',
    pinned: Math.max(...docs.map((doc) => doc.pinned || 0)),
    archived: docs.every((doc) => Boolean(doc.archived)),
  }
}

export async function listMessages(
  jid: string,
  opts: { before?: number; after?: number; limit?: number } = {},
): Promise<{ messages: MessageDoc[]; hasMore: boolean }> {
  const database = await db()
  const jids = await aliasJids(jid)

  // Mode "delta": hanya pesan yang lebih baru dari `after` (untuk polling
  // ringan — tidak perlu mengangkut ulang 40 pesan setiap 2 detik).
  if (opts.after) {
    const docs = await database
      .collection<MessageDoc>(COLLECTIONS.messages)
      .find({ jid: { $in: jids }, ts: { $gt: opts.after } })
      .sort({ ts: 1 })
      .limit(Math.min(opts.limit || 100, 200))
      .toArray()
    return { messages: docs, hasMore: false }
  }

  const limit = Math.min(opts.limit || 40, 100)
  const query: Record<string, unknown> = { jid: { $in: jids } }
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
