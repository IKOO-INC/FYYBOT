'use client'

import { useState } from 'react'
import { RefreshIcon } from '@/components/icons'

type SyncResult = {
  groups?: { groups?: number; total?: number }
  chats?: { updated?: number; total?: number }
}

/**
 * Tombol manual untuk meminta worker menyinkronkan nama grup + nama 1:1.
 * Berguna saat masih ada chat yang tampil sebagai nomor panjang.
 */
export default function SyncNamesButton({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    if (state === 'loading') return
    setState('loading')
    setMessage(null)
    try {
      const res = await fetch('/api/session/sync-names', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; result?: SyncResult }
      if (!res.ok || !json.ok) throw new Error(json?.error || `Gagal menyinkronkan (${res.status})`)
      const groups = json.result?.groups?.groups ?? 0
      const chats = json.result?.chats?.updated ?? 0
      setState('done')
      setMessage(`${groups} grup & ${chats} chat diperbarui`)
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'Gagal menyinkronkan nama')
    }
  }

  return (
    <div className={compact ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-3'}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === 'loading'}
        className="inline-flex items-center gap-2 rounded-full bg-[#00a884] px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-[#019477] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <RefreshIcon size={13} className={state === 'loading' ? 'animate-spin' : ''} />
        {state === 'loading' ? 'Menyinkronkan…' : 'Sinkronkan nama & foto'}
      </button>
      {message && (
        <span
          className={`text-[11px] leading-snug ${
            state === 'error' ? 'text-red-600 dark:text-red-300' : 'text-[var(--wa-text-soft)]'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  )
}
