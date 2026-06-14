import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { User, loginUser, logoutUser, getCurrentUser, storeUser, clearUser } from "@/api/auth"

interface AuthContextValue {
  user: User | null
  isLoggedIn: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u)
      setIsLoading(false)
    })
  }, [])

  async function login(email: string, password: string) {
    const u = await loginUser(email, password)
    storeUser(u)
    setUser(u)
    navigate("/")
  }

  async function logout() {
    try {
      await logoutUser()
    } finally {
      clearUser()
      setUser(null)
      // Full-page reload avoids the race where PublicOnlyRoute still sees
      // the old isLoggedIn=true and bounces the user back to /.
      window.location.replace("/login")
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
