import { api, apiUrl } from "@/lib/api"

export interface User {
  name: string
  full_name: string
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false"
const MOCK_USER: User = { name: "admin@clienterp.com", full_name: "HR Admin" }
const STORAGE_KEY = "auth_user"

export async function loginUser(email: string, password: string): Promise<User> {
  if (USE_MOCK) {
    if (!email || !password) throw new Error("Invalid credentials")
    return MOCK_USER
  }
  const res = await api.post(apiUrl("login"), { usr: email, pwd: password })
  // Frappe returns "Logged In" for users with a default app, "No App" for users without one.
  // Both mean login succeeded — only "Invalid login credentials" means failure.
  const msg: string = res.data.message ?? ""
  if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("error")) {
    throw new Error("Invalid email or password")
  }
  if (!msg || (msg !== "Logged In" && msg !== "No App" && !res.data.full_name)) {
    throw new Error("Login failed")
  }
  return {
    name: email,
    full_name: res.data.full_name ?? email,
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
