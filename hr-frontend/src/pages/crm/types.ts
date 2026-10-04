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

// Monochrome overhaul — stages are told apart by position + label, not hue.
// Only the terminal "Failed" state keeps the one sanctioned safety red.
const NEUTRAL_BADGE = "bg-[var(--bg-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]"
export const STAGE_COLORS: Record<CRMStage, string> = {
  Lead: NEUTRAL_BADGE,
  Discussion: NEUTRAL_BADGE,
  Quotation: NEUTRAL_BADGE,
  Order: NEUTRAL_BADGE,
  Delivery: NEUTRAL_BADGE,
  Success: "bg-[var(--bg-inverse)] text-[var(--text-inverse)] border-transparent",
  Failed: "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger)]",
}

// Depth of progress — a ramp of ink tints so later stages read as "further
// along" without colour. Used as the small rail at the top of each column.
export const STAGE_COLUMN_COLORS: Record<CRMStage, string> = {
  Lead: "var(--n300)",
  Discussion: "var(--n400)",
  Quotation: "var(--n500)",
  Order: "var(--n600)",
  Delivery: "var(--n700)",
  Success: "var(--n900)",
  Failed: "var(--color-danger)",
}

export const SERVICE_INTERESTS = ["Logistics", "HR Services", "Accounting", "Other"] as const
export const SOURCES = ["Referral", "Cold Call", "Walk-in", "Social Media", "Other"] as const
