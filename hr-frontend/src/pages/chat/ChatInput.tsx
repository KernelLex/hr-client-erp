import { useState, useRef, useCallback, useEffect } from "react"
import { Send, Paperclip, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { MentionPicker } from "./MentionPicker"
import { FilePreview } from "./FilePreview"
import { uploadChatFile } from "@/api/chat"
import type { MentionUser, PendingFile } from "./types"

interface Props {
  onSend: (payload: {
    content?: string
    file_url?: string
    file_name?: string
    file_type?: string
    file_size?: number
    mentions?: string[]
  }) => void
  isSending: boolean
  mentionUsers: MentionUser[]
  disabled?: boolean
}

export function ChatInput({ onSend, isSending, mentionUsers, disabled }: Props) {
  const [text, setText] = useState("")
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [mentionState, setMentionState] = useState<{
    active: boolean
    query: string
    cursorPos: number
    atPos: number
    highlightIdx: number
  }>({ active: false, query: "", cursorPos: 0, atPos: 0, highlightIdx: 0 })

  const [mentionsInMessage, setMentionsInMessage] = useState<string[]>([]) // user emails

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px"
  }, [text])

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const cursor = e.target.selectionStart ?? 0
    setText(val)

    // Detect @mention trigger
    const textUpToCursor = val.slice(0, cursor)
    const mentionMatch = textUpToCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      setMentionState({
        active: true,
        query: mentionMatch[1],
        cursorPos: cursor,
        atPos: cursor - mentionMatch[0].length,
        highlightIdx: 0,
      })
    } else {
      setMentionState((s) => ({ ...s, active: false, query: "" }))
    }
  }

  const filteredMentionUsers = mentionUsers.filter(
    (u) =>
      !mentionState.query ||
      u.full_name.toLowerCase().includes(mentionState.query.toLowerCase())
  )

  function insertMention(user: MentionUser) {
    const { atPos } = mentionState
    const before = text.slice(0, atPos)
    const after = text.slice(mentionState.cursorPos)
    const inserted = `@${user.full_name} `
    const newText = before + inserted + after
    setText(newText)
    setMentionsInMessage((prev) => [...new Set([...prev, user.user])])
    setMentionState((s) => ({ ...s, active: false, query: "" }))

    // Restore focus + cursor
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const newPos = atPos + inserted.length
      ta.focus()
      ta.setSelectionRange(newPos, newPos)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionState.active && filteredMentionUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionState((s) => ({
          ...s,
          highlightIdx: Math.min(s.highlightIdx + 1, filteredMentionUsers.length - 1),
        }))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionState((s) => ({ ...s, highlightIdx: Math.max(s.highlightIdx - 1, 0) }))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        insertMention(filteredMentionUsers[mentionState.highlightIdx])
        return
      }
      if (e.key === "Escape") {
        setMentionState((s) => ({ ...s, active: false }))
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    const MAX_MB = 10
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_MB} MB)`)
      return
    }

    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null
    setPendingFile({ file, preview_url: preview, uploading: true, uploaded_url: null, uploaded_name: null, error: null })

    try {
      const { file_url, file_name } = await uploadChatFile(file)
      setPendingFile((pf) => pf ? { ...pf, uploading: false, uploaded_url: file_url, uploaded_name: file_name } : null)
    } catch {
      setPendingFile((pf) => pf ? { ...pf, uploading: false, error: "Upload failed" } : null)
      toast.error("File upload failed. Please try again.")
    }
  }

  function removePendingFile() {
    if (pendingFile?.preview_url) URL.revokeObjectURL(pendingFile.preview_url)
    setPendingFile(null)
  }

  function handleSend() {
    const trimmed = text.trim()
    if (isSending || disabled) return
    if (!trimmed && !pendingFile?.uploaded_url) return
    if (pendingFile?.uploading) {
      toast.error("Please wait for the file to finish uploading")
      return
    }

    const payload: Parameters<typeof onSend>[0] = {}

    if (trimmed) payload.content = trimmed
    if (pendingFile?.uploaded_url) {
      payload.file_url = pendingFile.uploaded_url
      payload.file_name = pendingFile.file.name
      payload.file_type = pendingFile.file.type
      payload.file_size = pendingFile.file.size
    }
    if (mentionsInMessage.length > 0) payload.mentions = mentionsInMessage

    onSend(payload)
    setText("")
    setMentionsInMessage([])
    removePendingFile()
    setMentionState((s) => ({ ...s, active: false }))
  }

  const canSend = (text.trim().length > 0 || pendingFile?.uploaded_url) && !pendingFile?.uploading

  return (
    <div className="shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
      {/* Pending file preview */}
      {pendingFile && (
        <div className="mb-2 flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
          {pendingFile.uploading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={13} className="animate-spin text-indigo-500" />
              <span>Uploading {pendingFile.file.name}…</span>
            </div>
          ) : pendingFile.error ? (
            <span className="text-xs text-red-500">{pendingFile.error}</span>
          ) : (
            <div className="flex-1 min-w-0">
              {pendingFile.preview_url ? (
                <img src={pendingFile.preview_url} alt="preview" className="h-16 rounded object-cover" />
              ) : (
                <FilePreview
                  file_url={pendingFile.uploaded_url!}
                  file_name={pendingFile.file.name}
                  file_type={pendingFile.file.type}
                  file_size={pendingFile.file.size}
                  compact
                />
              )}
            </div>
          )}
          <button onClick={removePendingFile} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mention picker */}
      <div className="relative">
        {mentionState.active && (
          <MentionPicker
            query={mentionState.query}
            users={mentionUsers}
            onSelect={insertMention}
            onClose={() => setMentionState((s) => ({ ...s, active: false }))}
            highlightIndex={mentionState.highlightIdx}
          />
        )}

        <div className="flex items-end gap-2">
          {/* File attach */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!!pendingFile || disabled}
            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40 shrink-0"
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Select a room to chat" : "Message… (@ to mention, Shift+Enter for newline)"}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 bg-gray-50 focus:bg-white transition-colors"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend || isSending}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center shrink-0"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>

        {/* Character count warning */}
        {text.length > 1800 && (
          <p className="text-right text-xs mt-1" style={{ color: text.length > 2000 ? "#ef4444" : "#f59e0b" }}>
            {text.length}/2000
          </p>
        )}
      </div>
    </div>
  )
}
