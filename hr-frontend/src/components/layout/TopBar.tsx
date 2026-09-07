import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Menu, Eye, X } from "lucide-react"
import { api, apiUrl } from "@/lib/api"
import { useAuth, type ViewAsUser } from "@/context/AuthContext"

interface TopBarProps {
  onToggleSidebar?: () => void
  onOpenSearch?: () => void
}

interface UserRow {
  name: string
  email: string
  designation: string
  is_admin: boolean
  permissions: Record<string, boolean>
}

function ViewAsSwitcher() {
  const { realUser, isImpersonating, viewAs, setViewAs } = useAuth()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")

  const { data } = useQuery({
    queryKey: ["all_users_permissions"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.permissions.get_all_users_with_permissions"))
      return res.data.message as { users: UserRow[] }
    },
    enabled: open,
    staleTime: 1000 * 60 * 5,
  })

  const users = useMemo(() => {
    const list = (data?.users ?? []).filter((u) => u.email !== realUser?.name)
    const query = q.trim().toLowerCase()
    return query ? list.filter((u) => (u.name + " " + u.email + " " + u.designation).toLowerCase().includes(query)) : list
  }, [data, q, realUser])

  function pick(u: UserRow) {
    const target: ViewAsUser = { email: u.email, name: u.name, is_admin: u.is_admin, permissions: u.permissions }
    setViewAs(target)
    setOpen(false)
    setQ("")
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors"
        style={{ borderColor: isImpersonating ? "var(--gold)" : "var(--border,#e0d9cb)", color: isImpersonating ? "var(--brand-primary)" : "#6a6a5c" }}
      >
        <Eye size={13} />
        {isImpersonating ? `Viewing: ${viewAs?.name}` : "View as user"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl z-50 overflow-hidden" style={{ border: "0.5px solid var(--border,#e0d9cb)" }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a user…"
              className="w-full px-3 py-2.5 text-sm outline-none border-b"
              style={{ borderColor: "var(--border,#e0d9cb)", color: "#2c2c2a" }}
            />
            <div className="max-h-72 overflow-y-auto py-1">
              {isImpersonating && (
                <button onClick={() => { setViewAs(null); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-[var(--cream,#f5efe4)]" style={{ color: "var(--brand-primary)" }}>
                  ← Back to my own view
                </button>
              )}
              {users.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">No users</div>
              ) : (
                users.map((u) => (
                  <button key={u.email} onClick={() => pick(u)}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--cream,#f5efe4)]">
                    <div className="text-[13px] text-gray-900 flex items-center gap-1.5">
                      {u.name}
                      {u.is_admin && <span className="text-[9px] font-semibold px-1.5 rounded" style={{ background: "var(--gold)", color: "var(--brand-primary)" }}>admin</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">{u.designation || u.email}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function TopBar({ onToggleSidebar, onOpenSearch }: TopBarProps) {
  const { realUser, logout, isRealAdmin, isImpersonating, viewAs, setViewAs } = useAuth()

  const initials = realUser?.full_name
    ? realUser.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "HR"

  return (
    <>
      {/* Preview banner */}
      {isImpersonating && (
        <div className="no-print flex items-center justify-center gap-3 text-[12px] font-medium px-4 py-1.5"
          style={{ background: "var(--brand-primary,#1e3a2f)", color: "var(--gold-light,#d4b675)" }}>
          <Eye size={13} />
          <span>Previewing the interface as <strong style={{ color: "#fff" }}>{viewAs?.name}</strong> — data still loads with your admin access.</span>
          <button onClick={() => setViewAs(null)} className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
            <X size={11} /> Exit preview
          </button>
        </div>
      )}

      <header className="no-print h-14 border-b border-gray-200 bg-white shadow-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <Menu size={18} />
          </button>

          {/* Global search — opens the command palette (also Ctrl/Cmd+K) */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-800 transition-colors"
            style={{ borderColor: "var(--border, #e0d9cb)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--gold)" }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border, #e0d9cb)" }}
          >
            <span aria-hidden>🔍</span>
            <span>Search</span>
            <kbd className="rounded px-1.5 py-0.5 text-[10px] text-gray-500" style={{ background: "var(--cream-dark, #ebe3d3)" }}>Ctrl K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin-only interface preview switcher */}
          {isRealAdmin && <ViewAsSwitcher />}

          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback className="bg-forest-700 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {realUser && (
                <>
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{realUser.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{realUser.name}</p>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem className="text-red-600 cursor-pointer" onClick={() => logout()}>
                <LogOut size={14} className="mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  )
}
