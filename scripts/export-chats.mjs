#!/usr/bin/env node
/**
 * Ekspor semua chat + pesan terakhir ke file JSON di PC.
 *
 *   npm run chats:export                 # → data/chats/*.json + index.json
 *   npm run chats:export -- --limit 200  # batasi jumlah pesan per chat
 *   npm run chats:export -- --out D:\arsip-fyy
 *
 * Hasilnya bisa dibuka tanpa MongoDB (arsip/backup). Panel yang jalan di
 * Vercel tetap membaca MongoDB, karena file lokal PC tidak bisa diakses
 * dari internet.
 */
import { MongoClient } from 'mongodb'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fs from 'node:fs'

for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue
  try {
    process.loadEnvFile?.(file)
  } catch {
    /* abaikan file env yang tidak valid */
  }
}

const args = process.argv.slice(2)
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || ''
const dbName = process.env.MONGODB_DB_NAME || 'fyywhatsapp'
const outDir = path.resolve(arg('out', 'data/chats'))
const perChat = Math.max(1, Number(arg('limit', 500)))

if (!uri) {
  console.error('MONGODB_URI belum diisi. Jalankan `npm run setup` lalu isi .env.local.')
  process.exit(1)
}
if (/cluster0\.xxxxx|USER|PASSWORD/i.test(uri)) {
  console.error('MONGODB_URI masih contoh/placeholder. Isi connection string asli dari Atlas.')
  process.exit(1)
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 12000 })

try {
  await client.connect()
  const db = client.db(dbName)

  const chats = await db.collection('wa_chats').find({}).sort({ lastTs: -1 }).toArray()
  await mkdir(outDir, { recursive: true })

  const index = []
  let totalMessages = 0

  for (const chat of chats) {
    const docs = await db
      .collection('wa_messages')
      .find({ jid: chat._id }, { projection: { raw: 0 } })
      .sort({ ts: -1 })
      .limit(perChat)
      .toArray()

    const payload = {
      jid: chat._id,
      name: chat.name || null,
      isGroup: Boolean(chat.isGroup),
      unread: chat.unread || 0,
      lastTs: chat.lastTs || 0,
      exportedAt: Date.now(),
      count: docs.length,
      messages: docs.reverse(),
    }

    const fileName = `${String(chat._id).replace(/[^a-zA-Z0-9@._-]/g, '_')}.json`
    await writeFile(path.join(outDir, fileName), JSON.stringify(payload, null, 1), 'utf8')

    totalMessages += docs.length
    index.push({
      jid: chat._id,
      name: chat.name || null,
      isGroup: Boolean(chat.isGroup),
      unread: chat.unread || 0,
      lastTs: chat.lastTs || 0,
      messages: docs.length,
      file: fileName,
    })

    if (index.length % 50 === 0) console.log(`… ${index.length} chat`)
  }

  await writeFile(
    path.join(outDir, 'index.json'),
    JSON.stringify({ exportedAt: Date.now(), database: dbName, chats: index }, null, 2),
    'utf8',
  )

  console.log(`Selesai: ${index.length} chat, ${totalMessages} pesan → ${outDir}`)
} catch (err) {
  console.error('Ekspor gagal:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await client.close().catch(() => null)
}
