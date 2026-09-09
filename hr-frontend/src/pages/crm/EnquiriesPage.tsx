// CRM Enquiries (Phase 2 spec §3.2) — qualified requirements. Convert an
// enquiry to an opportunity to move it into the pipeline.
import { SystemPage } from "../peoplework/SystemPage"
import { crmPipelineGet, crmPipelinePost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "enquiry_title", label: "Enquiry Title", type: "text", required: true },
  { name: "company_name", label: "Company / Client", type: "text" },
  { name: "contact_person", label: "Contact Person", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "scope", label: "Scope", type: "textarea" },
  { name: "rooms", label: "Rooms / Areas", type: "text" },
  {
    name: "budget_band", label: "Budget Band", type: "select", placeholder: "Select band",
    options: ["Under 5L", "5-10L", "10-25L", "25-50L", "50L+"].map((b) => ({ value: b, label: b })),
  },
  { name: "timeline", label: "Timeline", type: "text" },
  { name: "site_address", label: "Site Address", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea" },
]

export function EnquiriesPage() {
  return (
    <SystemPage
      queryKey="crm_enquiries"
      title="Enquiries"
      fetcher={() => crmPipelineGet<ModulePayload>("get_enquiries_page")}
      searchPlaceholder="Search enquiries..."
      create={{
        label: "New Enquiry",
        drawerTitle: "New Enquiry",
        submitLabel: "Create Enquiry",
        successMessage: "Enquiry created",
        fields: FIELDS,
        submit: (v) => crmPipelinePost("create_enquiry", { payload: v }),
      }}
      detail={{
        title: (row: Row) => `${row["enquiry_title"]} · ${row["status"]}`,
        actions: [
          {
            label: "Convert to Opportunity",
            variant: "primary",
            successMessage: "Opportunity created",
            hidden: (row: Row) => row["status"] === "Converted",
            run: (row: Row) => crmPipelinePost("convert_enquiry_to_opportunity", { name: row["name"] }),
          },
        ],
      }}
    />
  )
}
