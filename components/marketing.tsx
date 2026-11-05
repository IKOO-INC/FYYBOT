import {
  CheckDouble,
  EmojiIcon,
  MicIcon,
  PaperclipIcon,
  SearchIcon,
  MenuDots,
  QrIcon,
  DatabaseIcon,
} from './icons'

function Avatar({ text, color = '#00a884', size = 40 }: { text: string; color?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {text}
    </span>
  )
}

export function ChatWindowMock() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-white text-[#111b21] shadow-[0_30px_90px_-30px_rgba(0,0,0,0.8)] ring-1 ring-black/10">
      <div className="flex items-center justify-between border-b border-[#e9edef] bg-[#f0f2f5] px-3 py-2">
        <div className="flex items-center gap-2.5">
          <Avatar text="AR" color="#7f66ff" size={32} />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">Rani · Customer</p>
            <p className="text-[11px] text-[#667781]">online</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[#54656f]">
          <SearchIcon size={16} />
          <MenuDots size={16} />
        </div>
      </div>

      <div className="wa-wallpaper relative space-y-2 px-3 py-4">
        <div className="flex justify-center">
          <span className="rounded-md bg-white/85 px-2 py-1 text-[10px] font-medium text-[#54656f] shadow-sm">
            HARI INI
          </span>
        </div>

        <div className="flex">
          <div className="wa-bubble wa-bubble-in wa-bubble-tail-in max-w-[80%] px-2.5 py-1.5">
            <p className="text-[12.5px] leading-snug">
              Kak, pesanan saya sudah dikirim belum ya? 😊
            </p>
            <div className="mt-0.5 text-right text-[9.5px] text-[#667781]">09:12</div>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="wa-bubble wa-bubble-out wa-bubble-tail-out max-w-[80%] px-2.5 py-1.5">
            <p className="text-[12.5px] leading-snug">
              Sudah kak, resi <span className="font-semibold">JP1234567890</span>. Paket tiba besok ya 🚚
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] text-[#667781]">
              09:13 <CheckDouble size={13} className="text-[#53bdeb]" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="wa-bubble wa-bubble-out wa-bubble-tail-out max-w-[80%] px-2.5 py-1.5">
            <div className="mb-1 flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5">
              <div className="h-8 w-8 rounded bg-gradient-to-br from-[#00a884] to-[#008069]" />
              <div className="leading-tight">
                <p className="text-[10.5px] font-semibold">invoice-AR-0912.pdf</p>
                <p className="text-[9px] text-[#667781]">PDF · 128 KB</p>
              </div>
            </div>
            <p className="text-[11px] text-[#667781]">Ini invoice-nya kak 🙏</p>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] text-[#667781]">
              09:13 <CheckDouble size={13} className="text-[#53bdeb]" />
            </div>
          </div>
        </div>

        <div className="flex">
          <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00a884] typing-dot" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#00a884] typing-dot" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#00a884] typing-dot" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[#e9edef] bg-[#f0f2f5] px-3 py-2">
        <EmojiIcon size={18} className="text-[#54656f]" />
        <PaperclipIcon size={17} className="text-[#54656f]" />
        <div className="flex-1 rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] text-[#8696a0]">
          Ketik pesan
        </div>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00a884] text-white">
          <MicIcon size={14} />
        </span>
      </div>
    </div>
  )
}

export function InboxMock() {
  const chats = [
    { name: 'Rani · Customer', msg: 'Siap kak, makasih ya 🙏', time: '09:14', unread: 2, color: '#7f66ff', initials: 'RA' },
    { name: 'Grup Reseller FYY', msg: 'Admin: stok baru ready', time: '08:52', unread: 12, color: '#00a884', initials: 'GR' },
    { name: 'Budi Santoso', msg: 'Anda: invoice sudah dikirim', time: 'Kemarin', unread: 0, color: '#53bdeb', initials: 'BS' },
    { name: 'Siti Aminah', msg: 'Foto', time: 'Kemarin', unread: 0, color: '#f4b400', initials: 'SA' },
    { name: 'Supplier Jakarta', msg: 'Dokumen: PO-0912.pdf', time: 'Sen', unread: 0, color: '#e542a3', initials: 'SJ' },
  ]

  return (
    <div className="overflow-hidden rounded-2xl bg-white text-[#111b21] shadow-[0_30px_90px_-30px_rgba(0,0,0,0.8)] ring-1 ring-black/10">
      <div className="flex items-center justify-between bg-[#f0f2f5] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00a884]/15 text-[#008069]">
            <ChatGlyph />
          </span>
          <p className="text-[13px] font-semibold">Chat</p>
        </div>
        <div className="flex items-center gap-2 text-[#54656f]">
          <MenuDots size={16} />
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-2.5 py-1.5 text-[11.5px] text-[#8696a0]">
          <SearchIcon size={14} /> Cari atau mulai chat baru
        </div>
      </div>
      <div className="divide-y divide-[#f0f2f5]">
        {chats.map((chat) => (
          <div key={chat.name} className="flex items-center gap-2.5 px-3 py-2.5">
            <Avatar text={chat.initials} color={chat.color} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12.5px] font-medium">{chat.name}</p>
                <span className={`text-[10px] ${chat.unread ? 'font-semibold text-[#00a884]' : 'text-[#667781]'}`}>
                  {chat.time}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11.5px] text-[#667781]">{chat.msg}</p>
                {chat.unread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[9.5px] font-bold text-white">
                    {chat.unread}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3C6.9 3 2.8 6.4 2.8 10.6c0 2.4 1.3 4.5 3.3 5.9l-.9 3.2 3.5-1.7c1 .3 2.1.4 3.3.4 5.1 0 9.2-3.4 9.2-7.6S17.1 3 12 3Z" />
    </svg>
  )
}

export function QrMock() {
  const cells: Array<{ x: number; y: number }> = []
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const inFinder =
        (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
      if (inFinder) continue
      if ((x * 7 + y * 13 + x * y) % 5 < 2) cells.push({ x, y })
    }
  }
  const finder = (tx: number, ty: number) => (
    <g key={`${tx}-${ty}`}>
      <rect x={tx} y={ty} width="7" height="7" rx="1.6" fill="#111b21" />
      <rect x={tx + 1} y={ty + 1} width="5" height="5" rx="1" fill="#fff" />
      <rect x={tx + 2} y={ty + 2} width="3" height="3" rx="0.6" fill="#111b21" />
    </g>
  )

  return (
    <div className="rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#111b21]">
          <QrIcon size={17} />
          <span className="text-xs font-semibold">Tautkan perangkat</span>
        </div>
        <span className="rounded-full bg-[#e7fbf5] px-2 py-0.5 text-[10px] font-semibold text-[#008069]">
          menunggu scan
        </span>
      </div>
      <svg viewBox="0 0 21 21" className="h-44 w-44" shapeRendering="crispEdges">
        {finder(0, 0)}
        {finder(14, 0)}
        {finder(0, 14)}
        {cells.map((cell) => (
          <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" fill="#111b21" />
        ))}
      </svg>
      <p className="mt-3 max-w-[11rem] text-[11px] leading-relaxed text-[#667781]">
        WhatsApp → Perangkat tertaut → Tautkan perangkat
      </p>
      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#f0f2f5] px-2 py-1.5 text-[10px] text-[#54656f]">
        <DatabaseIcon size={12} /> sesi disimpan di MongoDB
      </div>
    </div>
  )
}
