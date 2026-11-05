'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, DatabaseIcon, LockIcon, QrIcon, ShieldIcon, WifiIcon } from './icons'

export default function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Gagal masuk')
      window.location.href = '/panel/chats'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
      setLoading(false)
    }
  }

  return (
    <main className="landing relative flex min-h-[100dvh] items-center justify-center px-5 py-10">
      <div className="landing-glow absolute inset-0 -z-10" />
      <div className="landing-grid absolute inset-0 -z-10" />

      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#06140f]/80 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.05fr_1fr]">
        {/* Brand side */}
        <div className="relative hidden flex-col justify-between p-9 lg:flex">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#25d366] to-[#008069]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M20 11.6a7.6 7.6 0 0 1-8 7.6 8 8 0 0 1-3.5-.8L4 20l1.6-4.5A7.5 7.5 0 0 1 4.4 11a7.7 7.7 0 0 1 7.8-7.6 7.6 7.6 0 0 1 7.8 8.2Z" />
                  <path d="M8.8 9.6h6.4M8.8 12.6h6.4" />
                </svg>
              </span>
              <span>
                <span className="block text-[13px] font-semibold tracking-wide">FYY WHATSAPP</span>
                <span className="block text-[10px] uppercase tracking-[0.22em] text-brand-200/70">admin panel</span>
              </span>
            </Link>

            <h1 className="mt-10 text-[28px] font-semibold leading-tight text-white">
              Ruang kerja pribadi
              <br /> untuk WhatsApp Anda.
            </h1>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-white/55">
              Satu panel, satu nomor, tanpa akun tambahan. Sesi WhatsApp dimuat seperti WhatsApp Web dan
              disimpan di MongoDB.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                { icon: QrIcon, text: 'Tautkan lewat QR atau pairing code' },
                { icon: WifiIcon, text: 'Inbox realtime bergaya WhatsApp Web' },
                { icon: DatabaseIcon, text: 'Sesi & pesan tersimpan di MongoDB' },
                { icon: ShieldIcon, text: 'Hanya bisa diakses dengan password' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.text} className="flex items-center gap-2.5 text-[12.5px] text-white/60">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300 ring-1 ring-brand-400/20">
                      <Icon size={14} />
                    </span>
                    {item.text}
                  </li>
                )
              })}
            </ul>
          </div>

          <p className="text-[11px] leading-relaxed text-white/30">
            Tidak berafiliasi dengan WhatsApp Inc. Gunakan sesuai Ketentuan Layanan WhatsApp.
          </p>
        </div>

        {/* Form side */}
        <div className="relative bg-white/[0.03] p-7 sm:p-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/45 transition hover:text-white/80"
          >
            <ArrowLeft size={13} /> Kembali ke beranda
          </Link>

          <div className="mt-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/25">
              <LockIcon size={20} />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-white">Masuk ke panel</h2>
            <p className="mt-1.5 text-[12.5px] text-white/50">
              Gunakan password admin yang kamu set pada environment variable <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">ADMIN_PASSWORD</code>.
            </p>
          </div>

          {!configured && (
            <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-3 text-[11.5px] leading-relaxed text-amber-200">
              <strong className="font-semibold">ADMIN_PASSWORD belum diset.</strong> Tambahkan di Vercel →
              Settings → Environment Variables (atau file <code>.env.local</code>), lalu redeploy.
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-[11.5px] font-medium text-white/60">
                Password admin
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-3 pr-16 text-[14px] text-white placeholder:text-white/25 outline-none transition focus:border-brand-400/60 focus:bg-white/[0.06]"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-medium text-white/45 transition hover:text-white/80"
                >
                  {show ? 'Sembunyikan' : 'Lihat'}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12px] text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#25d366] to-[#00a884] px-4 py-3 text-[13.5px] font-semibold text-[#04231b] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Memeriksa…' : 'Masuk panel'}
              <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </button>
          </form>

          <p className="mt-6 text-[11px] leading-relaxed text-white/30">
            Sesi login disimpan sebagai cookie httpOnly selama 14 hari. Setelah masuk, buka menu{' '}
            <span className="text-white/50">Koneksi</span> untuk menautkan WhatsApp.
          </p>
        </div>
      </div>
    </main>
  )
}
