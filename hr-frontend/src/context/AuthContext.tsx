import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { ADMIN_USERS } from "@/lib/constants"
import { User, loginUser, logoutUser, getCurrentUser, storeUser, clearUser } from "@/api/auth"
import { setActiveCompanyCache } from "@/lib/api"

// A user an admin is previewing the interface "as" (Option-1 impersonation:
// UI/permissions only — the backend session stays the real admin).
export interface ViewAsUser {
  email: string
  name: string
  is_admin: boolean
  permissions: Record<string, boolean>
}

const VIEW_AS_KEY = "view_as"

interface AuthContextValue {
  user: User | null          // effective identity (impersonated when viewing-as)
  realUser: User | null      // the actual logged-in account
  isLoggedIn: boolean
  isLoading: boolean
  isRealAdmin: boolean
  isImpersonating: boolean
  viewAs: ViewAsUser | null
  setViewAs: (target: ViewAsUser | null) => void
  login: (email: string, password: string, company?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [realUser, setRealUser] = useState<User | null>(null)
  const [viewAs, setViewAsState] = useState<ViewAsUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getCurrentUser().then((u) => {
      setRealUser(u)
      // Restore an in-progress preview, but only for a real admin.
      try {
        const raw = sessionStorage.getItem(VIEW_AS_KEY)
        if (raw && u && ADMIN_USERS.has(u.name)) setViewAsState(JSON.parse(raw))
      } catch { /* ignore */ }
      setIsLoading(false)
    })
  }, [])

  const isRealAdmin = !!(realUser && ADMIN_USERS.has(realUser.name))

  function setViewAs(target: ViewAsUser | null) {
    // Only a real admin may impersonate.
    if (target && !isRealAdmin) return
    setViewAsState(target)
    try {
      if (target) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(target))
      else sessionStorage.removeItem(VIEW_AS_KEY)
    } catch { /* ignore */ }
  }

  async function login(email: string, password: string, company?: string) {
    // A fresh login must never inherit the previous session's company. Set the
    // cache BEFORE the request so the very first authed call (getMyCompanies)
    // carries the correct company — or is cleared so the server-resolved default
    // wins. Without this, a stale cached company param overrides the pick and the
    // user lands in the wrong company's books.
    try {
      setActiveCompanyCache(company ?? null)
    } catch {
      /* ignore */
    }
    const u = await loginUser(email, password, company)
    storeUser(u)
    setRealUser(u)
    navigate("/")
  }

  async function logout() {
    try {
      await logoutUser()
    } finally {
      clearUser()
      // Clear the active-company cache so it can never bleed into the next login.
      try { setActiveCompanyCache(null) } catch { /* ignore */ }
      try { sessionStorage.removeItem(VIEW_AS_KEY) } catch { /* ignore */ }
      setViewAsState(null)
      setRealUser(null)
      // Full-page reload avoids the race where PublicOnlyRoute still sees
      // the old isLoggedIn=true and bounces the user back to /.
      window.location.replace("/login")
    }
  }

  // Effective identity used for all interface gating.
  const effectiveUser: User | null = viewAs
    ? { name: viewAs.email, full_name: viewAs.name }
    : realUser

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        realUser,
        isLoggedIn: !!realUser,
        isLoading,
        isRealAdmin,
        isImpersonating: !!viewAs,
        viewAs,
        setViewAs,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
