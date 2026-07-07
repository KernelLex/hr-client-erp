import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { MentionUser } from "./types"

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

interface Props {
  query: string
  users: MentionUser[]
  onSelect: (user: MentionUser) => void
  onClose: () => void
  highlightIndex: number
}

export function MentionPicker({ query, users, onSelect, onClose, highlightIndex }: Props) {
  const filtered = users.filter(
    (u) => !query || u.full_name.toLowerCase().includes(query.toLowerCase())
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50"
    >
      <div className="px-3 py-1.5 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Mention someone</p>
      </div>
      {filtered.map((u, i) => (
        <button
          key={u.user}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(u)
          }}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
            i === highlightIndex ? "bg-forest-50" : "hover:bg-gray-50"
          )}
        >
          <div className="w-6 h-6 rounded-full bg-forest-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {getInitials(u.full_name)}
          </div>
          <span className="text-sm text-gray-700">{u.full_name}</span>
        </button>
      ))}
    </div>
  )
}
