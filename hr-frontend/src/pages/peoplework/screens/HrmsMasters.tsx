// HRMS master-data screens — Departments and Designations. Thin wrappers over
// ArchetypePage that point at the hrms_masters backend endpoints.
import { ArchetypePage } from "../ArchetypePage"
import { hrmsMastersGet } from "../client"
import type { ModulePayload } from "../types"

export function DepartmentsPage() {
  return (
    <ArchetypePage
      queryKey="hrms_departments"
      title="Departments"
      fetcher={() => hrmsMastersGet<ModulePayload>("get_departments")}
      searchPlaceholder="Search departments..."
    />
  )
}

export function DesignationsPage() {
  return (
    <ArchetypePage
      queryKey="hrms_designations"
      title="Designations"
      fetcher={() => hrmsMastersGet<ModulePayload>("get_designations")}
      searchPlaceholder="Search designations..."
    />
  )
}
