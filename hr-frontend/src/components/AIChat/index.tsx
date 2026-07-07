import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { X, Send, Bot, Loader2, Sparkles, ChevronDown } from "lucide-react"
import { checkAIStatus, chatWithVera, type ChatMessage } from "@/api/ai"

const QUICK_CHIPS = [
  "What are my overdue invoices?",
  "Summarise this month's sales",
  "Which vendors have pending payments?",
  "Show top clients by revenue",
  "Any cash flow risks?",
  "Quotation conversion rate?",
]

const STORAGE_KEY = "vera_ai_chat_pos"

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-2 h-2 bg-forest-400 rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 bg-forest-400 rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 bg-forest-400 rounded-full animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clampPos(x: number, y: number, btnW = 56, btnH = 56) {
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - btnW)),
    y: Math.max(0, Math.min(y, window.innerHeight - btnH)),
  }
}

export default function AIChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [showChips, setShowChips] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Drag state — position is bottom-right offset from viewport top-left
  const saved = loadPos()
  const [pos, setPos] = useState<{ x: number; y: number }>(
    saved ?? { x: window.innerWidth - 80, y: window.innerHeight - 80 }
  )
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on the FAB itself (not the chat panel)
    if ((e.target as HTMLElement).closest(".ai-chat-panel")) return
    e.preventDefault()
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, bx: pos.x, by: pos.y }

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return
      const dx = ev.clientX - dragStart.current.mx
      const dy = ev.clientY - dragStart.current.my
      const nx = dragStart.current.bx + dx
      const ny = dragStart.current.by + dy
      setPos(clampPos(nx, ny))
    }

    function onUp(ev: MouseEvent) {
      dragging.current = false
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      // If barely moved, treat as a click
      const dist = Math.abs(ev.clientX - dragStart.current.mx) + Math.abs(ev.clientY - dragStart.current.my)
      if (dist < 5) setOpen(prev => !prev)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [pos])

  // Touch drag
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest(".ai-chat-panel")) return
    const t = e.touches[0]
    dragging.current = true
    dragStart.current = { mx: t.clientX, my: t.clientY, bx: pos.x, by: pos.y }

    function onMove(ev: TouchEvent) {
      if (!dragging.current) return
      const touch = ev.touches[0]
      const dx = touch.clientX - dragStart.current.mx
      const dy = touch.clientY - dragStart.current.my
      setPos(clampPos(dragStart.current.bx + dx, dragStart.current.by + dy))
    }

    function onEnd(ev: TouchEvent) {
      dragging.current = false
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onEnd)
      const t2 = ev.changedTouches[0]
      const dist = Math.abs(t2.clientX - dragStart.current.mx) + Math.abs(t2.clientY - dragStart.current.my)
      if (dist < 8) setOpen(prev => !prev)
    }

    window.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("touchend", onEnd)
  }, [pos])

  // Persist position
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  }, [pos])

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: checkAIStatus,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: (msg: string) => chatWithVera(msg, history),
    onSuccess: (data, msg) => {
      setHistory(prev => [
        ...prev,
        { role: "user", content: msg },
        { role: "assistant", content: data.reply },
      ])
    },
    onError: (_, msg) => {
      setHistory(prev => [
        ...prev,
        { role: "user", content: msg },
        { role: "assistant", content: "Something went wrong. Please try again." },
      ])
    },
  })

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, open, isPending])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isPending) return
    setInput("")
    setShowChips(false)
    sendMessage(msg)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isReady = status?.ready

  // Chat panel opens upward and to the left from the FAB
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: pos.x + 56 + 8 > window.innerWidth / 2
      ? Math.max(4, pos.x - 320 + 56)   // open to the left
      : pos.x,                             // open to the right
    top: pos.y + 56 + 480 + 8 > window.innerHeight
      ? Math.max(4, pos.y - 480)          // open upward
      : pos.y + 56 + 8,                   // open downward
    zIndex: 50,
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="ai-chat-panel w-80 h-[480px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ ...panelStyle, position: "fixed" }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-forest-600 to-gold-600 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <div>
                <p className="text-white font-semibold text-sm">Vera AI</p>
                <p className="text-forest-200 text-xs">
                  {isReady ? `${status.active_model}` : "Offline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isReady && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {history.length === 0 && (
              <div className="text-center py-6">
                <Sparkles className="w-8 h-8 text-forest-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Hi! I'm Vera AI</p>
                <p className="text-xs text-gray-400 mt-1">Ask me anything about your business data</p>
              </div>
            )}
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-forest-600 text-white rounded-br-sm"
                    : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isPending && (
              <div className="flex justify-start">
                <div className="bg-white rounded-xl rounded-bl-sm shadow-sm border border-gray-100">
                  <TypingIndicator />
                </div>
              </div>
            )}
            {!isReady && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Ollama is not running. Start it with <code className="bg-amber-100 px-1 rounded">ollama serve</code>.
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick chips */}
          {showChips && history.length === 0 && isReady && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {QUICK_CHIPS.slice(0, 4).map(chip => (
                <button
                  key={chip}
                  onClick={() => handleSend(chip)}
                  className="text-xs bg-forest-50 text-forest-700 border border-forest-200 rounded-full px-2.5 py-1 hover:bg-forest-100 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-100 bg-white shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={isReady ? "Ask Vera anything…" : "AI offline"}
                disabled={!isReady || isPending}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 disabled:opacity-50 max-h-24"
                style={{ overflowY: "auto" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || !isReady || isPending}
                className="p-2 bg-forest-600 text-white rounded-xl hover:bg-forest-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draggable FAB */}
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="fixed z-50 select-none"
        style={{ left: pos.x, top: pos.y, cursor: dragging.current ? "grabbing" : "grab" }}
        title="Drag to move · Click to open Vera AI"
      >
        <button
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 pointer-events-none ${
            open
              ? "bg-gray-700"
              : isReady
              ? "bg-gradient-to-br from-forest-600 to-gold-600"
              : "bg-gray-400"
          }`}
        >
          {open ? (
            <ChevronDown className="w-6 h-6 text-white" />
          ) : (
            <Bot className="w-6 h-6 text-white" />
          )}
          {!open && isReady && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
          )}
        </button>
      </div>
    </>
  )
}
