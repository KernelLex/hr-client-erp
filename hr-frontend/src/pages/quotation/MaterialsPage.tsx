// Quotation Studio · Materials master (Phase 2 spec §4.7). Carcass/shutter
// materials with thicknesses used in BOQ line specifications.
import { SystemPage } from "../peoplework/SystemPage"
import { quotationMastersGet, quotationMastersPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, placeholder: "MAT-BWP-18" },
  { name: "material_name", label: "Material", type: "text", required: true, half: true, placeholder: "BWP Plywood" },
  { name: "category", label: "Category", type: "text", half: true, placeholder: "Carcass / Shutter" },
  { name: "thickness", label: "Thickness", type: "text", half: true, placeholder: "18 mm" },
  { name: "uom", label: "UOM", type: "text", half: true, placeholder: "SFT" },
  { name: "status", label: "Status", type: "select", default: "Active", half: true,
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
]

export function MaterialsPage() {
  return (
    <SystemPage
      queryKey="q_materials"
      title="Materials"
      fetcher={() => quotationMastersGet<ModulePayload>("get_materials_page")}
      searchPlaceholder="Search materials..."
      create={{
        label: "New Material",
        drawerTitle: "New Material",
        submitLabel: "Create Material",
        successMessage: "Material created",
        fields: FIELDS,
        submit: (v) => quotationMastersPost("create_material", { payload: v }),
      }}
    />
  )
}
