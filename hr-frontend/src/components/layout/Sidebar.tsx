import { ADMIN_USERS } from "@/lib/constants"
import { useState, useEffect } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { LogOut } from "lucide-react"
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

// Unicode glyph icon (matches the reference sidebar's geometric symbols)
function Glyph({ char, active }: { char: string; active: boolean }) {
  return (
    <span
      className="w-4 text-center shrink-0 text-[14px] leading-none"
      style={{ color: active ? "var(--gold)" : "#8a9c8a" }}
    >
      {char}
    </span>
  )
}

// A top-level single nav link (with a glyph)
function NavItem({
  to,
  label,
  glyph,
  end = false,
  adminBadge = false,
  unreadCount = 0,
  onClick,
}: {
  to: string
  label: string
  glyph: string
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
          "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap border-l-[3px]",
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
          <Glyph char={glyph} active={isActive} />
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

// A child item inside a dropdown group — real navigation link, text-row style
// (no per-item icon), matching the reference `.nav-sub-item`.
function SubItem({
  to,
  label,
  isActive,
  adminBadge = false,
  indent = false,
  onClick,
}: {
  to: string
  label: string
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
        "flex items-center gap-2 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150 whitespace-nowrap border-l-[3px]",
        indent ? "pl-11 pr-3" : "pl-9 pr-3",
        isActive ? "text-white" : "text-[#d4c8a8]/85 hover:text-white hover:bg-white/5 border-transparent"
      )}
      style={isActive ? { backgroundColor: "var(--bg-sidebar-hover)", color: "#fff", borderLeftColor: "var(--gold)" } : {}}
    >
      <span className="flex-1">{label}</span>
      {adminBadge && <AdminBadge />}
    </NavLink>
  )
}

// Dropdown group header button (glyph + label + rotating arrow)
function GroupHeader({
  label,
  glyph,
  open,
  active,
  onToggle,
}: {
  label: string
  glyph: string
  open: boolean
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
        active ? "text-white" : "text-[#d4c8a8] hover:text-white hover:bg-white/5"
      )}
    >
      <Glyph char={glyph} active={active} />
      <span className="flex-1 text-left">{label}</span>
      <span
        className="text-[13px] leading-none transition-transform duration-200 shrink-0"
        style={{ color: "#5c7364", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
      >
        ›
      </span>
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

// Collapsible group body
function GroupBody({ open, maxHeight, children }: { open: boolean; maxHeight: number; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden transition-all duration-200"
      style={{ maxHeight: open ? `${maxHeight}px` : "0px", opacity: open ? 1 : 0 }}
    >
      <div className="pt-0.5 space-y-0.5">{children}</div>
    </div>
  )
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
  const { can } = usePermissions()
  const location = useLocation()
  const { data: unreadData } = useUnreadCounts()
  const totalUnread = unreadData?.total_unread ?? 0

  const isAdmin = !!(user && ADMIN_USERS.has(user.name))

  // Dropdown open state — persisted in localStorage
  const [salesOpen, setSalesOpen] = useState(() => readLS("sidebar_sales_open", true))
  const [quotationOpen, setQuotationOpen] = useState(() => readLS("sidebar_quotation_open", false))
  const [accountingOpen, setAccountingOpen] = useState(() => readLS("sidebar_accounting_open", false))
  const [hrOpen, setHrOpen] = useState(() => readLS("sidebar_hr_open", true))
  const [todoOpen, setTodoOpen] = useState(() => readLS("sidebar_todo_open", true))
  const [docsOpen, setDocsOpen] = useState(() => readLS("sidebar_docs_open", false))
  const [adminOpen, setAdminOpen] = useState(() => readLS("sidebar_admin_open", false))

  // Auto-expand the group that contains the active route
  useEffect(() => {
    const p = location.pathname
    if (p === "/crm" || p.startsWith("/crm/") || p === "/sales-register") setSalesOpen(true)
    if (p.startsWith("/quotation/")) setQuotationOpen(true)
    if (p === "/accounting-module") setAccountingOpen(true)
    if (
      p.startsWith("/admin/attendance") || p === "/leave" || p.startsWith("/expenses") ||
      p.startsWith("/admin/employees") || p === "/holidays" || p.startsWith("/recruitment") ||
      p.startsWith("/hrms/")
    ) setHrOpen(true)
    if (p.startsWith("/todo/")) setTodoOpen(true)
    if (p === "/drive" || p.startsWith("/accounts") || p === "/verify" || p === "/ai-insights" || p === "/graphs") setDocsOpen(true)
    if (p === "/admin/users" || p === "/admin/permissions") setAdminOpen(true)
  }, [location.pathname])

  function makeToggle(setter: React.Dispatch<React.SetStateAction<boolean>>, key: string) {
    return () => setter((v) => {
      const next = !v
      try { localStorage.setItem(key, String(next)) } catch { /* localStorage unavailable */ }
      return next
    })
  }
  const toggleSales = makeToggle(setSalesOpen, "sidebar_sales_open")
  const toggleQuotation = makeToggle(setQuotationOpen, "sidebar_quotation_open")
  const toggleAccounting = makeToggle(setAccountingOpen, "sidebar_accounting_open")
  const toggleHR = makeToggle(setHrOpen, "sidebar_hr_open")
  const toggleTodo = makeToggle(setTodoOpen, "sidebar_todo_open")
  const toggleDocs = makeToggle(setDocsOpen, "sidebar_docs_open")
  const toggleAdmin = makeToggle(setAdminOpen, "sidebar_admin_open")

  // Close sidebar on mobile when a nav item is clicked
  function close() {
    if (window.innerWidth < 768) onClose?.()
  }

  // Active-state helpers
  const path = location.pathname
  const search = location.search

  const CRM_SUBROUTES = ["/crm/enquiries", "/crm/opportunities", "/crm/contacts", "/crm/team", "/crm/followups"]
  const isPipelineActive = path === "/crm" || (path.startsWith("/crm/") && !CRM_SUBROUTES.includes(path))
  const isSalesRegisterActive = path === "/sales-register"
  const isSalesGroupActive = isPipelineActive || isSalesRegisterActive

  const isQuotationGroupActive = path.startsWith("/quotation/")

  const acct = (tab: string) => path === "/accounting-module" && search === `?tab=${tab}`
  const isAccountingGroupActive = path === "/accounting-module"

  const isAttendanceActive = path.startsWith("/admin/attendance")
  const isHolidaysActive = path === "/holidays"
  const isLeaveActive = path === "/leave"
  const isExpensesActive = path.startsWith("/expenses")
  const isTeamActive = path.startsWith("/admin/employees")
  const isRecruitmentActive = path.startsWith("/recruitment")
  const isEmpMasterActive = path === "/hrms/employees"
  const isDepartmentsActive = path === "/hrms/departments"
  const isDesignationsActive = path === "/hrms/designations"
  const isShiftsActive = path === "/hrms/shifts"
  const isShiftAssignActive = path === "/hrms/shift-assignments"
  const isTrainingActive = path === "/hrms/training"
  const isTrainingSessActive = path === "/hrms/training-sessions"
  const isExitActive = path === "/hrms/exit"
  const isPayrollActive = path === "/hrms/payroll"
  const isSalaryAssignActive = path === "/hrms/salary-assignments"
  const isPayrollRunsActive = path === "/hrms/payroll-runs"
  const isSalarySlipsActive = path === "/hrms/salary-slips"
  const isOnboardingActive = path === "/hrms/onboarding"
  const isApprCyclesActive = path === "/hrms/appraisal-cycles"
  const isApprsActive = path === "/hrms/appraisals"
  const isHrGroupActive = isAttendanceActive || isHolidaysActive || isLeaveActive || isExpensesActive || isTeamActive || isRecruitmentActive || path.startsWith("/hrms/")

  const isPersonalTasksActive = path === "/todo/personal"
  const isTeamTasksActive = path === "/todo/team"
  const isApprovalsActive = path === "/todo/approvals"
  const isRemindersActive = path === "/todo/reminders"
  const isCalendarActive = path === "/todo/calendar"
  const isMeetingsActive = path === "/todo/meetings"
  const isNotesActive = path === "/todo/notes"
  const isTodoGroupActive = path.startsWith("/todo/")

  const isAccountsDocActive = path === "/drive"
  const isAccountsUploadActive = path === "/accounts" && search === "?tab=upload"
  const isVerifyActive = path === "/verify"
  const isAIInsightsActive = path === "/ai-insights"
  const isGraphsActive = path === "/graphs"
  const isDocsGroupActive = isAccountsDocActive || path.startsWith("/accounts") || isVerifyActive || isAIInsightsActive || isGraphsActive

  const isUsersActive = path === "/admin/users"
  const isPermsActive = path === "/admin/permissions"
  const isAdminGroupActive = isUsersActive || isPermsActive

  // Permissions — registry-driven (can() also checks the parent group key)
  const showAttendance = can("attendance")
  const showLeave = can("leave")
  const showRecruitment = can("recruitment")
  const showExpense = can("expense")
  const showHolidays = can("hrms.holidays")
  const showHrms = can("hrms")
  const showAccounts = can("accounts")
  const showCRM = can("crm")
  const showQuotation = can("quotation")
  const showChat = can("chat")
  const showOrgHub = can("org_hub")
  const showTodo = can("todo")

  const sidebarBody = (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-sidebar)", boxShadow: "var(--shadow-sidebar)" }}
    >
      {/* Brand */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 font-heading text-lg"
            style={{ background: "linear-gradient(150deg, var(--gold-light), var(--gold))", color: "var(--brand-primary)", border: "0.5px solid rgba(255,255,255,0.25)", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
          >
            V
          </div>
          <div className="leading-tight">
            <div className="font-heading text-[16px] text-[var(--cream,#f5efe4)] whitespace-nowrap" style={{ color: "#f5efe4" }}>Vera Enterprises</div>
            <div className="text-[9px] tracking-[1.5px] mt-0.5" style={{ color: "#8a9c8a" }}>ERP WORKSPACE</div>
          </div>
        </div>
        <div className="mt-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1 px-2 space-y-0.5 overflow-y-auto">

        {/* ── OVERVIEW ── */}
        <SectionTitle>Overview</SectionTitle>
        <NavItem to="/" label="Dashboard" glyph="◫" end onClick={close} />
        <NavItem to="/my-profile" label="My Profile" glyph="◐" onClick={close} />
        {showChat && <NavItem to="/chat" label="Chat" glyph="◈" unreadCount={totalUnread} onClick={close} />}

        {/* ── OPERATIONS ── */}
        <SectionTitle>Operations</SectionTitle>

        {showCRM && (
          <>
            <GroupHeader label="Sales (CRM)" glyph="◈" open={salesOpen} active={isSalesGroupActive} onToggle={toggleSales} />
            <GroupBody open={salesOpen} maxHeight={360}>
              <SubItem to="/crm" label="Pipeline" isActive={isPipelineActive} onClick={close} />
              <SubItem to="/crm/enquiries" label="Enquiries" isActive={path === "/crm/enquiries"} onClick={close} />
              <SubItem to="/crm/opportunities" label="Opportunities" isActive={path === "/crm/opportunities"} onClick={close} />
              <SubItem to="/crm/contacts" label="Customer Contacts" isActive={path === "/crm/contacts"} onClick={close} />
              <SubItem to="/crm/followups" label="Follow-ups" isActive={path === "/crm/followups"} onClick={close} />
              <SubItem to="/crm/team" label="Sales Team" isActive={path === "/crm/team"} onClick={close} />
              {isAdmin && <SubItem to="/sales-register" label="Sales Register" isActive={isSalesRegisterActive} adminBadge onClick={close} />}
            </GroupBody>
          </>
        )}

        {/* Quotation Studio — masters that drive the six-stage chain (Phase 2 §4). */}
        {showQuotation && (
          <>
            <GroupHeader label="Quotation Studio" glyph="◆" open={quotationOpen} active={isQuotationGroupActive} onToggle={toggleQuotation} />
            <GroupBody open={quotationOpen} maxHeight={300}>
              <SubItem to="/quotation/units" label="Units" isActive={path === "/quotation/units"} onClick={close} />
              <SubItem to="/quotation/materials" label="Materials" isActive={path === "/quotation/materials"} onClick={close} />
              <SubItem to="/quotation/finishes" label="Finishes" isActive={path === "/quotation/finishes"} onClick={close} />
              <SubItem to="/quotation/hardware" label="Hardware" isActive={path === "/quotation/hardware"} onClick={close} />
              <SubItem to="/quotation/pricing" label="Pricing Methods" isActive={path === "/quotation/pricing"} onClick={close} />
              <SubItem to="/quotation/templates" label="Templates" isActive={path === "/quotation/templates"} onClick={close} />
            </GroupBody>
          </>
        )}

        {/* ERP Entries — ERP-native records + request/approve queue (Phase 2 §2). */}
        {/* Visible to all: admins create/approve; everyone else requests. */}
        <NavItem to="/erp-entries" label="ERP Entries" glyph="⊞" onClick={close} />
        <NavItem to="/data-entry-requests" label={isAdmin ? "Data Entry Requests" : "My Requests"} glyph="✎" onClick={close} />

        {isAdmin && (
          <>
            <NavItem to="/inventory" label="Inventory" glyph="▤" adminBadge onClick={close} />
            <NavItem to="/purchasing" label="Purchasing" glyph="◪" adminBadge onClick={close} />
            <NavItem to="/logistics" label="Logistics" glyph="◇" adminBadge onClick={close} />
            <NavItem to="/returns" label="Returns & QC" glyph="◔" adminBadge onClick={close} />

            <GroupHeader label="Accounting" glyph="◎" open={accountingOpen} active={isAccountingGroupActive} onToggle={toggleAccounting} />
            <GroupBody open={accountingOpen} maxHeight={640}>
              <SubItem to="/accounting-module?tab=coa"                  label="Chart of Accounts"     isActive={acct("coa")} onClick={close} />
              <SubItem to="/accounting-module?tab=journal"              label="Journal Entries"        isActive={acct("journal")} onClick={close} />
              <SubItem to="/accounting-module?tab=payment"              label="Payment Entries"        isActive={acct("payment")} onClick={close} />
              <SubItem to="/accounting-module?tab=receipts"             label="Receipts"               isActive={acct("receipts")} onClick={close} />
              <SubItem to="/accounting-module?tab=bank-recon"           label="Bank Book"              isActive={acct("bank-recon")} onClick={close} />
              <SubItem to="/accounting-module?tab=sales-invoices"       label="Sales Invoices"         isActive={acct("sales-invoices")} onClick={close} />
              <SubItem to="/accounting-module?tab=purchase-bills"       label="Purchase Bills"         isActive={acct("purchase-bills")} onClick={close} />
              <SubItem to="/accounting-module?tab=credit-notes"         label="Credit Notes"           isActive={acct("credit-notes")} onClick={close} />
              <SubItem to="/accounting-module?tab=debit-notes"          label="Debit Notes"            isActive={acct("debit-notes")} onClick={close} />
              <SubItem to="/accounting-module?tab=general-ledger"       label="General Ledger"         isActive={acct("general-ledger")} onClick={close} />
              <SubItem to="/accounting-module?tab=ar"                   label="Accounts Receivable"    isActive={acct("ar")} onClick={close} />
              <SubItem to="/accounting-module?tab=ap"                   label="Accounts Payable"       isActive={acct("ap")} onClick={close} />
              <SubItem to="/accounting-module?tab=depreciation"         label="Depreciation (Journal)" isActive={acct("depreciation")} onClick={close} />
              <SubItem to="/accounting-module?tab=cash-flow"            label="Cash Flow"              isActive={acct("cash-flow")} onClick={close} />
              <SubItem to="/accounting-module?tab=financial-statements" label="Financial Statements"   isActive={acct("financial-statements")} onClick={close} />
            </GroupBody>
            <NavItem to="/accounts-dashboard" label="Accounts Dashboard" glyph="◎" adminBadge onClick={close} />
          </>
        )}

        {/* ── PEOPLE & WORK ── */}
        <SectionTitle>People &amp; Work</SectionTitle>

        {showHrms && (<>
        <GroupHeader label="HRMS" glyph="☺" open={hrOpen} active={isHrGroupActive} onToggle={toggleHR} />
        <GroupBody open={hrOpen} maxHeight={1000}>
          {isAdmin && <SubItem to="/hrms/employees" label="Employee Master" isActive={isEmpMasterActive} adminBadge onClick={close} />}
          {showAttendance && <SubItem to="/admin/attendance" label="Attendance" isActive={isAttendanceActive} onClick={close} />}
          {showHolidays && <SubItem to="/holidays" label="Holidays" isActive={isHolidaysActive} indent onClick={close} />}
          {showLeave && <SubItem to="/leave" label="Leave" isActive={isLeaveActive} onClick={close} />}
          {showExpense && <SubItem to="/expenses" label="Expenses" isActive={isExpensesActive} onClick={close} />}
          {showRecruitment && <SubItem to="/recruitment" label="Recruitment" isActive={isRecruitmentActive} onClick={close} />}
          {isAdmin && <SubItem to="/admin/employees" label="Team" isActive={isTeamActive} adminBadge onClick={close} />}
          {isAdmin && (
            <>
              <SubItem to="/hrms/shifts" label="Shifts" isActive={isShiftsActive} adminBadge onClick={close} />
              <SubItem to="/hrms/shift-assignments" label="Shift Roster" isActive={isShiftAssignActive} indent adminBadge onClick={close} />
              <SubItem to="/hrms/payroll" label="Payroll" isActive={isPayrollActive} adminBadge onClick={close} />
              <SubItem to="/hrms/salary-assignments" label="Salary Assignments" isActive={isSalaryAssignActive} indent adminBadge onClick={close} />
              <SubItem to="/hrms/payroll-runs" label="Payroll Runs" isActive={isPayrollRunsActive} indent adminBadge onClick={close} />
              <SubItem to="/hrms/salary-slips" label="Salary Slips" isActive={isSalarySlipsActive} indent adminBadge onClick={close} />
              <SubItem to="/hrms/onboarding" label="Onboarding" isActive={isOnboardingActive} adminBadge onClick={close} />
              <SubItem to="/hrms/training" label="Training" isActive={isTrainingActive} adminBadge onClick={close} />
              <SubItem to="/hrms/training-sessions" label="Training Sessions" isActive={isTrainingSessActive} indent adminBadge onClick={close} />
              <SubItem to="/hrms/appraisals" label="Appraisals" isActive={isApprsActive} adminBadge onClick={close} />
              <SubItem to="/hrms/appraisal-cycles" label="Appraisal Cycles" isActive={isApprCyclesActive} indent adminBadge onClick={close} />
              <SubItem to="/hrms/exit" label="Exit Management" isActive={isExitActive} adminBadge onClick={close} />
              <SubItem to="/hrms/departments" label="Departments" isActive={isDepartmentsActive} adminBadge onClick={close} />
              <SubItem to="/hrms/designations" label="Designations" isActive={isDesignationsActive} indent adminBadge onClick={close} />
            </>
          )}
        </GroupBody>
        </>)}

        {showTodo && (<>
        <GroupHeader label="To-Do System" glyph="✓" open={todoOpen} active={isTodoGroupActive} onToggle={toggleTodo} />
        <GroupBody open={todoOpen} maxHeight={360}>
          {can("todo.personal") && <SubItem to="/todo/personal" label="Personal Tasks" isActive={isPersonalTasksActive} onClick={close} />}
          {isAdmin && <SubItem to="/todo/team" label="Team Tasks" isActive={isTeamTasksActive} adminBadge onClick={close} />}
          {isAdmin && <SubItem to="/todo/approvals" label="Workflow Approvals" isActive={isApprovalsActive} adminBadge onClick={close} />}
          {can("todo.reminders") && <SubItem to="/todo/reminders" label="Reminders" isActive={isRemindersActive} onClick={close} />}
          {can("todo.calendar") && <SubItem to="/todo/calendar" label="Calendar" isActive={isCalendarActive} onClick={close} />}
          {can("todo.meetings") && <SubItem to="/todo/meetings" label="Meetings" isActive={isMeetingsActive} onClick={close} />}
          {isAdmin && <SubItem to="/todo/notes" label="Notes" isActive={isNotesActive} adminBadge onClick={close} />}
        </GroupBody>
        </>)}

        {showOrgHub && <NavItem to="/org-hub" label="Org Hub" glyph="◐" onClick={close} />}

        {/* ── PLATFORM ── */}
        <SectionTitle>Platform</SectionTitle>

        {showAccounts && (
          <>
            <GroupHeader label="Document Management" glyph="▤" open={docsOpen} active={isDocsGroupActive} onToggle={toggleDocs} />
            <GroupBody open={docsOpen} maxHeight={400}>
              {can("accounts.drive") && <SubItem to="/drive" label="Drive Documents" isActive={isAccountsDocActive} onClick={close} />}
              {can("accounts.upload") && <SubItem to="/accounts?tab=upload" label="Upload Status" isActive={isAccountsUploadActive} onClick={close} />}
              {isAdmin && (
                <>
                  <SubItem to="/verify" label="Verify Data" isActive={isVerifyActive} adminBadge onClick={close} />
                  <SubItem to="/ai-insights" label="AI Insights" isActive={isAIInsightsActive} adminBadge onClick={close} />
                  <SubItem to="/graphs" label="Graphs" isActive={isGraphsActive} adminBadge onClick={close} />
                </>
              )}
            </GroupBody>
          </>
        )}

        {isAdmin && (
          <>
            <GroupHeader label="Administration" glyph="◈" open={adminOpen} active={isAdminGroupActive} onToggle={toggleAdmin} />
            <GroupBody open={adminOpen} maxHeight={200}>
              <SubItem to="/admin/users" label="User Management" isActive={isUsersActive} adminBadge onClick={close} />
              <SubItem to="/admin/permissions" label="Permissions" isActive={isPermsActive} adminBadge onClick={close} />
            </GroupBody>
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
            <p className="text-white text-xs font-semibold truncate leading-tight">{user?.full_name ?? "—"}</p>
            <p className="text-[11px] truncate leading-tight" style={{ color: "#8a9c8a" }}>{user?.name ?? ""}</p>
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
