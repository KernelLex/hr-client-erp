import { createContext, useContext, ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import { useAuth } from "./AuthContext"

const ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

interface PermissionsContextValue {
  moduleEnabled: (module: string) => boolean
  isLoading: boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  moduleEnabled: () => true,
  isLoading: false,
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isLoggedIn } = useAuth()
  const isAdmin = !!(user && ADMIN_USERS.has(user.name))

  const { data, isLoading } = useQuery({
    queryKey: ["my_permissions", user?.name],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.permissions.get_my_permissions"))
      return res.data.message as { modules: Record<string, boolean> }
    },
    enabled: isLoggedIn && !isAdmin,
    staleTime: 1000 * 60 * 5,
  })

  function moduleEnabled(module: string): boolean {
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
