import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { mongoError, requireAuth } from '@/lib/api'
import { getSessionView } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const session = await getSessionView()
    let qrDataUrl: string | null = null
    if (session.qr) {
      qrDataUrl = await QRCode.toDataURL(session.qr, {
        margin: 1,
        width: 640,
        color: { dark: '#111b21', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
    }

    return NextResponse.json(
      {
        ok: true,
        session: {
          status: session.status,
          online: session.online,
          workerAlive: session.workerAlive,
          heartbeatAge: session.heartbeatAge,
          me: session.me || null,
          lastError: session.lastError || null,
          pairingCode: session.pairingCode || null,
          pairingPhone: session.pairingPhone || null,
          connectedAt: session.connectedAt || null,
          startedAt: session.startedAt || null,
          qr: qrDataUrl,
          qrUpdatedAt: session.qrUpdatedAt || null,
        },
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return mongoError(err)
  }
}
