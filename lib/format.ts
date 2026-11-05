export function formatClock(ts?: number | null) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
}

export function formatChatTime(short = true, ts?: number | null) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return formatClock(ts)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return short ? 'Kemarin' : 'Kemarin ' + formatClock(ts)
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays < 7) return d.toLocaleDateString('id-ID', { weekday: 'long' })
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function formatDateDivider(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hari ini'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Kemarin'
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function initials(name?: string | null) {
  if (!name) return '?'
  const cleaned = name.trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  '#00a884',
  '#53bdeb',
  '#7f66ff',
  '#ff8a65',
  '#f4b400',
  '#e542a3',
  '#00897b',
  '#5c6bc0',
  '#ec407a',
  '#26a69a',
]

export function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function prettyPhone(jid?: string | null) {
  if (!jid) return ''
  const raw = jid.split('@')[0]?.split(':')[0] || ''
  if (!/^\d+$/.test(raw)) return raw
  if (raw.startsWith('62')) return `+${raw}`
  return `+${raw}`
}

export function truncate(text: string, max = 90) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function timeAgo(ts?: number | null) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 5000) return 'baru saja'
  if (diff < 60_000) return `${Math.floor(diff / 1000)} detik lalu`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} menit lalu`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} jam lalu`
  return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}
