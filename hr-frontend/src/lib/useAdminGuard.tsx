import { Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { ADMIN_USERS } from "@/lib/constants"

/**
 * Blocks direct URL access to admin-only pages, not just the nav link.
 * Usage: `const guard = useAdminGuard(); if (guard) return guard;` at the
 * top of a page component, before any other hooks that depend on admin data.
 */
export function useAdminGuard() {
  const { user } = useAuth()
  const isAdmin = !!user && ADMIN_USERS.has(user.name)
  if (!isAdmin) return <Navigate to="/" replace />
  return null
}
