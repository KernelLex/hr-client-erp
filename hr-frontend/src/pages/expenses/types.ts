export type ClaimType = "Petrol" | "Material"
export type ClaimStatus = "Pending" | "Approved" | "Rejected"

export interface ExpenseClaim {
  name: string
  claim_title: string
  employee: string
  employee_name: string
  employee_email: string
  claim_type: ClaimType
  claim_date: string
  amount: number
  km_driven: number
  vehicle_number: string
  route_from: string
  route_to: string
  fuel_receipt: string
  material_description: string
  vendor_name: string
  material_receipt: string
  purpose: string
  status: ClaimStatus
  admin_notes: string
  reviewed_by: string
  reviewed_on: string
  rejection_reason: string
  submitted_on: string
  pdf_path: string
}

export interface MonthlySummary {
  employee: string
  employee_name: string
  total_claimed: number
  total_approved: number
  total_rejected: number
  total_pending: number
  claim_count: number
  petrol_total: number
  material_total: number
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
