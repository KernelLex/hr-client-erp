import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-app)" }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)", borderTopColor: "transparent" }} />
    </div>
  )
}

export function ProtectedRoute() {
  const { isLoggedIn, isLoading } = useAuth()

  if (isLoading) return <Spinner />
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { isLoggedIn, isLoading } = useAuth()

  if (isLoading) return <Spinner />
  if (isLoggedIn) return <Navigate to="/" replace />
  return <Outlet />
}
