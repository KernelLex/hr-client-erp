import type { GetUsersPermissionsResponse } from "./types"

const ALL_ON = {
  recruitment: true,
  employee_lifecycle: true,
  accounts: true,
  projects: true,
  logistics: true,
  hr: true,
  attendance: true,
  expense: true,
} as const

export const MOCK_PERMISSIONS_RESPONSE: GetUsersPermissionsResponse = {
  modules: ["recruitment", "employee_lifecycle", "accounts", "projects", "logistics", "hr", "attendance", "expense"],
  users: [
    {
      name: "Owais Ahmed Khan",
      email: "owais@veraenterprises.in",
      department: "Admin",
      designation: "Full access — manages everything",
      is_admin: true,
      permissions: { ...ALL_ON },
    },
    {
      name: "Maaz",
      email: "maazdgr8.mma@gmail.com",
      department: "Project",
      designation: "Project management & tracking",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
    {
      name: "Manjunath M N",
      email: "manju.veraaccnts@outlook.com",
      department: "Accounts",
      designation: "Accounts management, GST filing, TDS",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
    {
      name: "Lookman",
      email: "lookman.vera@outlook.com",
      department: "Accounts",
      designation: "Accounts executive duties",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
    {
      name: "Bhagya Shree",
      email: "Bhagyashree.veraenterprises@outlook.com",
      department: "Logistics",
      designation: "Logistics management, stock monitoring, porter executive, HR",
      is_admin: false,
      permissions: { ...ALL_ON },
    },
  ],
}
