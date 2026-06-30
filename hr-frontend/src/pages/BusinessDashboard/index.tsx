import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

// BusinessDashboard is retired — all financial data lives in Operations.
// This redirect exists so any bookmarked /business URL lands in the right place.
export default function BusinessDashboard() {
  const navigate = useNavigate()
  useEffect(() => { navigate("/operations", { replace: true }) }, [navigate])
  return null
}

// Named export kept so existing imports don't break at compile time.
export function BusinessDocsContent() { return null }
