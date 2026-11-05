import 'dotenv/config'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

function loadRootEnv() {
  // When running from ./worker, also allow the project root .env.local / .env
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env.local'),
    path.resolve(process.cwd(), '..', '.env'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    try {
      process.loadEnvFile?.(file)
    } catch {
      /* ignore */
    }
  }
}

loadRootEnv()

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || ''

export const config = {
  mongoUri: uri,
  dbName: process.env.MONGODB_DB_NAME || process.env.WA_DB_NAME || 'fyywhatsapp',
  sessionId: process.env.WA_SESSION_ID || 'default',
  workerId: process.env.WORKER_ID || `${os.hostname()}-${process.pid}`,
  syncFullHistory: (process.env.WA_SYNC_FULL_HISTORY || 'true') !== 'false',
  maxMediaBytes: Number(process.env.WA_MAX_MEDIA_MB || 8) * 1024 * 1024,
  autoDownloadMedia: (process.env.WA_AUTO_MEDIA || 'true') !== 'false',
  historyMessageLimit: Number(process.env.WA_HISTORY_LIMIT || 60),
  logLevel: process.env.WA_LOG_LEVEL || 'warn',
}

export function assertConfig() {
  if (!config.mongoUri) {
    console.error(
      '\n[worker] MONGODB_URI belum diset.\n' +
        'Tambahkan di file .env.local (root project) atau environment variable worker:\n' +
        '  MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority"\n' +
        '  MONGODB_DB_NAME="fyywhatsapp"\n',
    )
    process.exit(1)
  }
}
