import { useNavigate } from "react-router-dom"
import { Calendar, Mail, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { EmployeeListItem, DocumentsChecklist } from "../types"
import { DEPT_COLORS, STAGE_COLORS } from "../types"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function deptColor(dept: string) {
  return DEPT_COLORS[dept] ?? "bg-gray-500"
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Directory card ───────────────────────────────────────────────────────────

interface DirectoryCardProps {
  employee: EmployeeListItem
}

export function DirectoryEmployeeCard({ employee }: DirectoryCardProps) {
  const navigate = useNavigate()
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-full ${deptColor(employee.department)} flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
          {initials(employee.employee_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm truncate">{employee.employee_name}</p>
          <p className="text-xs text-gray-500 truncate">{employee.designation}</p>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${employee.status === "Active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
          {employee.status}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Building2 size={11} />
          <span>{employee.department}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Mail size={11} />
          <span className="truncate">{employee.company_email}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Calendar size={11} />
          <span>Joined {formatDate(employee.date_of_joining)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <span className="text-[11px] text-gray-400 font-mono">{employee.name}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/employees/${employee.name}`)}>
          View Profile
        </Button>
      </div>
    </div>
  )
}

// ─── Onboarding kanban card ───────────────────────────────────────────────────

interface OnboardingCardProps {
  employee: EmployeeListItem
  docsChecklist?: DocumentsChecklist
  onUpdate: (employee: EmployeeListItem) => void
}

function docsProgress(checklist?: DocumentsChecklist) {
  if (!checklist) return 0
  const vals = Object.values(checklist)
  const done = vals.filter((v) => v === "received" || v === "waived").length
  return Math.round((done / vals.length) * 100)
}

export function OnboardingEmployeeCard({ employee, docsChecklist, onUpdate }: OnboardingCardProps) {
  const stageBadge = STAGE_COLORS[employee.custom_onboarding_stage]
  const progress = employee.custom_onboarding_stage === "Documents Collected" || employee.custom_onboarding_stage === "IT Setup" || employee.custom_onboarding_stage === "First Day"
    ? 100
    : docsProgress(docsChecklist)

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-9 h-9 rounded-full ${deptColor(employee.department)} flex items-center justify-center text-white font-semibold text-xs shrink-0`}>
          {initials(employee.employee_name)}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{employee.employee_name}</p>
          <p className="text-xs text-gray-500 truncate">{employee.designation}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
        <Calendar size={11} />
        <span>Joining {formatDate(employee.date_of_joining)}</span>
      </div>

      {employee.custom_onboarding_stage === "Offer Accepted" && (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-gray-400 mb-1">
            <span>Documents</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stageBadge}`}>
          {employee.custom_onboarding_stage}
        </span>
        <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => onUpdate(employee)}>
          Update
        </Button>
      </div>
    </div>
  )
}
