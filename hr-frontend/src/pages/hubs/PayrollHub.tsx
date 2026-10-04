import { TabbedHub } from "@/components/layout/TabbedHub"
import {
  SalaryStructuresPage, SalaryAssignmentsPage, PayrollRunsPage, SalarySlipsPage,
} from "@/pages/peoplework/screens/Payroll"

// Payroll (People) — the four payroll screens bundled under one entry.
// Every screen is the original component; routes /hrms/salary-assignments etc.
// still resolve directly for deep-links.
export function PayrollHub() {
  return (
    <TabbedHub
      title="Payroll"
      subtitle="Salary processing"
      crumb="People / HRMS / Payroll"
      tabs={[
        { key: "structures", label: "Salary Structures", element: <SalaryStructuresPage /> },
        { key: "assignments", label: "Salary Assignments", element: <SalaryAssignmentsPage /> },
        { key: "runs", label: "Payroll Runs", element: <PayrollRunsPage /> },
        { key: "slips", label: "Salary Slips", element: <SalarySlipsPage /> },
      ]}
    />
  )
}
