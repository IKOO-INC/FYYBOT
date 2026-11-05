import Link from 'next/link'
import { ChatWindowMock, InboxMock, QrMock } from '@/components/marketing'
import {
  ArrowRight,
  BoltIcon,
  CheckDouble,
  DatabaseIcon,
  GlobeIcon,
  ImageIcon,
  LockIcon,
  PhoneIcon,
  QrIcon,
  RefreshIcon,
  SendIcon,
  ShieldIcon,
  UsersIcon,
  WifiIcon,
  SparkIcon,
} from '@/components/icons'

const navLinks = [
  { href: '#cara-kerja', label: 'Cara Kerja' },
  { href: '#fitur', label: 'Fitur' },
  { href: '#arsitektur', label: 'Arsitektur' },
  { href: '#harga', label: 'Harga' },
  { href: '#faq', label: 'FAQ' },
]

const features = [
  {
    icon: WifiIcon,
    title: 'Inbox realtime seperti WhatsApp Web',
    body: 'Pesan masuk muncul di panel tanpa perlu refresh. Daftar chat, badge belum dibaca, centang biru, dan balasan langsung dari browser.',
  },
  {
    icon: QrIcon,
    title: 'Tautkan lewat QR atau pairing code',
    body: 'Tidak ada akun baru. Pindai QR di WhatsApp → Perangkat tertaut, atau pakai kode 8 digit — sama seperti WhatsApp Web biasa.',
  },
  {
    icon: DatabaseIcon,
    title: 'Sesi tersimpan di MongoDB',
    body: 'Creds dan Signal keys disimpan per-key di MongoDB. Worker restart atau redeploy tidak membuat nomor harus scan ulang.',
  },
  {
    icon: ImageIcon,
    title: 'Kirim & terima media',
    body: 'Gambar, video, audio, dokumen, sticker, lokasi, dan pesan yang dihapus — semua ditampilkan dengan bubble yang rapi.',
  },
  {
    icon: UsersIcon,
    title: 'Grup, kontak, dan status centang',
    body: 'Nama grup ikut tersinkron, nama pengirim tampil di chat grup, status pesan berubah dari terkirim → diterima → dibaca.',
  },
  {
    icon: SendIcon,
    title: 'Command queue anti-bentrok',
    body: 'Panel menulis perintah ke MongoDB, worker mengeksekusinya berurutan. Tidak ada race condition meski panel dibuka di dua tab.',
  },
  {
    icon: LockIcon,
    title: 'Akses khusus admin',
    body: 'Satu password admin dari environment variable, cookie httpOnly bertanda tangan HMAC, dan semua API wajib login.',
  },
  {
    icon: RefreshIcon,
    title: 'Auto-reconnect',
    body: 'Jika koneksi terputus, worker menyambung ulang otomatis dengan backoff. Kalau sesi di-logout dari HP, panel memberi tanda jelas.',
  },
]

const steps = [
  {
    n: '01',
    title: 'Buka panel & login',
    body: 'Masuk ke halaman panel dengan password admin yang kamu set di environment. Tidak perlu daftar akun baru — ini ruang kerja pribadi.',
    tag: '1 menit',
  },
  {
    n: '02',
    title: 'Tautkan WhatsApp',
    body: 'Buka menu Koneksi → pindai QR dari WhatsApp (Perangkat tertaut), atau ketik nomor untuk mendapatkan pairing code 8 digit.',
    tag: 'Scan / pairing',
  },
  {
    n: '03',
    title: 'Kelola chat dari inbox',
    body: 'Semua percakapan langsung tampil. Balas teks, kirim file, tandai dibaca. Sesi tersimpan di MongoDB sehingga tidak perlu scan ulang.',
    tag: 'Siap tempur',
  },
]

const plans = [
  {
    name: 'Basic',
    price: 'Gratis',
    period: 'selamanya',
    highlight: false,
    items: ['1 nomor WhatsApp', 'Inbox teks & media', 'Riwayat 30 hari', 'Sesi MongoDB', 'Auto-reconnect'],
    cta: 'Buka Panel',
  },
  {
    name: 'Nitro',
    price: 'Rp85K',
    period: 'per bulan',
    highlight: true,
    items: [
      'Semua fitur Basic',
      'Multi perangkat tertaut',
      'Penyimpanan media 14 hari',
      'Label & pencarian chat',
      'Prioritas worker',
    ],
    cta: 'Buka Panel',
  },
  {
    name: 'Bisnis',
    price: 'Rp250K',
    period: 'per bulan',
    highlight: false,
    items: ['Semua fitur Nitro', 'Beberapa nomor', 'Riwayat tanpa batas', 'Akses API & webhook', 'Backup sesi harian'],
    cta: 'Hubungi Admin',
  },
]

const faqs = [
  {
    q: 'Apakah ini WhatsApp resmi?',
    a: 'Bukan. Panel ini memakai library open-source Baileys (WhatsApp Web multi-device protocol). Gunakan dengan bijak dan sesuai Ketentuan Layanan WhatsApp — tidak untuk spam atau pesan massal.',
  },
  {
    q: 'Kenapa perlu worker terpisah dari Vercel?',
    a: 'Vercel menjalankan serverless function yang berumur pendek, sementara koneksi WhatsApp harus tetap hidup. Website (panel) berjalan di Vercel, sedangkan worker Baileys berjalan sebagai proses Node.js di VPS/Render/Railway dan terhubung ke MongoDB yang sama.',
  },
  {
    q: 'Apakah saya harus scan QR setiap kali worker restart?',
    a: 'Tidak. Credentials dan Signal keys disimpan di MongoDB per sesi, jadi worker memuat ulang sesi seperti WhatsApp Web memuat perangkat tertaut. Scan ulang hanya terjadi bila kamu logout atau sesi dicabut dari HP.',
  },
  {
    q: 'Di mana data saya disimpan?',
    a: 'Semua kredensial sesi, daftar chat, pesan, dan media disimpan di database MongoDB milikmu sendiri (MongoDB Atlas). Tidak ada server pihak ketiga yang menyimpan isi percakapan.',
  },
  {
    q: 'Bisa mengirim gambar, video, dan dokumen?',
    a: 'Bisa. Lampirkan file langsung dari kolom pesan (maksimal 9 MB per file). Pesan masuk yang berisi media otomatis diunduh ke MongoDB agar bisa dibuka kapan pun.',
  },
  {
    q: 'Bagaimana keamanan panelnya?',
    a: 'Panel dilindungi password admin dari environment variable, sesi login berupa cookie httpOnly yang ditandatangani HMAC, dan setiap endpoint API memverifikasi sesi tersebut.',
  },
]

function SectionHeading({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string
  title: React.ReactNode
  body?: string
  center?: boolean
}) {
  return (
    <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
        {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-white/60">{body}</p>}
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="landing min-h-screen overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#04100c]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#25d366] to-[#008069] shadow-lg shadow-emerald-900/40">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M20 11.6a7.6 7.6 0 0 1-8 7.6 8 8 0 0 1-3.5-.8L4 20l1.6-4.5A7.5 7.5 0 0 1 4.4 11a7.7 7.7 0 0 1 7.8-7.6 7.6 7.6 0 0 1 7.8 8.2Z" />
                <path d="M8.8 9.6h6.4M8.8 12.6h6.4" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold tracking-wide text-white">FYY WHATSAPP</span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-brand-200/70">admin panel</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13px] font-medium text-white/65 transition hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#04231b] transition hover:bg-brand-100"
            >
              Masuk Panel
            </Link>
            <a
              href="#cara-kerja"
              className="hidden items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-[13px] font-medium text-white/80 transition hover:bg-white/5 sm:inline-flex"
            >
              Cara kerja <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="landing-glow absolute inset-0 -z-10" />
        <div className="landing-grid absolute inset-0 -z-10" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
          <div className="fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1.5 text-[11.5px] font-medium text-brand-200">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-300 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-300" />
              </span>
              WhatsApp Web engine · Baileys · MongoDB
            </span>

            <h1 className="mt-6 text-[2.45rem] font-semibold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              WhatsApp Anda
              <br />
              <span className="text-gradient">online dari browser.</span>
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/65">
              Panel pribadi untuk menghosting sesi WhatsApp Anda. Tautkan lewat QR seperti WhatsApp Web,
              lalu balas semua chat dari inbox yang terasa persis WhatsApp Web — tanpa menyentuh HP,
              tanpa membuat akun baru.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#25d366] to-[#00a884] px-6 py-3 text-sm font-semibold text-[#04231b] shadow-xl shadow-emerald-900/40 transition hover:brightness-110"
              >
                Buka Panel Admin
                <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#cara-kerja"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5"
              >
                <QrIcon size={16} /> Lihat cara menautkan
              </a>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[
                { k: 'Sesi', v: 'MongoDB' },
                { k: 'Sinkron', v: '< 2 detik' },
                { k: 'Scan ulang', v: 'Tidak perlu' },
              ].map((item) => (
                <div key={item.k}>
                  <dt className="text-[10.5px] uppercase tracking-[0.16em] text-white/40">{item.k}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-white">{item.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative fade-up">
            <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-brand-500/15 blur-3xl" />
            <div className="float-slow">
              <ChatWindowMock />
            </div>
            <div className="glass absolute -bottom-6 -left-4 hidden rounded-xl px-3 py-2 text-[11px] text-white/80 shadow-xl sm:flex sm:items-center sm:gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/20 text-brand-200">
                <DatabaseIcon size={13} />
              </span>
              Sesi aman di MongoDB Atlas
            </div>
            <div className="glass absolute -top-4 right-2 hidden rounded-xl px-3 py-2 text-[11px] text-white/80 shadow-xl sm:flex sm:items-center sm:gap-2">
              <CheckDouble size={14} className="text-brand-300" /> Tersambung · 24 jam
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE / TRUST */}
      <div className="border-y border-white/10 bg-white/[0.02] py-3">
        <div className="mx-auto flex max-w-6xl overflow-hidden px-5">
          <div className="marquee flex shrink-0 items-center gap-10 whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-white/35">
            {[
              'WhatsApp Web multi-device',
              'Baileys 6.7',
              'MongoDB session store',
              'Next.js App Router',
              'Vercel edge-ready UI',
              'Media & dokumen',
              'Grup + status centang',
              'Anti-spam command queue',
            ]
              .concat([
                'WhatsApp Web multi-device',
                'Baileys 6.7',
                'MongoDB session store',
                'Next.js App Router',
                'Vercel edge-ready UI',
                'Media & dokumen',
                'Grup + status centang',
                'Anti-spam command queue',
              ])
              .map((item, index) => (
                <span key={`${item}-${index}`} className="flex items-center gap-10">
                  {item}
                  <span className="h-1 w-1 rounded-full bg-brand-400/50" />
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* CARA KERJA */}
      <section id="cara-kerja" className="relative mx-auto w-full max-w-6xl px-5 py-20 lg:py-28">
        <SectionHeading
          eyebrow="Cara kerja"
          title={<>Online dalam 3 langkah,<br className="hidden sm:block" /> seperti WhatsApp Web.</>}
          body="Tidak ada instalasi di HP, tidak ada pembuatan akun bot. Semua dimulai dari QR yang sudah Anda kenal."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.n}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-brand-400/40 hover:bg-white/[0.05]"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-sm font-semibold text-brand-200 ring-1 ring-brand-400/20">
                    {step.n}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-[15px] font-semibold text-white">{step.title}</h3>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/45">
                        {step.tag}
                      </span>
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">{step.body}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className="absolute bottom-0 left-[2.7rem] h-4 w-px bg-gradient-to-b from-brand-400/40 to-transparent" />
                )}
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-400/20 bg-brand-500/[0.07] p-4 text-[12.5px] text-brand-100/80">
              <SparkIcon size={16} className="text-brand-300" />
              Tips: buka panel di desktop. Tampilan mobile otomatis berubah jadi mode chat satu kolom.
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-brand-500/10 blur-2xl" />
            <div className="float-slow relative">
              <QrMock />
            </div>
          </div>
        </div>
      </section>

      {/* INBOX SHOWCASE */}
      <section className="relative border-y border-white/10 bg-white/[0.015] py-20 lg:py-28">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Inbox"
              title={
                <>
                  Rasanya <span className="text-brand-300">persis WhatsApp Web</span>, tapi ini panel kerja Anda.
                </>
              }
              body="Daftar chat, pencarian, filter belum dibaca, bubble hijau, centang biru, indikator mengetik — semua detail yang membuat WhatsApp terasa akrab, kini jadi ruang kerja."
            />
            <ul className="mt-8 space-y-3">
              {[
                'Cari chat berdasarkan nama, nomor, atau isi pesan terakhir.',
                'Filter semua, belum dibaca, grup, dan arsip.',
                'Buka panel info untuk melihat JID dan detail percakapan.',
                'Balas cepat dengan Enter, pesan panjang dengan Shift+Enter.',
                'Lampirkan gambar, video, audio, atau dokumen langsung dari komposer.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-white/65">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-medium text-white/85 transition hover:bg-white/5"
            >
              Coba sekarang <ArrowRight size={14} />
            </Link>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-500/20 to-transparent blur-2xl" />
            <InboxMock />
            <div className="glass absolute -bottom-5 right-4 hidden items-center gap-2 rounded-xl px-3 py-2 text-[11px] text-white/80 shadow-xl sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" /> Sinkron realtime
            </div>
          </div>
        </div>
      </section>

      {/* FITUR */}
      <section id="fitur" className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-28">
        <SectionHeading
          eyebrow="Fitur"
          title="Semua yang dibutuhkan untuk kerja harian."
          body="Bukan sekadar bot pembalas. Ini inbox penuh dengan detail yang Anda butuhkan saat mengurus pelanggan."
          center
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-brand-400/35 hover:bg-white/[0.05]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300 ring-1 ring-brand-400/20">
                  <Icon size={19} />
                </span>
                <h3 className="mt-4 text-[13.5px] font-semibold leading-snug text-white">{feature.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{feature.body}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ARSITEKTUR */}
      <section id="arsitektur" className="border-y border-white/10 bg-white/[0.015] py-20 lg:py-28">
        <div className="mx-auto w-full max-w-6xl px-5">
          <SectionHeading
            eyebrow="Di balik layar"
            title="Arsitektur yang jujur: UI di Vercel, koneksi WhatsApp di worker."
            body="Koneksi WhatsApp harus hidup terus, sedangkan Vercel menjalankan function berumur pendek. Karena itu panel dan worker dipisah, lalu dipertemukan lewat MongoDB."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: GlobeIcon,
                title: 'Panel · Vercel',
                body: 'Next.js App Router menyajikan landing page, login admin, inbox, dan API. Semua state percakapan dibaca dari MongoDB melalui driver resmi.',
                tags: ['Next.js 15', 'Vercel', 'httpOnly auth'],
              },
              {
                icon: PhoneIcon,
                title: 'Worker · Node.js',
                body: 'Proses Node yang menjaga socket Baileys tetap hidup. Menulis pesan masuk ke MongoDB dan mengeksekusi perintah kirim dari panel.',
                tags: ['Baileys', 'auto-reconnect', 'media downloader'],
              },
              {
                icon: DatabaseIcon,
                title: 'Session · MongoDB',
                body: 'Creds & Signal keys disimpan per-key, ditambah koleksi chat, pesan, media, dan command queue. Cukup satu URI untuk semuanya.',
                tags: ['Atlas', 'session store', 'command queue'],
              },
            ].map((card) => {
              const Icon = card.icon
              return (
                <div key={card.title} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#07150f]/80 p-6">
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl" />
                  <Icon size={22} className="text-brand-300" />
                  <h3 className="mt-4 text-[14px] font-semibold text-white">{card.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{card.body}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {card.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-white/45">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-[12.5px] text-white/60 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2">
              <ShieldIcon size={16} className="text-brand-300" />
              Worker hanya berkomunikasi lewat MongoDB — tanpa port publik, tanpa webhook terbuka.
            </p>
            <span className="flex items-center gap-2 text-white/45">
              <BoltIcon size={14} /> latensi perintah ~1 detik
            </span>
          </div>
        </div>
      </section>

      {/* HARGA */}
      <section id="harga" className="mx-auto w-full max-w-6xl px-5 py-20 lg:py-28">
        <SectionHeading
          eyebrow="Harga"
          title="Skema paket, siap dipakai kalau panel dibuka untuk publik."
          body="Saat ini panel dipakai pribadi. Struktur paket di bawah mengikuti referensi hosting bot WhatsApp, tinggal sesuaikan saat dipasarkan."
          center
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 ${
                plan.highlight
                  ? 'border-brand-400/50 bg-gradient-to-b from-brand-500/[0.12] to-transparent shadow-[0_20px_60px_-30px_rgba(0,168,132,0.6)]'
                  : 'border-white/10 bg-white/[0.025]'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#25d366] to-[#00a884] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#04231b]">
                  paling populer
                </span>
              )}
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">{plan.name}</h3>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-3xl font-semibold text-white">{plan.price}</span>
                <span className="pb-1 text-[12px] text-white/45">/ {plan.period}</span>
              </div>
              <ul className="mt-6 space-y-2.5">
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12.5px] text-white/65">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={`mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-[#25d366] to-[#00a884] text-[#04231b] hover:brightness-110'
                    : 'border border-white/15 text-white/80 hover:bg-white/5'
                }`}
              >
                {plan.cta} <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-[11.5px] leading-relaxed text-white/35">
          Harga di atas ilustratif untuk struktur halaman. Panel ini berjalan di akun infrastruktur milikmu sendiri
          (Vercel + MongoDB Atlas + worker Node).
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-white/10 bg-white/[0.015] py-20 lg:py-28">
        <div className="mx-auto w-full max-w-4xl px-5">
          <SectionHeading eyebrow="FAQ" title="Pertanyaan yang sering muncul." center />
          <div className="mt-10 space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-xl border border-white/10 bg-white/[0.025] px-5 py-4 transition open:border-brand-400/30 open:bg-white/[0.04]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13.5px] font-medium text-white/85">
                  {faq.q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition group-open:rotate-45">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-20 lg:py-24">
        <div className="landing-glow absolute inset-0 -z-10 opacity-80" />
        <div className="mx-auto w-full max-w-4xl px-5 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Siap buka WhatsApp Anda dari browser?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-white/60">
            Masuk ke panel, tautkan perangkat lewat QR, dan mulai balas chat dalam hitungan detik.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#25d366] to-[#00a884] px-7 py-3 text-sm font-semibold text-[#04231b] shadow-xl shadow-emerald-900/40 transition hover:brightness-110"
            >
              Masuk ke Panel <ArrowRight size={16} />
            </Link>
            <Link
              href="/api/health"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/75 transition hover:bg-white/5"
            >
              Cek status sistem
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#030b08]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#25d366] to-[#008069]">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M20 11.6a7.6 7.6 0 0 1-8 7.6 8 8 0 0 1-3.5-.8L4 20l1.6-4.5A7.5 7.5 0 0 1 4.4 11a7.7 7.7 0 0 1 7.8-7.6 7.6 7.6 0 0 1 7.8 8.2Z" />
                </svg>
              </span>
              <span className="text-[13px] font-semibold text-white">FYY WhatsApp Admin</span>
            </div>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-white/45">
              Panel pribadi untuk menghosting sesi WhatsApp dengan Baileys. Sesi tersimpan di MongoDB dan
              tetap hidup di worker Node.js.
            </p>
            <p className="mt-4 text-[11px] leading-relaxed text-white/30">
              Tidak berafiliasi dengan WhatsApp Inc. Gunakan sesuai Ketentuan Layanan WhatsApp.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Produk</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-white/55">
              {navLinks.slice(0, 4).map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Panel</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-white/55">
              <li>
                <Link href="/login" className="transition hover:text-white">
                  Masuk
                </Link>
              </li>
              <li>
                <Link href="/panel/chats" className="transition hover:text-white">
                  Inbox
                </Link>
              </li>
              <li>
                <Link href="/panel/connect" className="transition hover:text-white">
                  Koneksi WhatsApp
                </Link>
              </li>
              <li>
                <Link href="/api/health" className="transition hover:text-white">
                  Status sistem
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Teknis</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-white/55">
              <li>Next.js · Vercel</li>
              <li>Baileys · Node.js</li>
              <li>MongoDB Atlas</li>
              <li>https://fyywhatsappadmin.vercel.app</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-[11px] text-white/35 sm:flex-row">
            <p>© {new Date().getFullYear()} FYY WhatsApp Admin. Dibuat untuk kebutuhan internal.</p>
            <p className="flex items-center gap-1.5">
              <ShieldIcon size={12} /> Sesi &amp; data tetap di database milik Anda.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
