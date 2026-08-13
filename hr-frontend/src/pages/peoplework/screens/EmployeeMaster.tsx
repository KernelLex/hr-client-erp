// Employee Master — the active-employee roster (real data: 41 employees across
// the three group companies). Rows deep-link into the existing admin employee
// detail page.
import { useNavigate } from "react-router-dom"
import { ArchetypePage } from "../ArchetypePage"
import { hrmsPeopleGet } from "../client"
import type { ModulePayload, Row } from "../types"

export function EmployeeMasterPage() {
  const navigate = useNavigate()
  return (
    <ArchetypePage
      queryKey="hrms_employee_master"
      title="Employee Master"
      fetcher={() => hrmsPeopleGet<ModulePayload>("get_employee_master")}
      searchPlaceholder="Search by name, department, designation..."
      onRowClick={(row: Row) => {
        const email = row["_email"]
        if (email) navigate(`/admin/employees/${encodeURIComponent(String(email))}`)
      }}
    />
  )
}
