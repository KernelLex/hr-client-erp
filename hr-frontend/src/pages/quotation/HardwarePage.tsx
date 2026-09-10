// Quotation Studio · Hardware master (Phase 2 spec §4.7). Hardware items and
// packages (hinges, channels, baskets) referenced by units and BOQ lines.
import { SystemPage } from "../peoplework/SystemPage"
import { quotationMastersGet, quotationMastersPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, placeholder: "HW-BLUM-PREM" },
  { name: "hardware_item", label: "Hardware Item", type: "text", required: true, half: true, placeholder: "Soft-close Hinge" },
  { name: "category", label: "Category", type: "text", half: true, placeholder: "Hinge / Channel / Basket" },
  { name: "brand", label: "Brand", type: "text", half: true, placeholder: "Blum / Hettich / Ebco" },
  { name: "series", label: "Series", type: "text", half: true },
  { name: "uom", label: "UOM", type: "text", half: true, placeholder: "Set / Nos" },
  { name: "status", label: "Status", type: "select", default: "Active",
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
]

export function HardwarePage() {
  return (
    <SystemPage
      queryKey="q_hardware"
      title="Hardware"
      fetcher={() => quotationMastersGet<ModulePayload>("get_hardware_page")}
      searchPlaceholder="Search hardware..."
      create={{
        label: "New Hardware",
        drawerTitle: "New Hardware Item",
        submitLabel: "Create Hardware",
        successMessage: "Hardware created",
        fields: FIELDS,
        submit: (v) => quotationMastersPost("create_hardware", { payload: v }),
      }}
    />
  )
}
