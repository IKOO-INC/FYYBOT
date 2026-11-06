import { NextResponse } from 'next/server'
import { mongoError, requireAuth } from '@/lib/api'
import { listChats, getSessionView } from '@/lib/store'

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
    const session = await getSessionView()
    // Dihitung dari daftar yang sudah digabung (LID + nomor) supaya tidak dobel.
    const unread = chats.reduce((total, chat) => total + (chat.unread || 0), 0)
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
