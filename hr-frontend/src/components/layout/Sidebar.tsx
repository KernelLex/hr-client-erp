import { ADMIN_USERS } from "@/lib/constants"
import { useState, useEffect } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { LogOut } from "lucide-react"
import { useUnreadCounts } from "@/pages/chat/useChat"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { usePermissions } from "@/context/PermissionsContext"
import { useCompany, ALL_COMPANIES } from "@/context/CompanyContext"

/* ============================================================================
   MONOCHROME UI OVERHAUL (2026-10) — light sidebar, 7 areas.
   Every route and permission gate from the previous sidebar is preserved;
   only the grouping and skin changed. Hierarchy comes from weight/space, not
   colour; the active item is marked by an ink left-border + ink text.
   ============================================================================ */

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

// ─── Reusable pieces ─────────────────────────────────────────────────────────

function AdminBadge() {
  return (
    <span
      className="ml-auto text-[10px] font-semibold rounded px-1.5 py-0.5"
      style={{ border: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}
    >
      admin
    </span>
  )
}

// Unicode glyph icon (geometric, monochrome)
function Glyph({ char, active }: { char: string; active: boolean }) {
  return (
    <span
      className="w-4 text-center shrink-0 text-[14px] leading-none"
      style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)" }}
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
          "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors duration-150 whitespace-nowrap border-l-[2px] border-transparent",
          isActive ? "" : "hover:bg-[var(--overlay-hover)]"
        )
      }
      style={({ isActive }) =>
        isActive
          ? { backgroundColor: "var(--overlay-selected)", color: "var(--text-primary)", borderLeftColor: "var(--text-primary)" }
          : { color: "var(--text-secondary)" }
      }
    >
      {({ isActive }) => (
        <>
          <Glyph char={glyph} active={isActive} />
          <span className="flex-1">{label}</span>
          {adminBadge && <AdminBadge />}
          {unreadCount > 0 && (
            <span
              className="ml-auto min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1"
              style={{ backgroundColor: "var(--bg-inverse)", color: "var(--text-inverse)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// A child item inside a dropdown group — text-row style (no per-item icon)
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
        "flex items-center gap-2 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-150 whitespace-nowrap border-l-[2px] border-transparent",
        indent ? "pl-11 pr-3" : "pl-9 pr-3",
        isActive ? "" : "hover:bg-[var(--overlay-hover)]"
      )}
      style={isActive
        ? { backgroundColor: "var(--overlay-selected)", color: "var(--text-primary)", borderLeftColor: "var(--text-primary)" }
        : { color: "var(--text-tertiary)" }}
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
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors duration-150",
        active ? "" : "hover:bg-[var(--overlay-hover)]"
      )}
      style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}
    >
      <Glyph char={glyph} active={active} />
      <span className="flex-1 text-left">{label}</span>
      <span
        className="text-[13px] leading-none transition-transform duration-200 shrink-0"
        style={{ color: "var(--text-tertiary)", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
      >
        ›
      </span>
    </button>
  )
}

// Section title (e.g. HOME, SALES)
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 pt-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: "var(--text-tertiary)" }}
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
  const { activeCompany, availableCompanies } = useCompany()
  const location = useLocation()
  const { data: unreadData } = useUnreadCounts()
  const totalUnread = unreadData?.total_unread ?? 0

  const isAdmin = !!(user && ADMIN_USERS.has(user.name))

  // Dropdown open state — persisted in localStorage
  const [quotationOpen, setQuotationOpen] = useState(() => readLS("sidebar_quotation_open", false))
  const [accountingOpen, setAccountingOpen] = useState(() => readLS("sidebar_accounting_open", false))
  const [dataOpen, setDataOpen] = useState(() => readLS("sidebar_data_open", false))
  const [hrOpen, setHrOpen] = useState(() => readLS("sidebar_hr_open", false))
  const [todoOpen, setTodoOpen] = useState(() => readLS("sidebar_todo_open", true))
  const [adminOpen, setAdminOpen] = useState(() => readLS("sidebar_admin_open", false))

  // Active-state helpers
  const path = location.pathname
  const search = location.search

  const isQuotationGroupActive = path.startsWith("/quotation/")

  const acct = (tab: string) => path === "/accounting-module" && search === `?tab=${tab}`
  const isAccountingGroupActive = path === "/accounting-module" || path === "/accounts-dashboard"
  const isErpEntriesActive = path === "/erp-entries"
  const isDataRequestsActive = path === "/data-entry-requests"
  const isTallyActive = path === "/tally-upload"
  const isUploadStatusActive = path === "/accounts" && search === "?tab=upload"
  const isVerifyActive = path === "/verify"
  const isExpensesActive = path.startsWith("/expenses")
  const isDataGroupActive = isErpEntriesActive || isDataRequestsActive || isTallyActive || isUploadStatusActive || isVerifyActive || isExpensesActive

  const isTeamActive = path.startsWith("/admin/employees")
  const isEmpMasterActive = path === "/hrms/employees"
  const isHrGroupActive = path.startsWith("/hrms/") || isTeamActive

  const isPersonalTasksActive = path === "/todo/personal"
  const isTeamTasksActive = path === "/todo/team"
  const isApprovalsActive = path === "/todo/approvals"
  const isRemindersActive = path === "/todo/reminders"
  const isTodoGroupActive = path.startsWith("/todo/")

  const isAdminGroupActive =
    path === "/admin/users" || path === "/admin/permissions" || path === "/admin/company-settings" ||
    path === "/admin/cost-prices" || path === "/admin/finish-rates" || path === "/admin/group-dashboard" ||
    path === "/org-hub" || path === "/admin/org-hub"

  // Auto-expand the group that contains the active route
  useEffect(() => {
    if (isQuotationGroupActive) setQuotationOpen(true)
    if (isAccountingGroupActive) setAccountingOpen(true)
    if (isDataGroupActive) setDataOpen(true)
    if (isHrGroupActive) setHrOpen(true)
    if (isTodoGroupActive) setTodoOpen(true)
    if (isAdminGroupActive) setAdminOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search])

  function makeToggle(setter: React.Dispatch<React.SetStateAction<boolean>>, key: string) {
    return () => setter((v) => {
      const next = !v
      try { localStorage.setItem(key, String(next)) } catch { /* localStorage unavailable */ }
      return next
    })
  }
  const toggleQuotation = makeToggle(setQuotationOpen, "sidebar_quotation_open")
  const toggleAccounting = makeToggle(setAccountingOpen, "sidebar_accounting_open")
  const toggleData = makeToggle(setDataOpen, "sidebar_data_open")
  const toggleHR = makeToggle(setHrOpen, "sidebar_hr_open")
  const toggleTodo = makeToggle(setTodoOpen, "sidebar_todo_open")
  const toggleAdmin = makeToggle(setAdminOpen, "sidebar_admin_open")

  // Close sidebar on mobile when a nav item is clicked
  function close() {
    if (window.innerWidth < 768) onClose?.()
  }

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

  // Brand reflects the active company so each workspace is identifiable — name
  // + abbreviation only (no accent colour, per the monochrome overhaul).
  const isAllCompanies = activeCompany === ALL_COMPANIES
  const activeBrand = availableCompanies.find((c) => c.name === activeCompany)
  const brandName = isAllCompanies ? "All Companies" : activeBrand?.label || "Vera ERP"
  const brandAbbr = isAllCompanies ? "◆" : activeBrand?.abbr || "V"

  const sidebarBody = (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-sidebar)", borderRight: "1px solid var(--border-subtle)" }}
    >
      {/* Brand */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 text-base font-semibold"
            style={{ backgroundColor: "var(--bg-inverse)", color: "var(--text-inverse)" }}
          >
            {brandAbbr}
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)", letterSpacing: "-.01em" }}>{brandName}</div>
            <div className="text-[9px] tracking-[1.5px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>ERP WORKSPACE</div>
          </div>
        </div>
        <div className="mt-3 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1 px-2 space-y-0.5 overflow-y-auto">

        {/* ── HOME ── */}
        <SectionTitle>Home</SectionTitle>
        <NavItem to="/" label="Dashboard" glyph="▣" end onClick={close} />
        {isAdmin && <NavItem to="/ai-insights" label="AI Insights" glyph="◇" adminBadge onClick={close} />}
        {isAdmin && <NavItem to="/graphs" label="Graphs" glyph="◴" adminBadge onClick={close} />}
        <NavItem to="/my-profile" label="My Profile" glyph="◐" onClick={close} />

        {/* ── SALES ── */}
        {(showCRM || showQuotation) && <SectionTitle>Sales</SectionTitle>}

        {/* CRM — pipeline + sub-screens bundled into one tabbed hub at /crm */}
        {showCRM && <NavItem to="/crm" label="CRM" glyph="◈" onClick={close} />}
        {showCRM && isAdmin && <NavItem to="/sales-register" label="Sales Register" glyph="▦" adminBadge onClick={close} />}

        {showQuotation && (
          <>
            <GroupHeader label="Quotation Studio" glyph="◆" open={quotationOpen} active={isQuotationGroupActive} onToggle={toggleQuotation} />
            <GroupBody open={quotationOpen} maxHeight={520}>
              <SubItem to="/quotation/prequote" label="Pre-Quote" isActive={path === "/quotation/prequote"} onClick={close} />
              <SubItem to="/quotation/projects" label="Projects" isActive={path.startsWith("/quotation/projects")} onClick={close} />
              <SubItem to="/quotation/measurements" label="Measurement Sheets" isActive={path.startsWith("/quotation/measurements")} onClick={close} />
              <SubItem to="/quotation/boqs" label="BOQ / Configuration" isActive={path.startsWith("/quotation/boqs")} onClick={close} />
              <SubItem to="/quotation/cost-sheets" label="Cost Sheets" isActive={path.startsWith("/quotation/cost-sheets")} onClick={close} />
              <SubItem to="/quotation/quotations" label="Customer Quotations" isActive={path.startsWith("/quotation/quotations")} onClick={close} />
              <SubItem to="/quotation/sales-orders" label="Sales Orders" isActive={path.startsWith("/quotation/sales-orders")} onClick={close} />
              <SubItem to="/quotation/reclaimed" label="Reclaimed Materials" isActive={path.startsWith("/quotation/reclaimed")} onClick={close} />
              <SubItem to="/quotation/hardware-packages" label="Hardware Packages" isActive={path === "/quotation/hardware-packages"} onClick={close} />
              {/* Catalogue masters bundled; Terms templates+clauses bundled */}
              <SubItem to="/quotation/catalogue" label="Studio Catalogue" isActive={path === "/quotation/catalogue" || ["/quotation/materials","/quotation/finishes","/quotation/hardware","/quotation/units","/quotation/pricing","/quotation/templates"].includes(path)} onClick={close} />
              <SubItem to="/quotation/terms" label="Terms" isActive={path === "/quotation/terms" || path === "/quotation/terms-clauses" || path === "/quotation/terms-templates"} onClick={close} />
            </GroupBody>
          </>
        )}

        {/* ── DELIVERY ── */}
        {(showQuotation || isAdmin) && <SectionTitle>Delivery</SectionTitle>}
        {showQuotation && (
          <>
            <NavItem to="/projects" label="Project Delivery" glyph="▦" onClick={close} />
            <NavItem to="/projects/schedule" label="Work Schedule" glyph="◷" onClick={close} />
            <NavItem to="/service" label="Service & Warranty" glyph="◉" onClick={close} />
          </>
        )}
        {isAdmin && (
          <>
            <NavItem to="/purchasing" label="Purchasing" glyph="⬓" adminBadge onClick={close} />
            <NavItem to="/inventory" label="Inventory" glyph="▥" adminBadge onClick={close} />
            <NavItem to="/logistics" label="Logistics" glyph="⇲" adminBadge onClick={close} />
            <NavItem to="/returns" label="Returns & QC" glyph="↩" adminBadge onClick={close} />
          </>
        )}

        {/* ── FINANCE ── */}
        <SectionTitle>Finance</SectionTitle>
        {isAdmin && (
          <>
            <GroupHeader label="Accounts" glyph="◎" open={accountingOpen} active={isAccountingGroupActive} onToggle={toggleAccounting} />
            <GroupBody open={accountingOpen} maxHeight={700}>
              <SubItem to="/accounts-dashboard" label="Accounts Dashboard" isActive={path === "/accounts-dashboard"} adminBadge onClick={close} />
              <SubItem to="/accounting-module?tab=financial-statements" label="Financial Statements"   isActive={acct("financial-statements")} onClick={close} />
              <SubItem to="/accounting-module?tab=general-ledger"       label="General Ledger"         isActive={acct("general-ledger")} onClick={close} />
              <SubItem to="/accounting-module?tab=coa"                  label="Chart of Accounts"      isActive={acct("coa")} onClick={close} />
              <SubItem to="/accounting-module?tab=journal"              label="Journal Entries"        isActive={acct("journal")} onClick={close} />
              <SubItem to="/accounting-module?tab=payment"              label="Payment Entries"        isActive={acct("payment")} onClick={close} />
              <SubItem to="/accounting-module?tab=receipts"             label="Receipts"               isActive={acct("receipts")} onClick={close} />
              <SubItem to="/accounting-module?tab=bank-recon"           label="Bank Book"              isActive={acct("bank-recon")} onClick={close} />
              <SubItem to="/accounting-module?tab=sales-invoices"       label="Sales Invoices"         isActive={acct("sales-invoices")} onClick={close} />
              <SubItem to="/accounting-module?tab=purchase-bills"       label="Purchase Bills"         isActive={acct("purchase-bills")} onClick={close} />
              <SubItem to="/accounting-module?tab=credit-notes"         label="Credit Notes"           isActive={acct("credit-notes")} onClick={close} />
              <SubItem to="/accounting-module?tab=debit-notes"          label="Debit Notes"            isActive={acct("debit-notes")} onClick={close} />
              <SubItem to="/accounting-module?tab=ar"                   label="Accounts Receivable"    isActive={acct("ar")} onClick={close} />
              <SubItem to="/accounting-module?tab=ap"                   label="Accounts Payable"       isActive={acct("ap")} onClick={close} />
              <SubItem to="/accounting-module?tab=depreciation"         label="Depreciation (Journal)" isActive={acct("depreciation")} onClick={close} />
              <SubItem to="/accounting-module?tab=cash-flow"            label="Cash Flow"              isActive={acct("cash-flow")} onClick={close} />
            </GroupBody>
            <NavItem to="/admin/vendor-payments" label="Vendor Payments" glyph="◈" adminBadge onClick={close} />
          </>
        )}

        {/* Data & Entries — ERP-native records, imports, verification, claims */}
        <GroupHeader label="Data & Entries" glyph="▤" open={dataOpen} active={isDataGroupActive} onToggle={toggleData} />
        <GroupBody open={dataOpen} maxHeight={360}>
          <SubItem to="/erp-entries" label="ERP Entries" isActive={isErpEntriesActive} onClick={close} />
          <SubItem to="/data-entry-requests" label={isAdmin ? "Data Entry Requests" : "My Requests"} isActive={isDataRequestsActive} onClick={close} />
          {showExpense && <SubItem to="/expenses" label="Expenses" isActive={isExpensesActive} onClick={close} />}
          {isAdmin && <SubItem to="/tally-upload" label="Tally Import" isActive={isTallyActive} adminBadge onClick={close} />}
          {showAccounts && can("accounts.upload") && <SubItem to="/accounts?tab=upload" label="Upload Status" isActive={isUploadStatusActive} onClick={close} />}
          {isAdmin && <SubItem to="/verify" label="Verify Data" isActive={isVerifyActive} adminBadge onClick={close} />}
        </GroupBody>

        {/* ── PEOPLE ── */}
        {(showHrms || showAttendance || showLeave || showHolidays || showRecruitment) && <SectionTitle>People</SectionTitle>}
        {showAttendance && <NavItem to="/admin/attendance" label="Attendance" glyph="◷" onClick={close} />}
        {showLeave && <NavItem to="/leave" label="Leave" glyph="⎋" onClick={close} />}
        {showHolidays && <NavItem to="/holidays" label="Holidays" glyph="◰" onClick={close} />}
        {showRecruitment && <NavItem to="/recruitment" label="Recruitment" glyph="◍" onClick={close} />}

        {showHrms && (<>
          <GroupHeader label="HRMS" glyph="☺" open={hrOpen} active={isHrGroupActive} onToggle={toggleHR} />
          <GroupBody open={hrOpen} maxHeight={1000}>
            {isAdmin && <SubItem to="/hrms/employees" label="Employee Master" isActive={isEmpMasterActive} adminBadge onClick={close} />}
            {isAdmin && <SubItem to="/admin/employees" label="Team" isActive={isTeamActive} adminBadge onClick={close} />}
            {isAdmin && (
              <>
                <SubItem to="/hrms/departments" label="Departments" isActive={path === "/hrms/departments"} adminBadge onClick={close} />
                <SubItem to="/hrms/designations" label="Designations" isActive={path === "/hrms/designations"} indent adminBadge onClick={close} />
                <SubItem to="/hrms/shifts" label="Shifts" isActive={path === "/hrms/shifts"} adminBadge onClick={close} />
                <SubItem to="/hrms/shift-assignments" label="Shift Roster" isActive={path === "/hrms/shift-assignments"} indent adminBadge onClick={close} />
                <SubItem to="/hrms/payroll" label="Payroll" isActive={path === "/hrms/payroll" || path === "/hrms/salary-assignments" || path === "/hrms/payroll-runs" || path === "/hrms/salary-slips"} adminBadge onClick={close} />
                <SubItem to="/hrms/onboarding" label="Onboarding" isActive={path === "/hrms/onboarding"} adminBadge onClick={close} />
                <SubItem to="/hrms/training" label="Training" isActive={path === "/hrms/training"} adminBadge onClick={close} />
                <SubItem to="/hrms/training-sessions" label="Training Sessions" isActive={path === "/hrms/training-sessions"} indent adminBadge onClick={close} />
                <SubItem to="/hrms/appraisals" label="Appraisals" isActive={path === "/hrms/appraisals"} adminBadge onClick={close} />
                <SubItem to="/hrms/appraisal-cycles" label="Appraisal Cycles" isActive={path === "/hrms/appraisal-cycles"} indent adminBadge onClick={close} />
                <SubItem to="/hrms/exit" label="Exit Management" isActive={path === "/hrms/exit"} adminBadge onClick={close} />
              </>
            )}
          </GroupBody>
        </>)}

        {/* ── WORKSPACE ── */}
        {(showTodo || showChat || showAccounts) && <SectionTitle>Workspace</SectionTitle>}
        {showTodo && (<>
          <GroupHeader label="Tasks" glyph="✓" open={todoOpen} active={isTodoGroupActive} onToggle={toggleTodo} />
          <GroupBody open={todoOpen} maxHeight={280}>
            {can("todo.personal") && <SubItem to="/todo/personal" label="Personal Tasks" isActive={isPersonalTasksActive} onClick={close} />}
            {isAdmin && <SubItem to="/todo/team" label="Team Tasks" isActive={isTeamTasksActive} adminBadge onClick={close} />}
            {isAdmin && <SubItem to="/todo/approvals" label="Workflow Approvals" isActive={isApprovalsActive} adminBadge onClick={close} />}
            {can("todo.reminders") && <SubItem to="/todo/reminders" label="Reminders" isActive={isRemindersActive} onClick={close} />}
          </GroupBody>
          {can("todo.calendar") && <NavItem to="/todo/calendar" label="Calendar" glyph="◰" onClick={close} />}
          {can("todo.meetings") && <NavItem to="/todo/meetings" label="Meetings" glyph="◎" onClick={close} />}
          {isAdmin && <NavItem to="/todo/notes" label="Notes" glyph="▤" adminBadge onClick={close} />}
        </>)}
        {showChat && <NavItem to="/chat" label="Chat" glyph="◌" unreadCount={totalUnread} onClick={close} />}
        {showAccounts && can("accounts.drive") && <NavItem to="/drive" label="Drive Documents" glyph="▣" onClick={close} />}

        {/* ── ADMIN ── */}
        {(isAdmin || showOrgHub) && <SectionTitle>Admin</SectionTitle>}
        {isAdmin && (
          <>
            <GroupHeader label="Administration" glyph="◈" open={adminOpen} active={isAdminGroupActive} onToggle={toggleAdmin} />
            <GroupBody open={adminOpen} maxHeight={420}>
              <SubItem to="/admin/group-dashboard" label="Group Dashboard" isActive={path === "/admin/group-dashboard"} adminBadge onClick={close} />
              <SubItem to="/admin/users" label="User Management" isActive={path === "/admin/users"} adminBadge onClick={close} />
              <SubItem to="/admin/permissions" label="Permissions" isActive={path === "/admin/permissions"} adminBadge onClick={close} />
              <SubItem to="/admin/company-settings" label="Company Settings" isActive={path === "/admin/company-settings"} adminBadge onClick={close} />
              <SubItem to="/admin/cost-prices" label="Cost / Dealer Prices" isActive={path === "/admin/cost-prices"} adminBadge onClick={close} />
              <SubItem to="/admin/finish-rates" label="Finish / Material Rates" isActive={path === "/admin/finish-rates"} adminBadge onClick={close} />
              {showOrgHub && <SubItem to="/org-hub" label="Org Hub" isActive={path === "/org-hub" || path === "/admin/org-hub"} adminBadge onClick={close} />}
            </GroupBody>
          </>
        )}
        {!isAdmin && showOrgHub && <NavItem to="/org-hub" label="Org Hub" glyph="◍" onClick={close} />}
      </nav>

      {/* Bottom profile + sign out */}
      <div className="shrink-0 px-3 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2.5 mb-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
            style={{ backgroundColor: "var(--bg-inverse)", color: "var(--text-inverse)" }}
          >
            {user?.full_name ? getInitials(user.full_name) : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate leading-tight" style={{ color: "var(--text-primary)" }}>{user?.full_name ?? "—"}</p>
            <p className="text-[11px] truncate leading-tight" style={{ color: "var(--text-tertiary)" }}>{user?.name ?? ""}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-2 text-xs rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--overlay-hover)]"
          style={{ color: "var(--text-tertiary)" }}
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
          open ? "w-[244px]" : "w-0"
        )}
      >
        {sidebarBody}
      </div>

      {/* Mobile fixed overlay sidebar — slides in/out */}
      <div
        className={cn(
          "no-print flex flex-col md:hidden fixed inset-y-0 left-0 z-30 w-[244px] transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarBody}
      </div>
    </>
  )
}
