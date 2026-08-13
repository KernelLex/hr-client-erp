// Performance Appraisal system — run appraisal cycles and appraise employees
// against the standard KRAs, recording a score out of 5.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { appraisalGet, appraisalPost, notesGet } from "../client"
import type { ModulePayload, Row } from "../types"
import type { FieldSpec } from "../components/RecordDrawer"

export function AppraisalCyclesPage() {
  return (
    <SystemPage
      queryKey="appraisal_cycles"
      title="Appraisal Cycles"
      fetcher={() => appraisalGet<ModulePayload>("get_cycles")}
      searchPlaceholder="Search cycles..."
      create={{
        label: "New Cycle",
        drawerTitle: "New Appraisal Cycle",
        submitLabel: "Create Cycle",
        successMessage: "Cycle created",
        fields: [
          { name: "cycle_name", label: "Cycle Name", type: "text", required: true, placeholder: "e.g. Annual Review 2026" },
          { name: "start_date", label: "Period Start", type: "date", required: true, half: true },
          { name: "end_date", label: "Period End", type: "date", required: true, half: true },
        ],
        submit: (v) => appraisalPost("create_cycle", v),
      }}
    />
  )
}

export function AppraisalsPage() {
  const { data: emps } = useQuery({
    queryKey: ["appraisal_employee_options"],
    queryFn: () => notesGet<{ options: { value: string; label: string }[] }>("get_employee_options"),
    staleTime: 5 * 60 * 1000,
  })
  const { data: cycles } = useQuery({
    queryKey: ["appraisal_cycle_options"],
    queryFn: () => appraisalGet<{ options: { value: string; label: string }[] }>("get_cycle_options"),
    staleTime: 60 * 1000,
  })

  const fields: FieldSpec[] = [
    { name: "employee", label: "Employee", type: "select", required: true, options: emps?.options ?? [], placeholder: "Select employee" },
    { name: "appraisal_cycle", label: "Cycle", type: "select", required: true, options: cycles?.options ?? [], placeholder: "Select cycle" },
  ]

  return (
    <SystemPage
      queryKey="appraisals"
      title="Performance Appraisal"
      fetcher={() => appraisalGet<ModulePayload>("get_appraisals")}
      searchPlaceholder="Search appraisals..."
      create={{ label: "New Appraisal", drawerTitle: "New Appraisal", subtitle: "Appraises the employee against the standard KRAs: Quality, Productivity, Teamwork, Discipline.", submitLabel: "Create", successMessage: "Appraisal created", fields, submit: (v) => appraisalPost("create_appraisal", v) }}
      detail={{
        title: (row: Row) => `Appraisal · ${row["employee"]}`,
        actions: [
          {
            label: "Record Score",
            variant: "primary",
            reasonLabel: "Score out of 5 (e.g. 4.2)",
            successMessage: "Score recorded",
            run: (row: Row, reason?: string) => appraisalPost("set_score", { name: row["id"], score: reason }),
          },
        ],
      }}
    />
  )
}
