import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import type { AnyBulkWriteOperation, Db } from 'mongodb'
import { COL } from './db'

export interface MongoAuthState {
  state: AuthenticationState
  /** Simpan creds (di-debounce supaya tidak membanjiri MongoDB). */
  saveCreds: () => Promise<void>
  /** Tunggu semua tulisan (keys + creds) benar-benar selesai. */
  flush: (timeoutMs?: number) => Promise<boolean>
  /** Jumlah tulisan yang masih berjalan (untuk log/diagnosa). */
  pending: () => number
  clear: () => Promise<void>
}

type AuthDoc = { _id: string; data: string; updatedAt?: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface MongoAuthOptions {
  /** Jeda penggabungan penulisan creds (ms). 0 = langsung tulis. */
  saveDebounceMs?: number
  /** Dipanggil saat penulisan gagal setelah retry — jangan sampai senyap. */
  onError?: (err: unknown, context: string) => void
}

/**
 * Menyimpan auth state Baileys (creds + Signal keys) di MongoDB sehingga sesi
 * WhatsApp tahan restart/redeploy.
 *
 * Poin penting untuk keamanan sesi:
 * - setiap penulisan dicatat (`track`) agar shutdown bisa menunggu (`flush`);
 * - `keys.set` memakai satu `bulkWrite` per batch (atomik per batch, hemat round-trip);
 * - penulisan yang gagal dicoba sekali lagi sebelum dilaporkan;
 * - `saveCreds` di-debounce agar `creds.update` yang beruntun tidak menulis berulang.
 */
export async function useMongoAuthState(
  database: Db,
  sessionId = 'default',
  options: MongoAuthOptions = {},
): Promise<MongoAuthState> {
  const col = database.collection<AuthDoc>(COL.auth)
  const prefix = `${sessionId}:`
  const memory = new Map<string, unknown>()
  const debounceMs = Math.max(0, options.saveDebounceMs ?? 400)
  const onError = options.onError || (() => null)

  /** Tulisan yang masih berjalan. */
  const pending = new Set<Promise<unknown>>()

  function track<T>(promise: Promise<T>): Promise<T> {
    pending.add(promise)
    promise.catch(() => null).finally(() => pending.delete(promise))
    return promise
  }

  async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    try {
      return await fn()
    } catch (first) {
      await sleep(120)
      try {
        return await fn()
      } catch (second) {
        onError(second ?? first, context)
        throw second
      }
    }
  }

  const writeData = (data: unknown, id: string) =>
    withRetry(
      () =>
        col.updateOne(
          { _id: `${prefix}${id}` },
          { $set: { data: JSON.stringify(data, BufferJSON.replacer), updatedAt: Date.now() } },
          { upsert: true },
        ),
      `write ${id}`,
    )

  const removeData = (id: string) =>
    withRetry(() => col.deleteOne({ _id: `${prefix}${id}` }), `delete ${id}`)

  const readData = async (id: string) => {
    const doc = await col.findOne({ _id: `${prefix}${id}` })
    if (!doc?.data) return null
    try {
      return JSON.parse(doc.data, BufferJSON.reviver)
    } catch {
      // Dokumen rusak (mis. proses mati saat menulis) → anggap tidak ada,
      // lebih baik minta tautkan ulang daripada memakai state setengah jadi.
      onError(new Error(`dokumen auth rusak: ${id}`), 'read')
      return null
    }
  }

  const creds = ((await readData('creds')) || initAuthCreds()) as AuthenticationState['creds']

  const keys: AuthenticationState['keys'] = {
    get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
      const data: { [id: string]: SignalDataTypeMap[T] } = {}
      await Promise.all(
        ids.map(async (id) => {
          const cacheKey = `${type}-${id}`
          let value = memory.get(cacheKey) as SignalDataTypeMap[T] | undefined
          if (value === undefined) {
            const stored = await readData(`key-${cacheKey}`)
            if (stored) {
              value = stored as SignalDataTypeMap[T]
              memory.set(cacheKey, value)
            }
          }
          if (value) {
            if (type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as object,
              ) as unknown as SignalDataTypeMap[T]
            }
            data[id] = value
          }
        }),
      )
      return data
    },

    set: async (data) => {
      // Satu bulkWrite per batch: jauh lebih cepat dan tidak setengah jalan
      // seperti saat memakai banyak updateOne terpisah.
      const operations: AnyBulkWriteOperation<AuthDoc>[] = []
      for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        const bucket = data[category]
        if (!bucket) continue
        for (const id of Object.keys(bucket)) {
          const value = bucket[id]
          const cacheKey = `${category}-${id}`
          if (value) {
            memory.set(cacheKey, value)
            operations.push({
              updateOne: {
                filter: { _id: `${prefix}key-${cacheKey}` },
                update: {
                  $set: { data: JSON.stringify(value, BufferJSON.replacer), updatedAt: Date.now() },
                },
                upsert: true,
              },
            })
          } else {
            memory.delete(cacheKey)
            operations.push({ deleteOne: { filter: { _id: `${prefix}key-${cacheKey}` } } })
          }
        }
      }
      if (!operations.length) return
      await track(withRetry(() => col.bulkWrite(operations, { ordered: true }), 'keys.set'))
    },
  }

  /* ------------------------------------------------------------------ */
  /* creds: debounce + flush                                            */
  /* ------------------------------------------------------------------ */

  let saveTimer: NodeJS.Timeout | null = null
  let savePromise: Promise<void> | null = null
  let dirty = false

  function cancelDebounce() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  async function writeCredsNow() {
    dirty = false
    await track(writeData(creds, 'creds').catch((err) => onError(err, 'saveCreds')))
  }

  function saveCreds(): Promise<void> {
    dirty = true
    if (savePromise) return savePromise

    if (debounceMs === 0) {
      savePromise = writeCredsNow().finally(() => {
        savePromise = null
      })
      return savePromise
    }

    savePromise = new Promise<void>((resolve) => {
      saveTimer = setTimeout(() => {
        saveTimer = null
        void writeCredsNow().finally(() => {
          savePromise = null
          resolve()
        })
      }, debounceMs)
    })
    return savePromise
  }

  async function flush(timeoutMs = 3000): Promise<boolean> {
    // Tulis dulu creds yang masih tertahan debounce.
    cancelDebounce()
    if (dirty) await writeCredsNow()

    if (!pending.size) return true

    const drained = Promise.allSettled([...pending]).then(() => true)
    const timeout = sleep(timeoutMs).then(() => false)
    const ok = await Promise.race([drained, timeout])
    if (!ok) onError(new Error(`${pending.size} tulisan auth belum selesai`), 'flush timeout')
    return ok
  }

  return {
    state: {
      creds,
      keys: {
        get: keys.get as AuthenticationState['keys']['get'],
        set: keys.set,
      },
    },
    saveCreds,
    flush,
    pending: () => pending.size,
    clear: async () => {
      cancelDebounce()
      savePromise = null
      dirty = false
      await track(withRetry(() => col.deleteMany({ _id: { $regex: `^${escapeRegExp(prefix)}` } }), 'clear'))
      memory.clear()
    },
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
