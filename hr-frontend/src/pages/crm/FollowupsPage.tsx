// Follow-ups (Phase 2 spec §3.2) — task list against leads / enquiries /
// opportunities. Mark done with an outcome.
import { SystemPage } from "../peoplework/SystemPage"
import { crmDirGet, crmDirPost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "subject", label: "Subject", type: "text", required: true },
  {
    name: "linked_type", label: "Against", type: "select", placeholder: "Select type",
    options: ["Lead", "Enquiry", "Opportunity"].map((t) => ({ value: t, label: t })),
  },
  { name: "linked_name", label: "Record ID", type: "text", placeholder: "e.g. VCO-2026-0001" },
  { name: "due_date", label: "Due Date", type: "date" },
  { name: "next_action", label: "Next Action", type: "textarea" },
]

export function FollowupsPage() {
  return (
    <SystemPage
      queryKey="crm_followups"
      title="Follow-ups"
      fetcher={() => crmDirGet<ModulePayload>("get_followups_page")}
      searchPlaceholder="Search follow-ups..."
      create={{
        label: "New Follow-up",
        drawerTitle: "New Follow-up",
        submitLabel: "Create",
        successMessage: "Follow-up created",
        fields: FIELDS,
        submit: (v) => crmDirPost("create_followup", { payload: v }),
      }}
      detail={{
        title: (row: Row) => `${row["subject"]} · ${row["status"]}`,
        actions: [
          {
            label: "Mark Done",
            variant: "primary",
            reasonLabel: "Outcome",
            successMessage: "Marked done",
            hidden: (row: Row) => row["status"] === "Done",
            run: (row: Row, reason?: string) => crmDirPost("complete_followup", { name: row["name"], outcome: reason }),
          },
        ],
      }}
    />
  )
}
