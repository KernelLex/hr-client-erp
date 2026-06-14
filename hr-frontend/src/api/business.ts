import { api } from "@/lib/api"

export interface SalesInvoice {
  name: string
  invoice_number: string
  invoice_date: string
  due_date: string
  client_name: string
  client_gstin: string
  subtotal: number
  discount: number
  cgst: number
  sgst: number
  igst: number
  total_tax: number
  total_amount: number
  payment_status: "Pending" | "Paid" | "Overdue" | "Partial"
  payment_terms: string
  notes: string
  linked_quotation: string
  drive_file: string
  extraction_method: string
  uploaded_by: string
  items_json: string
  creation: string
  confidence_score: number | null
}

export interface PurchaseInvoice {
  name: string
  invoice_number: string
  invoice_date: string
  due_date: string
  vendor_name: string
  vendor_gstin: string
  po_reference: string
  cgst: number
  sgst: number
  igst: number
  total_tax: number
  total_amount: number
  tds_amount: number
  tds_applicable: number
  payment_status: "Pending" | "Paid" | "Overdue" | "Partial"
  drive_file: string
  extraction_method: string
  items_json: string
  creation: string
}

export interface PurchaseOrder {
  name: string
  po_number: string
  po_date: string
  vendor_name: string
  delivery_date: string
  total_value: number
  payment_terms: string
  status: "Open" | "Received" | "Cancelled"
  grn_reference: string
  drive_file: string
  extraction_method: string
  items_json: string
  creation: string
}

export interface Quotation {
  name: string
  quote_number: string
  quote_date: string
  valid_until: string
  client_name: string
  client_contact: string
  total_value: number
  discount: number
  final_value: number
  status: "Draft" | "Sent" | "Won" | "Lost" | "Expired"
  conversion_likelihood: "High" | "Medium" | "Low"
  follow_up_date: string
  linked_invoice: string
  drive_file: string
  extraction_method: string
  items_json: string
  creation: string
}

export interface GRN {
  name: string
  grn_number: string
  grn_date: string
  vendor_name: string
  po_reference: string
  total_value: number
  quality_status: string
  shortages_noted: number
  damages_noted: number
  linked_po: string
  drive_file: string
  creation: string
}

export interface FinancialReport {
  name: string
  report_type: string
  period: string
  from_date: string
  to_date: string
  total_revenue: number
  total_expenses: number
  gross_profit: number
  gross_margin_pct: number
  net_profit: number
  net_margin_pct: number
  total_assets: number
  total_liabilities: number
  equity: number
  working_capital: number
  current_ratio: number
  debt_to_equity: number
  health_status: string
  drive_file: string
  creation: string
}

export interface SalaryRecord {
  name: string
  employee_name: string
  employee_id: string
  month: string
  year: number
  month_year: string
  designation: string
  department: string
  basic_salary: number
  gross_salary: number
  total_deductions: number
  net_salary: number
  pf_amount: number
  tds_amount: number
  professional_tax: number
  drive_file: string
  creation: string
}

export interface BusinessTotals {
  total_receivables: number
  total_payables: number
  total_sales: number
  total_purchases: number
  gross_margin: number
  overdue_invoices: number
  pending_pos: number
  open_quotations: number
}

export interface StructuredData {
  sales_invoices?: SalesInvoice[]
  quotations?: Quotation[]
  purchase_invoices?: PurchaseInvoice[]
  purchase_orders?: PurchaseOrder[]
  grns?: GRN[]
  financial_reports?: FinancialReport[]
  payment_records?: unknown[]
  salary_records?: SalaryRecord[]
  attendance_records?: unknown[]
  totals: BusinessTotals
}

export interface ProcessResult {
  total: number
  processed: number
  skipped: number
  failed: number
  details: Array<{ file: string; result: unknown }>
}

export interface DocumentConnection {
  type: "sales_chain" | "purchase_chain"
  client?: string
  vendor?: string
  invoice?: {
    name: string
    number: string
    amount: number
    status: string
    date: string
    due_date?: string
  }
  quotation?: {
    name: string
    quote_number: string
    final_value: number
    status: string
  }
  po?: {
    name: string
    number: string
    amount: number
    status: string
    date: string
  }
}

export const getStructuredData = (doctype?: string): Promise<StructuredData> =>
  api.get("/api/method/vera_drive.api.get_structured_data", {
    params: doctype ? { doctype } : {},
  }).then((r) => r.data.message)

export const processAllFiles = (category?: string, force?: boolean): Promise<ProcessResult> =>
  api.post("/api/method/vera_drive.api.process_all_files", {
    category: category || null,
    force: force ? 1 : 0,
  }).then((r) => r.data.message)

export const processSingleFile = (docName: string, force?: boolean): Promise<unknown> =>
  api.post("/api/method/vera_drive.api.process_single_file", {
    doc_name: docName,
    force: force ? 1 : 0,
  }).then((r) => r.data.message)

export const autoLinkDocuments = (): Promise<{ success: boolean; links_created: number }> =>
  api.post("/api/method/vera_drive.api.auto_link_documents", {}).then((r) => r.data.message)

export const getDocumentConnections = (): Promise<{
  success: boolean
  connections: DocumentConnection[]
  total_chains: number
}> =>
  api.get("/api/method/vera_drive.api.get_document_connections").then((r) => r.data.message)

export const updatePaymentStatus = (
  doctype: string,
  docname: string,
  status: string
): Promise<{ success: boolean }> =>
  api.post("/api/method/vera_drive.api.update_payment_status", {
    doctype,
    docname,
    status,
  }).then((r) => r.data.message)

export const updateDocStatus = (
  doctype: string,
  docname: string,
  status: string
): Promise<{ success: boolean }> =>
  api.post("/api/method/vera_drive.api.update_doc_status", {
    doctype,
    docname,
    status,
  }).then((r) => r.data.message)
