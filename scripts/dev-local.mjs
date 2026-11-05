#!/usr/bin/env node
/**
 * Jalankan panel (Next.js) + worker (Baileys) sekaligus di satu terminal.
 *
 *   npm run local
 *
 * Tanpa dependency tambahan: hanya child_process. Output diberi prefiks
 * [panel] / [worker] supaya mudah dibedakan, dan Ctrl+C mematikan keduanya.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const isWin = process.platform === 'win32'
const color = !process.env.NO_COLOR
const c = {
  dim: (s) => (color ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (color ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (color ? `\x1b[32m${s}\x1b[0m` : s),
  cyan: (s) => (color ? `\x1b[36m${s}\x1b[0m` : s),
  yellow: (s) => (color ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (color ? `\x1b[31m${s}\x1b[0m` : s),
}

/* ------------------------------------------------------------------ */
/* Preflight                                                          */
/* ------------------------------------------------------------------ */

const major = Number(process.versions.node.split('.')[0])
if (Number.isFinite(major) && major < 20) {
  console.error(c.red(`Node.js ${process.versions.node} terlalu lama. Butuh Node 20+ (disarankan 22).`))
  process.exit(1)
}

function readEnvFile(file) {
  const values = {}
  if (!existsSync(file)) return values
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

// .env.local menang atas .env (sama seperti Next.js)
const envFiles = [path.join(root, '.env.local'), path.join(root, '.env'), path.join(root, 'worker', '.env')]
const fileEnv = Object.assign({}, ...envFiles.map(readEnvFile).reverse(), {})
const env = (key) => process.env[key] || fileEnv[key] || ''

function mongoHost(uri) {
  if (!uri) return null
  const match = uri.match(/@([^/?]+)/)
  return match ? match[1] : uri.replace(/^mongodb(\+srv)?:\/\//, '').split('/')[0] || null
}

const uri = env('MONGODB_URI')
const dbName = env('MONGODB_DB_NAME') || 'fyywhatsapp'
const adminPassword = env('ADMIN_PASSWORD') || env('PANEL_PASSWORD')

if (!existsSync(path.join(root, 'package.json')) || !existsSync(path.join(root, 'worker', 'package.json'))) {
  console.error(c.red('Script ini harus dijalankan dari repo FYYBOT (folder berisi package.json + worker/).'))
  process.exit(1)
}

const problems = []
if (!uri) {
  problems.push(
    'MONGODB_URI kosong. Buat file .env.local di root project dan isi connection string Atlas,\n' +
      '   contoh:  MONGODB_URI=mongodb+srv://user:pass@cluster0.ab1cd.mongodb.net/?retryWrites=true&w=majority',
  )
} else if (/cluster0\.xxxxx\.mongodb\.net|user:pass|<password>/.test(uri)) {
  problems.push(
    'MONGODB_URI masih memakai contoh/placeholder (cluster0.xxxxx… atau user:pass).\n' +
      '   Ganti dengan connection string asli dari Atlas → Connect → Drivers.',
  )
}
if (!adminPassword) {
  problems.push('ADMIN_PASSWORD kosong. Panel tidak bisa dipakai login tanpa password ini.')
}
if (!existsSync(path.join(root, 'node_modules', 'next'))) {
  problems.push('Dependency panel belum ada. Jalankan dulu:  npm install')
}
if (!existsSync(path.join(root, 'worker', 'node_modules', 'tsx'))) {
  problems.push('Dependency worker belum ada. Jalankan dulu:  npm run setup')
}

if (problems.length) {
  console.error(c.red('\n✖ Tidak bisa dijalankan:\n'))
  for (const problem of problems) console.error(`  • ${problem}`)
  console.error(
    c.dim('\n  File env yang dibaca: .env.local, .env (root), worker/.env') +
      c.dim('\n  Contoh lengkap: lihat .env.example\n'),
  )
  process.exit(1)
}

const panelPort = process.env.PANEL_PORT || '3000'

console.log(c.bold('\nFYY WhatsApp Admin — mode lokal (panel + worker)\n'))
console.log(`  ${c.cyan('Panel')}   : http://localhost:${panelPort}   ${c.dim('(login: ADMIN_PASSWORD)')}`)
console.log(`  ${c.green('Worker')}  : Baileys — QR muncul di terminal ini & di /panel/connect`)
console.log(`  ${c.dim('MongoDB')} : ${dbName} @ ${c.dim(mongoHost(uri) || '?')}`)
console.log(c.dim('\n  Ctrl+C untuk menghentikan keduanya.\n'))

/* ------------------------------------------------------------------ */
/* Proses                                                             */
/* ------------------------------------------------------------------ */

const children = []
let shuttingDown = false

function start(name, args, tint) {
  const child = spawn(isWin ? 'npm.cmd' : 'npm', args, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: color ? '1' : '0' },
    shell: isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const prefix = tint(`[${name}] `)
  const write = (stream, chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim().length === 0) continue
      stream.write(`${prefix}${line}\n`)
    }
  }
  child.stdout.on('data', (chunk) => write(process.stdout, chunk))
  child.stderr.on('data', (chunk) => write(process.stderr, chunk))
  child.on('error', (err) => console.error(`${prefix}${c.red('gagal dijalankan:')} ${err.message}`))
  child.on('exit', (code, signal) => {
    const info = signal ? `signal ${signal}` : `kode ${code}`
    console.log(`${prefix}${c.yellow(`berhenti (${info})`)}`)
    if (shuttingDown) return
    const alive = children.filter((item) => item.child.exitCode === null && !item.child.killed)
    if (alive.length === 0) {
      process.exitCode = code ?? 0
      shutdown()
    } else {
      console.log(`${prefix}${c.dim(`${alive.map((item) => item.name).join(' & ')} masih jalan — Ctrl+C untuk berhenti.`)}`)
    }
  })

  children.push({ name, child })
  return child
}

function killChild(child) {
  if (!child || child.exitCode !== null) return
  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 4000).unref?.()
  }
}

let exitTimer = null
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const item of children) killChild(item.child)
  exitTimer = setTimeout(() => process.exit(process.exitCode ?? code), 800)
  exitTimer.unref?.()
}

process.on('SIGINT', () => {
  console.log(c.dim('\nMenghentikan panel & worker…'))
  shutdown(0)
  setTimeout(() => process.exit(0), 1200)
})
process.on('SIGTERM', () => shutdown(0))

// Worker dulu supaya QR cepat muncul, panel menyusul.
start('worker', ['run', 'worker:start'], c.green)
start('panel', ['run', 'dev'], c.cyan)
