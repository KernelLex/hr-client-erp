// Customer Contacts (Phase 2 spec §3.2) — multiple contacts per customer.
import { SystemPage } from "../peoplework/SystemPage"
import { crmDirGet, crmDirPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"

const FIELDS: FieldSpec[] = [
  { name: "contact_name", label: "Contact Name", type: "text", required: true },
  { name: "customer", label: "Customer", type: "text" },
  { name: "role", label: "Role", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "whatsapp", label: "WhatsApp", type: "text" },
  {
    name: "preferred_channel", label: "Preferred Channel", type: "select", placeholder: "Select channel",
    options: ["Phone", "Email", "WhatsApp"].map((c) => ({ value: c, label: c })),
  },
  { name: "notes", label: "Notes", type: "textarea" },
]

export function ContactsPage() {
  return (
    <SystemPage
      queryKey="crm_contacts"
      title="Customer Contacts"
      fetcher={() => crmDirGet<ModulePayload>("get_contacts_page")}
      searchPlaceholder="Search contacts..."
      create={{
        label: "New Contact",
        drawerTitle: "New Contact",
        submitLabel: "Save Contact",
        successMessage: "Contact added",
        fields: FIELDS,
        submit: (v) => crmDirPost("create_contact", { payload: v }),
      }}
    />
  )
}
