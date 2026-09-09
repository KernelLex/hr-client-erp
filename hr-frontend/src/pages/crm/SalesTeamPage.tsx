// Sales Team (Phase 2 spec §3.2) — team structure + the approval authority
// each member carries into the quotation approval engine (§4.6). Admin-managed.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../peoplework/SystemPage"
import { crmDirGet, crmDirPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"
import { useAuth } from "@/context/AuthContext"
import { ADMIN_USERS } from "@/lib/constants"

const AUTHORITIES = ["None", "Sales Executive", "Sales Manager", "CFO", "Director"]

export function SalesTeamPage() {
  const { user } = useAuth()
  const isAdmin = !!user && ADMIN_USERS.has(user.name)

  const { data: users } = useQuery({
    queryKey: ["sales_team_user_options"],
    queryFn: () => crmDirGet<{ options: { value: string; label: string }[] }>("get_user_options"),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  })

  const create = isAdmin
    ? {
        label: "Add Member",
        drawerTitle: "Add Sales Team Member",
        submitLabel: "Add Member",
        successMessage: "Member added",
        fields: [
          { name: "member", label: "User", type: "select" as const, required: true, options: users?.options ?? [], placeholder: "Select user" },
          { name: "territory", label: "Territory", type: "text" as const },
          { name: "reports_to", label: "Reports To", type: "select" as const, options: users?.options ?? [], placeholder: "Select manager" },
          { name: "approval_authority", label: "Approval Authority", type: "select" as const, default: "None", options: AUTHORITIES.map((a) => ({ value: a, label: a })) },
          { name: "status", label: "Status", type: "select" as const, default: "Active", options: [{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }] },
        ],
        submit: (v: Record<string, unknown>) => crmDirPost("create_team_member", { payload: v }),
      }
    : undefined

  return (
    <SystemPage
      queryKey="sales_team"
      title="Sales Team"
      fetcher={() => crmDirGet<ModulePayload>("get_team_page")}
      searchPlaceholder="Search team..."
      create={create}
    />
  )
}
