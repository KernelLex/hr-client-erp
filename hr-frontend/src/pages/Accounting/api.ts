// Shared fetch helpers for every tab in the Accounting page — all Tally-derived
// data lives behind three Python modules; this file is the one place that knows
// how to call them (CSRF header, GET/POST body shape, Frappe error unwrapping).

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const json = await res.json()
  if (json.exc) throw new Error(json.exc)
  if (json.message?.success === false) throw new Error(json.message.error ?? "Request failed")
  return json.message
}

function apiGetFactory(module: string) {
  return async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const qs = params ? "?" + new URLSearchParams(params).toString() : ""
    const res = await fetch(`/api/method/hr_client.api.${module}.${endpoint}${qs}`, {
      credentials: "include",
      headers: { "X-Frappe-CSRF-Token": getCsrf() },
    })
    return unwrap<T>(res)
  }
}

function apiPostFactory(module: string) {
  return async function apiPost<T>(endpoint: string, body?: Record<string, string>): Promise<T> {
    const fd = new FormData()
    Object.entries(body ?? {}).forEach(([k, v]) => fd.append(k, v))
    const res = await fetch(`/api/method/hr_client.api.${module}.${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Frappe-CSRF-Token": getCsrf() },
      body: fd,
    })
    return unwrap<T>(res)
  }
}

export const accountingGet = apiGetFactory("accounting")
export const accountingPost = apiPostFactory("accounting")
export const operationsGet = apiGetFactory("operations")
export const dashboardGet = apiGetFactory("accounts_dashboard")
