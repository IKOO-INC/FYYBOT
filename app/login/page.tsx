import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import LoginForm from '@/components/LoginForm'
import { adminPassword, isAuthenticated } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Masuk Panel',
  description: 'Masuk ke panel admin FYY WhatsApp.',
}

export default async function LoginPage() {
  if (await isAuthenticated()) redirect('/panel/chats')
  return <LoginForm configured={Boolean(adminPassword())} />
}
