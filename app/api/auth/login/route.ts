import { NextResponse } from 'next/server'
import { adminPassword, checkPassword, setSessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let password = ''
  try {
    const body = (await request.json()) as { password?: string }
    password = String(body.password || '')
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid' }, { status: 400 })
  }

  if (!adminPassword()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'ADMIN_PASSWORD belum diset di environment. Tambahkan dulu agar panel bisa dibuka.',
      },
      { status: 503 },
    )
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, error: 'Password salah' }, { status: 401 })
  }

  await setSessionCookie()
  return NextResponse.json({ ok: true })
}
