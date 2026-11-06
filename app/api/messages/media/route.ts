import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { badRequest, mongoError, requireAuth } from '@/lib/api'
import { COLLECTIONS } from '@/lib/mongo'
import { getDb } from '@/lib/mongo'
import { aliasJids, enqueueCommand, getMediaDoc, listMessages } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD = 4 * 1024 * 1024

function kindFromMime(mime: string) {
  if (mime.startsWith('image/')) return mime.includes('webp') ? 'sticker' : 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export async function POST(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const form = await request.formData()
    const jid = String(form.get('jid') || '')
    const caption = String(form.get('caption') || '')
    const file = form.get('file')
    if (!jid) return badRequest('jid wajib diisi')
    if (!(file instanceof File)) return badRequest('File tidak ditemukan')
    if (file.size > MAX_UPLOAD) return badRequest('Ukuran file maksimal 4 MB (batas body Vercel). Untuk file besar, kirim lewat WhatsApp di HP.')

    const buffer = Buffer.from(await file.arrayBuffer())
    const db = await getDb()
    const now = Date.now()
    const upload = await db.collection(COLLECTIONS.uploads).insertOne({
      name: file.name,
      mimetype: file.type || 'application/octet-stream',
      data: buffer.toString('base64'),
      size: file.size,
      createdAt: now,
    })

    const commandId = await enqueueCommand('send-media', {
      jid,
      uploadId: String(upload.insertedId),
      mimetype: file.type || 'application/octet-stream',
      fileName: file.name,
      caption,
      kind: kindFromMime(file.type || ''),
    })

    return NextResponse.json({ ok: true, commandId })
  } catch (err) {
    return mongoError(err)
  }
}

export async function GET(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny

  try {
    const url = new URL(request.url)
    const jid = url.searchParams.get('jid') || ''
    const id = url.searchParams.get('id') || ''
    if (!jid || !id) return badRequest('jid dan id wajib diisi')

    // Media bisa di-cache di bawah JID nomor maupun LID — cek semua alias.
    const jids = await aliasJids(jid)
    for (const candidate of jids) {
      const media = await getMediaDoc(`${candidate}:${id}`)
      if (!media?.data) continue
      const buffer = Buffer.from(String(media.data), 'base64')
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'content-type': String(media.mimetype || 'application/octet-stream'),
          'content-length': String(buffer.length),
          'cache-control': 'private, max-age=604800',
        },
      })
    }

    // Not cached yet → ask the worker to download it, client will retry.
    const messages = await listMessages(jid, { limit: 100 })
    const msg = messages.messages.find((m) => m.id === id)
    await enqueueCommand('download-media', {
      jid: msg?.jid || jid,
      messageId: id,
      fromMe: Boolean(msg?.fromMe),
      mediaKind: msg?.media?.kind || 'document',
    })
    return NextResponse.json({ ok: false, pending: true, error: 'Media sedang diunduh' }, { status: 202 })
  } catch (err) {
    return mongoError(err)
  }
}

export async function DELETE(request: Request) {
  const deny = await requireAuth()
  if (deny) return deny
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id') || ''
    if (!ObjectId.isValid(id)) return badRequest('id tidak valid')
    const db = await getDb()
    await db.collection(COLLECTIONS.media).deleteOne({ _id: id as unknown as never })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return mongoError(err)
  }
}
