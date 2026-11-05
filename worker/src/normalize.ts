import { getContentType, proto, type WAMessage } from '@whiskeysockets/baileys'

export interface MediaInfo {
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other'
  mimetype?: string
  fileName?: string
  seconds?: number
  width?: number
  height?: number
  hasMedia: boolean
  downloaded?: boolean
  size?: number
  isPtt?: boolean
}

export interface QuotedInfo {
  id?: string | null
  text?: string | null
  fromMe?: boolean
  participant?: string | null
}

export interface NormalizedMessage {
  type: string
  text: string
  media: MediaInfo | null
  quoted: QuotedInfo | null
  revokeTargetId?: string
  ignored?: boolean
}

const WRAPPER_TYPES = new Set([
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
])

export function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | null {
  let current = message || null
  let guard = 0
  while (current && guard < 6) {
    const type = getContentType(current)
    if (!type || !WRAPPER_TYPES.has(type)) break
    const inner = (current as Record<string, { message?: proto.IMessage } | undefined>)[type]
    if (!inner?.message) break
    current = inner.message
    guard += 1
  }
  return current
}

function contextOf(content: proto.IMessage, type: string) {
  const node = (content as Record<string, { contextInfo?: proto.IContextInfo } | undefined>)[type]
  return node?.contextInfo || null
}

function quotedFrom(ctx: proto.IContextInfo | null): QuotedInfo | null {
  if (!ctx?.quotedMessage) return null
  const inner = unwrapMessage(ctx.quotedMessage)
  const info = inner ? normalizeMessage(inner) : null
  return {
    id: ctx.stanzaId || null,
    participant: ctx.participant || null,
    fromMe: false,
    text: info?.text || (info?.media ? `[${info.media.kind}]` : 'Pesan'),
  }
}

export function normalizeMessage(message: proto.IMessage | null | undefined): NormalizedMessage {
  const content = unwrapMessage(message)
  if (!content) return { type: 'unknown', text: '', media: null, quoted: null }
  const type = getContentType(content) || 'unknown'
  const quoted = quotedFrom(contextOf(content, type))
  const base = { quoted }

  switch (type) {
    case 'conversation':
      return { ...base, type: 'chat', text: content.conversation || '', media: null }

    case 'extendedTextMessage': {
      const node = content.extendedTextMessage
      return { ...base, type: 'chat', text: node?.text || '', media: null }
    }

    case 'imageMessage':
      return {
        ...base,
        type: 'image',
        text: content.imageMessage?.caption || '',
        media: {
          kind: 'image',
          hasMedia: true,
          mimetype: content.imageMessage?.mimetype || 'image/jpeg',
          width: content.imageMessage?.width || undefined,
          height: content.imageMessage?.height || undefined,
        },
      }

    case 'videoMessage':
      return {
        ...base,
        type: 'video',
        text: content.videoMessage?.caption || '',
        media: {
          kind: 'video',
          hasMedia: true,
          mimetype: content.videoMessage?.mimetype || 'video/mp4',
          seconds: content.videoMessage?.seconds || undefined,
          width: content.videoMessage?.width || undefined,
          height: content.videoMessage?.height || undefined,
          isPtt: false,
        },
      }

    case 'ptvMessage':
      return {
        ...base,
        type: 'video',
        text: '',
        media: {
          kind: 'video',
          hasMedia: true,
          mimetype: (content.ptvMessage as { mimetype?: string } | undefined)?.mimetype || 'video/mp4',
          isPtt: false,
        },
      }

    case 'audioMessage':
      return {
        ...base,
        type: 'audio',
        text: '',
        media: {
          kind: 'audio',
          hasMedia: true,
          mimetype: content.audioMessage?.mimetype || 'audio/ogg',
          seconds: content.audioMessage?.seconds || undefined,
          isPtt: Boolean(content.audioMessage?.ptt),
        },
      }

    case 'documentMessage':
      return {
        ...base,
        type: 'document',
        text: content.documentMessage?.caption || '',
        media: {
          kind: 'document',
          hasMedia: true,
          mimetype: content.documentMessage?.mimetype || 'application/octet-stream',
          fileName: content.documentMessage?.fileName || 'dokumen',
          size: content.documentMessage?.fileLength ? Number(content.documentMessage.fileLength) : undefined,
        },
      }

    case 'stickerMessage':
      return {
        ...base,
        type: 'sticker',
        text: '',
        media: { kind: 'sticker', hasMedia: true, mimetype: content.stickerMessage?.mimetype || 'image/webp' },
      }

    case 'locationMessage': {
      const loc = content.locationMessage
      const label = [loc?.name, loc?.address].filter(Boolean).join(', ') || 'Lokasi dibagikan'
      return { ...base, type: 'location', text: label, media: null }
    }

    case 'liveLocationMessage':
      return { ...base, type: 'location', text: 'Lokasi langsung dibagikan', media: null }

    case 'contactMessage':
      return { ...base, type: 'contact', text: content.contactMessage?.displayName || 'Kontak dibagikan', media: null }

    case 'contactsArrayMessage':
      return {
        ...base,
        type: 'contact',
        text: `${content.contactsArrayMessage?.contacts?.length || 0} kontak dibagikan`,
        media: null,
      }

    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3': {
      const poll = content[type] as proto.IMessage['pollCreationMessage']
      return { ...base, type: 'poll', text: poll?.name || 'Polling', media: null }
    }

    case 'reactionMessage':
      return { ...base, type: 'reaction', text: content.reactionMessage?.text || '', media: null, ignored: true }

    case 'pollUpdateMessage':
    case 'protocolMessage':
    case 'senderKeyDistributionMessage':
    case 'messageContextInfo':
      if (type === 'protocolMessage') {
        const protocol = content.protocolMessage
        if (protocol?.type === proto.Message.ProtocolMessage.Type.REVOKE) {
          return {
            ...base,
            type: 'revoked',
            text: 'Pesan ini telah dihapus',
            media: null,
            revokeTargetId: protocol.key?.id || undefined,
          }
        }
      }
      return { ...base, type, text: '', media: null, ignored: true }

    case 'buttonsMessage':
      return { ...base, type: 'chat', text: content.buttonsMessage?.contentText || 'Pesan tombol', media: null }

    case 'templateMessage':
      return { ...base, type: 'chat', text: content.templateMessage?.hydratedTemplate?.hydratedContentText || 'Template', media: null }

    case 'listMessage':
      return { ...base, type: 'chat', text: content.listMessage?.description || content.listMessage?.title || 'Daftar', media: null }

    default:
      return { ...base, type, text: '', media: null }
  }
}

export function messagePreview(info: NormalizedMessage) {
  const media = info.media
  if (media) {
    const label =
      media.kind === 'audio'
        ? media.isPtt
          ? 'Pesan suara'
          : 'Audio'
        : media.kind === 'sticker'
          ? 'Sticker'
          : media.kind === 'image'
            ? 'Foto'
            : media.kind === 'video'
              ? 'Video'
              : 'Dokumen'
    return info.text ? `${label}: ${info.text}` : label
  }
  if (info.type === 'revoked') return 'Pesan ini telah dihapus'
  return info.text || ''
}

/** Recursively turn any BSON Binary / Uint8Array into Node Buffers. */
export function binaryToBuffer<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value) as unknown as T
  const asAny = value as unknown as { buffer?: unknown; _bsontype?: string; value?: unknown }
  if (asAny._bsontype === 'Binary' || asAny._bsontype === 'BinaryOld') {
    const raw = asAny.buffer
    if (Buffer.isBuffer(raw)) return raw as unknown as T
    if (raw instanceof Uint8Array) return Buffer.from(raw) as unknown as T
    return value
  }
  if (Array.isArray(value)) return value.map((item) => binaryToBuffer(item)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = binaryToBuffer(item)
  }
  return out as T
}

export function messageId(message: WAMessage) {
  return message.key?.id || ''
}

export function messageTimestamp(message: WAMessage) {
  const raw = message.messageTimestamp
  const value = typeof raw === 'number' ? raw : typeof raw === 'bigint' ? Number(raw) : Number(raw || 0)
  if (!value) return Date.now()
  // Baileys returns seconds; some payloads already carry milliseconds.
  return value > 1_000_000_000_000 ? value : value * 1000
}
