import { NextResponse } from 'next/server'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { listMessages, getChat } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const url = new URL(request.url)
    const jid = url.searchParams.get('jid')
    if (!jid) return badRequest('jid wajib diisi')
    const before = Number(url.searchParams.get('before') || 0)
    const limit = Number(url.searchParams.get('limit') || 40)

    const [{ messages, hasMore }, chat] = await Promise.all([
      listMessages(jid, { before: before || undefined, limit }),
      getChat(jid),
    ])

    return NextResponse.json(
      { ok: true, messages, hasMore, chat },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return mongoError(err)
  }
}
