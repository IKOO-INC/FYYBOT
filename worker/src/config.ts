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
  // QR lifetime, mengikuti default Baileys 6.7 (lib/Socket/socket.js):
  // QR pertama hidup 60 detik, QR berikutnya 20 detik.
  // Jangan set `qrTimeout` di makeWASocket agar kedua angka ini tetap sama.
  qrTtlFirstMs: Number(process.env.WA_QR_TTL_FIRST_MS || 60_000),
  qrTtlNextMs: Number(process.env.WA_QR_TTL_NEXT_MS || 20_000),
  qrSweepMs: Number(process.env.WA_QR_SWEEP_MS || 4000),
  // Masa berlaku pairing code (WhatsApp menolak kode lama).
  pairingTtlMs: Number(process.env.WA_PAIRING_TTL_MS || 120_000),
  // Satu DB boleh dipakai beberapa host; lock mencegah dua worker memegang
  // sesi yang sama (mis. GitHub Actions + laptop menyala bersamaan).
  disableLock: (process.env.WA_DISABLE_LOCK || 'false') === 'true',
  lockTtlMs: Number(process.env.WA_LOCK_TTL_MS || 90_000),
  lockWaitMs: Number(process.env.WA_LOCK_WAIT_MS || 300_000),
  // Batas umur proses (0 = tanpa batas). Dipakai GitHub Actions yang
  // maksimal 6 jam per job: worker menutup diri lebih dulu supaya job
  // berikutnya bisa mengambil alih tanpa tumpang tindih.
  maxRuntimeMs: Number(process.env.WA_MAX_RUNTIME_MS || 0),
  version: process.env.WORKER_VERSION || '1.1.0',
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
