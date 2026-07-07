import { useState, useEffect } from "react"
import {
  Search, X, FileText, Hash, Loader2, Image as ImageIcon,
  FileSpreadsheet, Globe, MessageSquare, Paperclip, Download, Users,
} from "lucide-react"
import { useSearchMessages, useRoomMedia } from "./useChat"
import type { SearchResult } from "./types"
import type { MediaItem } from "@/api/chat"

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined })
  } catch { return "" }
}

function highlight(text: string | null, query: string) {
  if (!text || !query.trim()) return <>{text || ""}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function MediaIcon({ kind }: { kind: MediaItem["kind"] }) {
  const cls = "w-5 h-5 shrink-0"
  if (kind === "image") return <ImageIcon className={cls + " text-blue-500"} />
  if (kind === "pdf") return <FileText className={cls + " text-red-500"} />
  if (kind === "doc") return <FileText className={cls + " text-blue-600"} />
  if (kind === "sheet") return <FileSpreadsheet className={cls + " text-green-600"} />
  return <FileText className={cls + " text-gray-400"} />
}

// ── Message result card ────────────────────────────────────────────────────────

function MessageResult({
  result, query, onNavigate, onClose, isRoomScope,
}: {
  result: SearchResult; query: string; onNavigate: (id: string) => void
  onClose: () => void; isRoomScope: boolean
}) {
  return (
    <button
      onClick={() => { onNavigate(result.room); onClose() }}
      className="w-full text-left px-4 py-3 hover:bg-forest-50/60 transition-colors border-b border-gray-50 last:border-0"
    >
      {/* Room + time */}
      {!isRoomScope && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Hash size={10} className="text-gray-300 shrink-0" />
          <span className="text-[11px] text-gray-400 font-medium truncate">{result.room_name}</span>
          <span className="ml-auto text-[10px] text-gray-300 shrink-0">{formatTime(result.sent_at)}</span>
        </div>
      )}

      <div className="flex items-start gap-2">
        {/* Sender initial */}
        <div className="w-7 h-7 rounded-full bg-forest-100 flex items-center justify-center shrink-0 text-[11px] font-bold text-forest-600">
          {(result.sender_name || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold text-gray-700">{result.sender_name}</span>
            {isRoomScope && <span className="text-[10px] text-gray-300 shrink-0">{formatTime(result.sent_at)}</span>}
          </div>
          {result.message_type === "file" ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Paperclip size={11} className="text-gray-400" />
              <span className="text-[12px] text-gray-500 truncate">
                {result.file_name ? highlight(result.file_name, query) : "Attachment"}
              </span>
            </div>
          ) : (
            <p className="text-[12px] text-gray-600 leading-relaxed line-clamp-2 mt-0.5">
              {highlight(result.content, query)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Media/file card ────────────────────────────────────────────────────────────

function MediaCard({ item, query }: { item: MediaItem; query: string }) {
  const isImage = item.kind === "image"
  return (
    <a
      href={item.file_url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      download={!isImage ? item.file_name : undefined}
      className="flex items-center gap-3 px-4 py-3 hover:bg-forest-50/60 transition-colors border-b border-gray-50 last:border-0 group"
    >
      {isImage ? (
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-gray-100 bg-gray-50">
          <img src={item.file_url ?? ""} alt={item.file_name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
          <MediaIcon kind={item.kind} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-gray-800 truncate">
          {highlight(item.file_name, query)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-gray-400">{item.sender_name}</span>
          <span className="text-[10px] text-gray-300">·</span>
          <span className="text-[10px] text-gray-400">{formatTime(item.sent_at)}</span>
          {item.file_size && (
            <><span className="text-[10px] text-gray-300">·</span>
            <span className="text-[10px] text-gray-400">{formatBytes(item.file_size)}</span></>
          )}
        </div>
      </div>

      <Download size={13} className="text-gray-300 group-hover:text-forest-500 transition-colors shrink-0" />
    </a>
  )
}

// ── Main SearchPanel ───────────────────────────────────────────────────────────

type Tab = "messages" | "media"

interface Props {
  onClose: () => void
  onNavigate: (roomId: string) => void
  /** If provided, search is scoped to this room (within-room mode) */
  activeRoomId?: string | null
  activeRoomName?: string
}

export function SearchPanel({ onClose, onNavigate, activeRoomId, activeRoomName }: Props) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [tab, setTab] = useState<Tab>("messages")
  const [scope, setScope] = useState<"room" | "global">(activeRoomId ? "room" : "global")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280)
    return () => clearTimeout(t)
  }, [query])

  const effectiveRoomId = scope === "room" && activeRoomId ? activeRoomId : undefined

  const { data: msgResults, isLoading: msgLoading } = useSearchMessages(debouncedQuery, effectiveRoomId)

  // Media: when searching show filtered results, otherwise show all media in room
  const mediaSearch = tab === "media" ? debouncedQuery : undefined
  const { data: mediaResults, isLoading: mediaLoading } = useRoomMedia(
    tab === "media" ? (effectiveRoomId ?? activeRoomId ?? null) : null,
    mediaSearch || undefined
  )

  const messages = msgResults ?? []
  const media = mediaResults ?? []

  const textMessages = messages.filter(m => m.message_type !== "file")
  const fileMessages = messages.filter(m => m.message_type === "file")

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        {/* Search input */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200 focus-within:border-forest-300 focus-within:ring-2 focus-within:ring-forest-100 transition-all">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "media" ? "Search files & media…" : "Search messages…"}
            className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500 transition-colors">
              <X size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors border-l border-gray-200 pl-2 ml-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scope toggle — only when inside a room */}
        {activeRoomId && (
          <div className="flex items-center gap-1 mt-2.5">
            <button
              onClick={() => setScope("room")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                scope === "room"
                  ? "bg-forest-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <Hash size={10} />
              {activeRoomName ?? "This chat"}
            </button>
            <button
              onClick={() => setScope("global")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                scope === "global"
                  ? "bg-forest-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <Globe size={10} />
              All chats
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex mt-2.5 border-b border-gray-100 -mb-3">
          {[
            { id: "messages" as Tab, label: "Messages", icon: MessageSquare },
            { id: "media" as Tab, label: "Files & Media", icon: Paperclip },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-forest-600 text-forest-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Messages tab */}
        {tab === "messages" && (
          <>
            {!debouncedQuery && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8 text-gray-400 py-12">
                <Search size={28} className="mb-3 opacity-20" />
                <p className="text-[13px] font-medium text-gray-500">Search messages</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {scope === "room" ? "Search in this conversation" : "Search across all your chats"}
                </p>
              </div>
            )}

            {debouncedQuery && msgLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-forest-400" />
              </div>
            )}

            {debouncedQuery && !msgLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <MessageSquare size={28} className="text-gray-200 mb-3" />
                <p className="text-[13px] text-gray-500">No messages found</p>
                <p className="text-[11px] text-gray-400 mt-1">for "<strong>{debouncedQuery}</strong>"</p>
              </div>
            )}

            {debouncedQuery && !msgLoading && messages.length > 0 && (
              <div className="py-1">
                {/* Text messages */}
                {textMessages.length > 0 && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                      Messages · {textMessages.length}
                    </p>
                    {textMessages.map(r => (
                      <MessageResult
                        key={r.id} result={r} query={debouncedQuery}
                        onNavigate={onNavigate} onClose={onClose}
                        isRoomScope={scope === "room"}
                      />
                    ))}
                  </>
                )}

                {/* Files found via message search */}
                {fileMessages.length > 0 && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                      Files · {fileMessages.length}
                    </p>
                    {fileMessages.map(r => (
                      <MessageResult
                        key={r.id} result={r} query={debouncedQuery}
                        onNavigate={onNavigate} onClose={onClose}
                        isRoomScope={scope === "room"}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Files & Media tab */}
        {tab === "media" && (
          <>
            {mediaLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-forest-400" />
              </div>
            )}

            {!mediaLoading && media.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <Paperclip size={28} className="text-gray-200 mb-3" />
                <p className="text-[13px] text-gray-500">
                  {debouncedQuery ? `No files match "${debouncedQuery}"` : "No files shared yet"}
                </p>
                {!scope && (
                  <p className="text-[11px] text-gray-400 mt-1">Open a chat to browse its files</p>
                )}
              </div>
            )}

            {!mediaLoading && media.length > 0 && (
              <>
                {/* Group by kind */}
                {(["image", "pdf", "doc", "sheet", "file"] as MediaItem["kind"][]).map(kind => {
                  const items = media.filter(m => m.kind === kind)
                  if (!items.length) return null
                  const label = kind === "image" ? "Images & Photos"
                    : kind === "pdf" ? "PDFs"
                    : kind === "doc" ? "Documents"
                    : kind === "sheet" ? "Spreadsheets"
                    : "Other Files"
                  return (
                    <div key={kind}>
                      <p className="px-4 pt-3 pb-1 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                        {label} · {items.length}
                      </p>
                      {items.map(item => (
                        <MediaCard key={item.id} item={item} query={debouncedQuery} />
                      ))}
                    </div>
                  )
                })}
              </>
            )}

            {!activeRoomId && !effectiveRoomId && !mediaLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <Users size={28} className="text-gray-200 mb-3" />
                <p className="text-[13px] text-gray-500">Open a chat to browse its media</p>
                <p className="text-[11px] text-gray-400 mt-1">Files & media are shown per conversation</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
