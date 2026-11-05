'use client'

import { avatarColor, initials } from '@/lib/format'

export default function Avatar({
  name,
  seed,
  size = 49,
  online = false,
  className = '',
}: {
  name?: string | null
  seed?: string
  size?: number
  online?: boolean
  className?: string
}) {
  const color = avatarColor(seed || name || '?')
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-medium text-white/95 select-none"
        style={{ background: color, fontSize: Math.max(11, size * 0.35) }}
      >
        {initials(name)}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-[#25d366] ring-2 ring-white dark:ring-[#111b21]"
          style={{ width: size * 0.26, height: size * 0.26 }}
        />
      )}
    </span>
  )
}
