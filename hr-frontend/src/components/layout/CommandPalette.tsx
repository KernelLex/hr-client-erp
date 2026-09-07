import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ADMIN_USERS } from "@/lib/constants"
import { useAuth } from "@/context/AuthContext"

interface SearchEntry {
  label: string
  to: string
  group: string
  admin?: boolean
}

// Flat index of every real page in the app, grouped like the sidebar.
const INDEX: SearchEntry[] = [
  { label: "Dashboard", to: "/", group: "Overview" },
  { label: "My Profile", to: "/my-profile", group: "Overview" },
  { label: "Chat", to: "/chat", group: "Overview" },

  { label: "Pipeline", to: "/crm", group: "Sales (CRM)" },
  { label: "Sales Register", to: "/sales-register", group: "Sales (CRM)", admin: true },

  { label: "Inventory", to: "/inventory", group: "Operations", admin: true },
  { label: "Purchasing", to: "/purchasing", group: "Operations", admin: true },
  { label: "Logistics", to: "/logistics", group: "Operations", admin: true },
  { label: "Returns & QC", to: "/returns", group: "Operations", admin: true },

  { label: "Chart of Accounts", to: "/accounting-module?tab=coa", group: "Accounting", admin: true },
  { label: "Journal Entries", to: "/accounting-module?tab=journal", group: "Accounting", admin: true },
  { label: "Payment Entries", to: "/accounting-module?tab=payment", group: "Accounting", admin: true },
  { label: "Receipts", to: "/accounting-module?tab=receipts", group: "Accounting", admin: true },
  { label: "Bank Book", to: "/accounting-module?tab=bank-recon", group: "Accounting", admin: true },
  { label: "Sales Invoices", to: "/accounting-module?tab=sales-invoices", group: "Accounting", admin: true },
  { label: "Purchase Bills", to: "/accounting-module?tab=purchase-bills", group: "Accounting", admin: true },
  { label: "Credit Notes", to: "/accounting-module?tab=credit-notes", group: "Accounting", admin: true },
  { label: "Debit Notes", to: "/accounting-module?tab=debit-notes", group: "Accounting", admin: true },
  { label: "General Ledger", to: "/accounting-module?tab=general-ledger", group: "Accounting", admin: true },
  { label: "Accounts Receivable", to: "/accounting-module?tab=ar", group: "Accounting", admin: true },
  { label: "Accounts Payable", to: "/accounting-module?tab=ap", group: "Accounting", admin: true },
  { label: "Depreciation (Journal)", to: "/accounting-module?tab=depreciation", group: "Accounting", admin: true },
  { label: "Cash Flow", to: "/accounting-module?tab=cash-flow", group: "Accounting", admin: true },
  { label: "Financial Statements", to: "/accounting-module?tab=financial-statements", group: "Accounting", admin: true },
  { label: "Accounts Dashboard", to: "/accounts-dashboard", group: "Accounting", admin: true },

  { label: "Employee Master", to: "/hrms/employees", group: "HRMS", admin: true },
  { label: "Attendance", to: "/admin/attendance", group: "HRMS" },
  { label: "Holidays", to: "/holidays", group: "HRMS" },
  { label: "Leave", to: "/leave", group: "HRMS" },
  { label: "Expenses", to: "/expenses", group: "HRMS" },
  { label: "Recruitment", to: "/recruitment", group: "HRMS" },
  { label: "Team", to: "/admin/employees", group: "HRMS", admin: true },
  { label: "Shifts", to: "/hrms/shifts", group: "HRMS", admin: true },
  { label: "Shift Roster", to: "/hrms/shift-assignments", group: "HRMS", admin: true },
  { label: "Payroll", to: "/hrms/payroll", group: "HRMS", admin: true },
  { label: "Salary Assignments", to: "/hrms/salary-assignments", group: "HRMS", admin: true },
  { label: "Payroll Runs", to: "/hrms/payroll-runs", group: "HRMS", admin: true },
  { label: "Salary Slips", to: "/hrms/salary-slips", group: "HRMS", admin: true },
  { label: "Onboarding", to: "/hrms/onboarding", group: "HRMS", admin: true },
  { label: "Training", to: "/hrms/training", group: "HRMS", admin: true },
  { label: "Training Sessions", to: "/hrms/training-sessions", group: "HRMS", admin: true },
  { label: "Appraisals", to: "/hrms/appraisals", group: "HRMS", admin: true },
  { label: "Appraisal Cycles", to: "/hrms/appraisal-cycles", group: "HRMS", admin: true },
  { label: "Exit Management", to: "/hrms/exit", group: "HRMS", admin: true },
  { label: "Departments", to: "/hrms/departments", group: "HRMS", admin: true },
  { label: "Designations", to: "/hrms/designations", group: "HRMS", admin: true },

  { label: "Personal Tasks", to: "/todo/personal", group: "To-Do System" },
  { label: "Team Tasks", to: "/todo/team", group: "To-Do System", admin: true },
  { label: "Workflow Approvals", to: "/todo/approvals", group: "To-Do System", admin: true },
  { label: "Reminders", to: "/todo/reminders", group: "To-Do System" },
  { label: "Calendar", to: "/todo/calendar", group: "To-Do System" },
  { label: "Meetings", to: "/todo/meetings", group: "To-Do System" },
  { label: "Notes", to: "/todo/notes", group: "To-Do System", admin: true },

  { label: "Org Hub", to: "/org-hub", group: "People & Work" },

  { label: "Drive Documents", to: "/drive", group: "Document Management" },
  { label: "Upload Status", to: "/accounts?tab=upload", group: "Document Management" },
  { label: "Verify Data", to: "/verify", group: "Document Management", admin: true },
  { label: "AI Insights", to: "/ai-insights", group: "Document Management", admin: true },
  { label: "Graphs", to: "/graphs", group: "Document Management", admin: true },

  { label: "User Management", to: "/admin/users", group: "Administration", admin: true },
  { label: "Permissions", to: "/admin/permissions", group: "Administration", admin: true },
]

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = !!(user && ADMIN_USERS.has(user.name))
  const [q, setQ] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const available = useMemo(() => INDEX.filter((e) => !e.admin || isAdmin), [isAdmin])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const pool = query
      ? available.filter((e) => (e.label + " " + e.group).toLowerCase().includes(query))
      : available
    return pool.slice(0, 50)
  }, [q, available])

  // Reset + focus when opened
  useEffect(() => {
    if (open) {
      setQ("")
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open])

  function go(to: string) {
    onClose()
    navigate(to)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault()
      go(results[0].to)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center px-4"
      style={{ background: "rgba(30,58,47,.42)", paddingTop: "90px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full bg-white overflow-hidden"
        style={{ maxWidth: "560px", borderRadius: "14px", boxShadow: "0 24px 70px rgba(0,0,0,.35)", border: "0.5px solid var(--border, #e0d9cb)" }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='Jump to any screen… try "invoice", "payroll", "leave"'
          className="w-full outline-none text-[14px] text-gray-900"
          style={{ padding: "16px 18px", borderBottom: "0.5px solid var(--border, #e0d9cb)", fontFamily: "'Inter', sans-serif" }}
        />
        <div className="overflow-y-auto p-1.5" style={{ maxHeight: "380px" }}>
          {results.length === 0 ? (
            <div className="py-6 text-center text-gray-400 text-xs">No matches</div>
          ) : (
            results.map((e) => (
              <button
                key={e.group + e.to}
                onClick={() => go(e.to)}
                className="w-full flex items-center gap-2.5 rounded-md text-left text-[13px] text-gray-900 hover:bg-[var(--cream,#f5efe4)]"
                style={{ padding: "9px 12px" }}
              >
                <span
                  className="shrink-0 text-center font-semibold uppercase"
                  style={{
                    fontSize: "9px", letterSpacing: ".8px", color: "var(--text-muted, #8a8a80)",
                    background: "var(--cream-dark, #ebe3d3)", padding: "2px 8px", borderRadius: "10px",
                    minWidth: "104px",
                  }}
                >
                  {e.group}
                </span>
                <span className="flex-1">{e.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
