'use client'

import { useState } from 'react'
import { LogoutIcon } from '@/components/icons'

export default function LogoutButton() {
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    window.location.href = '/'
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 px-4 py-2.5 text-[12.5px] font-medium text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
    >
      <LogoutIcon size={15} /> {busy ? 'Keluar…' : 'Keluar dari panel'}
    </button>
  )
}
