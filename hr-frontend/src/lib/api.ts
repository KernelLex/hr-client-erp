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

api.interceptors.request.use((config) => {
  if (config.method && ["post", "put", "patch", "delete"].includes(config.method)) {
    config.headers["X-Frappe-CSRF-Token"] = getCsrfToken()
  }
  return config
})

export function apiUrl(method: string) {
  return `/api/method/${method}`
}
