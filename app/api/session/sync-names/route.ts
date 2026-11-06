import { NextResponse } from 'next/server'
import { mongoError, requireAuth } from '@/lib/api'
import { enqueueCommand, waitForCommand } from '@/lib/store'

export const runtime = 'nodejs'
// Worker menyisir semua grup + pesan terakhir; beri ruang lebih dari default.
export const maxDuration = 60

/**
 * POST /api/session/sync-names
 *
 * Meminta worker:
 *  1. `groupFetchAllParticipating()` → isi nama semua grup sekaligus
 *  2. backfill nama chat 1:1 dari `pushName` pesan terakhir
 *
 * Dipakai tombol "Sinkronkan nama" di panel saat masih ada chat bernomor.
 */
export async function POST() {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const id = await enqueueCommand('sync-names')
    const result = await waitForCommand(id, 45_000)

    if (!result || result.status === 'pending' || result.status === 'processing') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Worker belum merespons. Pastikan proses worker (Baileys) berjalan dan memakai MONGODB_URI yang sama, lalu coba lagi.',
        },
        { status: 504 },
      )
    }

    if (result.status === 'error') {
      return NextResponse.json(
        { ok: false, error: result.error || 'Gagal menyinkronkan nama' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true, result: result.result || {} })
  } catch (err) {
    return mongoError(err)
  }
}
