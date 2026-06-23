import { useState } from "react"
import { Hash, MessageSquare, Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatRoom, MentionUser, OnlineUser } from "./types"
import { useGetOrCreateDM } from "./useChat"

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function formatTime(iso: string) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86_400_000)
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
    return d.toLocaleDateString([], { month: "short", day: "numeric" })
  } catch {
    return ""
  }
}

interface Props {
  rooms: ChatRoom[]
  activeRoomId: string | null
  onSelectRoom: (id: string) => void
  onSearch: () => void
  mentionUsers: MentionUser[]
  onlineUsers: OnlineUser[]
  currentUser: string
  unreadCounts: Record<string, { unread: number; mention_count: number }>
}

export function RoomList({
  rooms, activeRoomId, onSelectRoom, onSearch,
  mentionUsers, onlineUsers, currentUser, unreadCounts,
}: Props) {
  const [showNewDM, setShowNewDM] = useState(false)
  const { mutate: createDM, isPending: dmPending } = useGetOrCreateDM()

  const onlineSet = new Set(onlineUsers.map((u) => u.user))
  const generalRoom = rooms.find((r) => r.room_type === "General")
  const dmRooms = rooms.filter((r) => r.room_type === "Direct")

  function handleStartDM(user: string) {
    createDM(user, {
      onSuccess: (data) => {
        setShowNewDM(false)
        onSelectRoom(data.room_id)
      },
    })
  }

  function RoomItem({ room }: { room: ChatRoom }) {
    const isActive = room.id === activeRoomId
    const counts = unreadCounts[room.id]
    const unread = counts?.unread ?? room.unread
    const mentions = counts?.mention_count ?? room.mention_count
    const isGeneral = room.room_type === "General"

    return (
      <button
        onClick={() => onSelectRoom(room.id)}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group",
          isActive
            ? "bg-indigo-600 text-white"
            : "text-[#94A3B8] hover:bg-white/5 hover:text-[#E2E8F0]"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isGeneral ? (
            <Hash size={14} className={cn("shrink-0", isActive ? "text-indigo-200" : "text-[#475569]")} />
          ) : (
            <div className={cn(
              "w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold",
              isActive ? "bg-indigo-400 text-white" : "bg-[#1E293B] text-[#94A3B8]"
            )}>
              {getInitials(room.display_name)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[13px] font-medium truncate">{room.display_name}</span>
              {room.last_message && (
                <span className={cn("text-[10px] shrink-0", isActive ? "text-indigo-200" : "text-[#475569]")}>
                  {formatTime(room.last_message.sent_at)}
                </span>
              )}
            </div>
            {room.last_message?.preview && (
              <p className={cn(
                "text-[11px] truncate leading-tight mt-0.5",
                isActive ? "text-indigo-200" : "text-[#475569]"
              )}>
                {room.last_message.preview}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {mentions > 0 && (
              <span className="text-[10px] font-bold text-amber-300">✦{mentions}</span>
            )}
            {unread > 0 && (
              <span className={cn(
                "min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1",
                isActive ? "bg-white text-indigo-600" : "bg-indigo-500 text-white"
              )}>
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-sidebar)" }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <p className="text-white font-bold text-[15px] tracking-tight">Company Chat</p>
        <p className="text-[#475569] text-[11px] mt-0.5">{onlineUsers.length} online</p>
      </div>

      {/* Search button */}
      <div className="px-3 pb-2 shrink-0">
        <button
          onClick={onSearch}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-[#475569] hover:text-[#94A3B8] hover:bg-white/5 transition-colors"
        >
          <Search size={13} />
          <span>Search messages…</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
        {/* General channel */}
        {generalRoom && (
          <>
            <p className="px-3 py-1 text-[10px] font-semibold text-[#334155] uppercase tracking-wider">
              Channels
            </p>
            <RoomItem room={generalRoom} />
          </>
        )}

        {/* Direct Messages */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-3 py-1">
            <p className="text-[10px] font-semibold text-[#334155] uppercase tracking-wider">
              Direct Messages
            </p>
            <button
              onClick={() => setShowNewDM((v) => !v)}
              className="text-[#334155] hover:text-[#94A3B8] transition-colors"
              title="New DM"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* New DM picker */}
          {showNewDM && (
            <div className="mx-2 mb-1 bg-[#1E293B] rounded-lg overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
                <span className="text-[11px] text-[#94A3B8]">Start a conversation</span>
                <button onClick={() => setShowNewDM(false)} className="text-[#475569] hover:text-[#94A3B8]">
                  <X size={12} />
                </button>
              </div>
              {mentionUsers.map((u) => {
                const alreadyHasDM = dmRooms.some((r) => r.display_name === u.full_name)
                return (
                  <button
                    key={u.user}
                    onClick={() => handleStartDM(u.user)}
                    disabled={dmPending}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="relative shrink-0">
                      <div className="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">
                        {getInitials(u.full_name)}
                      </div>
                      {onlineSet.has(u.user) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-[#0F172A]" />
                      )}
                    </div>
                    <span className="text-[12px] text-[#CBD5E1] flex-1">{u.full_name}</span>
                    {alreadyHasDM && <span className="text-[10px] text-[#334155]">existing</span>}
                  </button>
                )
              })}
            </div>
          )}

          {dmRooms.length === 0 && !showNewDM && (
            <p className="px-3 py-2 text-[11px] text-[#334155]">No conversations yet</p>
          )}

          {dmRooms.map((room) => {
            const otherUser = mentionUsers.find((u) => room.display_name === u.full_name)
            const isOnline = otherUser ? onlineSet.has(otherUser.user) : false

            return (
              <div key={room.id} className="relative">
                <RoomItem room={room} />
                {isOnline && (
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-green-400 rounded-full border border-[#0F172A] pointer-events-none"
                    style={{ left: "22px", top: "auto", bottom: "6px" }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Online presence strip */}
      {onlineUsers.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-white/5">
          <p className="text-[10px] text-[#334155] mb-1.5">Online now</p>
          <div className="flex flex-wrap gap-1">
            {onlineUsers.slice(0, 8).map((u) => (
              <div key={u.user} title={u.full_name}
                className="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-green-400"
              >
                {getInitials(u.full_name)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
