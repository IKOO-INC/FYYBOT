'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Avatar from './Avatar'
import Conversation from './Conversation'
import {
  ArchiveIcon,
  BoltIcon,
  ChatIcon,
  DatabaseIcon,
  FileIcon,
  ImageIcon,
  MenuDots,
  MicIcon,
  PaperclipIcon,
  PinIcon,
  QrIcon,
  RefreshIcon,
  SearchIcon,
  StickerIcon,
  VideoIcon,
} from '@/components/icons'
import { usePoll } from '@/lib/client'
import { formatChatTime, prettyPhone, truncate } from '@/lib/format'
import type { ChatSummary } from '@/lib/types'

type ChatsResponse = {
  ok: boolean
  chats: ChatSummary[]
  unread: number
  online: boolean
  me: { name?: string | null; number?: string | null; id?: string | null } | null
}

type SessionResponse = {
  ok: boolean
  session: {
    status: string
    online: boolean
    workerAlive: boolean
    me: { name?: string | null; number?: string | null } | null
    heartbeatAge: number | null
  }
}

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'unread', label: 'Belum dibaca' },
  { id: 'groups', label: 'Grup' },
  { id: 'archived', label: 'Arsip' },
] as const

function PreviewIcon({ type }: { type?: string }) {
  const className = 'text-[var(--wa-text-soft)]'
  switch (type) {
    case 'image':
      return <ImageIcon size={13} className={className} />
    case 'video':
      return <VideoIcon size={13} className={className} />
    case 'audio':
      return <MicIcon size={13} className={className} />
    case 'document':
      return <FileIcon size={13} className={className} />
    case 'sticker':
      return <StickerIcon size={13} className={className} />
    default:
      return null
  }
}

export default function Inbox() {
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [syncing, setSyncing] = useState(false)


  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const jid = params.get('jid')
    if (jid) setSelected(jid)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const chatsUrl = `/api/chats?filter=${filter}&q=${encodeURIComponent(debounced)}`
  const { data, refresh, setData } = usePoll<ChatsResponse>(chatsUrl, 4000)
  const { data: sessionData } = usePoll<SessionResponse>('/api/session', 6000)

  const syncNames = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch('/api/session/sync-names', { method: 'POST' })
      await refresh()
    } catch {
      /* abaikan: hasilnya terlihat di daftar chat */
    } finally {
      setSyncing(false)
    }
  }, [refresh])

  const chats = useMemo(() => {
    const list = [...(data?.chats || [])]
    list.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || b.lastTs - a.lastTs)
    return list
  }, [data?.chats])

  const activeChat = useMemo(
    () => chats.find((chat) => chat.jid === selected) || null,
    [chats, selected],
  )

  const select = useCallback((jid: string | null) => {
    setSelected(jid)
    const url = jid ? `/panel/chats?jid=${encodeURIComponent(jid)}` : '/panel/chats'
    window.history.replaceState({}, '', url)
  }, [])

  const markRead = useCallback(
    (jid: string) => {
      setData((current) => {
        if (!current) return current
        const chatsNext = current.chats.map((chat) => (chat.jid === jid ? { ...chat, unread: 0 } : chat))
        return {
          ...current,
          chats: chatsNext,
          unread: chatsNext.reduce((total, chat) => total + (chat.unread || 0), 0),
        }
      })
    },
    [setData],
  )

  // Foto profil: diambil bertahap untuk chat yang terlihat saja.
  const avatarKey = useMemo(
    () => chats.slice(0, 40).map((chat) => chat.jid).join(','),
    [chats],
  )
  useEffect(() => {
    const jids = avatarKey ? avatarKey.split(',') : []
    if (!jids.length) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/avatars?jids=${encodeURIComponent(jids.join(','))}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { avatars?: Record<string, string> }
        if (!alive || !json.avatars) return
        setAvatars((current) => ({ ...current, ...json.avatars }))
      } catch {
        /* diamkan: foto profil bersifat opsional */
      }
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [avatarKey])

  const session = sessionData?.session
  const me = session?.me || data?.me || null
  const online = Boolean(session?.online ?? data?.online)
  const workerAlive = Boolean(session?.workerAlive)

  return (
    <div className="flex min-w-0 flex-1">
      {/* Chat list */}
      <aside
        className={`wa-pane wa-border min-w-0 flex-col border-r ${
          selected ? 'hidden lg:flex lg:w-[400px]' : 'flex w-full lg:w-[400px]'
        }`}
      >
        <header className="wa-header wa-border flex h-[60px] shrink-0 items-center justify-between px-3 border-b">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={me?.name || me?.number || 'Admin'} seed={me?.number || 'admin'} size={38} online={online} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13.5px] font-medium">{me?.name || (me?.number ? prettyPhone(me.number) : 'Panel WhatsApp')}</p>
              <p className="text-[11px] text-[var(--wa-text-soft)]">
                {online ? 'tersambung' : workerAlive ? 'menyambungkan…' : 'worker offline'}
              </p>
            </div>
          </div>
          <div className="relative flex items-center">
            <button type="button" onClick={refresh as () => void} className="wa-icon-btn" title="Muat ulang chat">
              <RefreshIcon size={18} />
            </button>
            <button type="button" onClick={() => setShowMenu((value) => !value)} className="wa-icon-btn" title="Menu">
              <MenuDots size={18} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-lg bg-[var(--wa-pane)] py-1 shadow-xl ring-1 ring-black/10">
                <Link
                  href="/panel/connect"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-[var(--wa-pane-2)]"
                >
                  <QrIcon size={15} className="text-[var(--wa-text-soft)]" /> Koneksi WhatsApp
                </Link>
                <Link
                  href="/panel/settings"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-[var(--wa-pane-2)]"
                >
                  <DatabaseIcon size={15} className="text-[var(--wa-text-soft)]" /> Pengaturan &amp; status
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false)
                    void refresh()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--wa-pane-2)]"
                >
                  <RefreshIcon size={15} className="text-[var(--wa-text-soft)]" /> Segarkan daftar chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false)
                    void syncNames()
                  }}
                  disabled={syncing}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--wa-pane-2)] disabled:opacity-60"
                >
                  <RefreshIcon size={15} className={`text-[var(--wa-text-soft)] ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Menyinkronkan nama…' : 'Sinkronkan nama & foto'}
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="wa-pane shrink-0 space-y-2 px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--wa-pane-2)] px-2.5 py-2">
            <SearchIcon size={16} className="text-[var(--wa-text-soft)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari atau mulai chat baru"
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--wa-text-soft)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-[11px] text-[var(--wa-text-soft)]">
                Hapus
              </button>
            )}
          </div>
          <div className="wa-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium transition ${
                  filter === item.id
                    ? 'bg-[#e7fbf5] text-[#008069] dark:bg-[#005c4b]/60 dark:text-[#d9fdd3]'
                    : 'bg-[var(--wa-pane-2)] text-[var(--wa-text-soft)] hover:text-[var(--wa-text)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!workerAlive && (
          <div className="mx-3 mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-200">
            Worker belum aktif. Nyalakan worker Baileys agar pesan masuk dan terkirim.{' '}
            <Link href="/panel/connect" className="font-semibold underline">
              Buka Koneksi
            </Link>
          </div>
        )}

        <div className="wa-scroll min-h-0 flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wa-pane-2)] text-[var(--wa-text-soft)]">
                <ChatIcon size={22} />
              </span>
              <p className="text-[13px] font-medium">
                {debounced ? 'Chat tidak ditemukan' : filter === 'unread' ? 'Tidak ada chat belum dibaca' : 'Belum ada chat'}
              </p>
              <p className="text-[11.5px] leading-relaxed text-[var(--wa-text-soft)]">
                {debounced
                  ? 'Coba kata kunci lain atau ubah filter.'
                  : 'Tautkan WhatsApp lebih dulu, chat akan muncul di sini setelah tersinkron.'}
              </p>
              <Link
                href="/panel/connect"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#00a884] px-3 py-1.5 text-[11.5px] font-semibold text-white"
              >
                <QrIcon size={13} /> Tautkan WhatsApp
              </Link>
            </div>
          ) : (
            chats.map((chat) => {
              const active = chat.jid === selected
              return (
                <button
                  key={chat.jid}
                  type="button"
                  onClick={() => select(chat.jid)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                    active ? 'wa-active' : 'hover:bg-[var(--wa-hover)]'
                  }`}
                >
                  <Avatar name={chat.name} seed={chat.jid} size={49} src={avatars[chat.jid]} />
                  <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5 -mb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-[14px]">
                        {chat.pinned ? <PinIcon size={12} className="text-[var(--wa-text-soft)]" /> : null}
                        <span className="truncate">{chat.name}</span>
                        {!chat.isGroup && prettyPhone(chat.jid) && prettyPhone(chat.jid) !== chat.name ? (
                          <span className="shrink-0 text-[10.5px] font-normal text-[var(--wa-text-soft)]">
                            {prettyPhone(chat.jid)}
                          </span>
                        ) : null}
                      </p>
                      <span
                        className={`shrink-0 text-[10.5px] ${
                          chat.unread ? 'font-semibold text-[#25d366]' : 'text-[var(--wa-text-soft)]'
                        }`}
                      >
                        {formatChatTime(true, chat.lastTs)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1 truncate text-[12px] text-[var(--wa-text-soft)]">
                        {chat.lastFromMe && <span className="shrink-0 text-[11px]">Anda:</span>}
                        <PreviewIcon type={chat.lastType} />
                        <span className="truncate">{truncate(chat.lastText || 'Belum ada pesan', 60)}</span>
                      </p>
                      {chat.unread > 0 && (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-white">
                          {chat.unread > 99 ? '99+' : chat.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="wa-header wa-border hidden shrink-0 items-center justify-between border-t px-3 py-2 text-[10.5px] text-[var(--wa-text-soft)] lg:flex">
          <span className="flex items-center gap-1.5">
            <BoltIcon size={12} /> {chats.length} chat · {data?.unread || 0} belum dibaca
          </span>
          <Link href="/panel/connect" className="flex items-center gap-1 hover:text-[var(--wa-text)]">
            <QrIcon size={12} /> Koneksi
          </Link>
        </div>
      </aside>

      {/* Conversation or empty state */}
      {selected ? (
        <Conversation
          key={selected}
          jid={selected}
          chat={activeChat}
          online={online}
          onBack={() => select(null)}
          onSent={refresh as () => void}
          onRead={markRead}
        />
      ) : (
        <div className="wa-pane-2 relative hidden min-w-0 flex-1 flex-col items-center justify-center px-8 text-center lg:flex">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_50%_18%,rgba(0,168,132,0.08),transparent_60%)]" />
          <div className="relative max-w-md">
            <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--wa-pane)] text-[#00a884] shadow-sm">
              <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M20 11.6a7.6 7.6 0 0 1-8 7.6 8 8 0 0 1-3.5-.8L4 20l1.6-4.5A7.5 7.5 0 0 1 4.4 11a7.7 7.7 0 0 1 7.8-7.6 7.6 7.6 0 0 1 7.8 8.2Z" />
                <path d="M8.8 9.6h6.4M8.8 12.6h6.4" />
              </svg>
            </span>
            <h1 className="mt-6 text-2xl font-light text-[var(--wa-text)]">FYY WhatsApp Admin</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--wa-text-soft)]">
              Kirim dan terima pesan tanpa perlu membuka HP. Pilih percakapan di samping, atau tautkan
              perangkat lewat QR bila belum tersambung.
            </p>

            <div className="mt-6 flex flex-col items-center gap-2 text-[11.5px] text-[var(--wa-text-soft)]">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${online ? 'bg-[#25d366]' : workerAlive ? 'bg-amber-400' : 'bg-[#8696a0]'}`} />
                {online ? 'WhatsApp tersambung' : workerAlive ? 'Worker aktif, sesi belum tersambung' : 'Worker belum aktif'}
              </span>
              <Link
                href="/panel/connect"
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--wa-border)] px-3.5 py-1.5 font-medium text-[var(--wa-text)] transition hover:bg-[var(--wa-pane)]"
              >
                <QrIcon size={13} /> {online ? 'Kelola sesi' : 'Scan QR untuk menautkan'}
              </Link>
            </div>

            <div className="mt-10 flex items-center justify-center gap-6 text-[10.5px] text-[var(--wa-text-soft)]">
              <span className="flex items-center gap-1.5">
                <DatabaseIcon size={12} /> Sesi di MongoDB
              </span>
              <span className="flex items-center gap-1.5">
                <PaperclipIcon size={12} /> Media didukung
              </span>
              <span className="flex items-center gap-1.5">
                <ArchiveIcon size={12} /> Arsip &amp; filter
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
