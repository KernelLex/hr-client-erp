import { api, apiUrl } from "@/lib/api"

export interface User {
  name: string
  full_name: string
}

/** Typed login failure so the UI can tell a bad password apart from a network
 *  hiccup / rate-limit / server error instead of always saying "wrong password". */
export type LoginErrorReason = "credentials" | "rate_limited" | "network" | "server"
export class LoginError extends Error {
  reason: LoginErrorReason
  constructor(message: string, reason: LoginErrorReason) {
    super(message)
    this.name = "LoginError"
    this.reason = reason
  }
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false"
const MOCK_USER: User = { name: "admin@clienterp.com", full_name: "HR Admin" }
const STORAGE_KEY = "auth_user"

export async function loginUser(email: string, password: string, company?: string): Promise<User> {
  if (USE_MOCK) {
    if (!email || !password) throw new Error("Invalid credentials")
    return MOCK_USER
  }
  // `company` (from the pre-login picker) is validated server-side by the
  // on_session_creation hook; a wrong/forbidden company returns the SAME generic
  // "Invalid login credentials" as a bad password (no company enumeration).
  // Trim the email — trailing spaces from autofill/mobile keyboards are a common
  // cause of a correct account looking like a wrong one. Never trim the password.
  const cleanEmail = email.trim()
  const body: Record<string, string> = { usr: cleanEmail, pwd: password }
  if (company) body.company = company
  let res
  try {
    res = await api.post(apiUrl("login"), body)
  } catch (e: unknown) {
    // Distinguish *why* login failed so the UI doesn't always blame the password.
    const err = e as { response?: { status?: number }; code?: string }
    const status = err?.response?.status
    if (status === 401 || status === 403 || status === 417) {
      throw new LoginError("Invalid email or password.", "credentials")
    }
    if (status === 429) {
      throw new LoginError("Too many attempts. Please wait a minute and try again.", "rate_limited")
    }
    if (!err?.response) {
      throw new LoginError("Can't reach the server. Check your connection and try again.", "network")
    }
    throw new LoginError("Something went wrong signing in. Please try again.", "server")
  }
  // Frappe returns "Logged In" for users with a default app, "No App" for users without one.
  // Both mean login succeeded — only "Invalid login credentials" means failure.
  const msg: string = res.data.message ?? ""
  if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("error")) {
    throw new LoginError("Invalid email or password.", "credentials")
  }
  if (!msg || (msg !== "Logged In" && msg !== "No App" && !res.data.full_name)) {
    throw new LoginError("Something went wrong signing in. Please try again.", "server")
  }
  return {
    name: cleanEmail,
    full_name: res.data.full_name ?? cleanEmail,
  }
}

export async function logoutUser(): Promise<void> {
  if (!USE_MOCK) {
    await api.post(apiUrl("logout"))
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (USE_MOCK) {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as User) : null
  }
  try {
    const res = await api.get(apiUrl("frappe.auth.get_logged_user"))
    const userName: string = res.data.message
    if (!userName || userName === "Guest") return null
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as User
      if (parsed.name === userName) return parsed
    }
    return { name: userName, full_name: userName }
  } catch {
    return null
  }
}

export function storeUser(user: User): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}
