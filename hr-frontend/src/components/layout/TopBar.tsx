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
import { LogOut, Menu, Eye, X, Moon, Sun, Rows3 } from "lucide-react"
import { api, apiUrl } from "@/lib/api"
import { useAuth, type ViewAsUser } from "@/context/AuthContext"
import { useCompany, ALL_COMPANIES } from "@/context/CompanyContext"
import { CompanySwitcher } from "./CompanySwitcher"
import { getTheme, toggleTheme as toggleThemePref, cycleDensity } from "@/lib/uiPrefs"

// Density + light/dark controls (monochrome overhaul). State is local to force
// a re-render; the actual preference lives on <html> + localStorage.
function DisplayControls() {
  const [theme, setThemeState] = useState(getTheme())
  return (
    <div className="flex items-center gap-1">
      <button
        title="Density"
        onClick={() => cycleDensity()}
        className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--overlay-hover)]"
        style={{ color: "var(--text-secondary)" }}
      >
        <Rows3 size={16} />
      </button>
      <button
        title="Theme"
        onClick={() => setThemeState(toggleThemePref())}
        className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--overlay-hover)]"
        style={{ color: "var(--text-secondary)" }}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}

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
        style={{ borderColor: isImpersonating ? "var(--border-strong)" : "var(--border-control)", color: isImpersonating ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        <Eye size={13} />
        {isImpersonating ? `Viewing: ${viewAs?.name}` : "View as user"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 rounded-xl z-50 overflow-hidden" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-3)" }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a user…"
              className="w-full px-3 py-2.5 text-sm outline-none border-b bg-transparent"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
            <div className="max-h-72 overflow-y-auto py-1">
              {isImpersonating && (
                <button onClick={() => { setViewAs(null); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-[var(--overlay-hover)]" style={{ color: "var(--text-primary)" }}>
                  ← Back to my own view
                </button>
              )}
              {users.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>No users</div>
              ) : (
                users.map((u) => (
                  <button key={u.email} onClick={() => pick(u)}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--overlay-hover)]">
                    <div className="text-[13px] flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                      {u.name}
                      {u.is_admin && <span className="ui-badge" style={{ height: 16 }}>admin</span>}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{u.designation || u.email}</div>
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
  const { activeCompany, availableCompanies } = useCompany()

  const companyLabel =
    activeCompany === ALL_COMPANIES
      ? "All Companies"
      : availableCompanies.find((c) => c.name === activeCompany)?.label || activeCompany || "Vera ERP"

  const initials = realUser?.full_name
    ? realUser.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "HR"

  return (
    <>
      {/* Preview banner */}
      {isImpersonating && (
        <div className="no-print flex items-center justify-center gap-3 text-[12px] font-medium px-4 py-1.5"
          style={{ background: "var(--bg-inverse)", color: "var(--text-inverse)" }}>
          <Eye size={13} />
          <span>Previewing the interface as <strong>{viewAs?.name}</strong> — data still loads with your admin access.</span>
          <button onClick={() => setViewAs(null)} className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: "rgba(255,255,255,0.18)", color: "var(--text-inverse)" }}>
            <X size={11} /> Exit preview
          </button>
        </div>
      )}

      <header
        className="no-print h-14 flex items-center justify-between px-4 shrink-0"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--overlay-hover)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Menu size={18} />
          </button>

          {/* Active company name — always reflects the workspace you're in */}
          <div className="hidden sm:flex items-center gap-2 pl-1 pr-2 mr-1 border-r" style={{ borderColor: "var(--border-subtle)" }}>
            <span className="text-[15px] font-semibold whitespace-nowrap max-w-[180px] truncate" style={{ color: "var(--text-primary)", letterSpacing: "-.01em" }}>
              {companyLabel}
            </span>
          </div>

          {/* Global search — opens the command palette (also Ctrl/Cmd+K) */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--overlay-hover)]"
            style={{ borderColor: "var(--border-control)", color: "var(--text-tertiary)" }}
          >
            <span aria-hidden>⚲</span>
            <span>Search</span>
            <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ border: "1px solid var(--border-subtle)" }}>⌘K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Density + light/dark controls */}
          <DisplayControls />

          {/* Active company switcher — always visible when >1 company is accessible */}
          <CompanySwitcher />

          {/* Admin-only interface preview switcher */}
          {isRealAdmin && <ViewAsSwitcher />}

          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback className="text-xs font-semibold" style={{ background: "var(--bg-inverse)", color: "var(--text-inverse)" }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {realUser && (
                <>
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{realUser.full_name}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{realUser.name}</p>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem className="cursor-pointer" onClick={() => logout()}>
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
