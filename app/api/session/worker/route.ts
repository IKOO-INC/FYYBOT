import { NextResponse } from 'next/server'
import { mongoError, requireAuth } from '@/lib/api'
import { dispatchWorker, githubConfig } from '@/lib/github'
import { claimWorkerTrigger, getSessionView, recordWorkerTrigger } from '@/lib/store'

export const runtime = 'nodejs'
export const maxDuration = 25

/**
 * Menyalakan worker Baileys lewat `workflow_dispatch` GitHub Actions.
 *
 * Dipakai tombol "Nyalakan worker" dan auto-start di halaman Koneksi.
 * - Tidak melakukan apa pun kalau heartbeat worker masih segar.
 * - Dibatasi cooldown (default 3 menit) supaya workflow tidak di-dispatch berulang.
 */
export async function POST() {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const session = await getSessionView()

    if (session.workerAlive) {
      return NextResponse.json({
        ok: true,
        alreadyRunning: true,
        message: 'Worker sudah aktif — menunggu heartbeat dan QR berikutnya.',
      })
    }

    if (!githubConfig.enabled) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          error: 'Auto-start belum aktif: GITHUB_TOKEN belum diset di Vercel.',
          hint: 'Tambahkan Environment Variable GITHUB_TOKEN (PAT dengan izin Actions: Read and write), lalu redeploy.',
          actionsUrl: githubConfig.actionsUrl,
        },
        { status: 400 },
      )
    }

    const claim = await claimWorkerTrigger()
    if (!claim.allowed) {
      return NextResponse.json({
        ok: true,
        alreadyRequested: true,
        waitSeconds: claim.waitSeconds,
        message: `Worker sudah diminta menyala ${claim.waitSeconds}s lalu. GitHub Actions butuh ±1 menit untuk mulai — halaman ini menyegarkan otomatis.`,
        actionsUrl: githubConfig.actionsUrl,
      })
    }

    const result = await dispatchWorker()
    await recordWorkerTrigger({ ok: result.ok, error: result.error })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          error: result.error,
          hint: result.hint,
          actionsUrl: githubConfig.actionsUrl,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      dispatched: true,
      message: 'Workflow WhatsApp Worker dijalankan di GitHub Actions. Worker menyala dalam ±1 menit.',
      actionsUrl: githubConfig.actionsUrl,
    })
  } catch (err) {
    return mongoError(err)
  }
}
