// Registry-driven permission model. The backend
// (hr_client.api.permissions.PERMISSION_REGISTRY) is the single source of truth
// for what modules/subsections exist; the frontend just renders whatever it
// returns, so new modules appear automatically.

export interface RegistryItem {
  key: string
  label: string
  admin?: boolean
}

export interface RegistryGroup {
  key: string
  label: string
  icon?: string
  admin?: boolean
  items: RegistryItem[]
}

export type PermissionMap = Record<string, boolean>

export interface CompanyAccessRow {
  company: string
  access_level?: "Admin" | "Full" | "ReadOnly"
  is_default?: number | boolean
}

export interface UserPermissions {
  name: string
  email: string
  department: string
  designation: string
  company: string
  /** Payroll company (read-only) — SEPARATE from can-access. */
  employed_by?: string
  /** The positive company-access allowlist (which books this user may open). */
  company_access?: CompanyAccessRow[]
  is_admin: boolean
  permissions: PermissionMap
}

export interface GetUsersPermissionsResponse {
  users: UserPermissions[]
  registry: RegistryGroup[]
  keys: string[]
  /** Every company that exists (for the access grid). */
  all_companies?: string[]
  /** Whether the current viewer may grant/revoke company access. */
  can_grant?: boolean
}

export interface UpdatePermissionsPayload {
  email: string
  permissions: PermissionMap
}
