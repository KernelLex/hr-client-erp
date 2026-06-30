import { ADMIN_USERS, OWAIS_USERS } from "@/lib/constants"
import { useState, useEffect } from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  UserCircle,
  ChevronRight,
  Clock,
  CalendarDays,
  Receipt,
  Users,
  Briefcase,
  BookOpen,
  FileText,
  UploadCloud,
  TrendingUp,
  BarChart2,
  LineChart,
  Bot,
  Shield,
  LogOut,
  Minus,
  CheckSquare,
  MessageSquare,
  Activity,
} from "lucide-react"
import { useUnreadCounts } from "@/pages/chat/useChat"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { usePermissions } from "@/context/PermissionsContext"


function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

// ─── Reusable pieces ─────────────────────────────────────────────────────────

function AdminBadge() {
  return (
    <span
      className="ml-auto text-[10px] font-semibold rounded px-1.5 py-0.5"
      style={{ backgroundColor: "#312e81", color: "#a5b4fc" }}
    >
      admin
    </span>
  )
}

function SoonBadge() {
  return (
    <span
      className="ml-auto text-[10px] font-semibold rounded px-1.5 py-0.5"
      style={{ backgroundColor: "#1E293B", color: "#64748B" }}
    >
      soon
    </span>
  )
}

// A top-level single nav link
function NavItem({
  to,
  label,
  icon: Icon,
  end = false,
  adminBadge = false,
  unreadCount = 0,
  onClick,
}: {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
  adminBadge?: boolean
  unreadCount?: number
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap",
          isActive ? "text-white" : "text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-white/5"
        )
      }
      style={({ isActive }) =>
        isActive
          ? {
              backgroundColor: "var(--bg-sidebar-active)",
              color: "var(--text-sidebar-active)",
              boxShadow: "0 2px 8px rgba(79,70,229,0.4)",
            }
          : {}
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={15} style={{ color: isActive ? "#FFFFFF" : "#64748B" }} />
          <span className="flex-1">{label}</span>
          {adminBadge && <AdminBadge />}
          {unreadCount > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// A child item inside a dropdown group — uses manual isActive
function SubItem({
  to,
  label,
  icon: Icon,
  isActive,
  adminBadge = false,
  indent = false,
  onClick,
}: {
  to: string
  label: string
  icon: React.ElementType | null
  isActive: boolean
  adminBadge?: boolean
  indent?: boolean
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap",
        indent ? "pl-8 pr-3" : "pl-5 pr-3",
        isActive
          ? "text-white"
          : "text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-white/5"
      )}
      style={
        isActive
          ? {
              backgroundColor: "var(--bg-sidebar-active)",
              color: "var(--text-sidebar-active)",
              boxShadow: "0 2px 8px rgba(79,70,229,0.4)",
            }
          : {}
      }
    >
      {Icon ? (
        <Icon size={13} style={{ color: isActive ? "#FFFFFF" : "#64748B" }} />
      ) : (
        <Minus size={10} style={{ color: isActive ? "#c7d2fe" : "#334155" }} />
      )}
      <span>{label}</span>
      {adminBadge && <AdminBadge />}
    </NavLink>
  )
}

// Disabled item (coming soon)
function DisabledItem({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium cursor-not-allowed select-none whitespace-nowrap"
      title="Coming soon"
      style={{ color: "#475569" }}
    >
      <Icon size={15} style={{ color: "#334155" }} />
      <span>{label}</span>
      <SoonBadge />
    </div>
  )
}

// Dropdown group header button
function GroupHeader({
  label,
  icon: Icon,
  open,
  active,
  onToggle,
}: {
  label: string
  icon: React.ElementType
  open: boolean
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150",
        active
          ? "text-[#A5B4FC]"
          : "text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-white/5"
      )}
    >
      <Icon size={15} style={{ color: active ? "#A5B4FC" : "#64748B" }} />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight
        size={13}
        className="transition-transform duration-200 shrink-0"
        style={{
          color: "#475569",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
        }}
      />
    </button>
  )
}

// Separator line
function Sep() {
  return <div className="mx-3 my-1.5 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

function readLS(key: string, defaultVal: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? defaultVal : v === "true"
  } catch {
    return defaultVal
  }
}

export function Sidebar({ open = true, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const { moduleEnabled } = usePermissions()
  const location = useLocation()
  const { data: unreadData } = useUnreadCounts()
  const totalUnread = unreadData?.total_unread ?? 0

  const isAdmin = !!(user && ADMIN_USERS.has(user.name))

  // Dropdown open state — persisted in localStorage
  const [hrOpen, setHrOpen] = useState(() => readLS("sidebar_hr_open", true))
  const [accountsOpen, setAccountsOpen] = useState(() => readLS("sidebar_accounts_open", true))

  // Auto-expand the group that contains the active route
  useEffect(() => {
    const p = location.pathname
    if (p.startsWith("/admin/attendance") || p === "/leave" || p.startsWith("/expenses") || p.startsWith("/admin/employees") || p === "/holidays") {
      setHrOpen(true)
    }
    if (p.startsWith("/accounts") || p === "/drive" || p === "/verify" || p === "/ai-insights" || p === "/graphs") {
      setAccountsOpen(true)
    }
  }, [location.pathname])

  function toggleHR() {
    setHrOpen((v) => {
      const next = !v
      try { localStorage.setItem("sidebar_hr_open", String(next)) } catch {}
      return next
    })
  }

  function toggleAccounts() {
    setAccountsOpen((v) => {
      const next = !v
      try { localStorage.setItem("sidebar_accounts_open", String(next)) } catch {}
      return next
    })
  }

  // Close sidebar on mobile when a nav item is clicked
  function close() {
    if (window.innerWidth < 768) onClose?.()
  }

  // Active-state helpers
  const path = location.pathname
  const search = location.search

  const isAttendanceActive = path.startsWith("/admin/attendance")
  const isHolidaysActive = path === "/holidays"
  const isLeaveActive = path === "/leave"
  const isExpensesActive = path.startsWith("/expenses")
  const isTeamActive = path.startsWith("/admin/employees")
  const isHrGroupActive = isAttendanceActive || isHolidaysActive || isLeaveActive || isExpensesActive || isTeamActive

  const isAccountsDocActive = path === "/drive"
  const isAccountsUploadActive = path === "/accounts" && search === "?tab=upload"

  const isVerifyActive = path === "/verify"
  const isAIInsightsActive = path === "/ai-insights"
  const isGraphsActive = path === "/graphs"
  const isAccountsGroupActive = path === "/drive" || path.startsWith("/accounts") || path === "/verify" || path === "/ai-insights" || path === "/graphs"

  // Permissions
  const showAttendance = moduleEnabled("attendance")
  const showLeave = moduleEnabled("leave")
  const showRecruitment = moduleEnabled("recruitment")
  const showAccounts = moduleEnabled("accounts")
  const showCRM = moduleEnabled("crm")
  const showChat = moduleEnabled("chat")

  const sidebarBody = (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-sidebar)", boxShadow: "var(--shadow-sidebar)" }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            <span className="text-white font-bold text-xs">V</span>
          </div>
          <span className="text-white font-bold text-[17px] tracking-tight whitespace-nowrap">Vera ERP</span>
        </div>
        <div className="mt-3 h-px" style={{ backgroundColor: "rgba(79,70,229,0.4)" }} />
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-1 px-2 space-y-0.5 overflow-y-auto">

        {/* Dashboard */}
        <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end onClick={close} />

        {/* My Profile */}
        <NavItem to="/my-profile" label="My Profile" icon={UserCircle} onClick={close} />

        <Sep />

        {/* HR group */}
        <GroupHeader
          label="HR"
          icon={Users}
          open={hrOpen}
          active={isHrGroupActive}
          onToggle={toggleHR}
        />
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ maxHeight: hrOpen ? "400px" : "0px", opacity: hrOpen ? 1 : 0 }}
        >
          <div className="pt-0.5 space-y-0.5">
            {showAttendance && (
              <>
                <SubItem
                  to="/admin/attendance"
                  label="Attendance"
                  icon={Clock}
                  isActive={isAttendanceActive}
                  onClick={close}
                />
                <SubItem
                  to="/holidays"
                  label="Holidays"
                  icon={null}
                  isActive={isHolidaysActive}
                  indent
                  onClick={close}
                />
              </>
            )}
            {showLeave && (
              <SubItem
                to="/leave"
                label="Leave"
                icon={CalendarDays}
                isActive={isLeaveActive}
                onClick={close}
              />
            )}
            <SubItem
              to="/expenses"
              label="Expenses"
              icon={Receipt}
              isActive={isExpensesActive}
              onClick={close}
            />
            {isAdmin && (
              <SubItem
                to="/admin/employees"
                label="Team"
                icon={Users}
                isActive={isTeamActive}
                adminBadge
                onClick={close}
              />
            )}
          </div>
        </div>

        <Sep />

        {/* Recruitment */}
        {showRecruitment && (
          <NavItem to="/recruitment" label="Recruitment" icon={Briefcase} onClick={close} />
        )}

        <Sep />

        {/* Accounts group */}
        {showAccounts && (
          <>
            <GroupHeader
              label="Accounts"
              icon={BookOpen}
              open={accountsOpen}
              active={isAccountsGroupActive}
              onToggle={toggleAccounts}
            />
            <div
              className="overflow-hidden transition-all duration-200"
              style={{ maxHeight: accountsOpen ? "400px" : "0px", opacity: accountsOpen ? 1 : 0 }}
            >
              <div className="pt-0.5 space-y-0.5">
                <SubItem
                  to="/drive"
                  label="Drive Documents"
                  icon={FileText}
                  isActive={isAccountsDocActive}
                  onClick={close}
                />
                <SubItem
                  to="/accounts?tab=upload"
                  label="Upload Status"
                  icon={UploadCloud}
                  isActive={isAccountsUploadActive}
                  onClick={close}
                />
                {isAdmin && (
                  <>
                    <SubItem
                      to="/verify"
                      label="Verify Data"
                      icon={CheckSquare}
                      isActive={isVerifyActive}
                      adminBadge
                      onClick={close}
                    />
                    <SubItem
                      to="/ai-insights"
                      label="AI Insights"
                      icon={Bot}
                      isActive={isAIInsightsActive}
                      onClick={close}
                    />
                    <SubItem
                      to="/graphs"
                      label="Graphs"
                      icon={LineChart}
                      isActive={isGraphsActive}
                      onClick={close}
                    />
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <Sep />

        {/* Operations — admin only */}
        {isAdmin && (
          <NavItem
            to="/operations"
            label="Operations"
            icon={Activity}
            adminBadge
            onClick={close}
          />
        )}

        {/* CRM */}
        {showCRM && (
          <NavItem to="/crm" label="CRM" icon={TrendingUp} onClick={close} />
        )}

        {/* Chat */}
        {showChat && (
          <NavItem
            to="/chat"
            label="Chat"
            icon={MessageSquare}
            unreadCount={totalUnread}
            onClick={close}
          />
        )}

        <DisabledItem label="Performance" icon={BarChart2} />

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <Sep />
            <NavItem
              to="/admin/users"
              label="User Management"
              icon={Users}
              adminBadge
              onClick={close}
            />
            <NavItem
              to="/admin/permissions"
              label="Permissions"
              icon={Shield}
              adminBadge
              onClick={close}
            />
          </>
        )}
      </nav>

      {/* Bottom profile + sign out */}
      <div
        className="shrink-0 px-3 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2.5 mb-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            {user?.full_name ? getInitials(user.full_name) : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">
              {user?.full_name ?? "—"}
            </p>
            <p className="text-[11px] truncate leading-tight" style={{ color: "#64748B" }}>
              {user?.name ?? ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2 text-xs rounded-md px-2 py-1.5 transition-colors"
          style={{ color: "#64748B" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#1E293B"
            e.currentTarget.style.color = "#94A3B8"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.color = "#64748B"
          }}
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop inline sidebar — collapses width */}
      <div
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
          open ? "w-[220px]" : "w-0"
        )}
      >
        {sidebarBody}
      </div>

      {/* Mobile fixed overlay sidebar — slides in/out */}
      <div
        className={cn(
          "flex flex-col md:hidden fixed inset-y-0 left-0 z-30 w-[220px] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarBody}
      </div>
    </>
  )
}
