import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { mongoError, requireAuth } from '@/lib/api'
import { WORKER_TRIGGER_COOLDOWN_MS, getSessionView } from '@/lib/store'
import { githubConfig } from '@/lib/github'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const session = await getSessionView()
    const now = Date.now()

    // QR hanya boleh tampil kalau masih dalam masa berlaku yang ditulis worker
    // (worker mengikuti TTL Baileys: 60 dtk untuk QR pertama, 20 dtk berikutnya).
    const rawQr = session.qr || null
    const issuedAt = session.qrUpdatedAt || null
    // Dokumen sesi lama mungkin belum punya qrExpiresAt → pakai perkiraan 60 dtk
    // dari qrUpdatedAt supaya QR basi tetap tidak ditampilkan.
    const expiresAt = session.qrExpiresAt || (issuedAt ? issuedAt + 60_000 : null)
    const fresh = Boolean(rawQr) && (expiresAt ? expiresAt > now : true)

    const qrDataUrl =
      fresh && rawQr
        ? await QRCode.toDataURL(rawQr, {
            margin: 1,
            width: 720,
            color: { dark: '#111b21', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          })
        : null

    const qrExpiresIn = fresh && expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null
    const qrTtl = fresh && expiresAt && issuedAt ? Math.max(1, Math.round((expiresAt - issuedAt) / 1000)) : null

    const rawPairing = session.pairingCode || null
    const pairingIssuedAt = session.pairingAt || null
    const pairingExpiresAt =
      session.pairingExpiresAt || (pairingIssuedAt ? pairingIssuedAt + 120_000 : null)
    const pairingFresh = Boolean(rawPairing) && (pairingExpiresAt ? pairingExpiresAt > now : true)
    const pairingExpiresIn =
      pairingFresh && pairingExpiresAt ? Math.max(0, Math.ceil((pairingExpiresAt - now) / 1000)) : null

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
          pairingCode: pairingFresh ? rawPairing : null,
          pairingPhone: session.pairingPhone || null,
          pairingAt: pairingFresh ? pairingIssuedAt : null,
          pairingExpiresAt: pairingFresh ? pairingExpiresAt : null,
          pairingExpiresIn: pairingExpiresIn,
          workerId: session.workerId || null,
          workerVersion: session.workerVersion || null,
          connectedAt: session.connectedAt || null,
          startedAt: session.startedAt || null,
          qr: qrDataUrl,
          qrUpdatedAt: fresh ? issuedAt : null,
          qrExpiresAt: fresh ? expiresAt : null,
          qrExpiresIn,
          qrTtl,
          qrSeq: session.qrSeq || 0,
          autoTrigger: {
            configured: githubConfig.enabled,
            cooldownSeconds: Math.round(WORKER_TRIGGER_COOLDOWN_MS / 1000),
            lastAt: session.workerTriggerAt || null,
            lastOk: session.workerTriggerOk ?? null,
            lastError: session.workerTriggerError || null,
            actionsUrl: githubConfig.actionsUrl,
            repo: githubConfig.repo,
            workflow: githubConfig.workflow,
          },
        },
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return mongoError(err)
  }
}
