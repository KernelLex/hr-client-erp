import { ADMIN_USERS } from "@/lib/constants"
import { createContext, useContext, ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import { useAuth } from "./AuthContext"


interface PermissionsContextValue {
  moduleEnabled: (module: string) => boolean
  isLoading: boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
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

  function moduleEnabled(module: string): boolean {
    // Previewing "as" another user — use their real flags.
    if (isImpersonating && viewAs) {
      if (viewAs.is_admin) return true
      return viewAs.permissions[module] !== false
    }
    if (isAdmin) return true
    if (isLoading || !data) return true  // optimistic while loading
    return data.modules[module] !== false
  }

  return (
    <PermissionsContext.Provider value={{ moduleEnabled, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
