import { api, apiUrl } from "@/lib/api"

export interface EmployeeProfile {
  employee_id: string
  employee_name: string
  first_name: string
  last_name: string
  image: string
  // Personal
  date_of_birth: string
  gender: string
  blood_group: string
  personal_email: string
  cell_number: string
  person_to_be_contacted: string
  emergency_phone_number: string
  current_address: string
  // Work
  designation: string
  department: string
  date_of_joining: string
  employment_type: string
  company_email: string
  reports_to: string
  reports_to_name: string
  status: string
  user_id: string
  // Documents
  custom_aadhaar_number: string
  custom_pan_number: string
  // Bank
  bank_name: string
  bank_ac_no: string
  custom_ifsc_code: string
  // Skills
  custom_skills: string
  education: Array<{ school: string; qualification: string; year: string | number }>
}

export interface EmployeeListItem {
  name: string
  employee_name: string
  first_name: string
  last_name: string
  designation: string
  department: string
  image: string
  company_email: string
  user_id: string
  date_of_joining: string
  pending_leaves?: number
}

export async function getEmployeeProfile(email: string): Promise<EmployeeProfile> {
  const res = await api.get(apiUrl("hr_client.api.employee.get_employee_profile"), {
    params: { email },
  })
  return res.data.message
}

export async function updateOwnProfile(fields: Partial<EmployeeProfile>): Promise<void> {
  await api.post(apiUrl("hr_client.api.employee.update_own_profile"), {
    fields_to_update: JSON.stringify(fields),
  })
}

export async function adminUpdateProfile(email: string, fields: Partial<EmployeeProfile>): Promise<void> {
  await api.post(apiUrl("hr_client.api.employee.admin_update_profile"), {
    email,
    fields_to_update: JSON.stringify(fields),
  })
}

export async function getAllEmployees(): Promise<EmployeeListItem[]> {
  const res = await api.get(apiUrl("hr_client.api.employee.get_all_employees"))
  return res.data.message
}

// ── Self-service password change ──────────────────────────────────────────────
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
  const res = await api.post(apiUrl("hr_client.api.employee.change_my_password"), {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return res.data.message
}

// ── Self-service attendance (logged-in employee's own Jibble data) ─────────────
export interface MyAttendanceRow {
  person_id: string
  person_name: string
  date: string
  clock_in: string | null
  clock_out: string | null
  hours: number
  break_minutes: number
  status: "on_time" | "late" | "working" | "absent"
}
export interface MyAttendanceDay {
  date: string
  date_label: string
  entry: MyAttendanceRow | null
}
export interface MyAttendance {
  success: boolean
  linked: boolean
  person_name: string
  data: MyAttendanceDay[]
  date_from: string
  date_to: string
  message?: string
  summary?: { present_days: number; late_days: number; total_hours: number }
  last_synced?: string
}
export async function getMyAttendance(dateFrom: string, dateTo: string): Promise<MyAttendance> {
  const res = await api.get(apiUrl("hr_client.api.jibble.get_my_attendance"), {
    params: { date_from: dateFrom, date_to: dateTo },
  })
  return res.data.message
}

export async function uploadProfilePhoto(file: File, email?: string): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  if (email) form.append("email", email)
  // Must use fetch (not axios) — axios's manual Content-Type overrides the boundary,
  // breaking Frappe's multipart parser. Let the browser set it automatically.
  const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "fetch"
  const res = await fetch(apiUrl("hr_client.api.employee.upload_profile_photo"), {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": csrfToken },
    body: form,
  })
  const data = await res.json()
  return data.message.file_url
}
