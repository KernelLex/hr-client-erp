import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
