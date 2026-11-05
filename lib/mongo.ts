import { MongoClient, type Db } from 'mongodb'

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || ''
const dbName = process.env.MONGODB_DB_NAME || process.env.WA_DB_NAME || 'fyywhatsapp'

type Cache = {
  client?: MongoClient
  promise?: Promise<MongoClient>
}

const globalCache = globalThis as unknown as { __fyyMongo?: Cache }
if (!globalCache.__fyyMongo) globalCache.__fyyMongo = {}
const cache = globalCache.__fyyMongo

export function mongoConfigured() {
  return Boolean(uri)
}

export function mongoUriKind() {
  if (!uri) return 'missing'
  if (uri.startsWith('mongodb+srv://')) return 'atlas-srv'
  if (uri.startsWith('mongodb://')) return 'standard'
  return 'unknown'
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error(
      'MONGODB_URI belum diset. Tambahkan connection string MongoDB Atlas ke Environment Variables (Vercel / .env.local).',
    )
  }
  if (!cache.promise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      retryWrites: true,
    })
    cache.client = client
    cache.promise = client.connect()
  }
  return cache.promise
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient()
  return client.db(dbName)
}

export const COLLECTIONS = {
  auth: 'wa_auth',
  session: 'wa_status',
  chats: 'wa_chats',
  messages: 'wa_messages',
  contacts: 'wa_contacts',
  commands: 'wa_commands',
  media: 'wa_media',
  uploads: 'wa_uploads',
} as const

export async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection(COLLECTIONS.messages).createIndex({ jid: 1, ts: -1 }).catch(() => null),
    db.collection(COLLECTIONS.messages).createIndex({ ts: -1 }).catch(() => null),
    db.collection(COLLECTIONS.chats).createIndex({ lastTs: -1 }).catch(() => null),
    db.collection(COLLECTIONS.commands).createIndex({ status: 1, createdAt: 1 }).catch(() => null),
    db.collection(COLLECTIONS.uploads).createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }).catch(() => null),
  ])
}
