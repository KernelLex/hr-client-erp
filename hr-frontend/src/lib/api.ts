import axios from "axios"

const BASE = import.meta.env.VITE_API_BASE ?? ""

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
})

// Frappe requires X-Frappe-CSRF-Token on all state-changing requests.
// After login, Frappe sets a csrf_token cookie we can read here.
function getCsrfToken(): string {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf_token="))
      ?.split("=")[1] ?? "fetch"
  )
}

// ── Active company (multi-company) ────────────────────────────────────────────
// The active company is appended to EVERY request so the server scopes reads to
// it. The server always re-validates against the caller's access, so this is a
// convenience/UX signal, never the security boundary. Persisted in localStorage
// (cache only — CompanyContext revalidates against the server on every mount).
const COMPANY_KEY = "active_company"

export function getActiveCompany(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY)
  } catch {
    return null
  }
}

export function setActiveCompanyCache(company: string | null): void {
  try {
    if (company) localStorage.setItem(COMPANY_KEY, company)
    else localStorage.removeItem(COMPANY_KEY)
  } catch {
    /* ignore */
  }
}

api.interceptors.request.use((config) => {
  if (config.method && ["post", "put", "patch", "delete"].includes(config.method)) {
    config.headers["X-Frappe-CSRF-Token"] = getCsrfToken()
  }
  // Append the active company to params (GET) and body (POST/PUT/PATCH) unless
  // one is already explicitly set on the call.
  const company = getActiveCompany()
  if (company) {
    config.params = config.params ?? {}
    if (config.params.company == null) config.params.company = company
    if (
      config.method &&
      ["post", "put", "patch"].includes(config.method) &&
      config.data &&
      typeof config.data === "object" &&
      !Array.isArray(config.data) &&
      (config.data as Record<string, unknown>).company == null
    ) {
      ;(config.data as Record<string, unknown>).company = company
    }
  }
  return config
})

export function apiUrl(method: string) {
  return `/api/method/${method}`
}
