import { NextResponse } from 'next/server'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { enqueueCommand, waitForCommand } from '@/lib/store'

export const runtime = 'nodejs'
// Menunggu worker (poll 220 ms) — beri ruang lebih dari 12 dtk.
export const maxDuration = 30

const ALLOWED = new Set(['logout', 'restart', 'pair'])

function offlineResponse() {
  return NextResponse.json(
    {
      ok: false,
      status: 'pending',
      error:
        'Worker tidak merespons. Pastikan proses worker (Baileys) sedang berjalan dan memakai MONGODB_URI yang sama.',
    },
    { status: 504 },
  )
}

export async function POST(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const body = (await request.json()) as { action?: string; phone?: string }
    const action = String(body.action || '')
    if (!ALLOWED.has(action)) return badRequest('Aksi tidak dikenal')

    if (action === 'pair') {
      const phone = String(body.phone || '').replace(/[^0-9]/g, '')
      if (phone.length < 8) return badRequest('Nomor tidak valid, gunakan format 628xxxx')

      const id = await enqueueCommand('pair', { phone })
      const result = await waitForCommand(id, 20_000)

      if (!result || result.status === 'pending' || result.status === 'processing') return offlineResponse()
      if (result.status === 'error') {
        return NextResponse.json({ ok: false, error: result.error || 'Gagal membuat pairing code' }, { status: 400 })
      }

      const payload = (result.result || {}) as { code?: string; expiresIn?: number; expiresAt?: number }
      if (!payload.code) {
        return NextResponse.json(
          { ok: false, error: 'Worker tidak mengembalikan kode pairing. Coba lagi.' },
          { status: 502 },
        )
      }

      return NextResponse.json({
        ok: true,
        pairingCode: payload.code,
        pairingPhone: phone,
        expiresAt: payload.expiresAt || null,
        expiresIn: payload.expiresIn || 120,
      })
    }

    const id = await enqueueCommand(action as 'logout' | 'restart')
    const result = await waitForCommand(id, 12_000)

    if (!result || result.status === 'pending' || result.status === 'processing') return offlineResponse()
    if (result.status === 'error') {
      return NextResponse.json({ ok: false, error: result.error || 'Aksi gagal dijalankan' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, status: result.status })
  } catch (err) {
    return mongoError(err)
  }
}
