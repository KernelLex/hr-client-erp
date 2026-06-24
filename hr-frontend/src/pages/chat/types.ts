export interface ChatMessage {
  id: string
  room: string
  sender: string
  sender_name: string
  content: string | null
  message_type: "text" | "file" | "system"
  file_url: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  mentions: string[]
  sent_at: string
  edited_at: string | null
  is_deleted: boolean
}

export interface LastMessage {
  preview: string | null
  sender_name: string | null
  sent_at: string
}

export interface ChatRoom {
  id: string
  room_type: "General" | "Direct" | "Group"
  display_name: string
  created_at: string
  unread: number
  mention_count: number
  last_message: LastMessage | null
  member_count?: number | null
}

export interface OnlineUser {
  user: string
  full_name: string
  user_image: string | null
}

export interface MentionUser {
  user: string
  full_name: string
  user_image: string | null
}

export interface UnreadCounts {
  counts: Record<string, { unread: number; mention_count: number }>
  total_unread: number
  total_mentions: number
}

export interface SearchResult {
  id: string
  room: string
  room_name: string
  sender: string
  sender_name: string
  content: string | null
  message_type: string
  file_url: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  sent_at: string
}

export interface PendingFile {
  file: File
  preview_url: string | null  // object URL for images
  uploading: boolean
  uploaded_url: string | null
  uploaded_name: string | null
  error: string | null
}
