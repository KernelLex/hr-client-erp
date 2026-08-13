// Exit Management system — initiate employee separations, track them to
// completion, and record the exit interview.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { separationGet, separationPost, notesGet } from "../client"
import type { ModulePayload, Row } from "../types"

export function ExitManagementPage() {
  const { data: emps } = useQuery({
    queryKey: ["separation_employee_options"],
    queryFn: () => notesGet<{ options: { value: string; label: string }[] }>("get_employee_options"),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <SystemPage
      queryKey="exit_separations"
      title="Exit Management"
      fetcher={() => separationGet<ModulePayload>("get_separations")}
      searchPlaceholder="Search separations..."
      create={{
        label: "Initiate Exit",
        drawerTitle: "Initiate Employee Separation",
        submitLabel: "Initiate",
        successMessage: "Separation initiated",
        fields: [
          { name: "employee", label: "Employee", type: "select", required: true, options: emps?.options ?? [], placeholder: "Select employee" },
          { name: "exit_date", label: "Last Working Day", type: "date", required: true, half: true },
          { name: "resignation_letter_date", label: "Resignation Date", type: "date", half: true },
        ],
        submit: (v) => separationPost("initiate_separation", v),
      }}
      detail={{
        title: (row: Row) => `Exit · ${row["employee"]}`,
        actions: [
          { label: "Move to In Process", hidden: (r: Row) => r["status"] === "In Process", run: (r: Row) => separationPost("set_status", { name: r["id"], status: "In Process" }) },
          { label: "Mark Completed", variant: "primary", hidden: (r: Row) => r["status"] === "Completed", run: (r: Row) => separationPost("set_status", { name: r["id"], status: "Completed" }) },
          { label: "Save Exit Interview", reasonLabel: "Exit interview notes", successMessage: "Interview saved", run: (r: Row, reason?: string) => separationPost("record_exit_interview", { name: r["id"], notes: reason }) },
        ],
      }}
    />
  )
}
