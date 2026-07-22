export type PermissionModule =
  | "recruitment"
  | "employee_lifecycle"
  | "accounts"
  | "projects"
  | "logistics"
  | "hr"
  | "attendance"
  | "leave"
  | "expense"
  | "crm"
  | "chat"

export const PERMISSION_MODULE_LABELS: Record<PermissionModule, string> = {
  recruitment: "Recruitment",
  employee_lifecycle: "Employee Lifecycle",
  accounts: "Accounts",
  projects: "Projects",
  logistics: "Logistics / Stock",
  hr: "HR",
  attendance: "Attendance",
  leave: "Leave",
  expense: "Expense",
  crm: "CRM",
  chat: "Chat",
}

export const MODULE_ICONS: Record<PermissionModule, string> = {
  recruitment: "👥",
  employee_lifecycle: "🔄",
  accounts: "📊",
  projects: "📋",
  logistics: "📦",
  hr: "🏢",
  attendance: "🕐",
  leave: "🏖️",
  expense: "💳",
  crm: "📈",
  chat: "💬",
}

export interface UserPermissions {
  name: string
  email: string
  department: string
  designation: string
  company: string
  is_admin: boolean
  permissions: Record<PermissionModule, boolean>
}

export interface GetUsersPermissionsResponse {
  users: UserPermissions[]
  modules: PermissionModule[]
}

export interface UpdatePermissionsPayload {
  email: string
  permissions: Record<PermissionModule, boolean>
}
