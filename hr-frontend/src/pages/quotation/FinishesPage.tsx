// Quotation Studio · Finishes master (Phase 2 spec §4.7). Internal/external
// finishes and edge banding for BOQ line specifications.
import { SystemPage } from "../peoplework/SystemPage"
import { quotationMastersGet, quotationMastersPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, placeholder: "FIN-LAM-OAK" },
  { name: "finish_name", label: "Finish", type: "text", required: true, half: true, placeholder: "Synchronised Laminate — Oak" },
  { name: "category", label: "Category", type: "text", half: true, placeholder: "Laminate / Acrylic / Veneer" },
  { name: "finish_type", label: "Type", type: "text", half: true, placeholder: "Matte / Gloss / Textured" },
  { name: "colour", label: "Colour", type: "text", half: true },
  { name: "rate_uom", label: "Rate UOM", type: "text", half: true, placeholder: "SFT" },
  { name: "status", label: "Status", type: "select", default: "Active",
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
]

export function FinishesPage() {
  return (
    <SystemPage
      queryKey="q_finishes"
      title="Finishes"
      fetcher={() => quotationMastersGet<ModulePayload>("get_finishes_page")}
      searchPlaceholder="Search finishes..."
      create={{
        label: "New Finish",
        drawerTitle: "New Finish",
        submitLabel: "Create Finish",
        successMessage: "Finish created",
        fields: FIELDS,
        submit: (v) => quotationMastersPost("create_finish", { payload: v }),
      }}
    />
  )
}
