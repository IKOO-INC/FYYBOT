import { NextResponse } from 'next/server'
import { getMongoClient, mongoConfigured, mongoUriKind } from '@/lib/mongo'
import { adminPassword } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  let mongo: 'ok' | 'error' | 'not-configured' = 'not-configured'
  let message: string | null = null
  if (mongoConfigured()) {
    try {
      const client = await getMongoClient()
      await client.db().command({ ping: 1 })
      mongo = 'ok'
    } catch (err) {
      mongo = 'error'
      message = err instanceof Error ? err.message : 'unknown error'
    }
  }

  return NextResponse.json({
    ok: mongo === 'ok',
    mongo,
    uriKind: mongoUriKind(),
    dbName: process.env.MONGODB_DB_NAME || process.env.WA_DB_NAME || 'fyywhatsapp',
    adminPasswordConfigured: Boolean(adminPassword()),
    message,
    time: new Date().toISOString(),
  })
}
