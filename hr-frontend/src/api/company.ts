import { api, apiUrl } from "@/lib/api"

export interface CompanyBrand {
  name: string
  abbr: string
  label: string
  accent: string
  login_enabled?: boolean
}

export interface MyCompanies {
  active_company: string | null
  is_group_owner: boolean
  is_platform_admin: boolean
  companies: CompanyBrand[]
}

/** Public (guest) — companies shown on the pre-login picker. Branding only. */
export async function getLoginCompanies(): Promise<CompanyBrand[]> {
  const res = await api.get(apiUrl("hr_client.api.company.get_login_companies"))
  return res.data.message?.companies ?? []
}

/** The logged-in user's accessible companies + active one + tier. */
export async function getMyCompanies(): Promise<MyCompanies> {
  const res = await api.get(apiUrl("hr_client.api.company.get_my_companies"))
  return (
    res.data.message ?? {
      active_company: null,
      is_group_owner: false,
      is_platform_admin: false,
      companies: [],
    }
  )
}

/** Switch the active company for this session (server re-validates access). */
export async function setActiveCompany(company: string): Promise<string> {
  const res = await api.post(apiUrl("hr_client.api.company.set_active_company"), { company })
  return res.data.message?.active_company ?? company
}

export interface GroupSummary {
  companies: string[]
  per_company: Record<string, { sales: number; purchase: number; funds: number }>
  group_raw: { sales: number; purchase: number; funds: number }
  eliminations: { sales: number; purchase: number }
  group_consolidated: { sales: number; purchase: number; funds: number }
  note: string
}

/** Consolidated per-company + group totals (group owner only, __ALL__ scope). */
export async function getGroupSummary(): Promise<GroupSummary> {
  const res = await api.get(apiUrl("hr_client.api.company.group_summary"), {
    params: { company: "__ALL__" },
  })
  return res.data.message
}
