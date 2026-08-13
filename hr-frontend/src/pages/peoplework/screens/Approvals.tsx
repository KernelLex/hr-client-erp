// Workflow Approvals — one action queue over everything awaiting the admin's
// decision (pending leave, expenses, CRM stage pushes). Approve/reject in place.
import { SystemPage } from "../SystemPage"
import { approvalsGet, approvalsPost } from "../client"
import type { ModulePayload, Row } from "../types"

export function WorkflowApprovalsPage() {
  return (
    <SystemPage
      queryKey="workflow_approvals"
      title="Workflow Approvals"
      fetcher={() => approvalsGet<ModulePayload>("get_pending_approvals")}
      searchPlaceholder="Search pending approvals..."
      detail={{
        title: (row: Row) => `${row["type"]} · ${row["raised_by"]}`,
        actions: [
          {
            label: "Approve",
            variant: "primary",
            successMessage: "Approved",
            run: (row: Row) => approvalsPost("act", { kind: row["_kind"], id: row["id"], action: "approve" }),
          },
          {
            label: "Reject",
            variant: "danger",
            reasonLabel: "Reason for rejection",
            successMessage: "Rejected",
            run: (row: Row, reason?: string) => approvalsPost("act", { kind: row["_kind"], id: row["id"], action: "reject", reason }),
          },
        ],
      }}
    />
  )
}
