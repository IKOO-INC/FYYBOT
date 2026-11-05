import { NextResponse } from 'next/server'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { enqueueCommand, waitForCommand } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const body = (await request.json()) as { jid?: string; text?: string }
    const jid = String(body.jid || '')
    const text = String(body.text || '')
    if (!jid) return badRequest('jid wajib diisi')
    if (!text.trim()) return badRequest('Pesan kosong')

    const commandId = await enqueueCommand('send-text', { jid, text })
    const result = await waitForCommand(commandId, 9000)
    return NextResponse.json({
      ok: result?.status === 'done',
      commandId,
      status: result?.status || 'pending',
      result: result?.result || null,
      error: result?.status === 'error' ? result.error : null,
    })
  } catch (err) {
    return mongoError(err)
  }
}
