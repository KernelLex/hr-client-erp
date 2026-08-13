// Shared Frappe fetch helpers for the People & Work workspace (HRMS + To-Do).
// Same CSRF + credentials convention as pages/Accounting/api.ts — one place
// that knows how to talk to hr_client.api.<module>.<endpoint>.

function getCsrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = ""
    try {
      const body = await res.json()
      detail = body?.message?.error || body?.message || body?.exception || ""
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  const body = await res.json()
  // Frappe wraps whitelisted return values in { message: ... }
  return (body?.message ?? body) as T
}

export function apiGetFactory(module: string) {
  return async function apiGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : ""
    const res = await fetch(`/api/method/hr_client.api.${module}.${endpoint}${qs}`, {
      credentials: "include",
      headers: { "X-Frappe-CSRF-Token": getCsrf() },
    })
    return unwrap<T>(res)
  }
}

export function apiPostFactory(module: string) {
  return async function apiPost<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`/api/method/hr_client.api.${module}.${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Frappe-CSRF-Token": getCsrf(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return unwrap<T>(res)
  }
}

// Module-scoped clients for every People & Work backend module.
export const hrmsMastersGet = apiGetFactory("hrms_masters")
export const hrmsPeopleGet = apiGetFactory("hrms_people")

export const notesGet = apiGetFactory("notes")
export const notesPost = apiPostFactory("notes")

export const shiftGet = apiGetFactory("shift")
export const shiftPost = apiPostFactory("shift")

export const attendanceHrGet = apiGetFactory("attendance")

export const payrollGet = apiGetFactory("payroll")
export const payrollPost = apiPostFactory("payroll")

export const onboardingGet = apiGetFactory("onboarding")
export const onboardingPost = apiPostFactory("onboarding")

export const trainingGet = apiGetFactory("training")
export const trainingPost = apiPostFactory("training")

export const appraisalGet = apiGetFactory("appraisal")
export const appraisalPost = apiPostFactory("appraisal")

export const separationGet = apiGetFactory("separation")
export const separationPost = apiPostFactory("separation")

export const approvalsGet = apiGetFactory("approvals")
export const approvalsPost = apiPostFactory("approvals")

export const todoGet = apiGetFactory("todo")
export const todoPost = apiPostFactory("todo")

export const calendarGet = apiGetFactory("calendar")
export const calendarPost = apiPostFactory("calendar")
