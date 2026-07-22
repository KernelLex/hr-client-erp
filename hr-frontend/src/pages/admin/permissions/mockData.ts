import type { GetUsersPermissionsResponse, PermissionModule } from "./types"

const ALL_ON: Record<PermissionModule, boolean> = {
  recruitment: true,
  employee_lifecycle: true,
  accounts: true,
  projects: true,
  logistics: true,
  hr: true,
  attendance: true,
  leave: true,
  expense: true,
  crm: true,
  chat: true,
}

export const MOCK_PERMISSIONS_RESPONSE: GetUsersPermissionsResponse = {
  modules: ["recruitment", "employee_lifecycle", "accounts", "projects", "logistics", "hr", "attendance", "leave", "expense", "crm", "chat"],
  users: [
    {
      name: "Owais Ahmed Khan",
      email: "owais@veraenterprises.in",
      department: "Admin",
      designation: "Full access — manages everything",
      company: "Vera Enterprises",
      is_admin: true,
      permissions: { ...ALL_ON },
    },
    {
      name: "Maaz",
      email: "maazdgr8.mma@gmail.com",
      department: "Project",
      designation: "Project management & tracking",
      company: "Vera Enterprises",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
    {
      name: "Manjunath M N",
      email: "manju.veraaccnts@outlook.com",
      department: "Accounts",
      designation: "Accounts management, GST filing, TDS",
      company: "Vera Enterprises",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
    {
      name: "Lookman Mohammed",
      email: "lookman.vera@outlook.com",
      department: "Accounts",
      designation: "Accountant",
      company: "Vera Enterprises",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
    {
      name: "Bhagya Shree",
      email: "bhagyashree.veraenterprises@outlook.com",
      department: "Accounts",
      designation: "Logistics In-charge",
      company: "Vera Enterprises",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
  ],
}
