import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import type { Db } from 'mongodb'
import { COL } from './db'

export interface MongoAuthState {
  state: AuthenticationState
  saveCreds: () => Promise<void>
  clear: () => Promise<void>
}

/**
 * Persists the Baileys auth state (creds + Signal keys) in MongoDB so the
 * WhatsApp Web session survives restarts, redeploys and cold starts.
 */
export async function useMongoAuthState(database: Db, sessionId = 'default'): Promise<MongoAuthState> {
  const col = database.collection<{ _id: string; data: string; updatedAt?: number }>(COL.auth)
  const prefix = `${sessionId}:`
  const memory = new Map<string, unknown>()

  const writeData = async (data: unknown, id: string) => {
    await col.updateOne(
      { _id: `${prefix}${id}` },
      { $set: { data: JSON.stringify(data, BufferJSON.replacer), updatedAt: Date.now() } },
      { upsert: true },
    )
  }

  const readData = async (id: string) => {
    const doc = await col.findOne({ _id: `${prefix}${id}` })
    if (!doc?.data) return null
    return JSON.parse(doc.data, BufferJSON.reviver)
  }

  const removeData = async (id: string) => {
    await col.deleteOne({ _id: `${prefix}${id}` })
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
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object) as unknown as SignalDataTypeMap[T]
            }
            data[id] = value
          }
        }),
      )
      return data
    },
    set: async (data) => {
      const tasks: Promise<unknown>[] = []
      for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        const bucket = data[category]
        if (!bucket) continue
        for (const id of Object.keys(bucket)) {
          const value = bucket[id]
          const cacheKey = `${category}-${id}`
          if (value) {
            memory.set(cacheKey, value)
            tasks.push(writeData(value, `key-${cacheKey}`))
          } else {
            memory.delete(cacheKey)
            tasks.push(removeData(`key-${cacheKey}`))
          }
        }
      }
      await Promise.all(tasks)
    },
  }

  return {
    state: {
      creds,
      keys: {
        get: keys.get as AuthenticationState['keys']['get'],
        set: keys.set,
      },
    },
    saveCreds: () => writeData(creds, 'creds'),
    clear: async () => {
      await col.deleteMany({ _id: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } })
      memory.clear()
    },
  }
}
