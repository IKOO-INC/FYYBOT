import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'fyy_session'
const TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || process.env.PANEL_PASSWORD || ''
}

function secret() {
  return process.env.ADMIN_SECRET || process.env.AUTH_SECRET || `fyy::${adminPassword() || 'setup-required'}`
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

export function createToken() {
  const payload = JSON.stringify({ iat: Date.now(), exp: Date.now() + TTL_SECONDS * 1000, n: randomBytes(6).toString('hex') })
  const body = Buffer.from(payload).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyToken(token?: string | null) {
  if (!token) return false
  const [body, mac] = token.split('.')
  if (!body || !mac) return false
  const expected = sign(body)
  try {
    if (mac.length !== expected.length) return false
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false
  } catch {
    return false
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

export async function isAuthenticated() {
  const store = await cookies()
  return verifyToken(store.get(COOKIE)?.value)
}

export async function setSessionCookie() {
  const store = await cookies()
  store.set(COOKIE, createToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

export function checkPassword(input: string) {
  const expected = adminPassword()
  if (!expected) return false
  const a = Buffer.from(input || '')
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const sessionCookieName = COOKIE
