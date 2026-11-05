import { NextResponse } from 'next/server'
import { mongoError, requireAuth } from '@/lib/api'
import { getAvatars, requestAvatars } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Foto profil kontak/grup.
 *
 *   GET /api/avatars?jids=628xxx@s.whatsapp.net,120363...@g.us
 *
 * Mengembalikan `{ avatars: { jid: dataUrl } }` untuk yang sudah tersimpan.
 * JID yang belum punya foto akan memicu perintah `avatar` ke worker
 * (dibatasi cooldown 10 menit + cache 6 jam), jadi panel tidak pernah
 * membanjiri WhatsApp dengan permintaan gambar.
 */
export async function GET(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const url = new URL(request.url)
    const jids = (url.searchParams.get('jids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 80)

    if (!jids.length) return NextResponse.json({ ok: true, avatars: {} })

    const avatars = await getAvatars(jids)
    const missing = jids.filter((jid) => !avatars[jid])
    const queued = missing.length ? await requestAvatars(missing).catch(() => 0) : 0

    return NextResponse.json(
      { ok: true, avatars, queued },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return mongoError(err)
  }
}
