import { ADMIN_USERS } from "@/lib/constants"
import { createContext, useContext, ReactNode, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import { useAuth } from "./AuthContext"
import type { RegistryGroup } from "@/pages/admin/permissions/types"


interface PermissionsContextValue {
  /** True if the given nav/permission key is allowed for the effective user. */
  can: (key: string) => boolean
  /** Back-compat alias — same as `can`. */
  moduleEnabled: (key: string) => boolean
  isLoading: boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  can: () => true,
  moduleEnabled: () => true,
  isLoading: false,
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isLoggedIn, isImpersonating, viewAs } = useAuth()
  const isAdmin = !!(user && ADMIN_USERS.has(user.name))

  const { data, isLoading } = useQuery({
    queryKey: ["my_permissions", user?.name],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.permissions.get_my_permissions"))
      return res.data.message as { modules: Record<string, boolean> }
    },
    // While previewing another user we already have their permissions from the
    // switcher, so no fetch is needed.
    enabled: isLoggedIn && !isAdmin && !isImpersonating,
    staleTime: 1000 * 60 * 5,
  })

  // The registry gives us each key's parent group, so disabling a whole module
  // also hides its subsections. Cached by any logged-in user.
  const { data: registryData } = useQuery({
    queryKey: ["permission_registry"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.permissions.get_permission_registry"))
      return res.data.message as { registry: RegistryGroup[] }
    },
    enabled: isLoggedIn,
    staleTime: 1000 * 60 * 30,
  })

  const parentOf = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const group of registryData?.registry ?? []) {
      map[group.key] = null
      for (const item of group.items ?? []) map[item.key] = group.key
    }
    return map
  }, [registryData])

  function isKeyAllowed(perms: Record<string, boolean>, key: string): boolean {
    // Walk the key and its ancestor group; any explicit `false` denies it.
    let k: string | null | undefined = key
    const seen = new Set<string>()
    while (k && !seen.has(k)) {
      seen.add(k)
      if (perms[k] === false) return false
      k = parentOf[k]
    }
    return true
  }

  function can(key: string): boolean {
    if (isImpersonating && viewAs) {
      if (viewAs.is_admin) return true
      return isKeyAllowed(viewAs.permissions, key)
    }
    if (isAdmin) return true
    if (isLoading || !data) return true // optimistic while loading
    return isKeyAllowed(data.modules, key)
  }

  return (
    <PermissionsContext.Provider value={{ can, moduleEnabled: can, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
