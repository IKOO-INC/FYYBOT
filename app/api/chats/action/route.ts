import { NextResponse } from 'next/server'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { enqueueCommand, preferredJid } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const body = (await request.json()) as { jid?: string; action?: string }
    const jid = String(body.jid || '')
    const action = String(body.action || '')
    if (!jid) return badRequest('jid wajib diisi')
    const target = await preferredJid(jid)

    if (action === 'read') {
      const id = await enqueueCommand('read', { jid: target })
      return NextResponse.json({ ok: true, commandId: id })
    }
    if (action === 'typing') {
      const id = await enqueueCommand('typing', { jid: target })
      return NextResponse.json({ ok: true, commandId: id })
    }
    return badRequest('Aksi tidak dikenal')
  } catch (err) {
    return mongoError(err)
  }
}
