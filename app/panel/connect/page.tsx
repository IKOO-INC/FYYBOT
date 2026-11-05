import type { Metadata } from 'next'
import ConnectPanel from '@/components/panel/ConnectPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Koneksi WhatsApp',
  robots: { index: false, follow: false },
}

export default function ConnectPage() {
  return <ConnectPanel />
}
