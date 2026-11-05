import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Base>
)

export const MenuDots = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </Base>
)

export const ChatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </Base>
)

export const ChatFilled = (p: IconProps) => (
  <Base {...p}>
    <path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
      fill="currentColor"
      fillOpacity="0.14"
    />
  </Base>
)

export const StatusIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    <circle cx="12" cy="12" r="3.4" />
  </Base>
)

export const UsersIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19" />
    <circle cx="9" cy="7" r="3.4" />
    <path d="M22 19v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16 4.13a4 4 0 0 1 0 7.75" />
  </Base>
)

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
  </Base>
)

export const LogoutIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Base>
)

export const SendIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </Base>
)

export const MicIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 17v4" />
    <path d="M8 21h8" />
  </Base>
)

export const PaperclipIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Base>
)

export const EmojiIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    <circle cx="9" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
  </Base>
)

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 12 5 5L20 6" />
  </Base>
)

export const CheckDouble = (p: IconProps) => (
  <Base {...p} strokeWidth={2}>
    <path d="m2 12.5 4.5 4.5L15 8" />
    <path d="m10 12.5 4.5 4.5L23 8" />
  </Base>
)

export const ChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
)

export const ChevronLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 6-6 6 6 6" />
  </Base>
)

export const ArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Base>
)

export const ArrowLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </Base>
)

export const QrIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3z" />
    <path d="M21 14v3M18 21h3M14 21h1" />
  </Base>
)

export const WifiIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12.5a10 10 0 0 1 14 0" />
    <path d="M8.5 16a5.5 5.5 0 0 1 7 0" />
    <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
  </Base>
)

export const XIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const LinkIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 3.4" />
    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
  </Base>
)

export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
    <path d="M21 3v6h-6" />
  </Base>
)

export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Base>
)

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 21h14" />
  </Base>
)

export const PlayIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 4v16l13-8L7 4Z" />
  </Base>
)

export const PauseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4v16M15 4v16" />
  </Base>
)

export const FileIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
  </Base>
)

export const ShieldIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
)

export const DatabaseIcon = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v7c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 12v7c0 1.66 3.58 3 8 3s8-1.34 8-3v-7" />
  </Base>
)

export const BoltIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </Base>
)

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Base>
)

export const GlobeIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </Base>
)

export const PhoneIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18.5h2" />
  </Base>
)

export const LockIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Base>
)

export const FilterIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
  </Base>
)

export const ArchiveIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Base>
)

export const MoonIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Base>
)

export const SunIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </Base>
)

export const InfoIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
)

export const ExternalIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3h7v7" />
    <path d="M21 3 11 13" />
    <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </Base>
)

export const SparkIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    <path d="M19 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
  </Base>
)

export const ImageIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="8.5" cy="9" r="1.6" />
    <path d="m21 15-5-5-9 9" />
  </Base>
)

export const VideoIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2" y="6" width="14" height="12" rx="2.5" />
    <path d="m16 10 6-3v10l-6-3" />
  </Base>
)

export const StickerIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h6l8-8V7a4 4 0 0 0-4-4h-4Z" />
    <path d="M13 21v-4a4 4 0 0 1 4-4h4" />
  </Base>
)

export const PollIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <rect x="5" y="12" width="4" height="6" />
    <rect x="11" y="8" width="4" height="10" />
    <rect x="17" y="4" width="4" height="14" />
  </Base>
)

export const PinIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21v-6" />
    <path d="M8 3h8l-1 6 3 3H6l3-3-1-6Z" />
  </Base>
)
