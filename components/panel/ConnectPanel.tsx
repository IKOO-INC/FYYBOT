'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Avatar from './Avatar'
import {
  ArrowRight,
  BoltIcon,
  ChatIcon,
  DatabaseIcon,
  PhoneIcon,
  QrIcon,
  RefreshIcon,
  ShieldIcon,
  WifiIcon,
  XIcon,
} from '@/components/icons'
import { apiFetch, usePoll } from '@/lib/client'
import { prettyPhone, timeAgo } from '@/lib/format'

type SessionResponse = {
  ok: boolean
  error?: string
  session: {
    status: 'disconnected' | 'connecting' | 'open' | 'close'
    online: boolean
    workerAlive: boolean
    heartbeatAge: number | null
    me: { id?: string | null; lid?: string | null; name?: string | null; number?: string | null; platform?: string | null } | null
    lastError: string | null
    pairingCode: string | null
    pairingPhone: string | null
    connectedAt: number | null
    startedAt: number | null
    qr: string | null
    qrUpdatedAt: number | null
  }
}

const statusMap: Record<string, { label: string; tone: string }> = {
  open: { label: 'Tersambung', tone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25' },
  connecting: { label: 'Menyambungkan', tone: 'bg-amber-400/12 text-amber-600 dark:text-amber-300 ring-amber-400/25' },
  close: { label: 'Terputus', tone: 'bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25' },
  disconnected: { label: 'Belum tertaut', tone: 'bg-slate-500/12 text-slate-500 dark:text-slate-300 ring-slate-500/25' },
}

export default function ConnectPanel() {
  const { data, error, refresh } = usePoll<SessionResponse>('/api/session', 4000)
  const session = data?.session
  const [phone, setPhone] = useState('')
  const [pairing, setPairing] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (session?.pairingCode) setCode(session.pairingCode)
  }, [session?.pairingCode])

  async function pair() {
    const digits = phone.replace(/[^0-9]/g, '')
    if (digits.length < 8) {
      setMessage({ kind: 'error', text: 'Nomor tidak valid. Gunakan format 628xxxxxxxxx tanpa + atau spasi.' })
      return
    }
    setPairing(true)
    setMessage(null)
    try {
      const res = await apiFetch<{ ok: boolean; pairingCode?: string | null; error?: string }>('/api/session/action', {
        method: 'POST',
        body: JSON.stringify({ action: 'pair', phone: digits }),
      })
      if (res.pairingCode) setCode(res.pairingCode)
      setMessage({ kind: 'ok', text: 'Kode pairing dibuat. Masukkan di WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon.' })
      void refresh()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Gagal membuat pairing code' })
    } finally {
      setPairing(false)
    }
  }

  async function action(name: 'restart' | 'logout') {
    if (name === 'logout' && !window.confirm('Putuskan sesi WhatsApp ini? Kamu perlu scan QR lagi untuk menautkan ulang.')) {
      return
    }
    setBusy(name)
    setMessage(null)
    try {
      const res = await apiFetch<{ ok: boolean; error?: string | null }>('/api/session/action', {
        method: 'POST',
        body: JSON.stringify({ action: name }),
      })
      if (!res.ok) throw new Error(res.error || 'Aksi gagal dijalankan')
      setCode(null)
      setMessage({
        kind: 'ok',
        text: name === 'logout' ? 'Sesi WhatsApp diputus dan kredensial dihapus dari MongoDB.' : 'Worker diminta menyambung ulang.',
      })
      void refresh()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Aksi gagal' })
    } finally {
      setBusy(null)
    }
  }

  const status = statusMap[session?.status || 'disconnected'] || statusMap.disconnected
  const connected = Boolean(session?.online)

  return (
    <div className="wa-pane-2 wa-scroll min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--wa-text-soft)]">
              Koneksi
            </span>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight">Tautkan WhatsApp Anda</h1>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-[var(--wa-text-soft)]">
              Sama seperti WhatsApp Web: buka WhatsApp di HP → <strong>Perangkat tertaut</strong> →{' '}
              <strong>Tautkan perangkat</strong>, lalu pindai QR di bawah. Kredensial sesi disimpan di MongoDB
              sehingga tidak perlu scan ulang setiap kali worker restart.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold ring-1 ${status.tone}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {status.label}
            </span>
            <button type="button" onClick={() => void refresh()} className="wa-icon-btn" title="Segarkan">
              <RefreshIcon size={18} />
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed ${
              message.kind === 'ok'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                : 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200'
            }`}
          >
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Tutup">
              <XIcon size={14} />
            </button>
          </div>
        )}

        {(error || data?.error) && (
          <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-200">
            {error || data?.error}
            {String(error || data?.error).includes('MONGODB_URI') && (
              <span className="mt-1 block text-[11.5px] opacity-80">
                Tambahkan MONGODB_URI pada Environment Variables di Vercel lalu redeploy.
              </span>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* QR / status card */}
          <section className="rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] p-5 sm:p-6">
            {connected ? (
              <div>
                <div className="flex items-center gap-4">
                  <Avatar name={session?.me?.name || session?.me?.number || 'WhatsApp'} seed={session?.me?.number || 'wa'} size={64} online />
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold">{session?.me?.name || 'WhatsApp tertaut'}</p>
                    <p className="text-[12.5px] text-[var(--wa-text-soft)]">
                      {session?.me?.number ? prettyPhone(session.me.number) : session?.me?.id || '—'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-300">
                      <WifiIcon size={12} /> tersambung {session?.connectedAt ? `· ${timeAgo(session.connectedAt)}` : ''}
                    </p>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--wa-border)] pt-4 text-[11.5px]">
                  <div>
                    <dt className="text-[var(--wa-text-soft)]">Platform</dt>
                    <dd className="mt-0.5 font-medium">{session?.me?.platform || 'WhatsApp Web'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--wa-text-soft)]">Worker</dt>
                    <dd className="mt-0.5 font-medium">
                      {session?.workerAlive ? `aktif · ${session.heartbeatAge ? Math.round(session.heartbeatAge / 1000) : 0}s lalu` : 'offline'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[var(--wa-text-soft)]">JID</dt>
                    <dd className="mt-0.5 break-all font-mono text-[11px]">{session?.me?.id || '—'}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/panel/chats"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#00a884] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#008f73]"
                  >
                    <ChatIcon size={15} /> Buka Inbox
                  </Link>
                  <button
                    type="button"
                    onClick={() => void action('restart')}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--wa-border)] px-4 py-2.5 text-[12.5px] font-medium transition hover:bg-[var(--wa-pane-2)] disabled:opacity-50"
                  >
                    <RefreshIcon size={15} /> {busy === 'restart' ? 'Memproses…' : 'Muat ulang koneksi'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void action('logout')}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/25 px-4 py-2.5 text-[12.5px] font-medium text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
                  >
                    <XIcon size={15} /> {busy === 'logout' ? 'Memutus…' : 'Putuskan sesi'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {session?.qr ? (
                  <>
                    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={session.qr} alt="QR WhatsApp" className="h-56 w-56" />
                    </div>
                    <p className="text-center text-[12px] leading-relaxed text-[var(--wa-text-soft)]">
                      Buka WhatsApp di HP → menu ⋮ → <strong>Perangkat tertaut</strong> →{' '}
                      <strong>Tautkan perangkat</strong>
                      <br />
                      QR diperbarui otomatis setiap beberapa detik.
                    </p>
                    <p className="text-[10.5px] text-[var(--wa-text-soft)]">QR terakhir: {timeAgo(session.qrUpdatedAt)}</p>
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wa-pane-2)] text-[var(--wa-text-soft)]">
                      <QrIcon size={24} />
                    </span>
                    <p className="mt-3 text-[13.5px] font-medium">QR belum tersedia</p>
                    <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-[var(--wa-text-soft)]">
                      {session?.workerAlive
                        ? 'Worker aktif dan sedang menyiapkan QR. Tunggu beberapa detik, halaman ini menyegarkan otomatis.'
                        : 'Worker Baileys belum berjalan. Nyalakan worker (perintah npm run worker) agar QR muncul di sini.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Pairing + status */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] p-5">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <PhoneIcon size={16} className="text-[var(--wa-text-soft)]" /> Tautkan dengan nomor (pairing code)
              </h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--wa-text-soft)]">
                Tidak bisa scan QR? Masukkan nomor WhatsApp, lalu ketik 8 digit kode di HP. Hanya berlaku bila sesi
                belum terdaftar.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="628123456789"
                  inputMode="numeric"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--wa-border)] bg-[var(--wa-pane-2)] px-3 py-2 text-[13px] outline-none focus:border-[#00a884]"
                />
                <button
                  type="button"
                  onClick={() => void pair()}
                  disabled={pairing || connected}
                  className="shrink-0 rounded-lg bg-[#00a884] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#008f73] disabled:opacity-50"
                >
                  {pairing ? 'Membuat…' : 'Minta kode'}
                </button>
              </div>
              {code && (
                <div className="mt-3 rounded-xl bg-[var(--wa-pane-2)] px-4 py-3 text-center">
                  <p className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--wa-text-soft)]">Pairing code</p>
                  <p className="mt-1 font-mono text-[22px] font-semibold tracking-[0.16em]">
                    {code.replace(/(.{4})(.{4})/, '$1-$2')}
                  </p>
                  <p className="mt-1 text-[10.5px] text-[var(--wa-text-soft)]">
                    WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] p-5">
              <h2 className="text-[13.5px] font-semibold">Detail teknis</h2>
              <ul className="mt-3 space-y-2.5 text-[11.5px]">
                {[
                  { icon: DatabaseIcon, k: 'Penyimpanan sesi', v: 'MongoDB · wa_auth' },
                  { icon: BoltIcon, k: 'Status koneksi', v: session?.status || 'disconnected' },
                  { icon: ShieldIcon, k: 'Worker heartbeat', v: session?.heartbeatAge !== null && session?.heartbeatAge !== undefined ? `${Math.round(session.heartbeatAge / 1000)}s lalu` : '—' },
                  { icon: WifiIcon, k: 'Mulai worker', v: session?.startedAt ? timeAgo(session.startedAt) : '—' },
                ].map((row) => {
                  const Icon = row.icon
                  return (
                    <li key={row.k} className="flex items-center justify-between gap-3 border-b border-[var(--wa-border)] pb-2 last:border-0 last:pb-0">
                      <span className="flex items-center gap-2 text-[var(--wa-text-soft)]">
                        <Icon size={13} /> {row.k}
                      </span>
                      <span className="text-right font-medium">{row.v}</span>
                    </li>
                  )
                })}
              </ul>
              {session?.lastError && !connected && (
                <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-300">
                  Terakhir: {session.lastError}
                </p>
              )}
            </section>

            <Link
              href="/panel/settings"
              className="flex items-center justify-between rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] px-5 py-4 text-[12.5px] font-medium transition hover:border-[#00a884]/40"
            >
              Buka pengaturan &amp; status sistem <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
