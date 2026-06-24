import { useState, useEffect, useMemo } from "react"
import { Hash, MessageSquare, Users, Search } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import {
  useRooms,
  useChatMessages,
  useSendMessage,
  useDeleteMessage,
  usePresence,
  useUnreadCounts,
  useMentionUsers,
  useMarkRoomRead,
} from "./useChat"
import { RoomList } from "./RoomList"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { SearchPanel } from "./SearchPanel"
import type { ChatRoom } from "./types"

export function ChatPage() {
  const { user } = useAuth()
  const currentUser = user?.name ?? ""

  const { data: rooms = [] } = useRooms()
  const { data: onlineUsers = [] } = usePresence()
  const { data: unreadData } = useUnreadCounts()
  const { data: mentionUsers = [] } = useMentionUsers()

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)

  const { mutate: markRead } = useMarkRoomRead()

  // Auto-select General room on first load
  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) {
      const general = rooms.find((r) => r.room_type === "General")
      if (general) setActiveRoomId(general.id)
    }
  }, [rooms, activeRoomId])

  // Mark room as read when switching into it
  useEffect(() => {
    if (activeRoomId) {
      markRead(activeRoomId)
    }
  }, [activeRoomId, markRead])

  const {
    messages, hasMore, loading,
    loadOlder, patchMessage, appendMessage,
  } = useChatMessages(activeRoomId)

  const { mutate: sendMsg, isPending: sending } = useSendMessage(appendMessage)
  const { mutate: deleteMsg } = useDeleteMessage(patchMessage)

  const activeRoom: ChatRoom | undefined = rooms.find((r) => r.id === activeRoomId)

  // Build a name lookup for @mention rendering
  const mentionUserNames = useMemo(() => {
    const map: Record<string, string> = {}
    mentionUsers.forEach((u) => { map[u.user] = u.full_name })
    return map
  }, [mentionUsers])

  type InputPayload = {
    content?: string
    file_url?: string
    file_name?: string
    file_type?: string
    file_size?: number
    mentions?: string[]
  }

  function handleSend(payload: InputPayload) {
    if (!activeRoomId) return
    sendMsg({ ...payload, room_id: activeRoomId })
  }

  function handleDelete(messageId: string) {
    deleteMsg(messageId)
  }

  function handleSelectRoom(roomId: string) {
    setShowSearch(false)
    setActiveRoomId(roomId)
  }

  const roomHeaderName = activeRoom
    ? activeRoom.room_type === "General"
      ? "# General"
      : activeRoom.display_name
    : ""

  function RoomIcon() {
    if (!activeRoom) return <MessageSquare size={16} className="text-gray-400" />
    if (activeRoom.room_type === "General") return <Hash size={16} className="text-gray-400" />
    if (activeRoom.room_type === "Group") return <Users size={16} className="text-gray-400" />
    return <MessageSquare size={16} className="text-gray-400" />
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: "#F8FAFC" }}>
      {/* Left panel — room list */}
      <div
        className="w-[220px] shrink-0 flex flex-col h-full overflow-hidden border-r border-white/5"
        style={{ backgroundColor: "var(--bg-sidebar)" }}
      >
        <RoomList
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelectRoom={handleSelectRoom}
          onSearch={() => setShowSearch(true)}
          mentionUsers={mentionUsers}
          onlineUsers={onlineUsers}
          currentUser={currentUser}
          unreadCounts={unreadData?.counts ?? {}}
        />
      </div>

      {/* Right panel — message area or search */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {showSearch ? (
          <SearchPanel
            onClose={() => setShowSearch(false)}
            onNavigate={handleSelectRoom}
            activeRoomId={activeRoomId}
            activeRoomName={activeRoom?.display_name}
          />
        ) : (
          <>
            {/* Room header */}
            <div className="shrink-0 px-5 py-3 bg-white border-b border-gray-100 flex items-center gap-2.5 shadow-sm">
              <RoomIcon />
              <h2 className="text-sm font-semibold text-gray-800">{roomHeaderName || "Select a room"}</h2>
              {activeRoom?.room_type === "Direct" && (
                <span className="text-xs text-gray-400">Direct Message</span>
              )}
              {activeRoom?.room_type === "Group" && activeRoom.member_count != null && (
                <span className="text-xs text-gray-400">{activeRoom.member_count} members</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {onlineUsers.length > 0 && (
                  <span className="text-xs text-gray-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1" />
                    {onlineUsers.length} online
                  </span>
                )}
                {/* In-room search button */}
                {activeRoomId && (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Search in this chat"
                  >
                    <Search size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <MessageList
              messages={messages}
              hasMore={hasMore}
              loading={loading}
              currentUser={currentUser}
              mentionUserNames={mentionUserNames}
              onLoadOlder={loadOlder}
              onDelete={handleDelete}
            />

            {/* Input */}
            <ChatInput
              onSend={handleSend}
              isSending={sending}
              mentionUsers={mentionUsers}
              disabled={!activeRoomId}
            />
          </>
        )}
      </div>
    </div>
  )
}
