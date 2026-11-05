# FYY WhatsApp Admin

Panel pribadi untuk menghosting sesi WhatsApp dengan library **Baileys** (WhatsApp Web multi-device protocol), lengkap dengan **inbox bergaya WhatsApp Web** dan **sesi yang disimpan di MongoDB**.

> Referensi tampilan & alur: [wibusoft.com](https://wibusoft.com/#how-it-works) — bagian *Cara kerja* diadaptasi menjadi alur tautkan perangkat → inbox. Dokumentasi Baileys: [baileys.wiki](https://baileys.wiki/).

- Landing page: `https://fyywhatsappadmin.vercel.app`
- Panel admin: `https://fyywhatsappadmin.vercel.app/login`

---

## Daftar isi

1. [Fitur](#fitur)
2. [Arsitektur](#arsitektur)
3. [Struktur proyek](#struktur-proyek)
4. [Menjalankan lokal](#menjalankan-lokal)
5. [Environment variables](#environment-variables)
6. [Cara pakai (tautkan WhatsApp)](#cara-pakai-tautkan-whatsapp)
7. [Deploy panel ke Vercel](#deploy-panel-ke-vercel)
8. [Deploy worker](#deploy-worker)
9. [Skema MongoDB](#skema-mongodb)
10. [API](#api)
11. [Keamanan](#keamanan)
12. [Troubleshooting](#troubleshooting)
13. [Disclaimer](#disclaimer)

---

## Fitur

**Inbox (meniru WhatsApp Web)**

- Daftar chat dengan avatar, cuplikan pesan, badge belum dibaca, chat terjepit (pinned), waktu relatif.
- Pencarian chat + filter **Semua / Belum dibaca / Grup / Arsip**.
- Bubble pesan masuk/keluar, ekor bubble, nama pengirim di grup, pemisah tanggal, jam, centang terkirim/diterima/dibaca.
- Media: gambar (lightbox), video, audio/pesan suara dengan waveform, dokumen (unduh), sticker, lokasi, kontak, polling.
- Balasan kutipan (quoted), pesan yang dihapus, reaksi emoji cepat.
- Komposer: Enter kirim, Shift+Enter baris baru, emoji picker, lampiran file, indikator "mengetik" dikirim ke WhatsApp.
- Panel info percakapan (JID, aktivitas terakhir, salin nomor, buka di WhatsApp).
- Tema terang/gelap, responsif (mobile jadi satu kolom), status worker online di rail kiri.

**Koneksi**

- QR **diambil langsung dari event `connection.update` Baileys** (`qr`), bukan gambar statis.
- Umur QR mengikuti default Baileys 6.7 (`qrTimeout`): **QR pertama 60 detik, QR berikutnya 20 detik**. Setiap QR baru menaikkan `qrSeq`, panel menampilkan hitung mundur + progress, lalu mengganti gambar otomatis.
- Kalau QR kedaluwarsa dan belum ada pengganti, worker menghapus `qr` dari MongoDB sehingga panel **tidak pernah** menampilkan QR basi (muncul status “menunggu QR baru” + tombol **Minta QR baru**).
- Bisa juga **pairing code** 8 digit via nomor.
- Status koneksi (connecting/open/close), heartbeat worker, detail akun (nomor, nama, platform, JID).
- Tombol muat ulang koneksi & putuskan sesi (logout perangkat + hapus kredensial dari MongoDB).
- Tidak ada akun baru: login panel pakai satu password admin, sesi WhatsApp dimuat seperti WhatsApp Web.

**Worker**

- Auth state (creds + Signal keys) disimpan per-key di MongoDB (`BufferJSON`), jadi restart/redeploy tidak perlu scan ulang.
- Auto-reconnect dengan backoff; deteksi `loggedOut` dan pembersihan sesi.
- Sinkronisasi riwayat (opsional), kontak, grup, status centang, pesan dihapus.
- Unduh media masuk otomatis (dengan batas ukuran) dan on-demand.
- Command queue di MongoDB → eksekusi berurutan, aman meski panel dibuka di beberapa tab.

---

## Arsitektur

```
┌──────────────────────────┐        ┌───────────────────────────┐
│  Panel (Next.js/Vercel)  │        │  Worker (Node + Baileys)  │
│  landing · login · inbox │        │  socket WhatsApp 24/7     │
│  API route handlers      │        │  event → MongoDB          │
└────────────┬─────────────┘        └────────────┬──────────────┘
             │  baca/tulis                        │ baca/tulis
             └──────────────► MongoDB Atlas ◄─────┘
                 wa_auth · wa_status · wa_chats · wa_messages
                 wa_media · wa_contacts · wa_commands · wa_uploads
```

**Kenapa worker terpisah?** Vercel menjalankan serverless function yang berumur pendek, sedangkan socket WhatsApp harus tetap hidup. Panel cukup membaca/menulis MongoDB; worker yang memegang koneksi. Keduanya memakai `MONGODB_URI` yang sama.

Perintah dari panel (kirim pesan, tandai dibaca, dll.) ditulis ke `wa_commands` dengan status `pending`. Worker mengambilnya (`processing`), mengeksekusi ke WhatsApp, lalu menandai `done`/`error`. Pesan keluar/masuk ditulis worker ke `wa_messages`, dan panel melakukan polling singkat (≈1,8 detik) untuk pengalaman realtime di serverless.

---

## Struktur proyek

```
app/
  page.tsx                 landing page (wibusoft-style, #cara-kerja)
  login/                   login admin
  panel/
    layout.tsx             shell + rail (auth guard)
    chats/                 inbox WhatsApp Web clone
    connect/               QR, pairing code, status sesi
    settings/              status sistem & panduan worker
  api/
    auth/login|logout      cookie httpOnly bertanda HMAC
    session                status sesi + QR (data URL)
    session/action         pair | logout | restart
    chats                  daftar chat + filter + search
    chats/action           read | typing
    messages               riwayat pesan (pagination)
    messages/send          kirim teks
    messages/media         unggah lampiran + ambil media
    messages/react         kirim reaksi
    health                 ping MongoDB & konfigurasi
components/
  marketing.tsx            mock UI untuk landing
  panel/                   Inbox, Conversation, MessageBubble, MessageMedia, Rail, …
lib/
  mongo.ts                 koneksi MongoDB (cached)
  store.ts                 query & enqueue command
  auth.ts                  password admin + cookie HMAC
  types.ts                 tipe dokumen
worker/
  src/index.ts             socket Baileys, event handler, command loop
  src/auth-state.ts        MongoDB auth state (creds + keys)
  src/normalize.ts         normalisasi pesan WhatsApp
  Dockerfile · render.yaml
```

---

## Menjalankan lokal

Butuh **Node.js 20+** dan **MongoDB** (lokal atau Atlas).

```bash
git clone https://github.com/IKOO-INC/FYYBOT.git
cd FYYBOT

# 1. Panel
npm install
cp .env.example .env.local     # isi ADMIN_PASSWORD + MONGODB_URI
npm run dev                    # http://localhost:3000

# 2. Worker (terminal terpisah)
cd worker
npm install
npm start                      # membaca .env.local di root atau env di shell
```

Buka `http://localhost:3000/login` → masuk → menu **Koneksi** → pindai QR dari
WhatsApp HP (`⋮` → **Perangkat tertaut** → **Tautkan perangkat**).

Setelah tersambung, chat akan muncul di **Inbox**. Pesan yang Anda kirim dari panel
masuk ke antrean `wa_commands`, dieksekusi worker dalam ≈1 detik.

> Worker membaca `.env.local` dari folder root project (juga `.env`). Jika dijalankan
> dari VPS, cukup set environment variable di service-nya.

---

## Environment variables

| Variabel | Untuk | Wajib | Default |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Panel | ya | — |
| `ADMIN_SECRET` | Panel (sign cookie) | disarankan | turunan password |
| `MONGODB_URI` | Panel + worker | ya | — |
| `MONGODB_DB_NAME` | Panel + worker | tidak | `fyywhatsapp` |
| `WA_SESSION_ID` | Worker | tidak | `default` |
| `WA_SYNC_FULL_HISTORY` | Worker | tidak | `true` |
| `WA_AUTO_MEDIA` | Worker | tidak | `true` |
| `WA_MAX_MEDIA_MB` | Worker | tidak | `8` |
| `WA_HISTORY_LIMIT` | Worker | tidak | `60` |
| `WA_LOG_LEVEL` | Worker | tidak | `warn` |
| `WA_QR_TTL_FIRST_MS` | Worker | tidak | `60000` (sama dengan Baileys) |
| `WA_QR_TTL_NEXT_MS` | Worker | tidak | `20000` (sama dengan Baileys) |
| `WA_PAIRING_TTL_MS` | Worker | tidak | `120000` (umur kode pairing) |
| `WA_MAX_RUNTIME_MS` | Worker | tidak | `0` (tanpa batas; GHA memakai 3.300.000 = 55 menit) |
| `WA_LOCK_TTL_MS` | Worker | tidak | `90000` |
| `WA_LOCK_WAIT_MS` | Worker | tidak | `300000` |
| `WA_DISABLE_LOCK` | Worker | tidak | `false` |
| `WORKER_VERSION` | Worker | tidak | `1.1.0` (tampil di panel) |

`/api/health` menampilkan status koneksi MongoDB dan apakah `ADMIN_PASSWORD` sudah diset
(tanpa membocorkan nilainya).

---

## Cara pakai (tautkan WhatsApp)

1. **Login panel** di `/login` dengan `ADMIN_PASSWORD`.
2. **Pastikan worker hidup.** Buka `/panel/connect`; indikator heartbeat harus `aktif`.
   Jika belum, jalankan `npm start` di folder `worker` (atau deploy worker, lihat bawah).
3. **Pindai QR** (atau minta pairing code dengan nomor `628…`).
   Di HP: WhatsApp → `⋮` → **Perangkat tertaut** → **Tautkan perangkat**.
4. Setelah `open`, nomor & nama muncul di halaman Koneksi. Buka **Inbox** dan mulai kirim pesan.
5. Sesi tersimpan di MongoDB. Worker boleh restart kapan saja — tidak perlu scan ulang.
   Scan ulang hanya jika Anda menekan **Putuskan sesi** atau mencabut perangkat dari HP.

---

## Deploy panel ke Vercel

1. Import repo `IKOO-INC/FYYBOT` sebagai project Vercel (framework: **Next.js**, tanpa
   build setting khusus).
2. Tambahkan Environment Variables untuk **Production + Preview**:
   - `ADMIN_PASSWORD`
   - `ADMIN_SECRET`
   - `MONGODB_URI`
   - `MONGODB_DB_NAME` (opsional)
3. Deploy. Domain project `fyywhatsappadmin` akan menjadi
   `https://fyywhatsappadmin.vercel.app`.
4. Buka `/api/health` untuk memastikan `mongo: "ok"` dan `adminPasswordConfigured: true`.
5. Buka `/login`, masuk, lalu `/panel/connect`.

> Catatan: jangan menjalankan Baileys di dalam serverless function Vercel —
> socket-nya akan diputus saat function selesai. Gunakan worker terpisah.

---

## Deploy worker

Worker butuh proses Node.js yang hidup terus. Pilih salah satu:

### a. GitHub Actions — tanpa console / tanpa kartu (paling mudah)

Repo sudah punya workflow `.github/workflows/worker.yml`. Worker menyala sendiri,
berjalan ±55 menit, menutup diri, lalu **langsung memicu run berikutnya**
(jeda ±1 menit). Cron tiap jam menjadi jaring pengaman kalau rantai terputus.
Tidak perlu terminal sama sekali — semua dari halaman GitHub.

1. Buka repo di GitHub → **Settings → Secrets and variables → Actions**.
2. Tab **Secrets** → **New repository secret** → nama `MONGODB_URI`, isi connection
   string Atlas (yang sama dengan di Vercel).
3. (Opsional) tab **Variables** → `MONGODB_DB_NAME=fyywhatsapp`, `WA_SESSION_ID=default`.
4. Tab **Actions** → pilih **WhatsApp Worker** → **Run workflow**.
5. Buka `https://fyywhatsappadmin.vercel.app/panel/connect` — dalam ±1 menit QR
   muncul sendiri (atau pakai pairing code).

Catatan:

- Job GitHub Actions maksimal 6 jam; worker menutup dirinya di menit ke-55
  (`WA_MAX_RUNTIME_MS`) supaya jadwal berikutnya tidak tumpang tindih.
- Repo ini publik → menit Actions **gratis tanpa batas**. Kalau repo di-private,
  ubah jadwal jadi tiap 3–6 jam agar tetap di kuota 2.000 menit/bulan.
- `wa_locks` mencegah dua worker (mis. Actions + laptop) memegang sesi yang sama.
  Worker kedua akan menunggu giliran, lalu keluar bila lock masih dipegang.
- Repo publik: jangan simpan `MONGODB_URI` di file — pakai Secrets.
- Butuh sesi benar-benar 24/7 tanpa jeda? Pakai Render/Railway/VPS (opsi b/c),
  atau turunkan `WA_MAX_RUNTIME_MS` + jadwal jadi `*/30 * * * *`.

### b. VPS / server sendiri (systemd)

```bash
git clone https://github.com/IKOO-INC/FYYBOT.git /opt/fyybot
cd /opt/fyybot/worker && npm install

# /etc/systemd/system/fyybot-worker.service
[Unit]
Description=FYY WhatsApp Worker
After=network.target

[Service]
WorkingDirectory=/opt/fyybot/worker
Environment=MONGODB_URI=mongodb+srv://...
Environment=MONGODB_DB_NAME=fyywhatsapp
Environment=WA_LOG_LEVEL=info
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now fyybot-worker
sudo journalctl -u fyybot-worker -f
```

### c. Render / Railway / Fly.io (Docker)

Repo sudah menyertakan `worker/Dockerfile` dan `render.yaml`.

- Render: **New → Blueprint** → pilih repo ini → isi `MONGODB_URI` & `MONGODB_DB_NAME`.
- Railway/Fly: build dengan `dockerfilePath = worker/Dockerfile`, lalu set env yang sama.
- Tidak butuh port publik: worker hanya bicara ke MongoDB.

### d. Menjalankan manual di komputer

```bash
cd worker
MONGODB_URI="mongodb+srv://..." MONGODB_DB_NAME="fyywhatsapp" npm start
```

Selama proses ini hidup, panel di Vercel bisa dipakai dari mana saja. Jika laptop
dimatikan, koneksi WhatsApp ikut berhenti (sesi tetap aman di MongoDB).

---

## Skema MongoDB

| Koleksi | Isi |
| --- | --- |
| `wa_auth` | `creds` + Signal keys (`key-<type>-<id>`) per `WA_SESSION_ID` |
| `wa_status` | status koneksi, QR, pairing code, info akun, heartbeat worker |
| `wa_chats` | ringkasan chat (nama, unread, pesan terakhir, pinned, arsip) |
| `wa_messages` | pesan ternormalisasi (`jid`, `id`, `fromMe`, `ts`, `type`, `text`, `media`, `quoted`, status) |
| `wa_media` | media terunduh (base64) — TTL 14 hari |
| `wa_contacts` | cache nama kontak |
| `wa_commands` | antrean perintah panel → worker |
| `wa_uploads` | file sementara dari panel → worker (TTL 24 jam) |
| `wa_locks` | lock single-worker (siapa pemegang socket + kapan kedaluwarsa) |

Sesi disimpan dengan `BufferJSON.replacer/reviver`, sehingga kunci biner Signal tetap utuh.

---

## API

Semua endpoint (kecuali `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/health`)
memerlukan cookie sesi admin.

| Method & path | Fungsi |
| --- | --- |
| `POST /api/auth/login` | `{ password }` → set cookie httpOnly |
| `POST /api/auth/logout` | hapus cookie panel |
| `GET /api/session` | status sesi + QR (data URL) + sisa umur QR/pairing code |
| `POST /api/session/action` | `{ action: "pair" \| "logout" \| "restart", phone? }` |
| `GET /api/chats?filter=all\|unread\|groups\|archived&q=` | daftar chat |
| `POST /api/chats/action` | `{ jid, action: "read" \| "typing" }` |
| `GET /api/messages?jid=&before=&limit=` | riwayat pesan |
| `POST /api/messages/send` | `{ jid, text }` → antre kirim |
| `POST /api/messages/media` | `multipart/form-data`: `jid`, `file`, `caption` |
| `GET /api/messages/media?jid=&id=` | ambil media (202 = sedang diunduh worker) |
| `POST /api/messages/react` | `{ jid, messageId, emoji, fromMe }` |
| `GET /api/health` | ping MongoDB + konfigurasi |

---

## Keamanan

- Hanya satu pintu masuk: `ADMIN_PASSWORD` (dibandingkan dengan `timingSafeEqual`).
- Cookie `fyy_session` bersifat `httpOnly`, `sameSite=lax`, `secure` di production,
  dan ditandatangani HMAC-SHA256 (`ADMIN_SECRET`).
- Semua route API memverifikasi cookie; halaman `/panel/*` dijaga di layout server.
- Worker **tidak** membuka port apa pun — komunikasi hanya lewat MongoDB.
- Kredensial WhatsApp hanya tersimpan di database Anda sendiri, tidak pernah dikirim ke
  pihak ketiga oleh aplikasi ini.
- Rekomendasi: pakai user MongoDB khusus dengan akses ke satu database, aktifkan IP
  access list Atlas, dan jangan commit `.env.local`.

---

## Troubleshooting

| Gejala | Penyebab & solusi |
| --- | --- |
| `MONGODB_URI belum diset` | Set env `MONGODB_URI` (Vercel + worker), lalu redeploy/restart. |
| QR tidak muncul | Worker belum jalan atau gagal konek Mongo. Cek log `npm start` di `worker`. |
| Pesan tidak terkirim / status `pending` | Worker offline. `POST /api/messages/send` menunggu ±9 detik worker. |
| `Sesi sudah terdaftar` saat pairing | Nomor sudah tertaut. Gunakan QR, atau **Putuskan sesi** dulu. |
| Logout sendiri setelah beberapa hari | HP mencabut perangkat, atau WhatsApp membatasi sesi. Scan ulang QR. |
| Media terus `202` | File terlalu besar (`WA_MAX_MEDIA_MB`) atau worker sedang mengunduh. Coba lagi. |
| Chat grup tanpa nama | Metadata grup belum tersinkron; worker mengambilnya otomatis saat ada pesan. |
| Riwayat kosong | `WA_SYNC_FULL_HISTORY=true` hanya mengirim histori terbaru. Pesan lama WhatsApp tidak selalu tersedia. |

---

## Disclaimer

Proyek ini **tidak berafiliasi dengan WhatsApp Inc.** Baileys adalah library tidak resmi.
Gunakan hanya untuk akun yang Anda miliki, patuhi Ketentuan Layanan WhatsApp, dan hindari
pengiriman massal/spam. Risiko pembatasan akun ditanggung pengguna.
