import { NextResponse } from 'next/server'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { enqueueCommand, waitForCommand } from '@/lib/store'

export const runtime = 'nodejs'

const ALLOWED = new Set(['logout', 'restart', 'pair'])

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
      const result = await waitForCommand(id, 15_000)
      if (!result || result.status === 'error') {
        return NextResponse.json({ ok: false, error: result?.error || 'Worker tidak merespons. Pastikan worker aktif.' }, { status: 504 })
      }
      return NextResponse.json({ ok: true, pairingCode: (result.result as { code?: string })?.code || null })
    }

    const id = await enqueueCommand(action as 'logout' | 'restart')
    const result = await waitForCommand(id, 10_000)
    return NextResponse.json({
      ok: result?.status !== 'error',
      status: result?.status || 'pending',
      error: result?.error || null,
    })
  } catch (err) {
    return mongoError(err)
  }
}
