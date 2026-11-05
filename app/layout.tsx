import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://fyywhatsappadmin.vercel.app'),
  title: {
    default: 'FYY WhatsApp Admin — Inbox WhatsApp Web & Bot Hosting',
    template: '%s · FYY WhatsApp Admin',
  },
  description:
    'Panel pribadi untuk menghosting sesi WhatsApp: tautkan lewat QR seperti WhatsApp Web, lalu balas pesan dari inbox bergaya WhatsApp Web. Sesi disimpan aman di MongoDB.',
  keywords: [
    'whatsapp admin',
    'whatsapp web',
    'baileys',
    'bot whatsapp',
    'hosting bot whatsapp',
    'inbox whatsapp',
    'fyybot',
  ],
  openGraph: {
    title: 'FYY WhatsApp Admin — Inbox WhatsApp Web & Bot Hosting',
    description:
      'Tautkan WhatsApp lewat QR, sesi tersimpan di MongoDB, dan kelola semua chat dari inbox bergaya WhatsApp Web.',
    url: 'https://fyywhatsappadmin.vercel.app',
    siteName: 'FYY WhatsApp Admin',
    type: 'website',
    locale: 'id_ID',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#00a884' },
    { media: '(prefers-color-scheme: dark)', color: '#111b21' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('fyy-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
