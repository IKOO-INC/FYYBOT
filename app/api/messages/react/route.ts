import { NextResponse } from 'next/server'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { enqueueCommand } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const body = (await request.json()) as { jid?: string; messageId?: string; emoji?: string; fromMe?: boolean }
    if (!body.jid || !body.messageId) return badRequest('jid dan messageId wajib diisi')
    const id = await enqueueCommand('react', {
      jid: body.jid,
      messageId: body.messageId,
      emoji: String(body.emoji || ''),
      fromMe: Boolean(body.fromMe),
    })
    return NextResponse.json({ ok: true, commandId: id })
  } catch (err) {
    return mongoError(err)
  }
}
