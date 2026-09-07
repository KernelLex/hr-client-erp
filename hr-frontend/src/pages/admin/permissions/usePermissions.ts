import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import type { GetUsersPermissionsResponse, UpdatePermissionsPayload } from "./types"

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
    mutationFn: async (payload: UpdatePermissionsPayload) => {
      const res = await api.post(apiUrl(`${BASE}.update_user_permissions`), {
        email: payload.email,
        permissions: JSON.stringify(payload.permissions),
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
