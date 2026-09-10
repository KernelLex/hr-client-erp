// Quotation Studio · Pricing Methods master (Phase 2 spec §4.3/§4.7). The five
// methods that drive BOQ quantity calculation. The standard set is seeded.
import { SystemPage } from "../peoplework/SystemPage"
import { quotationMastersGet, quotationMastersPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true },
  { name: "method", label: "Method", type: "select", required: true, half: true,
    options: ["RFT", "SFT", "SQM", "UNIT", "LS"].map((m) => ({ value: m, label: m })) },
  { name: "formula", label: "Formula", type: "text", help: "e.g. width × height ÷ 92,903.04 × qty" },
  { name: "uom", label: "UOM", type: "text", half: true },
  { name: "status", label: "Status", type: "select", default: "Active", half: true,
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
]

export function PricingMethodsPage() {
  return (
    <SystemPage
      queryKey="q_pricing"
      title="Pricing Methods"
      fetcher={() => quotationMastersGet<ModulePayload>("get_pricing_page")}
      searchPlaceholder="Search methods..."
      create={{
        label: "New Method",
        drawerTitle: "New Pricing Method",
        submitLabel: "Create Method",
        successMessage: "Pricing method created",
        fields: FIELDS,
        submit: (v) => quotationMastersPost("create_pricing_method", { payload: v }),
      }}
    />
  )
}
