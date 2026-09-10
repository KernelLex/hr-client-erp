// Quotation Studio · Units master (Phase 2 spec §4.7). Unit types with their
// default pricing method, measurement template and hardware package.
import { SystemPage } from "../peoplework/SystemPage"
import { quotationMastersGet, quotationMastersPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, placeholder: "KIT-BAS-STD" },
  { name: "unit_name", label: "Unit", type: "text", required: true, half: true },
  { name: "product_group", label: "Product Group", type: "text", half: true, placeholder: "Kitchen / Wardrobe / TV Unit" },
  { name: "category", label: "Category", type: "text", half: true, placeholder: "Base Unit / Wall Unit" },
  { name: "pricing_method", label: "Pricing Method", type: "select", half: true,
    options: ["RFT", "SFT", "SQM", "UNIT", "LS"].map((m) => ({ value: m, label: m })) },
  { name: "measurement_template", label: "Measurement Template", type: "text", half: true },
  { name: "hardware_package", label: "Hardware Package", type: "text" },
  { name: "status", label: "Status", type: "select", default: "Active",
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
]

export function UnitsPage() {
  return (
    <SystemPage
      queryKey="q_units"
      title="Units"
      fetcher={() => quotationMastersGet<ModulePayload>("get_units_page")}
      searchPlaceholder="Search units..."
      create={{
        label: "New Unit",
        drawerTitle: "New Unit",
        submitLabel: "Create Unit",
        successMessage: "Unit created",
        fields: FIELDS,
        submit: (v) => quotationMastersPost("create_unit", { payload: v }),
      }}
    />
  )
}
