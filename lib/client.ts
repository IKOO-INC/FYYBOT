'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login'
    throw new Error('Sesi habis, silakan login ulang')
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json?.error || `Permintaan gagal (${res.status})`)
  return json
}

export function usePoll<T>(url: string | null, intervalMs = 4000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  const urlRef = useRef(url)
  urlRef.current = url

  const load = useCallback(async () => {
    const target = urlRef.current
    if (!target) return
    try {
      const res = await fetch(target, { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      const json = (await res.json()) as T & { error?: string }
      if (!res.ok) throw new Error(json?.error || 'Gagal memuat data')
      if (!alive.current) return
      setData(json)
      setError(null)
    } catch (err) {
      if (!alive.current) return
      setError(err instanceof Error ? err.message : 'Gagal memuat data')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url, intervalMs, load])

  return { data, error, loading, refresh: load, setData }
}
