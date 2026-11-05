'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChatIcon, ChatFilled, LogoutIcon, MoonIcon, QrIcon, SettingsIcon, SunIcon } from '@/components/icons'
import { usePoll } from '@/lib/client'

const items = [
  { href: '/panel/chats', label: 'Chat', icon: ChatIcon, activeIcon: ChatFilled },
  { href: '/panel/connect', label: 'Koneksi WhatsApp', icon: QrIcon, activeIcon: QrIcon },
  { href: '/panel/settings', label: 'Pengaturan', icon: SettingsIcon, activeIcon: SettingsIcon },
]

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('fyy-theme', theme)
  } catch {
    /* ignore */
  }
}

export default function Rail() {
  const pathname = usePathname()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const { data } = usePoll<{ unread?: number; online?: boolean }>('/api/chats?limit=1', 15000)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem('fyy-theme')
    } catch {
      /* ignore */
    }
    const initial = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
    setTheme(initial)
    applyTheme(initial)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    window.location.href = '/'
  }

  const unread = data?.unread || 0

  return (
    <nav className="wa-pane-2 wa-border z-20 flex w-[68px] shrink-0 flex-col items-center justify-between border-r py-3">
      <div className="flex w-full flex-col items-center gap-1">
        <Link
          href="/"
          title="Beranda"
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#25d366] to-[#008069] shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M20 11.6a7.6 7.6 0 0 1-8 7.6 8 8 0 0 1-3.5-.8L4 20l1.6-4.5A7.5 7.5 0 0 1 4.4 11a7.7 7.7 0 0 1 7.8-7.6 7.6 7.6 0 0 1 7.8 8.2Z" />
            <path d="M8.8 9.6h6.4M8.8 12.6h6.4" />
          </svg>
        </Link>

        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = active ? item.activeIcon : item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`relative flex h-11 w-11 flex-col items-center justify-center rounded-xl transition ${
                active
                  ? 'bg-[var(--wa-pane)] text-[var(--wa-accent)] shadow-sm'
                  : 'text-[var(--wa-text-soft)] hover:bg-[var(--wa-pane)]/70 hover:text-[var(--wa-text)]'
              }`}
            >
              <Icon size={21} />
              {item.href === '/panel/chats' && unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[9.5px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div className="flex w-full flex-col items-center gap-1">
        <span
          title={data?.online ? 'Worker online' : 'Worker offline'}
          className={`mb-1 h-2 w-2 rounded-full ${data?.online ? 'bg-[#25d366]' : 'bg-[#8696a0]'}`}
        />
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          className="wa-icon-btn"
        >
          {theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
        </button>
        <button type="button" onClick={logout} title="Keluar panel" className="wa-icon-btn hover:!text-red-500">
          <LogoutIcon size={20} />
        </button>
      </div>
    </nav>
  )
}
