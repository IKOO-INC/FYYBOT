import type { ObjectId } from 'mongodb'

export type SessionStatus = 'disconnected' | 'connecting' | 'open' | 'close'

export interface SessionDoc {
  _id?: string
  status: SessionStatus
  qr?: string | null
  qrUpdatedAt?: number | null
  pairingCode?: string | null
  pairingPhone?: string | null
  me?: {
    id?: string | null
    lid?: string | null
    name?: string | null
    number?: string | null
    platform?: string | null
  } | null
  lastError?: string | null
  workerId?: string | null
  workerAt?: number | null
  startedAt?: number | null
  connectedAt?: number | null
}

export interface ChatDoc {
  _id: string
  name?: string
  isGroup?: boolean
  unread?: number
  lastTs?: number
  lastText?: string
  lastFromMe?: boolean
  lastType?: string
  archived?: boolean
  pinned?: number
  muted?: boolean
  updatedAt?: number
}

export interface MediaInfo {
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other'
  mimetype?: string
  fileName?: string
  seconds?: number
  width?: number
  height?: number
  hasMedia?: boolean
  downloaded?: boolean
  size?: number
  isPtt?: boolean
}

export interface MessageDoc {
  _id: string
  jid: string
  id: string
  fromMe?: boolean
  participant?: string | null
  senderName?: string | null
  ts: number
  type: string
  text?: string
  media?: MediaInfo | null
  quoted?: {
    id?: string | null
    text?: string | null
    fromMe?: boolean
    participant?: string | null
  } | null
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'error'
  ack?: number
  revoke?: boolean
  createdAt?: number
}

export type CommandType =
  | 'send-text'
  | 'send-media'
  | 'read'
  | 'typing'
  | 'react'
  | 'download-media'
  | 'pair'
  | 'logout'
  | 'restart'

export interface CommandDoc {
  _id?: ObjectId
  type: CommandType
  payload?: Record<string, unknown>
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: unknown
  error?: string | null
  createdAt: number
  updatedAt?: number
  token?: string
}

export interface ChatSummary {
  jid: string
  name: string
  isGroup: boolean
  unread: number
  lastTs: number
  lastText: string
  lastFromMe: boolean
  lastType: string
  pinned: number
  archived: boolean
}

export interface MeInfo {
  name: string | null
  number: string | null
  id: string | null
  platform: string | null
}
