export type PermissionModule =
  | "recruitment"
  | "employee_lifecycle"
  | "accounts"
  | "projects"
  | "logistics"
  | "hr"
  | "attendance"
  | "expense"

export const PERMISSION_MODULE_LABELS: Record<PermissionModule, string> = {
  recruitment: "Recruitment",
  employee_lifecycle: "Employee Lifecycle",
  accounts: "Accounts",
  projects: "Projects",
  logistics: "Logistics / Stock",
  hr: "HR",
  attendance: "Attendance",
  expense: "Expense",
}

export const MODULE_ICONS: Record<PermissionModule, string> = {
  recruitment: "👥",
  employee_lifecycle: "🔄",
  accounts: "📊",
  projects: "📋",
  logistics: "📦",
  hr: "🏢",
  attendance: "🕐",
  expense: "💳",
}

export interface UserPermissions {
  name: string
  email: string
  department: string
  designation: string
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
