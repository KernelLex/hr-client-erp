import { ADMIN_USERS } from "@/lib/constants"
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
  UploadCloud,
  TrendingUp,
  Bot,
  Shield,
  LogOut,
  Minus,
  CheckSquare,
  MessageSquare,
  Landmark,
  Package,
  ShoppingBag,
  Truck,
  Undo2,
  FileStack,
  LineChart,
  UsersRound,
  BarChart2,
  Building2,
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
      style={{ backgroundColor: "var(--gold)", color: "var(--brand-primary)" }}
    >
      admin
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
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap border-l-[3px]",
          isActive ? "text-white" : "text-[#d4c8a8] hover:text-white hover:bg-white/5 border-transparent"
        )
      }
      style={({ isActive }) =>
        isActive
          ? { backgroundColor: "var(--bg-sidebar-hover)", color: "#fff", borderLeftColor: "var(--gold)" }
          : {}
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={15} style={{ color: isActive ? "var(--gold)" : "#8a9c8a" }} />
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
        "flex items-center gap-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap border-l-[3px]",
        indent ? "pl-8 pr-3" : "pl-5 pr-3",
        isActive ? "text-white" : "text-[#d4c8a8] hover:text-white hover:bg-white/5 border-transparent"
      )}
      style={isActive ? { backgroundColor: "var(--bg-sidebar-hover)", color: "#fff", borderLeftColor: "var(--gold)" } : {}}
    >
      {Icon ? (
        <Icon size={13} style={{ color: isActive ? "var(--gold)" : "#8a9c8a" }} />
      ) : (
        <Minus size={10} style={{ color: isActive ? "var(--gold)" : "#4a6354" }} />
      )}
      <span>{label}</span>
      {adminBadge && <AdminBadge />}
    </NavLink>
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
        active ? "text-white" : "text-[#d4c8a8] hover:text-white hover:bg-white/5"
      )}
    >
      <Icon size={15} style={{ color: active ? "var(--gold)" : "#8a9c8a" }} />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight
        size={13}
        className="transition-transform duration-200 shrink-0"
        style={{ color: "#5c7364", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
      />
    </button>
  )
}

// Section title (e.g. OVERVIEW, OPERATIONS)
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 pt-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: "#8a9c8a" }}
    >
      {children}
    </div>
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
  const [salesOpen, setSalesOpen] = useState(() => readLS("sidebar_sales_open", true))
  const [docsOpen, setDocsOpen] = useState(() => readLS("sidebar_docs_open", false))
  const [adminOpen, setAdminOpen] = useState(() => readLS("sidebar_admin_open", false))

  // Auto-expand the group that contains the active route
  useEffect(() => {
    const p = location.pathname
    if (p.startsWith("/admin/attendance") || p === "/leave" || p.startsWith("/expenses") || p.startsWith("/admin/employees") || p === "/holidays" || p === "/recruitment" || p.startsWith("/recruitment/")) {
      setHrOpen(true)
    }
    if (p === "/crm" || p.startsWith("/crm/") || p === "/sales-register") {
      setSalesOpen(true)
    }
    if (p === "/drive" || p.startsWith("/accounts") || p === "/verify" || p === "/ai-insights" || p === "/graphs") {
      setDocsOpen(true)
    }
    if (p === "/admin/users" || p === "/admin/permissions") {
      setAdminOpen(true)
    }
  }, [location.pathname])

  function makeToggle(setter: React.Dispatch<React.SetStateAction<boolean>>, key: string) {
    return () => setter((v) => {
      const next = !v
      try { localStorage.setItem(key, String(next)) } catch { /* localStorage unavailable */ }
      return next
    })
  }
  const toggleHR = makeToggle(setHrOpen, "sidebar_hr_open")
  const toggleSales = makeToggle(setSalesOpen, "sidebar_sales_open")
  const toggleDocs = makeToggle(setDocsOpen, "sidebar_docs_open")
  const toggleAdmin = makeToggle(setAdminOpen, "sidebar_admin_open")

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
  const isRecruitmentActive = path.startsWith("/recruitment")
  const isHrGroupActive = isAttendanceActive || isHolidaysActive || isLeaveActive || isExpensesActive || isTeamActive || isRecruitmentActive

  const isPipelineActive = path === "/crm" || path.startsWith("/crm/")
  const isSalesRegisterActive = path === "/sales-register"
  const isSalesGroupActive = isPipelineActive || isSalesRegisterActive

  const isAccountsDocActive = path === "/drive"
  const isAccountsUploadActive = path === "/accounts" && search === "?tab=upload"
  const isVerifyActive = path === "/verify"
  const isAIInsightsActive = path === "/ai-insights"
  const isGraphsActive = path === "/graphs"
  const isDocsGroupActive = isAccountsDocActive || path.startsWith("/accounts") || isVerifyActive || isAIInsightsActive || isGraphsActive

  const isUsersActive = path === "/admin/users"
  const isPermsActive = path === "/admin/permissions"
  const isOrgHubActive = path === "/org-hub" || path === "/admin/org-hub"
  const isAdminGroupActive = isUsersActive || isPermsActive

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
            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-heading text-base"
            style={{ background: "linear-gradient(150deg, var(--gold-light), var(--gold))", color: "var(--brand-primary)" }}
          >
            V
          </div>
          <div className="leading-tight">
            <div className="font-heading text-[16px] text-white whitespace-nowrap">Vera Enterprises</div>
            <div className="text-[9px] tracking-widest" style={{ color: "#8a9c8a" }}>ERP WORKSPACE</div>
          </div>
        </div>
        <div className="mt-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-1 px-2 space-y-0.5 overflow-y-auto">

        <SectionTitle>Overview</SectionTitle>
        <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end onClick={close} />
        <NavItem to="/my-profile" label="My Profile" icon={UserCircle} onClick={close} />
        {showChat && (
          <NavItem to="/chat" label="Chat" icon={MessageSquare} unreadCount={totalUnread} onClick={close} />
        )}

        <Sep />
        <SectionTitle>Operations</SectionTitle>

        {/* Sales (CRM) group */}
        {showCRM && (
          <>
            <GroupHeader label="Sales (CRM)" icon={TrendingUp} open={salesOpen} active={isSalesGroupActive} onToggle={toggleSales} />
            <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: salesOpen ? "200px" : "0px", opacity: salesOpen ? 1 : 0 }}>
              <div className="pt-0.5 space-y-0.5">
                <SubItem to="/crm" label="Pipeline" icon={Briefcase} isActive={isPipelineActive} onClick={close} />
                {isAdmin && (
                  <SubItem to="/sales-register" label="Sales Register" icon={Receipt} isActive={isSalesRegisterActive} adminBadge onClick={close} />
                )}
              </div>
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <NavItem to="/inventory" label="Inventory" icon={Package} adminBadge onClick={close} />
            <NavItem to="/purchasing" label="Purchasing" icon={ShoppingBag} adminBadge onClick={close} />
            <NavItem to="/logistics" label="Logistics" icon={Truck} adminBadge onClick={close} />
            <NavItem to="/returns" label="Returns" icon={Undo2} adminBadge onClick={close} />
          </>
        )}

        <Sep />
        <SectionTitle>Finance &amp; Governance</SectionTitle>
        {isAdmin && (
          <>
            <NavItem to="/accounting" label="Accounting" icon={Landmark} adminBadge onClick={close} />
            <NavItem to="/accounts-dashboard" label="Accounts Dashboard" icon={BarChart2} adminBadge onClick={close} />
          </>
        )}

        <Sep />
        <SectionTitle>People &amp; Work</SectionTitle>

        {/* HRMS group */}
        <GroupHeader label="HRMS" icon={UsersRound} open={hrOpen} active={isHrGroupActive} onToggle={toggleHR} />
        <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: hrOpen ? "400px" : "0px", opacity: hrOpen ? 1 : 0 }}>
          <div className="pt-0.5 space-y-0.5">
            {showAttendance && (
              <>
                <SubItem to="/admin/attendance" label="Attendance" icon={Clock} isActive={isAttendanceActive} onClick={close} />
                <SubItem to="/holidays" label="Holidays" icon={null} isActive={isHolidaysActive} indent onClick={close} />
              </>
            )}
            {showLeave && (
              <SubItem to="/leave" label="Leave" icon={CalendarDays} isActive={isLeaveActive} onClick={close} />
            )}
            <SubItem to="/expenses" label="Expenses" icon={Receipt} isActive={isExpensesActive} onClick={close} />
            {showRecruitment && (
              <SubItem to="/recruitment" label="Recruitment" icon={Briefcase} isActive={isRecruitmentActive} onClick={close} />
            )}
            {isAdmin && (
              <SubItem to="/admin/employees" label="Team" icon={Users} isActive={isTeamActive} adminBadge onClick={close} />
            )}
          </div>
        </div>
        <NavItem to="/org-hub" label="Org Hub" icon={Building2} onClick={close} />

        <Sep />
        <SectionTitle>Platform</SectionTitle>

        {/* Document Management group */}
        {showAccounts && (
          <>
            <GroupHeader label="Document Management" icon={FileStack} open={docsOpen} active={isDocsGroupActive} onToggle={toggleDocs} />
            <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: docsOpen ? "400px" : "0px", opacity: docsOpen ? 1 : 0 }}>
              <div className="pt-0.5 space-y-0.5">
                <SubItem to="/drive" label="Drive Documents" icon={BookOpen} isActive={isAccountsDocActive} onClick={close} />
                <SubItem to="/accounts?tab=upload" label="Upload Status" icon={UploadCloud} isActive={isAccountsUploadActive} onClick={close} />
                {isAdmin && (
                  <>
                    <SubItem to="/verify" label="Verify Data" icon={CheckSquare} isActive={isVerifyActive} adminBadge onClick={close} />
                    <SubItem to="/ai-insights" label="AI Insights" icon={Bot} isActive={isAIInsightsActive} onClick={close} />
                    <SubItem to="/graphs" label="Graphs" icon={LineChart} isActive={isGraphsActive} onClick={close} />
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Administration group */}
        {isAdmin && (
          <>
            <GroupHeader label="Administration" icon={Shield} open={adminOpen} active={isAdminGroupActive} onToggle={toggleAdmin} />
            <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: adminOpen ? "200px" : "0px", opacity: adminOpen ? 1 : 0 }}>
              <div className="pt-0.5 space-y-0.5">
                <SubItem to="/admin/users" label="User Management" icon={Users} isActive={isUsersActive} adminBadge onClick={close} />
                <SubItem to="/admin/permissions" label="Permissions" icon={Shield} isActive={isPermsActive} adminBadge onClick={close} />
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Bottom profile + sign out */}
      <div className="shrink-0 px-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2.5 mb-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
            style={{ background: "linear-gradient(150deg, var(--gold-light), var(--gold))", color: "var(--brand-primary)" }}
          >
            {user?.full_name ? getInitials(user.full_name) : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">
              {user?.full_name ?? "—"}
            </p>
            <p className="text-[11px] truncate leading-tight" style={{ color: "#8a9c8a" }}>
              {user?.name ?? ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2 text-xs rounded-md px-2 py-1.5 transition-colors"
          style={{ color: "#8a9c8a" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-sidebar-hover)"
            e.currentTarget.style.color = "#d4c8a8"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
            e.currentTarget.style.color = "#8a9c8a"
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
          "no-print hidden md:flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
          open ? "w-[240px]" : "w-0"
        )}
      >
        {sidebarBody}
      </div>

      {/* Mobile fixed overlay sidebar — slides in/out */}
      <div
        className={cn(
          "no-print flex flex-col md:hidden fixed inset-y-0 left-0 z-30 w-[240px] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarBody}
      </div>
    </>
  )
}
