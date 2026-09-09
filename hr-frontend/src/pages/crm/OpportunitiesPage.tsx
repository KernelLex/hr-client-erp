// CRM Opportunities (Phase 2 spec §3.2) — the pipeline. Stage moves are done
// from the row detail; marking Won is the §5 project-handover trigger.
import { SystemPage } from "../peoplework/SystemPage"
import { crmPipelineGet, crmPipelinePost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const STAGES = ["Qualification", "Proposal", "Negotiation", "Won", "Lost"]

const FIELDS: FieldSpec[] = [
  { name: "opportunity_title", label: "Opportunity Title", type: "text", required: true },
  { name: "company_name", label: "Company / Client", type: "text" },
  { name: "contact_person", label: "Contact Person", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  {
    name: "stage", label: "Stage", type: "select", default: "Qualification",
    options: STAGES.map((s) => ({ value: s, label: s })),
  },
  { name: "estimated_value", label: "Estimated Value", type: "number" },
  { name: "probability", label: "Probability (%)", type: "number" },
  { name: "expected_close", label: "Expected Close", type: "date" },
  { name: "competitor", label: "Competitor", type: "text" },
  { name: "notes", label: "Notes", type: "textarea" },
]

const move = (name: unknown, stage: string) =>
  crmPipelinePost("set_opportunity_stage", { name, stage })

export function OpportunitiesPage() {
  return (
    <SystemPage
      queryKey="crm_opportunities"
      title="Opportunities"
      fetcher={() => crmPipelineGet<ModulePayload>("get_opportunities_page")}
      searchPlaceholder="Search opportunities..."
      create={{
        label: "New Opportunity",
        drawerTitle: "New Opportunity",
        submitLabel: "Create Opportunity",
        successMessage: "Opportunity created",
        fields: FIELDS,
        submit: (v) => crmPipelinePost("create_opportunity", { payload: v }),
      }}
      detail={{
        title: (row: Row) => `${row["opportunity_title"]} · ${row["stage"]}`,
        actions: [
          {
            label: "Move to Proposal", variant: "default",
            successMessage: "Moved to Proposal",
            hidden: (r: Row) => r["stage"] !== "Qualification",
            run: (r: Row) => move(r["name"], "Proposal"),
          },
          {
            label: "Move to Negotiation", variant: "default",
            successMessage: "Moved to Negotiation",
            hidden: (r: Row) => r["stage"] !== "Proposal",
            run: (r: Row) => move(r["name"], "Negotiation"),
          },
          {
            label: "Mark Won", variant: "primary",
            successMessage: "Marked Won",
            hidden: (r: Row) => r["stage"] === "Won" || r["stage"] === "Lost",
            run: (r: Row) => move(r["name"], "Won"),
          },
          {
            label: "Mark Lost", variant: "danger", reasonLabel: "Loss reason",
            successMessage: "Marked Lost",
            hidden: (r: Row) => r["stage"] === "Won" || r["stage"] === "Lost",
            run: (r: Row, reason?: string) =>
              crmPipelinePost("set_opportunity_stage", { name: r["name"], stage: "Lost", loss_reason: reason }),
          },
        ],
      }}
    />
  )
}
