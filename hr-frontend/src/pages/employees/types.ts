export type OnboardingStage =
  | "Offer Accepted"
  | "Documents Collected"
  | "IT Setup"
  | "First Day"
  | "Active"

export type DocStatus = "pending" | "received" | "waived"

export interface DocumentsChecklist {
  offer_letter_signed: DocStatus
  aadhaar: DocStatus
  pan_card: DocStatus
  address_proof: DocStatus
  educational_certificates: DocStatus
  bank_details: DocStatus
  passport_photo: DocStatus
}

export interface ITSetupChecklist {
  email_created: boolean
  laptop_assigned: boolean
  system_access: boolean
  software_installed: boolean
  access_card: boolean
}

export interface EmployeeListItem {
  name: string
  employee_name: string
  designation: string
  department: string
  company_email: string
  date_of_joining: string
  status: "Active" | "Inactive" | "Suspended" | "Left"
  custom_onboarding_stage: OnboardingStage
  image: string | null
}

export interface EmployeeFullRecord extends EmployeeListItem {
  first_name: string
  last_name: string
  date_of_birth: string
  gender: string
  personal_email: string
  cell_number: string
  permanent_address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  bank_name: string
  bank_ac_no: string
  reports_to: string | null
  reports_to_name: string | null
  documents_checklist: DocumentsChecklist
  it_setup_checklist: ITSetupChecklist
}

export interface EmployeeDetail {
  employee: EmployeeFullRecord
  exit: EmployeeExitRecord | null
}

export interface EmployeeExitRecord {
  name: string
  employee: string
  employee_name: string
  department: string
  resignation_date: string
  last_working_day: string | null
  resignation_letter: string | null
  status: "Pending" | "Interview Done" | "Cleared" | "Settled"
  final_settlement_status: "Pending" | "Done"
  exit_reason: string | null
  would_recommend: "Yes" | "No" | "Maybe" | null
  enjoyed_most: string | null
  improvement_suggestions: string | null
  management_feedback: string | null
}

export const MANDATORY_DOCS: (keyof DocumentsChecklist)[] = [
  "offer_letter_signed",
  "aadhaar",
  "pan_card",
]

export const DOC_LABELS: Record<keyof DocumentsChecklist, string> = {
  offer_letter_signed: "Signed Offer Letter",
  aadhaar: "Aadhaar Card",
  pan_card: "PAN Card",
  address_proof: "Address Proof",
  educational_certificates: "Educational Certificates",
  bank_details: "Bank Details",
  passport_photo: "Passport Photo",
}

export const IT_LABELS: Record<keyof ITSetupChecklist, string> = {
  email_created: "Email account created",
  laptop_assigned: "Laptop assigned",
  system_access: "System access configured",
  software_installed: "Required software installed",
  access_card: "Access card / ID issued",
}

export const DEPT_COLORS: Record<string, string> = {
  Engineering: "bg-blue-500",
  Design: "bg-purple-500",
  Product: "bg-indigo-500",
  Marketing: "bg-emerald-500",
  HR: "bg-pink-500",
  Finance: "bg-amber-500",
  Sales: "bg-orange-500",
  Operations: "bg-teal-500",
}

export const STAGE_COLORS: Record<OnboardingStage, string> = {
  "Offer Accepted": "bg-gray-100 text-gray-700",
  "Documents Collected": "bg-blue-100 text-blue-700",
  "IT Setup": "bg-purple-100 text-purple-700",
  "First Day": "bg-orange-100 text-orange-700",
  Active: "bg-green-100 text-green-700",
}
