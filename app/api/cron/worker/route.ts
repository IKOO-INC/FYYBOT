import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { mongoError } from '@/lib/api'
import { dispatchWorker, githubConfig } from '@/lib/github'
import { claimWorkerTrigger, getSessionView, recordWorkerTrigger } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 25

/**
 * Endpoint untuk cron eksternal (cron-job.org, UptimeRobot, Vercel Cron, dsb).
 *
 *   GET /api/cron/worker?key=CRON_SECRET
 *   Authorization: Bearer CRON_SECRET
 *
 * Kalau heartbeat worker sudah mati, endpoint ini men-dispatch workflow
 * GitHub Actions (dengan cooldown yang sama seperti tombol di panel).
 */
function secretOk(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: false, configured: false }

  const header = request.headers.get('authorization') || ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const queryKey = new URL(request.url).searchParams.get('key') || ''
  const provided = bearer || queryKey

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  const match = a.length === b.length && timingSafeEqual(a, b)
  return { ok: match, configured: true }
}

async function handle(request: Request) {
  const auth = secretOk(request)
  if (!auth.configured) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET belum diset di Environment Variables.' },
      { status: 503 },
    )
  }
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const session = await getSessionView()
    if (session.workerAlive) {
      return NextResponse.json({ ok: true, workerAlive: true, dispatched: false, heartbeatAge: session.heartbeatAge })
    }

    if (!githubConfig.enabled) {
      return NextResponse.json({
        ok: false,
        workerAlive: false,
        configured: false,
        error: 'GITHUB_TOKEN belum diset, auto-start tidak bisa dijalankan.',
        actionsUrl: githubConfig.actionsUrl,
      })
    }

    const claim = await claimWorkerTrigger()
    if (!claim.allowed) {
      return NextResponse.json({
        ok: true,
        workerAlive: false,
        dispatched: false,
        cooldown: true,
        waitSeconds: claim.waitSeconds,
      })
    }

    const result = await dispatchWorker()
    await recordWorkerTrigger({ ok: result.ok, error: result.error })

    return NextResponse.json(
      {
        ok: result.ok,
        workerAlive: false,
        dispatched: result.ok,
        error: result.ok ? undefined : result.error,
        hint: result.ok ? undefined : result.hint,
        actionsUrl: githubConfig.actionsUrl,
      },
      { status: result.ok ? 200 : 502 },
    )
  } catch (err) {
    return mongoError(err)
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
