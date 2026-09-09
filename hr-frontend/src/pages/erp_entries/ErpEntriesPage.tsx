// ERP Entries (Phase 2 spec §2.3) — ERP-native records that live outside the
// Tally books. Admins create entries directly; everyone else files a request
// (spec §2.4). The list itself is read-only for all roles.
import { SystemPage } from "../peoplework/SystemPage"
import { erpEntriesGet, erpEntriesPost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"
import type { FieldSpec } from "../peoplework/components/RecordDrawer"
import { useAuth } from "@/context/AuthContext"
import { ADMIN_USERS } from "@/lib/constants"

const ENTRY_TYPES = [
  "Supplementary Invoice",
  "Proforma Invoice",
  "Internal Debit Note",
  "Internal Credit Note",
  "Expense Entry",
  "Advance Record",
  "Manual Adjustment",
  "Free-form Document",
]

const ENTRY_FIELDS: FieldSpec[] = [
  {
    name: "entry_type", label: "Entry Type", type: "select", required: true,
    options: ENTRY_TYPES.map((t) => ({ value: t, label: t })),
    placeholder: "Select type",
  },
  { name: "entry_date", label: "Date", type: "date", required: true },
  { name: "party", label: "Party", type: "text", placeholder: "Customer / supplier" },
  { name: "amount", label: "Amount", type: "number", placeholder: "0.00" },
  { name: "description", label: "Description", type: "textarea", required: true },
  { name: "reason", label: "Reason", type: "textarea", placeholder: "Why this entry is needed" },
  { name: "linked_project", label: "Linked Project", type: "text" },
  { name: "linked_sales_order", label: "Linked Sales Order", type: "text" },
]

export function ErpEntriesPage() {
  const { user } = useAuth()
  const isAdmin = !!user && ADMIN_USERS.has(user.name)

  const create = isAdmin
    ? {
        label: "New Entry",
        drawerTitle: "New ERP Entry",
        subtitle: "Recorded directly in the ERP (non-statutory).",
        submitLabel: "Create Entry",
        successMessage: "Entry created",
        fields: ENTRY_FIELDS,
        submit: (v: Record<string, unknown>) => erpEntriesPost("create_entry", { payload: v }),
      }
    : {
        label: "Request Entry",
        drawerTitle: "Request an ERP Entry",
        subtitle: "Your request goes to an admin for approval.",
        submitLabel: "Submit Request",
        successMessage: "Request submitted for approval",
        fields: ENTRY_FIELDS,
        submit: async (v: Record<string, unknown>) => {
          const saved = await erpEntriesPost<{ name: string }>("save_request", { payload: v })
          return erpEntriesPost("submit_request", { name: saved.name })
        },
      }

  const detail = isAdmin
    ? {
        title: (row: Row) => `${row["entry_type"]} · ${row["party"]}`,
        actions: [
          {
            label: "Void Entry",
            variant: "danger" as const,
            reasonLabel: "Reason for voiding",
            successMessage: "Entry voided",
            hidden: (row: Row) => row["status"] === "Voided",
            run: (row: Row, reason?: string) =>
              erpEntriesPost("void_entry", { name: row["name"], reason }),
          },
        ],
      }
    : undefined

  return (
    <SystemPage
      queryKey="erp_entries"
      title="ERP Entries"
      fetcher={() => erpEntriesGet<ModulePayload>("get_entries_page")}
      searchPlaceholder="Search entries..."
      create={create}
      detail={detail}
    />
  )
}
