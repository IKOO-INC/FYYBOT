'use client'

import { avatarColor, initials } from '@/lib/format'

export default function Avatar({
  name,
  seed,
  size = 49,
  online = false,
  src = null,
  className = '',
}: {
  name?: string | null
  seed?: string
  size?: number
  online?: boolean
  /** Foto profil (data URL) dari worker; fallback ke inisial bila kosong. */
  src?: string | null
  className?: string
}) {
  const color = avatarColor(seed || name || '?')
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || 'Foto profil'}
          loading="lazy"
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-medium text-white/95 select-none"
          style={{ background: color, fontSize: Math.max(11, size * 0.35) }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-[#25d366] ring-2 ring-white dark:ring-[#111b21]"
          style={{ width: size * 0.26, height: size * 0.26 }}
        />
      )}
    </span>
  )
}
