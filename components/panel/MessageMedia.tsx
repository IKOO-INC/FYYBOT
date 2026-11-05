'use client'

import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, FileIcon, PauseIcon, PlayIcon, RefreshIcon, XIcon } from '@/components/icons'

function mediaUrl(jid: string, id: string) {
  return `/api/messages/media?jid=${encodeURIComponent(jid)}&id=${encodeURIComponent(id)}`
}

export function useMediaBlob(jid: string, messageId: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    let attempt = 0
    let timer: number | undefined
    let created: string | null = null

    setStatus('loading')
    setUrl(null)

    const run = async () => {
      attempt += 1
      try {
        const res = await fetch(mediaUrl(jid, messageId))
        if (!alive) return
        if (res.status === 202) {
          if (attempt < 14) timer = window.setTimeout(run, 1400)
          else setStatus('error')
          return
        }
        if (!res.ok) {
          setStatus('error')
          return
        }
        const blob = await res.blob()
        if (!alive) return
        created = URL.createObjectURL(blob)
        setUrl(created)
        setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    }

    void run()

    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
      if (created) URL.revokeObjectURL(created)
    }
  }, [jid, messageId, nonce])

  return { url, status, retry: () => setNonce((value) => value + 1) }
}

function Skeleton({ label = 'Mengunduh media…' }: { label?: string }) {
  return (
    <div className="flex h-40 w-52 items-center justify-center rounded-md bg-black/10 text-[11px] text-[var(--wa-text-soft)]">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {label}
      </span>
    </div>
  )
}

function Failed({ retry, label }: { retry: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={retry}
      className="flex h-32 w-52 flex-col items-center justify-center gap-2 rounded-md bg-black/10 text-[11px] text-[var(--wa-text-soft)] transition hover:bg-black/15"
    >
      <RefreshIcon size={16} />
      {label}
    </button>
  )
}

export function ImageBubble({
  jid,
  id,
  caption,
  width,
  height,
}: {
  jid: string
  id: string
  caption?: string
  width?: number
  height?: number
}) {
  const { url, status, retry } = useMediaBlob(jid, id)
  const [open, setOpen] = useState(false)
  const ratio = width && height ? width / height : 4 / 3

  return (
    <div>
      {status === 'ready' && url ? (
        <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption || 'Gambar'}
            className="max-h-80 w-auto max-w-full object-cover"
            style={{ aspectRatio: ratio }}
          />
        </button>
      ) : status === 'error' ? (
        <Failed retry={retry} label="Media tidak tersedia · coba lagi" />
      ) : (
        <Skeleton />
      )}
      {caption && <p className="mt-1.5 px-0.5 text-[13.5px] leading-snug">{caption}</p>}

      {open && url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
          >
            <XIcon size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={caption || 'Gambar'} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}

export function StickerBubble({ jid, id }: { jid: string; id: string }) {
  const { url, status, retry } = useMediaBlob(jid, id)
  if (status === 'ready' && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Sticker" className="h-32 w-32 object-contain" />
  }
  if (status === 'error') return <Failed retry={retry} label="Sticker tidak tersedia" />
  return <div className="h-32 w-32 animate-pulse rounded-md bg-black/10" />
}

export function VideoBubble({
  jid,
  id,
  caption,
  seconds,
}: {
  jid: string
  id: string
  caption?: string
  seconds?: number
}) {
  const { url, status, retry } = useMediaBlob(jid, id)
  return (
    <div>
      {status === 'ready' && url ? (
        <video src={url} controls playsInline className="max-h-80 w-full max-w-md rounded-md bg-black" />
      ) : status === 'error' ? (
        <Failed retry={retry} label="Video tidak tersedia · coba lagi" />
      ) : (
        <Skeleton label="Mengunduh video…" />
      )}
      <div className="mt-1 flex items-center justify-between gap-3">
        {caption && <p className="text-[13.5px] leading-snug">{caption}</p>}
        {seconds ? <span className="text-[10px] text-[var(--wa-text-soft)]">{formatDuration(seconds)}</span> : null}
      </div>
    </div>
  )
}

export function AudioBubble({
  jid,
  id,
  seconds,
  isPtt,
  fromMe,
}: {
  jid: string
  id: string
  seconds?: number
  isPtt?: boolean
  fromMe?: boolean
}) {
  const { url, status, retry } = useMediaBlob(jid, id)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(seconds || 0)
  const bars = useRef<number[]>(Array.from({ length: 28 }, (_, index) => 0.35 + ((index * 37) % 60) / 100))

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
  }, [url])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      void audio.play()
    }
  }

  if (status === 'loading') return <Skeleton label={isPtt ? 'Mengunduh pesan suara…' : 'Mengunduh audio…'} />
  if (status === 'error' || !url) return <Failed retry={retry} label="Audio tidak tersedia" />

  return (
    <div className="flex min-w-[220px] max-w-[320px] items-center gap-3 py-1">
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10 text-[var(--wa-text)]"
        aria-label={playing ? 'Jeda' : 'Putar'}
      >
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`flex h-6 items-end gap-[2px] ${fromMe ? 'text-black/40 dark:text-white/50' : 'text-[var(--wa-text-soft)]'}`}>
          {bars.current.map((height, index) => {
            const filled = index / bars.current.length <= progress
            return (
              <span
                key={index}
                className={`w-[3px] rounded-full ${filled ? 'bg-current opacity-100' : 'bg-current opacity-40'}`}
                style={{ height: `${Math.round(height * 22)}px` }}
              />
            )
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--wa-text-soft)]">
          <span>{isPtt ? 'Pesan suara' : 'Audio'}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
        }}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration
          if (Number.isFinite(value) && value > 0) setDuration(Math.round(value))
        }}
      />
    </div>
  )
}

export function DocumentBubble({
  jid,
  id,
  fileName,
  mimetype,
  size,
  caption,
}: {
  jid: string
  id: string
  fileName?: string
  mimetype?: string
  size?: number
  caption?: string
}) {
  const { url, status, retry } = useMediaBlob(jid, id)

  function download() {
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName || 'dokumen'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  return (
    <div>
      <div className="flex w-full max-w-[330px] items-center gap-3 rounded-md bg-black/5 p-2 dark:bg-white/5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-black/10 text-[var(--wa-text)] dark:bg-white/10">
          <FileIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium">{fileName || 'Dokumen'}</p>
          <p className="text-[10.5px] text-[var(--wa-text-soft)]">
            {mimetype?.split('/')[1]?.toUpperCase() || 'FILE'}
            {size ? ` · ${formatBytes(size)}` : ''}
          </p>
        </div>
        {status === 'ready' ? (
          <button
            type="button"
            onClick={download}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--wa-text-soft)] hover:bg-black/10"
            aria-label="Unduh"
          >
            <DownloadIcon size={16} />
          </button>
        ) : status === 'error' ? (
          <button
            type="button"
            onClick={retry}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--wa-text-soft)] hover:bg-black/10"
            aria-label="Coba lagi"
          >
            <RefreshIcon size={15} />
          </button>
        ) : (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--wa-text-soft)]" />
        )}
      </div>
      {caption && <p className="mt-1.5 text-[13.5px] leading-snug">{caption}</p>}
    </div>
  )
}

export function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
