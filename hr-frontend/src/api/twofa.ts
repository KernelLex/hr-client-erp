import { api, apiUrl } from "@/lib/api"

const BASE = "hr_client.api.twofa"

export interface TwoFAStatus {
  success: boolean
  exempt: boolean
  enrolled: boolean
  mandatory: boolean
  verified: boolean
  action: "none" | "enroll" | "verify"
}

export interface EnrollStart {
  success: boolean
  secret: string
  otpauth_uri: string
  qr: string // data:image/svg+xml;base64,...
  error?: string
}

async function get<T>(method: string): Promise<T> {
  const res = await api.get(apiUrl(`${BASE}.${method}`))
  return res.data.message as T
}
async function post<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await api.post(apiUrl(`${BASE}.${method}`), body)
  return res.data.message as T
}

export const getTwoFAStatus = () => get<TwoFAStatus>("get_status")
export const beginEnroll = () => post<EnrollStart>("begin_enroll")
export const confirmEnroll = (code: string) =>
  post<{ success: boolean; backup_codes?: string[]; error?: string }>("confirm_enroll", { code })
export const verifyTwoFA = (code: string) =>
  post<{ success: boolean; used_backup?: boolean; error?: string }>("verify", { code })
export const disableTwoFA = (code: string) =>
  post<{ success: boolean; error?: string }>("disable", { code })

// admin
export const adminResetTwoFA = (email: string) =>
  post<{ success: boolean }>("admin_reset", { email })
export const adminListTwoFA = () =>
  get<{ success: boolean; data: { user: string; enabled: number; confirmed_on: string; last_verified_on: string }[] }>("admin_list")
