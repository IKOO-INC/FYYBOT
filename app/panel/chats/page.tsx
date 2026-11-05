import type { Metadata } from 'next'
import Inbox from '@/components/panel/Inbox'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Inbox',
  robots: { index: false, follow: false },
}

export default function ChatsPage() {
  return <Inbox />
}
