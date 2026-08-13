// Payroll system — full processing: define structures, assign them with a base,
// run a pay period (generates slips), review and submit slips.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { payrollGet, payrollPost, notesGet } from "../client"
import type { ModulePayload, Row } from "../types"
import type { FieldSpec } from "../components/RecordDrawer"

export function SalaryStructuresPage() {
  return (
    <SystemPage
      queryKey="payroll_structures"
      title="Salary Structures"
      fetcher={() => payrollGet<ModulePayload>("get_salary_structures")}
      searchPlaceholder="Search structures..."
      create={{
        label: "New Structure",
        drawerTitle: "New Salary Structure",
        subtitle: "Creates a standard structure: Basic 50% · HRA 20% · Special 30%, with PF (12% of Basic) and Professional Tax deductions — all driven by each employee's base pay.",
        submitLabel: "Create Structure",
        successMessage: "Salary structure created",
        fields: [{ name: "structure_name", label: "Structure Name", type: "text", required: true, placeholder: "e.g. Vera Standard Monthly" }],
        submit: (v) => payrollPost("create_standard_structure", v),
      }}
    />
  )
}

export function SalaryAssignmentsPage() {
  const { data: emps } = useQuery({
    queryKey: ["payroll_employee_options"],
    queryFn: () => notesGet<{ options: { value: string; label: string }[] }>("get_employee_options"),
    staleTime: 5 * 60 * 1000,
  })
  const { data: structs } = useQuery({
    queryKey: ["payroll_structure_options"],
    queryFn: () => payrollGet<{ options: { value: string; label: string }[] }>("get_structure_options"),
    staleTime: 60 * 1000,
  })

  const fields: FieldSpec[] = [
    { name: "employee", label: "Employee", type: "select", required: true, options: emps?.options ?? [], placeholder: "Select employee" },
    { name: "salary_structure", label: "Structure", type: "select", required: true, options: structs?.options ?? [], placeholder: "Select structure" },
    { name: "from_date", label: "Effective From", type: "date", required: true, half: true },
    { name: "base", label: "Base Pay (₹/month)", type: "number", required: true, half: true, placeholder: "30000" },
  ]

  return (
    <SystemPage
      queryKey="payroll_assignments"
      title="Salary Assignments"
      fetcher={() => payrollGet<ModulePayload>("get_assignments")}
      searchPlaceholder="Search assignments..."
      create={{ label: "Assign Structure", drawerTitle: "Assign Salary Structure", submitLabel: "Assign", successMessage: "Structure assigned", fields, submit: (v) => payrollPost("assign_structure", v) }}
    />
  )
}

export function PayrollRunsPage() {
  return (
    <SystemPage
      queryKey="payroll_runs"
      title="Payroll Runs"
      fetcher={() => payrollGet<ModulePayload>("get_payroll_runs")}
      searchPlaceholder="Search runs..."
      create={{
        label: "Run Payroll",
        drawerTitle: "Run Payroll",
        subtitle: "Generates a draft Salary Slip for every employee with an active structure assignment in the period. Review and submit them on the Salary Slips screen.",
        submitLabel: "Run",
        successMessage: "Payroll run — slips generated",
        fields: [
          { name: "start_date", label: "Period Start", type: "date", required: true, half: true },
          { name: "end_date", label: "Period End", type: "date", required: true, half: true },
        ],
        submit: (v) => payrollPost("run_payroll", v),
      }}
    />
  )
}

export function SalarySlipsPage() {
  return (
    <SystemPage
      queryKey="payroll_slips"
      title="Salary Slips"
      fetcher={() => payrollGet<ModulePayload>("get_salary_slips")}
      searchPlaceholder="Search slips..."
      detail={{
        title: (row: Row) => `${row["employee"]} · ${row["period"]}`,
        actions: [
          {
            label: "Submit Slip",
            variant: "primary",
            hidden: (row: Row) => row["status"] === "Submitted",
            successMessage: "Slip submitted",
            run: (row: Row) => payrollPost("submit_slip", { name: row["id"] }),
          },
        ],
      }}
    />
  )
}
