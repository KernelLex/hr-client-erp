import { useState } from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilePreview } from "./FilePreview"
import type { ChatMessage } from "./types"

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function formatTime(iso: string) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

function isSameDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10)
}

function formatDayHeader(iso: string) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
  } catch {
    return ""
  }
}

// Render message content with @mention highlights
function renderContent(content: string, mentions: string[], mentionUserNames: Record<string, string>) {
  // Replace @FullName tokens. We stored mentions as email array; content has @Full Name text.
  // We highlight any @Word+ sequences that match a known full_name or start with @
  const parts = content.split(/(@\S+(?:\s+\S+)?)/g)
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-indigo-600 font-semibold bg-indigo-50 rounded px-0.5">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

interface Props {
  message: ChatMessage
  prevMessage: ChatMessage | null
  currentUser: string
  mentionUserNames: Record<string, string>
  onDelete: (id: string) => void
}

export function MessageItem({ message, prevMessage, currentUser, mentionUserNames, onDelete }: Props) {
  const [hovered, setHovered] = useState(false)

  const isOwn = message.sender === currentUser
  const showDayHeader = !prevMessage || !isSameDay(message.sent_at, prevMessage.sent_at)

  // Group consecutive messages from same sender (within 2 min)
  const sameGroup =
    prevMessage &&
    prevMessage.sender === message.sender &&
    !showDayHeader &&
    (() => {
      try {
        const diff = new Date(message.sent_at).getTime() - new Date(prevMessage.sent_at).getTime()
        return diff < 2 * 60_000
      } catch {
        return false
      }
    })()

  const isMentioned = message.mentions.includes(currentUser)

  if (message.message_type === "system") {
    return (
      <div className="flex items-center gap-3 py-1.5 px-4">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 shrink-0">{message.content}</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
    )
  }

  return (
    <>
      {showDayHeader && (
        <div className="flex items-center gap-3 py-2 px-4">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium shrink-0">
            {formatDayHeader(message.sent_at)}
          </span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}

      <div
        className={cn(
          "group flex items-start gap-2.5 px-4 py-0.5 transition-colors",
          sameGroup ? "pt-0" : "pt-2",
          hovered && "bg-gray-50",
          isMentioned && !message.is_deleted && "bg-amber-50 hover:bg-amber-50"
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Avatar column — only shown for first in group */}
        <div className="w-8 shrink-0 flex justify-center">
          {!sameGroup ? (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: isOwn ? "#4F46E5" : "#334155" }}
            >
              {getInitials(message.sender_name)}
            </div>
          ) : null}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name + time — only for first in group */}
          {!sameGroup && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className={cn("text-sm font-semibold", isOwn ? "text-indigo-700" : "text-gray-800")}>
                {message.sender_name}
                {isOwn && <span className="text-xs font-normal text-gray-400 ml-1">(you)</span>}
              </span>
              <span className="text-[11px] text-gray-400">{formatTime(message.sent_at)}</span>
              {isMentioned && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 rounded px-1">
                  ✦ mentioned you
                </span>
              )}
            </div>
          )}

          {/* Message body */}
          {message.is_deleted ? (
            <p className="text-sm text-gray-400 italic">Message deleted</p>
          ) : (
            <>
              {message.content && (
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                  {renderContent(message.content, message.mentions, mentionUserNames)}
                </p>
              )}
              {message.file_url && (
                <FilePreview
                  file_url={message.file_url}
                  file_name={message.file_name}
                  file_type={message.file_type}
                  file_size={message.file_size}
                />
              )}
            </>
          )}

          {/* Grouped timestamp (shown on hover for grouped messages) */}
          {sameGroup && hovered && (
            <span className="text-[10px] text-gray-300 mt-0.5 block">{formatTime(message.sent_at)}</span>
          )}
        </div>

        {/* Delete action (hover, own messages) */}
        {!message.is_deleted && isOwn && hovered && (
          <button
            onClick={() => onDelete(message.id)}
            className="shrink-0 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete message"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </>
  )
}
