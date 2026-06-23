import { useEffect, useRef, useCallback, useState } from "react"
import { Loader2, ArrowDown } from "lucide-react"
import { MessageItem } from "./MessageItem"
import type { ChatMessage } from "./types"

interface Props {
  messages: ChatMessage[]
  hasMore: boolean
  loading: boolean
  currentUser: string
  mentionUserNames: Record<string, string>
  onLoadOlder: () => void
  onDelete: (id: string) => void
}

export function MessageList({
  messages, hasMore, loading,
  currentUser, mentionUserNames,
  onLoadOlder, onDelete,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)
  const userScrolledUpRef = useRef(false)
  const [scrolledUp, setScrolledUp] = useState(false)

  // Auto-scroll to bottom when NEW messages arrive (not when loading older)
  useEffect(() => {
    if (messages.length === 0) return
    const added = messages.length - prevLengthRef.current
    prevLengthRef.current = messages.length

    if (added > 0 && !userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages.length])

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [loading])

  // Track if user has scrolled up
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isUp = distanceFromBottom > 100
    userScrolledUpRef.current = isUp
    setScrolledUp(isUp)
  }, [])

  function scrollToBottom() {
    userScrolledUpRef.current = false
    setScrolledUp(false)
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
          <span className="text-2xl">💬</span>
        </div>
        <p className="text-sm font-semibold text-gray-700">No messages yet</p>
        <p className="text-xs text-gray-400 mt-1">Be the first to say something!</p>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto py-2"
      >
        {/* Load older messages */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={onLoadOlder}
              className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-full px-4 py-1.5 transition-colors"
            >
              Load older messages
            </button>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageItem
            key={msg.id}
            message={msg}
            prevMessage={i > 0 ? messages[i - 1] : null}
            currentUser={currentUser}
            mentionUserNames={mentionUserNames}
            onDelete={onDelete}
          />
        ))}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Scroll to bottom button (shown when scrolled up) */}
      <button
        onClick={scrollToBottom}
        className="absolute bottom-3 right-3 w-8 h-8 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors opacity-0 group-hover:opacity-100"
        style={{ opacity: scrolledUp ? 1 : 0, pointerEvents: scrolledUp ? "auto" : "none" }}
      >
        <ArrowDown size={14} />
      </button>
    </div>
  )
}
