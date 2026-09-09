// Data Entry Requests (Phase 2 spec §2.4) — the admin review queue. Admins see
// every request (pending first) with approve / reject / return / under-review
// actions; a non-admin sees only their own requests, read-only, so they can
// track status and read any rejection reason.
import { SystemPage } from "../peoplework/SystemPage"
import { erpEntriesGet, erpEntriesPost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"
import type { RowAction } from "../peoplework/SystemPage"
import { useAuth } from "@/context/AuthContext"
import { ADMIN_USERS } from "@/lib/constants"

const PENDING = new Set(["Submitted", "Under Review"])

export function DataEntryRequestsPage() {
  const { user } = useAuth()
  const isAdmin = !!user && ADMIN_USERS.has(user.name)

  const actions: RowAction[] = isAdmin
    ? [
        {
          label: "Mark Under Review",
          variant: "default",
          successMessage: "Marked under review",
          hidden: (row: Row) => row["request_status"] !== "Submitted",
          run: (row: Row) => erpEntriesPost("mark_under_review", { name: row["name"] }),
        },
        {
          label: "Approve",
          variant: "primary",
          successMessage: "Approved — entry created",
          hidden: (row: Row) => !PENDING.has(String(row["request_status"])),
          run: (row: Row) => erpEntriesPost("approve_request", { name: row["name"] }),
        },
        {
          label: "Return for Info",
          variant: "default",
          reasonLabel: "What needs correcting?",
          successMessage: "Returned to requester",
          hidden: (row: Row) => !PENDING.has(String(row["request_status"])),
          run: (row: Row, reason?: string) =>
            erpEntriesPost("return_request", { name: row["name"], admin_notes: reason }),
        },
        {
          label: "Reject",
          variant: "danger",
          reasonLabel: "Reason for rejection",
          successMessage: "Rejected",
          hidden: (row: Row) => !PENDING.has(String(row["request_status"])),
          run: (row: Row, reason?: string) =>
            erpEntriesPost("reject_request", { name: row["name"], rejection_reason: reason }),
        },
      ]
    : []

  return (
    <SystemPage
      queryKey="data_entry_requests"
      title="Data Entry Requests"
      fetcher={() => erpEntriesGet<ModulePayload>("get_requests_page")}
      searchPlaceholder="Search requests..."
      detail={{
        title: (row: Row) => `${row["entry_type"]} · ${row["request_status"]}`,
        actions,
      }}
    />
  )
}
