import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getRooms, getOrCreateDM, markRoomRead,
  getMessages, getNewMessages, sendMessage, deleteMessage, searchMessages,
  pingOnline, getOnlineUsers, getUnreadCounts, getUsersForMention,
} from "@/api/chat"
import type { ChatMessage } from "./types"
import { useCallback, useEffect, useRef, useState } from "react"

// ─── Rooms ────────────────────────────────────────────────────────────────────

export function useRooms() {
  return useQuery({
    queryKey: ["chat-rooms"],
    queryFn: getRooms,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10_000,
  })
}

export function useGetOrCreateDM() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (other_user: string) => getOrCreateDM(other_user),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-rooms"] }),
  })
}

export function useMarkRoomRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (room_id: string) => markRoomRead(room_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-unread"] })
      qc.invalidateQueries({ queryKey: ["chat-rooms"] })
    },
  })
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oldestBeforeId, setOldestBeforeId] = useState<string | undefined>()
  const latestIdRef = useRef<string>("")
  const mountedRef = useRef(true)

  // Initial load when room changes
  useEffect(() => {
    mountedRef.current = true
    if (!roomId) {
      setMessages([])
      setHasMore(false)
      latestIdRef.current = ""
      return
    }

    setLoading(true)
    setMessages([])
    latestIdRef.current = ""

    getMessages(roomId, 50).then((data) => {
      if (!mountedRef.current) return
      setMessages(data.messages)
      setHasMore(data.has_more)
      if (data.messages.length > 0) {
        latestIdRef.current = data.messages[data.messages.length - 1].id
        setOldestBeforeId(data.messages[0].id)
      }
    }).finally(() => {
      if (mountedRef.current) setLoading(false)
    })

    return () => { mountedRef.current = false }
  }, [roomId])

  // Polling: fetch new messages every 3s
  useEffect(() => {
    if (!roomId) return
    const timer = setInterval(async () => {
      const sinceId = latestIdRef.current
      if (!sinceId) return
      try {
        const data = await getNewMessages(roomId, sinceId)
        if (!mountedRef.current) return
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const newOnes = data.messages.filter((m) => !existingIds.has(m.id))
            return [...prev, ...newOnes]
          })
          latestIdRef.current = data.messages[data.messages.length - 1].id
        }
      } catch {
        // transient network error — ignore
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [roomId])

  const loadOlder = useCallback(async () => {
    if (!roomId || !oldestBeforeId || !hasMore) return
    const data = await getMessages(roomId, 50, oldestBeforeId)
    if (!mountedRef.current) return
    setMessages((prev) => [...data.messages, ...prev])
    setHasMore(data.has_more)
    if (data.messages.length > 0) setOldestBeforeId(data.messages[0].id)
  }, [roomId, oldestBeforeId, hasMore])

  // Patch a message in local state (e.g. after delete)
  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  // Append an optimistic message
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    latestIdRef.current = msg.id
  }, [])

  return { messages, hasMore, loading, loadOlder, patchMessage, appendMessage }
}

// ─── Send / Delete ────────────────────────────────────────────────────────────

export function useSendMessage(appendMessage: (m: ChatMessage) => void) {
  return useMutation({
    mutationFn: sendMessage,
    onSuccess: (msg) => appendMessage(msg),
  })
}

export function useDeleteMessage(patchMessage: (id: string, p: Partial<ChatMessage>) => void) {
  return useMutation({
    mutationFn: (message_id: string) => deleteMessage(message_id),
    onMutate: (message_id) => {
      patchMessage(message_id, { is_deleted: true, content: null })
    },
  })
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function useSearchMessages(query: string, roomId?: string) {
  return useQuery({
    queryKey: ["chat-search", query, roomId],
    queryFn: () => searchMessages(query, roomId),
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  })
}

// ─── Presence ────────────────────────────────────────────────────────────────

export function usePresence() {
  // Ping every 30s to mark self online
  useEffect(() => {
    pingOnline()
    const timer = setInterval(pingOnline, 30_000)
    return () => clearInterval(timer)
  }, [])

  return useQuery({
    queryKey: ["chat-online"],
    queryFn: getOnlineUsers,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

// ─── Unread ───────────────────────────────────────────────────────────────────

export function useUnreadCounts() {
  return useQuery({
    queryKey: ["chat-unread"],
    queryFn: getUnreadCounts,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
}

// ─── Mention autocomplete ────────────────────────────────────────────────────

export function useMentionUsers() {
  return useQuery({
    queryKey: ["chat-mention-users"],
    queryFn: getUsersForMention,
    staleTime: 5 * 60_000,
  })
}
