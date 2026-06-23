import { useState, useEffect } from "react"
import { Search, X, FileText, Hash, MessageSquare, Loader2 } from "lucide-react"
import { useSearchMessages } from "./useChat"
import type { SearchResult } from "./types"

function highlight(text: string | null, query: string) {
  if (!text || !query) return text || ""
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length)
  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm">{match}</mark>
      {after}
    </>
  )
}

function formatTime(iso: string) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch { return "" }
}

interface Props {
  onClose: () => void
  onNavigate: (roomId: string) => void
}

export function SearchPanel({ onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: results, isLoading } = useSearchMessages(debouncedQuery)

  function handleResultClick(result: SearchResult) {
    onNavigate(result.room)
    onClose()
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all messages…"
          className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X size={14} />
          </button>
        )}
        <button
          onClick={onClose}
          className="ml-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-0.5 transition-colors"
        >
          Close
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!debouncedQuery && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 text-gray-400">
            <Search size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Type to search across all messages</p>
          </div>
        )}

        {debouncedQuery && isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        )}

        {debouncedQuery && !isLoading && results?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 text-gray-400">
            <p className="text-sm">No messages found for <strong className="text-gray-600">"{debouncedQuery}"</strong></p>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="py-2">
            <p className="px-4 py-1 text-[10px] text-gray-400 uppercase tracking-wider font-medium">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => handleResultClick(r)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Hash size={11} className="text-gray-300 shrink-0" />
                  <span className="text-[11px] text-gray-400 font-medium">{r.room_name}</span>
                  <span className="ml-auto text-[11px] text-gray-300">{formatTime(r.sent_at)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-gray-700 shrink-0">{r.sender_name}</span>
                  {r.message_type === "file" ? (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <FileText size={11} /> {r.file_name || "File"}
                    </span>
                  ) : (
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                      {highlight(r.content, debouncedQuery)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
