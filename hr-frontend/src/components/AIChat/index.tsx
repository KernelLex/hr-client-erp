import { useState, useRef, useEffect } from "react"
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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

export default function AIChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [showChips, setShowChips] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 h-[480px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <div>
                <p className="text-white font-semibold text-sm">Vera AI</p>
                <p className="text-indigo-200 text-xs">
                  {isReady ? `${status.active_model}` : "Offline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isReady && (
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {history.length === 0 && (
              <div className="text-center py-6">
                <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Hi! I'm Vera AI</p>
                <p className="text-xs text-gray-400 mt-1">
                  Ask me anything about your business data
                </p>
              </div>
            )}

            {history.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
                  }`}
                >
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
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {QUICK_CHIPS.slice(0, 4).map(chip => (
                <button
                  key={chip}
                  onClick={() => handleSend(chip)}
                  className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-100 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-100 bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={isReady ? "Ask Vera anything…" : "AI offline"}
                disabled={!isReady || isPending}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 max-h-24"
                style={{ overflowY: "auto" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || !isReady || isPending}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? "bg-gray-700 hover:bg-gray-800"
            : isReady
            ? "bg-gradient-to-br from-indigo-600 to-purple-600 hover:scale-110"
            : "bg-gray-400"
        }`}
        title="Vera AI Assistant"
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
  )
}
