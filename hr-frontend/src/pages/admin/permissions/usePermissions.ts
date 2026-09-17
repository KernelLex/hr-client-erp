import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import type { GetUsersPermissionsResponse, UpdatePermissionsPayload, CompanyAccessRow } from "./types"

const BASE = "hr_client.api.permissions"

export function useUsersWithPermissions() {
  return useQuery<GetUsersPermissionsResponse>({
    queryKey: ["permissions", "users-v3"],
    queryFn: async () => {
      const res = await api.get(apiUrl(`${BASE}.get_all_users_with_permissions`))
      return res.data.message
    },
    staleTime: 1000 * 60,
  })
}

export function useUpdatePermissions() {
  const qc = useQueryClient()
  return useMutation({
    // `company` (optional) scopes the module denials to one company. Omitted →
    // backend uses the active company.
    mutationFn: async (payload: UpdatePermissionsPayload & { company?: string }) => {
      const res = await api.post(apiUrl(`${BASE}.update_user_permissions`), {
        email: payload.email,
        permissions: JSON.stringify(payload.permissions),
        ...(payload.company ? { company: payload.company } : {}),
      })
      const msg = res.data.message
      if (msg && msg.success === false) {
        throw new Error(msg.error ?? "Unknown backend error")
      }
      return msg
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permissions", "users-v3"] })
    },
  })
}

export type { CompanyAccessRow }

/** Fetch a user's company-access allowlist. */
export function useUserCompanyAccess(email: string | null) {
  return useQuery<{ email: string; rows: CompanyAccessRow[] }>({
    queryKey: ["company-access", email],
    enabled: !!email,
    queryFn: async () => {
      const res = await api.get(apiUrl(`${BASE}.get_user_company_access`), { params: { email } })
      return res.data.message
    },
    staleTime: 1000 * 30,
  })
}

/** Rewrite a user's company-access allowlist (Owais only, server-enforced). */
export function useUpdateCompanyAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { user: string; rows: CompanyAccessRow[] }) => {
      const res = await api.post(apiUrl(`${BASE}.update_user_company_access`), {
        user: payload.user,
        rows: JSON.stringify(payload.rows),
      })
      const msg = res.data.message
      if (msg && msg.success === false) {
        throw new Error(msg.error ?? "Unknown backend error")
      }
      return msg
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["permissions", "users-v3"] })
      qc.invalidateQueries({ queryKey: ["company-access", vars.user] })
    },
  })
}
