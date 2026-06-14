export type CRMStage =
  | "Lead"
  | "Discussion"
  | "Quotation"
  | "Order"
  | "Delivery"
  | "Success"
  | "Failed"

export type ApprovalStatus = "Pending" | "Approved" | "Rejected"

export interface CRMApprovalRequest {
  name: string
  lead: string
  lead_title: string
  company_name: string
  contact_person: string
  phone: string
  email: string
  service_interest: string
  current_stage: CRMStage
  requested_stage: CRMStage
  requested_by: string
  requested_by_name: string
  request_notes: string
  approval_status: ApprovalStatus
  admin_notes: string
  reviewed_by: string
  reviewed_on: string
  lead_notes?: string
  lead_created?: string
  creation: string
  modified?: string
}

export interface CRMQuotationItem {
  name?: string
  item_description: string
  quantity: number
  unit_price: number
  amount: number
}

export interface CRMQuotation {
  name: string
  lead: string
  quotation_number: string
  items: CRMQuotationItem[]
  subtotal: number
  tax_percent: number
  total: number
  validity_days: number
  terms_and_conditions: string
  pdf_attachment: string
  status: string
  notes: string
}

export interface CRMLead {
  name: string
  lead_title: string
  company_name: string
  contact_person: string
  phone: string
  email: string
  service_interest: string
  source: string
  notes: string
  status: CRMStage
  rejection_reason: string
  assigned_to: string
  assigned_to_name: string
  approval_status: ApprovalStatus
  stage_push_requested: 0 | 1
  creation: string
  modified: string
  // from get_lead
  pending_approval?: CRMApprovalRequest | null
  approval_history?: CRMApprovalRequest[]
  quotation?: CRMQuotation | null
}

export const STAGE_ORDER: CRMStage[] = [
  "Lead", "Discussion", "Quotation", "Order", "Delivery", "Success",
]

export const STAGE_COLORS: Record<CRMStage, string> = {
  Lead: "bg-blue-100 text-blue-800 border-blue-200",
  Discussion: "bg-purple-100 text-purple-800 border-purple-200",
  Quotation: "bg-amber-100 text-amber-800 border-amber-200",
  Order: "bg-orange-100 text-orange-800 border-orange-200",
  Delivery: "bg-teal-100 text-teal-800 border-teal-200",
  Success: "bg-green-100 text-green-800 border-green-200",
  Failed: "bg-red-100 text-red-800 border-red-200",
}

export const STAGE_COLUMN_COLORS: Record<CRMStage, string> = {
  Lead: "border-blue-400",
  Discussion: "border-purple-400",
  Quotation: "border-amber-400",
  Order: "border-orange-400",
  Delivery: "border-teal-400",
  Success: "border-green-400",
  Failed: "border-red-400",
}

export const STAGE_HEADER_COLORS: Record<CRMStage, string> = {
  Lead: "bg-blue-600",
  Discussion: "bg-purple-600",
  Quotation: "bg-amber-600",
  Order: "bg-orange-600",
  Delivery: "bg-teal-600",
  Success: "bg-green-600",
  Failed: "bg-red-600",
}

export const SERVICE_INTERESTS = ["Logistics", "HR Services", "Accounting", "Other"] as const
export const SOURCES = ["Referral", "Cold Call", "Walk-in", "Social Media", "Other"] as const
