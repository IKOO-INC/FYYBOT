import type { Metadata } from 'next'
import Link from 'next/link'
import LogoutButton from '@/components/panel/LogoutButton'
import { DatabaseIcon, GlobeIcon, LockIcon, QrIcon, WifiIcon } from '@/components/icons'
import { adminPassword } from '@/lib/auth'
import { COLLECTIONS, getDb, mongoConfigured, mongoUriKind } from '@/lib/mongo'
import { getSessionView } from '@/lib/store'
import { timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pengaturan',
  robots: { index: false, follow: false },
}

async function loadStats() {
  const stats = { chats: 0, messages: 0, media: 0, commands: 0, error: null as string | null }
  if (!mongoConfigured()) {
    stats.error = 'MONGODB_URI belum diset'
    return stats
  }
  try {
    const db = await getDb()
    const [chats, messages, media, commands] = await Promise.all([
      db.collection(COLLECTIONS.chats).estimatedDocumentCount(),
      db.collection(COLLECTIONS.messages).estimatedDocumentCount(),
      db.collection(COLLECTIONS.media).estimatedDocumentCount(),
      db.collection(COLLECTIONS.commands).estimatedDocumentCount(),
    ])
    stats.chats = chats
    stats.messages = messages
    stats.media = media
    stats.commands = commands
  } catch (err) {
    stats.error = err instanceof Error ? err.message : 'Gagal membaca database'
  }
  return stats
}

export default async function SettingsPage() {
  const stats = await loadStats()
  let session = null as Awaited<ReturnType<typeof getSessionView>> | null
  try {
    session = await getSessionView()
  } catch {
    session = null
  }

  const rows = [
    { icon: DatabaseIcon, label: 'MongoDB URI', value: mongoConfigured() ? `terpasang (${mongoUriKind()})` : 'belum diset' },
    { icon: DatabaseIcon, label: 'Nama database', value: process.env.MONGODB_DB_NAME || process.env.WA_DB_NAME || 'fyywhatsapp' },
    { icon: LockIcon, label: 'Password admin', value: adminPassword() ? 'aktif' : 'belum diset' },
    { icon: WifiIcon, label: 'Worker', value: session?.workerAlive ? `aktif · heartbeat ${session.heartbeatAge ? Math.round(session.heartbeatAge / 1000) : 0}s lalu` : 'offline' },
    { icon: QrIcon, label: 'Status WhatsApp', value: session?.status || 'disconnected' },
    { icon: GlobeIcon, label: 'Region deploy', value: process.env.VERCEL_REGION || 'lokal / worker' },
  ]

  return (
    <div className="wa-pane-2 wa-scroll min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--wa-text-soft)]">
          Pengaturan
        </span>
        <h1 className="mt-1.5 text-[22px] font-semibold leading-tight">Panel &amp; status sistem</h1>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-[var(--wa-text-soft)]">
          Ringkasan konfigurasi yang dipakai panel ini. Semua nilai sensitif dibaca dari environment variable —
          tidak ada kredensial yang ditampilkan di halaman ini.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Chat tersimpan', value: stats.chats.toLocaleString('id-ID') },
            { label: 'Pesan', value: stats.messages.toLocaleString('id-ID') },
            { label: 'Media cache', value: stats.media.toLocaleString('id-ID') },
            { label: 'Perintah worker', value: stats.commands.toLocaleString('id-ID') },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] px-4 py-4">
              <p className="text-[11px] text-[var(--wa-text-soft)]">{card.label}</p>
              <p className="mt-1 text-[22px] font-semibold leading-none">{card.value}</p>
            </div>
          ))}
        </div>

        {stats.error && (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-200">
            {stats.error}
          </p>
        )}

        <section className="mt-6 rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] p-5">
          <h2 className="text-[13.5px] font-semibold">Konfigurasi aktif</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const Icon = row.icon
              return (
                <div key={row.label} className="flex items-start justify-between gap-3 rounded-xl bg-[var(--wa-pane-2)] px-3.5 py-3">
                  <span className="flex items-center gap-2 text-[11.5px] text-[var(--wa-text-soft)]">
                    <Icon size={14} /> {row.label}
                  </span>
                  <span className="max-w-[55%] break-words text-right text-[11.5px] font-medium">{row.value}</span>
                </div>
              )
            })}
          </dl>
          {session?.me?.number && (
            <p className="mt-3 text-[11.5px] text-[var(--wa-text-soft)]">
              Nomor tertaut: <span className="font-medium text-[var(--wa-text)]">+{session.me.number}</span>
              {session.connectedAt ? ` · sejak ${timeAgo(session.connectedAt)}` : ''}
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] p-5">
          <h2 className="text-[13.5px] font-semibold">Menjalankan worker</h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--wa-text-soft)]">
            Panel di Vercel hanya menampilkan UI dan API. Koneksi WhatsApp dijaga oleh proses worker Node.js yang
            memakai MongoDB yang sama.
          </p>
          <pre className="wa-scroll mt-3 overflow-x-auto rounded-xl bg-[#0b141a] px-4 py-3 text-[11.5px] leading-relaxed text-[#d9fdd3]">
{`# di server / VPS (bukan Vercel)
git clone https://github.com/IKOO-INC/FYYBOT.git
cd FYYBOT/worker
npm install
MONGODB_URI="mongodb+srv://..." MONGODB_DB_NAME="fyywhatsapp" npm start`}
          </pre>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--wa-text-soft)]">
            Worker akan menulis QR ke MongoDB. Buka halaman <Link href="/panel/connect" className="underline">Koneksi</Link>{' '}
            lalu pindai QR tersebut.
          </p>
        </section>

        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-pane)] px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold">Sesi panel</p>
            <p className="text-[11.5px] text-[var(--wa-text-soft)]">
              Cookie httpOnly berlaku 14 hari. Keluar akan menghapus cookie di browser ini.
            </p>
          </div>
          <LogoutButton />
        </section>

        <p className="mt-6 text-[10.5px] leading-relaxed text-[var(--wa-text-soft)]">
          FYY WhatsApp Admin · Baileys + MongoDB session store · Tidak berafiliasi dengan WhatsApp Inc.
        </p>
      </div>
    </div>
  )
}
