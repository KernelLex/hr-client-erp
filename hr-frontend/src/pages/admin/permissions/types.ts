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

export interface UserPermissions {
  name: string
  email: string
  department: string
  designation: string
  company: string
  is_admin: boolean
  permissions: PermissionMap
}

export interface GetUsersPermissionsResponse {
  users: UserPermissions[]
  registry: RegistryGroup[]
  keys: string[]
}

export interface UpdatePermissionsPayload {
  email: string
  permissions: PermissionMap
}
