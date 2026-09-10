// Quotation Studio · Terms clause library (Phase 2 spec §4.10). Modular,
// categorised clauses assembled into versioned templates (see TermsTemplatesPage)
// and stamped onto a quotation at approval time.
import { SystemPage } from "../peoplework/SystemPage"
import { termsGet, termsPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const CATEGORIES = [
  "Complete Interior Project", "Trading and Supply", "Appliances",
  "Countertop Stone", "Labour and Installation", "Variation",
]

const FIELDS: FieldSpec[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, placeholder: "PAY-50-ADV" },
  { name: "title", label: "Title", type: "text", required: true, half: true, placeholder: "Payment Schedule" },
  { name: "category", label: "Category", type: "select", half: true,
    options: CATEGORIES.map((c) => ({ value: c, label: c })) },
  { name: "applies_to_scope", label: "Applies To", type: "text", half: true, placeholder: "All / Modular / Trading" },
  { name: "mandatory", label: "Mandatory (always included)", type: "checkbox" },
  { name: "status", label: "Status", type: "select", default: "Active",
    options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })) },
  { name: "customer_text", label: "Customer-facing Text", type: "textarea", required: true },
]

export function TermsClausesPage() {
  return (
    <SystemPage
      queryKey="q_terms_clauses"
      title="Terms — Clauses"
      fetcher={() => termsGet<ModulePayload>("get_clauses_page")}
      searchPlaceholder="Search clauses..."
      create={{
        label: "New Clause",
        drawerTitle: "New Terms Clause",
        submitLabel: "Create Clause",
        successMessage: "Clause created",
        fields: FIELDS,
        submit: (v) => termsPost("create_clause", { payload: v }),
      }}
    />
  )
}
