// Quotation Studio · Templates master (Phase 2 spec §4.7). Measurement/spec
// templates whose dynamic fields become the dimension inputs during entry.
import { SystemPage } from "../peoplework/SystemPage"
import { quotationMastersGet, quotationMastersPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, placeholder: "TMPL-WHD" },
  { name: "template_name", label: "Template", type: "text", required: true, half: true, placeholder: "Width × Height × Depth" },
  { name: "applies_to", label: "Applies To", type: "text", placeholder: "Base Units / Wardrobes" },
  { name: "dynamic_fields", label: "Dynamic Fields", type: "textarea",
    help: "Comma-separated dimension fields (e.g. width, height, depth)" },
  { name: "status", label: "Status", type: "select", default: "Active",
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
]

export function TemplatesPage() {
  return (
    <SystemPage
      queryKey="q_templates"
      title="Templates"
      fetcher={() => quotationMastersGet<ModulePayload>("get_templates_page")}
      searchPlaceholder="Search templates..."
      create={{
        label: "New Template",
        drawerTitle: "New Template",
        submitLabel: "Create Template",
        successMessage: "Template created",
        fields: FIELDS,
        submit: (v) => quotationMastersPost("create_template", { payload: v }),
      }}
    />
  )
}
