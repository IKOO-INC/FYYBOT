'use client'

import { useState } from 'react'
import { CheckDouble, CheckIcon, ClockIcon, FileIcon } from '@/components/icons'
import { avatarColor, formatClock } from '@/lib/format'
import type { MessageDoc } from '@/lib/types'
import { AudioBubble, DocumentBubble, ImageBubble, StickerBubble, VideoBubble } from './MessageMedia'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[#027eb5] underline visited:text-[#7f66ff] dark:text-[#53bdeb]"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function Ticks({ status }: { status?: MessageDoc['status'] }) {
  if (!status || status === 'pending') return <ClockIcon size={13} className="text-[var(--wa-text-soft)]" />
  if (status === 'error') return <span className="text-[10px] text-red-500">gagal</span>
  if (status === 'sent') return <CheckIcon size={13} className="text-[var(--wa-text-soft)]" />
  return (
    <CheckDouble
      size={14}
      className={status === 'read' ? 'wa-tick-read' : 'text-[var(--wa-text-soft)]'}
    />
  )
}

export default function MessageBubble({
  message,
  isGroup,
  showTail,
  onReact,
}: {
  message: MessageDoc
  isGroup: boolean
  showTail: boolean
  onReact?: (message: MessageDoc, emoji: string) => void
}) {
  const [showReactions, setShowReactions] = useState(false)
  const fromMe = Boolean(message.fromMe)
  const media = message.media
  const author = !fromMe && isGroup ? message.senderName || message.participant?.split('@')[0] : null

  const bubbleClass = fromMe ? 'wa-bubble-out' : 'wa-bubble-in'
  const tailClass = showTail ? (fromMe ? 'wa-bubble-tail-out' : 'wa-bubble-tail-in') : ''

  return (
    <div
      className={`wa-message-row group flex w-full items-end gap-1 px-1 ${fromMe ? 'justify-end' : 'justify-start'}`}
      onMouseLeave={() => setShowReactions(false)}
    >
      {fromMe && onReact && (
        <div className="wa-msg-actions relative self-center">
          <ReactionButton onOpen={() => setShowReactions((value) => !value)} />
          {showReactions && (
            <ReactionPicker
              align="right"
              onPick={(emoji) => {
                setShowReactions(false)
                onReact(message, emoji)
              }}
            />
          )}
        </div>
      )}

      <div
        className={`wa-bubble ${bubbleClass} ${tailClass} px-2 py-1.5 ${message.revoke ? 'italic' : ''}`}
        style={media?.kind === 'sticker' ? { background: 'transparent', boxShadow: 'none' } : undefined}
      >
        {message.quoted && (
          <div className="mb-1 rounded-md border-l-[3px] border-[#00a884] bg-black/5 px-2 py-1 dark:bg-white/5">
            <p className="text-[11px] font-semibold text-[#00a884]">
              {message.quoted.participant?.split('@')[0] || 'Pesan'}
            </p>
            <p className="line-clamp-2 text-[11.5px] text-[var(--wa-text-soft)]">{message.quoted.text || 'Pesan'}</p>
          </div>
        )}

        {author && (
          <p className="mb-0.5 text-[12px] font-semibold leading-none" style={{ color: avatarColor(author) }}>
            {author}
          </p>
        )}

        {renderContent(message, media)}

        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] leading-none text-[var(--wa-text-soft)]">
          <span>{formatClock(message.ts)}</span>
          {fromMe && <Ticks status={message.status} />}
        </div>
      </div>

      {!fromMe && onReact && (
        <div className="wa-msg-actions relative self-center">
          <ReactionButton onOpen={() => setShowReactions((value) => !value)} />
          {showReactions && (
            <ReactionPicker
              align="left"
              onPick={(emoji) => {
                setShowReactions(false)
                onReact(message, emoji)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function renderContent(message: MessageDoc, media: MessageDoc['media']) {
  if (message.revoke || message.type === 'revoked') {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-[var(--wa-text-soft)]">
        <FileIcon size={13} /> Pesan ini telah dihapus
      </p>
    )
  }

  if (!media) {
    if (message.type === 'location') {
      return (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5 dark:bg-white/5">
          <span className="text-lg">📍</span>
          <p className="text-[12.5px]">{message.text || 'Lokasi'}</p>
        </div>
      )
    }
    if (message.type === 'contact') {
      return (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5 dark:bg-white/5">
          <span className="text-lg">👤</span>
          <p className="text-[12.5px]">{message.text || 'Kontak'}</p>
        </div>
      )
    }
    if (message.type === 'poll') {
      return (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5 dark:bg-white/5">
          <span className="text-lg">📊</span>
          <p className="text-[12.5px]">{message.text || 'Polling'}</p>
        </div>
      )
    }
    return message.text ? (
      <p className="whitespace-pre-wrap break-words text-[13.8px] leading-[1.4]">{linkify(message.text)}</p>
    ) : null
  }

  switch (media.kind) {
    case 'image':
      return (
        <ImageBubble
          jid={message.jid}
          id={message.id}
          caption={message.text}
          width={media.width}
          height={media.height}
          size={media.size}
        />
      )
    case 'sticker':
      return <StickerBubble jid={message.jid} id={message.id} size={media.size} />
    case 'video':
      return (
        <VideoBubble
          jid={message.jid}
          id={message.id}
          caption={message.text}
          seconds={media.seconds}
          size={media.size}
        />
      )
    case 'audio':
      return (
        <AudioBubble
          jid={message.jid}
          id={message.id}
          seconds={media.seconds}
          isPtt={media.isPtt}
          fromMe={message.fromMe}
          size={media.size}
        />
      )
    case 'document':
      return (
        <DocumentBubble
          jid={message.jid}
          id={message.id}
          fileName={media.fileName}
          mimetype={media.mimetype}
          size={media.size}
          caption={message.text}
        />
      )
    default:
      return <p className="text-[13px]">{message.text || 'Media'}</p>
  }
}

function ReactionButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Beri reaksi"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--wa-pane)] text-[var(--wa-text-soft)] shadow ring-1 ring-black/5 hover:text-[var(--wa-text)]"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
        <circle cx="9" cy="9.8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </button>
  )
}

function ReactionPicker({
  onPick,
  align,
}: {
  onPick: (emoji: string) => void
  align: 'left' | 'right'
}) {
  return (
    <div
      className={`absolute bottom-9 z-30 flex items-center gap-0.5 rounded-full bg-[var(--wa-pane)] px-1.5 py-1 shadow-lg ring-1 ring-black/10 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-base transition hover:scale-125 hover:bg-black/5"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
