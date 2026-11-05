import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Rail from '@/components/panel/Rail'
import { isAuthenticated } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Panel WhatsApp',
  robots: { index: false, follow: false },
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect('/login')

  return (
    <div className="wa-app h-[100dvh] w-full overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[1700px] overflow-hidden bg-[var(--wa-pane)] shadow-[0_6px_32px_rgba(11,20,26,0.16)] sm:my-4 sm:h-[calc(100dvh-2rem)] sm:rounded-lg">
        <Rail />
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
