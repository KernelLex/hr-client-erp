import { useQuery } from "@tanstack/react-query"
import { useNavigate, Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { getAllEmployees, type EmployeeListItem } from "@/api/employee"

const ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

const GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
]

function getGradient(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % GRADIENTS.length
  return GRADIENTS[Math.abs(h)]
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function departmentLabel(dept: string) {
  return dept.replace(/ - V$/, "")
}

const DEPT_BADGE: Record<string, { bg: string; text: string }> = {
  Logistics:  { bg: "#FEF3C7", text: "#92400E" },
  Accounts:   { bg: "#D1FAE5", text: "#065F46" },
  Project:    { bg: "#DBEAFE", text: "#1E40AF" },
  Management: { bg: "#EDE9FE", text: "#5B21B6" },
  HR:         { bg: "#FCE7F3", text: "#9D174D" },
}

function getBadgeStyle(dept: string) {
  return DEPT_BADGE[dept] ?? { bg: "#F1F5F9", text: "#475569" }
}

function EmployeeCardItem({ emp }: { emp: EmployeeListItem }) {
  const navigate = useNavigate()
  const dept = departmentLabel(emp.department)
  const empEmail = emp.user_id || emp.company_email
  const pendingLeaves = emp.pending_leaves ?? 0
  const gradient = emp.image ? "" : getGradient(emp.employee_name)
  const badge = getBadgeStyle(dept)

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex flex-col items-center text-center p-6 rounded-2xl bg-white select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      style={{
        border: "1px solid #E2E8F0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      onClick={() => navigate(`/admin/employees/${encodeURIComponent(empEmail)}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/admin/employees/${encodeURIComponent(empEmail)}`)}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = "0 8px 24px rgba(79,70,229,0.12)"
        el.style.transform = "translateY(-2px)"
        el.style.borderColor = "#A5B4FC"
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)"
        el.style.transform = "translateY(0)"
        el.style.borderColor = "#E2E8F0"
      }}
    >
      {/* Avatar */}
      <div className="relative mb-4">
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center overflow-hidden"
          style={{ background: gradient || "#EDE9FE" }}
        >
          {emp.image ? (
            <img src={emp.image} alt={emp.employee_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-bold text-[22px]">{getInitials(emp.employee_name)}</span>
          )}
        </div>
        {pendingLeaves > 0 && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {pendingLeaves}
          </span>
        )}
      </div>

      {/* Name + designation */}
      <p className="text-[16px] font-bold text-gray-900 leading-tight mb-0.5">{emp.employee_name}</p>
      <p className="text-[13px] text-gray-500 mb-3">{emp.designation}</p>

      {/* Department badge */}
      <span
        className="text-xs font-medium px-3 py-1 rounded-full"
        style={{ backgroundColor: badge.bg, color: badge.text }}
      >
        {dept}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      className="flex flex-col items-center p-6 rounded-2xl bg-white animate-pulse"
      style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
    >
      <div className="w-[72px] h-[72px] rounded-full bg-gray-200 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
      <div className="h-6 bg-gray-100 rounded-full w-1/2" />
    </div>
  )
}

export function AdminEmployeesPage() {
  const { user } = useAuth()
  const isAdmin = user && ADMIN_USERS.has(user.name)

  const { data: employees, isLoading } = useQuery({
    queryKey: ["all_employees"],
    queryFn: getAllEmployees,
    staleTime: 1000 * 60,
    enabled: !!isAdmin,
  })

  if (!isAdmin) return <Navigate to="/" replace />

  const count = employees?.length ?? 0

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary, #0F172A)" }}>
          Team Members
        </h1>
        <p className="text-[14px] text-gray-500 mt-1 flex items-center gap-1.5">
          {!isLoading && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          )}
          {isLoading ? "Loading…" : `${count} active employee${count !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Grid */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      >
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : employees?.map((emp) => <EmployeeCardItem key={emp.name} emp={emp} />)}
      </div>
    </div>
  )
}
