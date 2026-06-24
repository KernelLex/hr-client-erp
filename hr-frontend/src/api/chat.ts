import { api, apiUrl } from "@/lib/api"
import type {
  ChatRoom, ChatMessage, OnlineUser, MentionUser,
  UnreadCounts, SearchResult,
} from "@/pages/chat/types"

// ─── Rooms ────────────────────────────────────────────────────────────────────

export async function getRooms(): Promise<ChatRoom[]> {
  const r = await api.get(apiUrl("hr_client.api.chat.get_rooms"))
  return r.data.message.rooms
}

export async function getOrCreateDM(other_user: string): Promise<{ room_id: string; created: boolean }> {
  const r = await api.post(apiUrl("hr_client.api.chat.get_or_create_dm"), { other_user })
  return r.data.message
}

export async function markRoomRead(room_id: string): Promise<void> {
  await api.post(apiUrl("hr_client.api.chat.mark_room_read"), { room_id })
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(
  room_id: string,
  limit = 50,
  before_id?: string
): Promise<{ messages: ChatMessage[]; has_more: boolean }> {
  const r = await api.get(apiUrl("hr_client.api.chat.get_messages"), {
    params: { room_id, limit, before_id },
  })
  return r.data.message
}

export async function getNewMessages(
  room_id: string,
  since_id: string
): Promise<{ messages: ChatMessage[] }> {
  const r = await api.get(apiUrl("hr_client.api.chat.get_new_messages"), {
    params: { room_id, since_id },
  })
  return r.data.message
}

export async function sendMessage(payload: {
  room_id: string
  content?: string
  file_url?: string
  file_name?: string
  file_type?: string
  file_size?: number
  mentions?: string[]
}): Promise<ChatMessage> {
  const body = {
    ...payload,
    mentions: JSON.stringify(payload.mentions ?? []),
  }
  const r = await api.post(apiUrl("hr_client.api.chat.send_message"), body)
  return r.data.message.message
}

export async function deleteMessage(message_id: string): Promise<void> {
  await api.post(apiUrl("hr_client.api.chat.delete_message"), { message_id })
}

export async function searchMessages(
  query: string,
  room_id?: string
): Promise<SearchResult[]> {
  const r = await api.get(apiUrl("hr_client.api.chat.search_messages"), {
    params: { query, room_id },
  })
  return r.data.message.results
}

// ─── Presence ────────────────────────────────────────────────────────────────

export async function pingOnline(): Promise<void> {
  await api.post(apiUrl("hr_client.api.chat.ping_online"), {})
}

export async function getOnlineUsers(): Promise<OnlineUser[]> {
  const r = await api.get(apiUrl("hr_client.api.chat.get_online_users"))
  return r.data.message.online_users
}

// ─── Unread ───────────────────────────────────────────────────────────────────

export async function getUnreadCounts(): Promise<UnreadCounts> {
  const r = await api.get(apiUrl("hr_client.api.chat.get_unread_counts"))
  return r.data.message
}

// ─── Mention autocomplete ────────────────────────────────────────────────────

export async function getUsersForMention(): Promise<MentionUser[]> {
  const r = await api.get(apiUrl("hr_client.api.chat.get_users_for_mention"))
  return r.data.message.users
}

// ─── Group creation ───────────────────────────────────────────────────────────

export async function createGroup(
  display_name: string,
  members: string[]
): Promise<{ room_id: string; created: boolean }> {
  const r = await api.post(apiUrl("hr_client.api.chat.create_group"), {
    display_name,
    members_json: JSON.stringify(members),
  })
  return r.data.message
}

// ─── File upload (Frappe built-in) ───────────────────────────────────────────

export async function uploadChatFile(
  file: File
): Promise<{ file_url: string; file_name: string }> {
  const fd = new FormData()
  fd.append("file", file, file.name)
  fd.append("is_private", "0")
  // Do NOT specify a custom folder — Frappe will use the default Home folder.
  // Custom sub-folders must be created manually first; if they don't exist the
  // upload returns a 500/folder-not-found error which silently kills the upload.

  // Use native fetch (not axios): axios overrides Content-Type to application/json
  // which breaks multipart boundary — Frappe's upload_file requires multipart/form-data.
  // fetch() with FormData sets the correct Content-Type automatically.
  const csrfToken = (() => {
    const match = document.cookie.split("; ").find((c) => c.startsWith("csrf_token="))
    if (!match) return "fetch"
    try { return decodeURIComponent(match.split("=")[1]) } catch { return "fetch" }
  })()

  const res = await fetch("/api/method/upload_file", {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": csrfToken },
    body: fd,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.exc_type ?? err?.message ?? `Upload failed (${res.status})`)
  }

  const data = await res.json()
  const msg = data.message
  if (!msg?.file_url) throw new Error("No file URL returned from server")
  return { file_url: msg.file_url, file_name: msg.file_name ?? file.name }
}
