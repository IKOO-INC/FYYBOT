'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Avatar from './Avatar'
import MessageBubble from './MessageBubble'
import {
  ArrowLeft,
  ChevronDown,
  CopyIcon,
  EmojiIcon,
  ExternalIcon,
  InfoIcon,
  MicIcon,
  PaperclipIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  WifiIcon,
  XIcon,
} from '@/components/icons'
import { apiFetch } from '@/lib/client'
import { formatChatTime, formatDateDivider, prettyPhone, truncate } from '@/lib/format'
import type { ChatSummary, MessageDoc } from '@/lib/types'

const EMOJIS = ['😀', '😂', '🙏', '👍', '❤️', '🔥', '🎉', '😊', '😎', '🤔', '😅', '😭', '👏', '✅', '⚡', '📌', '💡', '🚀', '🥰', '😴', '🤝', '📦', '💰', '🧾']

type MessagesResponse = { ok: boolean; messages: MessageDoc[]; hasMore: boolean; chat: ChatSummary | null }

export default function Conversation({
  jid,
  chat,
  online,
  onBack,
  onSent,
  onRead,
}: {
  jid: string
  chat: ChatSummary | null
  online: boolean
  onBack: () => void
  onSent: () => void
  onRead: (jid: string) => void
}) {
  const [data, setData] = useState<MessagesResponse | null>(null)
  const dataRef = useRef<MessagesResponse | null>(null)
  dataRef.current = data

  /**
   * Muat halaman pertama (40 pesan terakhir).
   * Dipakai saat chat dibuka, setelah kirim pesan, dan saat tab kembali aktif.
   */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?jid=${encodeURIComponent(jid)}&limit=40`, { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      const json = (await res.json()) as MessagesResponse & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'Gagal memuat pesan')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pesan')
    }
  }, [jid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Polling ringan: hanya meminta pesan yang lebih baru dari yang sudah tampil
   * (`after=`), jadi setiap 2,5 detik yang diangkut biasanya 0–2 pesan saja,
   * bukan 40 pesan penuh seperti sebelumnya.
   */
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      const current = dataRef.current
      if (!current) return
      const newest = current.messages.reduce((max, message) => Math.max(max, message.ts || 0), 0)
      if (!newest) return
      try {
        const res = await fetch(
          `/api/messages?jid=${encodeURIComponent(jid)}&after=${newest}`,
          { cache: 'no-store' },
        )
        if (!res.ok || res.status === 401) return
        const json = (await res.json()) as MessagesResponse
        if (!alive || !json?.ok) return
        setData((previous) => {
          if (!previous) return json
          if (!json.messages.length) {
            return json.chat ? { ...previous, chat: json.chat } : previous
          }
          const seen = new Set(previous.messages.map((message) => message._id))
          const fresh = json.messages.filter((message) => !seen.has(message._id))
          if (!fresh.length) return previous
          const messages = [...previous.messages, ...fresh].slice(-300)
          return { ...previous, messages, chat: json.chat || previous.chat }
        })
      } catch {
        /* biarkan polling berikutnya mencoba lagi */
      }
    }
    const timer = window.setInterval(() => void tick(), 2500)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [jid])

  const [older, setOlder] = useState<MessageDoc[]>([])
  const [optimistic, setOptimistic] = useState<MessageDoc[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const typingAt = useRef(0)
  const readAt = useRef(0)
  const stickToBottom = useRef(true)

  const serverMessages = data?.messages || []

  useEffect(() => {
    setOlder([])
    setOptimistic([])
    setDraft('')
    setSearch('')
    setSearchOpen(false)
    setShowInfo(false)
    setError(null)
    stickToBottom.current = true
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    })
  }, [jid])

  const merged = useMemo(() => {
    const seen = new Set<string>()
    const list: MessageDoc[] = []
    for (const message of [...older, ...serverMessages]) {
      if (seen.has(message._id)) continue
      seen.add(message._id)
      list.push(message)
    }
    const now = Date.now()
    for (const pending of optimistic) {
      const matched = serverMessages.some(
        (message) =>
          message.fromMe && message.text === pending.text && Math.abs(message.ts - pending.ts) < 8000,
      )
      if (matched || now - pending.ts > 30_000) continue
      list.push(pending)
    }
    return list.sort((a, b) => a.ts - b.ts)
  }, [older, serverMessages, optimistic])

  const visible = useMemo(() => {
    if (!search.trim()) return merged
    const needle = search.toLowerCase()
    return merged.filter((message) => (message.text || '').toLowerCase().includes(needle))
  }, [merged, search])

  useEffect(() => {
    if (!stickToBottom.current) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [visible.length])

  // Mark as read whenever the open chat has unread messages.
  useEffect(() => {
    if (!chat?.unread || !jid) return
    if (documentinityHidden()) return
    const now = Date.now()
    if (now - readAt.current < 4000) return
    readAt.current = now
    void apiFetch(`/api/chats/action`, { method: 'POST', body: JSON.stringify({ jid, action: 'read' }) })
      .then(() => onRead(jid))
      .catch(() => null)
  }, [chat?.unread, jid, onRead])

  const onScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    stickToBottom.current = distance < 120
    setShowScrollDown(distance > 400)
    // Muat pesan lama otomatis saat pengguna menggulir ke atas.
    if (element.scrollTop < 80 && data?.hasMore && !loadingOlder) void loadOlder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.hasMore, loadingOlder])

  async function loadOlder() {
    const first = merged[0]
    if (!first || loadingOlder) return
    setLoadingOlder(true)
    try {
      const response = await apiFetch<MessagesResponse>(
        `/api/messages?jid=${encodeURIComponent(jid)}&limit=40&before=${first.ts}`,
      )
      const element = scrollRef.current
      const previousHeight = element?.scrollHeight || 0
      setOlder((current) => {
        const ids = new Set(current.map((message) => message._id))
        const combined = [...response.messages.filter((message) => !ids.has(message._id)), ...current]
        return combined
      })
      requestAnimationFrame(() => {
        if (element) element.scrollTop = element.scrollHeight - previousHeight
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pesan lama')
    } finally {
      setLoadingOlder(false)
    }
  }

  async function sendText() {
    const text = draft.trim()
    if (!text || sending) return
    const temp: MessageDoc = {
      _id: `temp-${Date.now()}`,
      jid,
      id: `temp-${Date.now()}`,
      fromMe: true,
      ts: Date.now(),
      type: 'chat',
      text,
      status: 'pending',
    }
    stickToBottom.current = true
    setOptimistic((current) => [...current, temp])
    setDraft('')
    setShowEmoji(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)
    setError(null)
    try {
      const result = await apiFetch<{ ok: boolean; error?: string | null }>('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({ jid, text }),
      })
      if (!result.ok) throw new Error(result.error || 'Pesan gagal dikirim (worker offline?)')
      await refresh()
      onSent()
    } catch (err) {
      setOptimistic((current) =>
        current.map((message) => (message._id === temp._id ? { ...message, status: 'error' } : message)),
      )
      setError(err instanceof Error ? err.message : 'Pesan gagal dikirim')
    } finally {
      setSending(false)
    }
  }

  async function uploadFile(file: File) {
    if (uploading) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('jid', jid)
      form.append('file', file)
      form.append('caption', '')
      await apiFetch('/api/messages/media', { method: 'POST', body: form })
      window.setTimeout(() => void refresh(), 1200)
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah file')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function react(message: MessageDoc, emoji: string) {
    void apiFetch('/api/messages/react', {
      method: 'POST',
      body: JSON.stringify({ jid, messageId: message.id, emoji, fromMe: message.fromMe }),
    }).catch(() => null)
  }

  function typingPing() {
    const now = Date.now()
    if (now - typingAt.current < 4000) return
    typingAt.current = now
    void apiFetch('/api/chats/action', { method: 'POST', body: JSON.stringify({ jid, action: 'typing' }) }).catch(
      () => null,
    )
  }

  const title = chat?.name || prettyPhone(jid)

  // Foto profil chat yang sedang dibuka (diambil sekali, lalu di-cache 6 jam di worker).
  const [avatar, setAvatar] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/avatars?jids=${encodeURIComponent(jid)}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { avatars?: Record<string, string> }
        if (!alive) return
        setAvatar(json.avatars?.[jid] || null)
      } catch {
        /* opsional */
      }
    }
    setAvatar(null)
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 120_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [jid])

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-[var(--wa-pane)]">
      {/* Header */}
      <header className="wa-header wa-border flex h-[60px] shrink-0 items-center gap-3 border-b px-3 sm:px-4">
        <button type="button" onClick={onBack} className="wa-icon-btn -ml-1 lg:hidden" aria-label="Kembali">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={title} seed={jid} size={40} online={false} src={avatar} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14.5px] font-medium">{title}</p>
          <p className="truncate text-[11.5px] text-[var(--wa-text-soft)]">
            {chat?.isGroup ? 'Grup WhatsApp' : prettyPhone(jid)}
            {online ? ' · tersambung' : ' · worker offline'}
          </p>
        </div>

        {searchOpen ? (
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-[var(--wa-pane)] px-2 py-1.5 sm:max-w-xs">
            <SearchIcon size={15} className="text-[var(--wa-text-soft)]" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari di percakapan"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--wa-text-soft)]"
            />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false)
                setSearch('')
              }}
              className="text-[var(--wa-text-soft)] hover:text-[var(--wa-text)]"
              aria-label="Tutup pencarian"
            >
              <XIcon size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-center">
            <button type="button" onClick={() => setSearchOpen(true)} className="wa-icon-btn" title="Cari pesan">
              <SearchIcon size={19} />
            </button>
            <button
              type="button"
              onClick={() => setShowInfo((value) => !value)}
              className="wa-icon-btn"
              title="Info percakapan"
            >
              <InfoIcon size={19} />
            </button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Messages */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="wa-wallpaper wa-scroll flex-1 overflow-y-auto px-2 py-3 sm:px-4"
          >
            {data?.hasMore && (
              <div className="mb-2 flex justify-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-[var(--wa-pane)]/90 px-3 py-1.5 text-[11.5px] font-medium text-[var(--wa-text-soft)] shadow-sm transition hover:text-[var(--wa-text)]"
                >
                  {loadingOlder ? 'Memuat…' : 'Muat pesan sebelumnya'}
                </button>
              </div>
            )}

            {data && visible.length === 0 && !data?.hasMore && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-[var(--wa-text-soft)]">
                  <WifiIcon size={22} />
                </span>
                <p className="text-[13px] font-medium">
                  {search ? 'Tidak ada pesan yang cocok' : 'Belum ada pesan di percakapan ini'}
                </p>
                <p className="max-w-xs text-[11.5px] text-[var(--wa-text-soft)]">
                  {search
                    ? 'Coba kata kunci lain.'
                    : 'Pesan baru akan muncul otomatis. Kirim pesan pertama untuk memulai.'}
                </p>
              </div>
            )}

            {visible.map((message, index) => {
              const previous = visible[index - 1]
              const showDivider =
                !previous || new Date(previous.ts).toDateString() !== new Date(message.ts).toDateString()
              const sameSender = previous && previous.fromMe === message.fromMe
              const closeInTime = previous && message.ts - previous.ts < 5 * 60 * 1000
              const showTail = !(sameSender && closeInTime)

              return (
                <div key={message._id}>
                  {showDivider && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-[var(--wa-pane)]/95 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--wa-text-soft)] shadow-sm">
                        {formatDateDivider(message.ts)}
                      </span>
                    </div>
                  )}
                  <div className={showTail ? 'mb-1.5' : 'mb-0.5'}>
                    <MessageBubble message={message} isGroup={Boolean(chat?.isGroup)} showTail={showTail} onReact={react} />
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {showScrollDown && (
            <button
              type="button"
              onClick={() => {
                stickToBottom.current = true
                bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
              }}
              className="absolute bottom-24 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--wa-pane)] text-[var(--wa-text-soft)] shadow-md ring-1 ring-black/5"
              aria-label="Ke pesan terbaru"
            >
              <ChevronDown size={18} />
            </button>
          )}

          {/* Composer */}
          <div className="wa-header wa-border relative shrink-0 border-t px-2 py-2 sm:px-3">
            {error && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11.5px] text-red-600 dark:text-red-300">
                <span className="flex items-center gap-1.5">
                  <RefreshIcon size={13} /> {error}
                </span>
                <button type="button" onClick={() => setError(null)} aria-label="Tutup">
                  <XIcon size={13} />
                </button>
              </div>
            )}

            {showEmoji && (
              <div className="absolute bottom-[68px] left-3 z-30 grid w-64 grid-cols-8 gap-1 rounded-xl bg-[var(--wa-pane)] p-2 shadow-xl ring-1 ring-black/10">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setDraft((current) => current + emoji)
                      textareaRef.current?.focus()
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setShowEmoji((value) => !value)}
                className="wa-icon-btn shrink-0"
                title="Emoji"
              >
                <EmojiIcon size={22} />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="wa-icon-btn shrink-0"
                title="Lampirkan file"
                disabled={uploading}
              >
                {uploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <PaperclipIcon size={20} />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadFile(file)
                }}
              />

              <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                onChange={(event) => {
                  setDraft(event.target.value)
                  const element = event.target
                  element.style.height = 'auto'
                  element.style.height = `${Math.min(element.scrollHeight, 120)}px`
                  typingPing()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendText()
                  }
                }}
                placeholder="Ketik pesan"
                className="wa-scroll max-h-[120px] min-h-[40px] flex-1 resize-none rounded-lg bg-[var(--wa-pane)] px-3 py-2.5 text-[13.5px] outline-none placeholder:text-[var(--wa-text-soft)]"
              />

              <button
                type="button"
                onClick={() => (draft.trim() ? void sendText() : undefined)}
                disabled={sending || !draft.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#008f73] disabled:bg-[var(--wa-pane-2)] disabled:text-[var(--wa-text-soft)]"
                title={draft.trim() ? 'Kirim' : 'Pesan suara (segera hadir)'}
              >
                {draft.trim() ? <SendIcon size={18} /> : <MicIcon size={18} />}
              </button>
            </div>
            <p className="mt-1 hidden px-1 text-[10px] text-[var(--wa-text-soft)] sm:block">
              Enter untuk kirim · Shift+Enter baris baru · lampiran maks 4 MB
            </p>
          </div>
        </div>

        {/* Info panel */}
        {showInfo && (
          <aside className="wa-pane-2 wa-border wa-scroll hidden w-[340px] shrink-0 overflow-y-auto border-l md:block">
            <div className="wa-header wa-border flex items-center gap-4 border-b px-4 py-4">
              <button type="button" onClick={() => setShowInfo(false)} className="wa-icon-btn" aria-label="Tutup">
                <XIcon size={19} />
              </button>
              <h2 className="text-[14px] font-medium">Info percakapan</h2>
            </div>
            <div className="flex flex-col items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-pane)] py-7">
              <Avatar name={title} seed={jid} size={112} src={avatar} />
              <div className="text-center">
                <p className="text-[16px] font-medium">{title}</p>
                <p className="text-[12px] text-[var(--wa-text-soft)]">{chat?.isGroup ? 'Grup' : prettyPhone(jid)}</p>
              </div>
            </div>
            <div className="border-b border-[var(--wa-border)] bg-[var(--wa-pane)] px-4 py-4">
              <p className="text-[11.5px] text-[var(--wa-text-soft)]">Tentang</p>
              <p className="mt-1 text-[13px]">{chat?.isGroup ? 'Percakapan grup WhatsApp' : 'Kontak WhatsApp'}</p>
              <p className="mt-3 text-[11.5px] text-[var(--wa-text-soft)]">JID</p>
              <p className="mt-1 break-all font-mono text-[11px]">{jid}</p>
              <p className="mt-3 text-[11.5px] text-[var(--wa-text-soft)]">Pesan terakhir</p>
              <p className="mt-1 text-[12.5px]">{truncate(chat?.lastText || '—', 140)}</p>
              <p className="mt-3 text-[11.5px] text-[var(--wa-text-soft)]">Aktivitas terakhir</p>
              <p className="mt-1 text-[12.5px]">{formatChatTime(false, chat?.lastTs)}</p>
            </div>
            <div className="space-y-2 bg-[var(--wa-pane)] px-4 py-4">
              {!chat?.isGroup && (
                <>
                  <a
                    href={`https://wa.me/${(jid.split('@')[0] || '').replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-pane-2)]"
                  >
                    <ExternalIcon size={16} className="text-[var(--wa-text-soft)]" /> Buka di WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(jid.split('@')[0])
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-[var(--wa-pane-2)]"
                  >
                    <CopyIcon size={16} className="text-[var(--wa-text-soft)]" /> Salin nomor
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  void apiFetch('/api/chats/action', { method: 'POST', body: JSON.stringify({ jid, action: 'read' }) })
                    .then(() => onRead(jid))
                    .catch(() => null)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-[var(--wa-pane-2)]"
              >
                <SearchIcon size={16} className="text-[var(--wa-text-soft)]" /> Tandai sudah dibaca
              </button>
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}

function documentinityHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}
