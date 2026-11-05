/**
 * Backoff eksponensial dengan jitter.
 *
 * Dipakai worker Baileys supaya koneksi yang gagal tidak di-retry serapat
 * mungkin (yang bisa terlihat seperti bot dan memperbesar risiko pembatasan).
 * Contoh tanpa jitter (base 2s, max 60s):
 *   1→2s  2→4s  3→8s  4→16s  5→32s  6→60s  7→60s …
 */
export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  /** 0..1 — variasi acak supaya banyak worker tidak retry serempak. */
  jitter?: number
  random?: () => number
}

export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 2000
  const maxMs = options.maxMs ?? 60_000
  const jitter = Math.min(1, Math.max(0, options.jitter ?? 0.2))
  const random = options.random ?? Math.random

  const safeAttempt = Math.max(1, Math.floor(attempt))
  const raw = Math.min(maxMs, baseMs * 2 ** (safeAttempt - 1))
  const spread = raw * jitter
  const value = raw - spread + random() * spread * 2

  return Math.max(500, Math.round(Math.min(maxMs, value)))
}
