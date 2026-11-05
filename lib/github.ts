// Memicu workflow GitHub Actions dari panel (Vercel) supaya worker Baileys
// bisa dinyalakan tanpa console. Butuh PAT dengan izin "Actions: read and write".

const REPO = process.env.GITHUB_REPO || 'IKOO-INC/FYYBOT'
const WORKFLOW = process.env.GITHUB_WORKFLOW || 'worker.yml'
const REF = process.env.GITHUB_REF_NAME || 'main'
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_DISPATCH_TOKEN || ''
const ACTIONS_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`

export const githubConfig = {
  repo: REPO,
  workflow: WORKFLOW,
  ref: REF,
  enabled: Boolean(TOKEN),
  actionsUrl: ACTIONS_URL,
}

export type DispatchResult = {
  ok: boolean
  status?: number
  error?: string
  hint?: string
}

function describe(status: number, body: string): DispatchResult {
  const snippet = body.replace(/\s+/g, ' ').slice(0, 180)
  if (status === 401) {
    return {
      ok: false,
      status,
      error: 'GITHUB_TOKEN ditolak GitHub (401). Token kedaluwarsa atau salah.',
      hint: 'Buat token baru: GitHub → Settings → Developer settings → Fine-grained token → akses repo FYYBOT, izin Actions: Read and write.',
    }
  }
  if (status === 403) {
    return {
      ok: false,
      status,
      error: 'GitHub menolak (403): token tidak punya izin Actions write.',
      hint: 'Buka token di GitHub → izin Actions harus "Read and write", dan repo FYYBOT harus dipilih.',
    }
  }
  if (status === 404) {
    return {
      ok: false,
      status,
      error: `Workflow "${WORKFLOW}" tidak ditemukan di ${REPO} (404).`,
      hint: 'Pastikan GITHUB_REPO/GITHUB_WORKFLOW benar dan workflow ada di branch main.',
    }
  }
  if (status === 422) {
    return {
      ok: false,
      status,
      error: 'GitHub menolak dispatch (422): branch atau workflow salah.',
      hint: `Cek GITHUB_REF_NAME (sekarang "${REF}") dan pastikan workflow punya trigger workflow_dispatch.`,
    }
  }
  return { ok: false, status, error: `GitHub membalas ${status}. ${snippet}` }
}

export async function dispatchWorker(runtimeMinutes = 55): Promise<DispatchResult> {
  if (!TOKEN) {
    return {
      ok: false,
      error: 'Auto-start belum aktif: GITHUB_TOKEN belum diisi di Vercel.',
      hint: 'Tambahkan Environment Variable GITHUB_TOKEN (PAT dengan izin Actions: Read and write) lalu redeploy.',
    }
  }

  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(WORKFLOW)}/dispatches`

  try {
    const res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'fyywhatsappadmin',
      },
      body: JSON.stringify({
        ref: REF,
        inputs: { runtime_minutes: String(runtimeMinutes) },
      }),
    })

    if (res.status === 204) return { ok: true, status: res.status }

    const body = await res.text().catch(() => '')
    return describe(res.status, body)
  } catch (err) {
    return {
      ok: false,
      error: `Gagal menghubungi GitHub: ${err instanceof Error ? err.message : 'unknown error'}`,
    }
  }
}
