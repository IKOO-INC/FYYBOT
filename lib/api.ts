import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'

export function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

export async function requireAuth() {
  const ok = await isAuthenticated()
  return ok ? null : unauthorized()
}

export function mongoError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada database'
  const notConfigured = message.includes('MONGODB_URI')
  return NextResponse.json(
    {
      ok: false,
      error: message,
      hint: notConfigured
        ? 'Set MONGODB_URI (dan MONGODB_DB_NAME) di Environment Variables lalu redeploy.'
        : undefined,
    },
    { status: notConfigured ? 503 : 500 },
  )
}

export function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 })
}
