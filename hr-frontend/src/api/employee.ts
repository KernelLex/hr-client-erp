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

export async function uploadProfilePhoto(file: File, email?: string): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  if (email) form.append("email", email)
  const res = await api.post(apiUrl("hr_client.api.employee.upload_profile_photo"), form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data.message.file_url
}
