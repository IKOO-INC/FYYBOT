import { NextResponse } from 'next/server'
import { mongoError, requireAuth } from '@/lib/api'
import { countUnread, listChats, getSessionView } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const url = new URL(request.url)
    const chats = await listChats({
      filter: url.searchParams.get('filter') || 'all',
      q: url.searchParams.get('q') || '',
      limit: Number(url.searchParams.get('limit') || 200),
    })
    const [session, unread] = await Promise.all([getSessionView(), countUnread()])
    return NextResponse.json(
      {
        ok: true,
        chats,
        unread,
        online: session.online,
        me: session.me || null,
        count: chats.length,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return mongoError(err)
  }
}
