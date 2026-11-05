import { MongoClient, type Db } from 'mongodb'
import { config } from './config'

export const COL = {
  auth: 'wa_auth',
  session: 'wa_status',
  chats: 'wa_chats',
  messages: 'wa_messages',
  contacts: 'wa_contacts',
  commands: 'wa_commands',
  media: 'wa_media',
  uploads: 'wa_uploads',
  locks: 'wa_locks',
} as const

let clientPromise: Promise<MongoClient> | null = null
let cacheDb: Db | null = null

export async function db(): Promise<Db> {
  if (cacheDb) return cacheDb
  if (!clientPromise) {
    const client = new MongoClient(config.mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
    })
    clientPromise = client.connect()
  }
  const client = await clientPromise
  cacheDb = client.db(config.dbName)
  return cacheDb
}

export async function closeDb() {
  if (!clientPromise) return
  const client = await clientPromise
  await client.close()
  clientPromise = null
  cacheDb = null
}

export async function ensureIndexes() {
  const database = await db()
  await Promise.all([
    database.collection(COL.messages).createIndex({ jid: 1, ts: -1 }),
    database.collection(COL.chats).createIndex({ lastTs: -1 }),
    database.collection(COL.commands).createIndex({ status: 1, createdAt: 1 }),
    database.collection(COL.media).createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 }),
  ])
}
