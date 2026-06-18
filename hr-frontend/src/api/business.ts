import { api, apiUrl } from "@/lib/api"

export interface SalesInvoice {
  name: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  client_name: string
  client_gstin?: string
  subtotal?: number
  discount?: number
  cgst: number
  sgst: number
  igst: number
  total_tax: number
  total_amount: number
  payment_status: "Pending" | "Paid" | "Overdue" | "Partial" | "Open"
  payment_terms?: string
  notes?: string
  linked_quotation?: string
  drive_file?: string
  extraction_method?: string
  uploaded_by?: string
  items_json?: string
  creation?: string
  confidence_score: number | null
  web_view_link?: string
  direction?: string
  file_name?: string
  doc_type?: string
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
  web_view_link?: string
  direction?: string
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
  web_view_link?: string
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
  web_view_link?: string
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
  web_view_link?: string
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
  file_name?: string
  web_view_link?: string
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
  file_name?: string
  web_view_link?: string
}

export interface BusinessTotals {
  total_receivables: number
  total_payables: number
  total_sales: number
  total_invoiced: number
  total_order_book: number
  total_purchases: number
  total_quoted: number
  total_payroll: number
  gross_margin: number
  overdue_invoices: number
  pending_pos: number
  open_quotations: number
}

export interface CreditNote {
  name: string
  cn_number: string
  cn_date: string
  client_name: string
  total_amount: number
  cgst: number
  sgst: number
  igst: number
  status: "Pending" | "Applied" | "Cancelled"
  confidence_score?: number | null
  web_view_link?: string
  file_name?: string
}

export interface DebitNote {
  name: string
  dn_number: string
  dn_date: string
  vendor_name: string
  total_amount: number
  status: "Pending" | "Applied" | "Cancelled"
  confidence_score?: number | null
  web_view_link?: string
  file_name?: string
}

export interface PaymentRecord {
  name: string
  file_name?: string
  payment_number?: string
  payment_date?: string
  amount?: number
  party_name?: string
  payment_type?: string
  reference_doc?: string
  web_view_link?: string
}

export interface StructuredData {
  sales_invoices?: SalesInvoice[]
  quotations?: Quotation[]
  credit_notes?: CreditNote[]
  purchase_invoices?: PurchaseInvoice[]
  purchase_orders?: PurchaseOrder[]
  debit_notes?: DebitNote[]
  grns?: GRN[]
  financial_reports?: FinancialReport[]
  payment_records?: PaymentRecord[]
  receipt_records?: Array<{ name: string; file_name?: string; party_name?: string; web_view_link?: string }>
  salary_records?: SalaryRecord[]
  attendance_records?: unknown[]
  totals: BusinessTotals
}

export interface ExtractableFile {
  name: string
  file_name: string
  doc_type: string
  module: string
  drive_file_id: string
  web_view_link?: string
  sync_status: string
}

export interface ExtractableFilesResult {
  files: ExtractableFile[]
  total_pending: number
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

const EMPTY_TOTALS: BusinessTotals = {
  total_receivables: 0,
  total_payables: 0,
  total_sales: 0,
  total_invoiced: 0,
  total_order_book: 0,
  total_purchases: 0,
  total_quoted: 0,
  total_payroll: 0,
  gross_margin: 0,
  overdue_invoices: 0,
  pending_pos: 0,
  open_quotations: 0,
}

export async function getStructuredData(_doctype?: string): Promise<StructuredData> {
  try {
    const res = await api.get(apiUrl("hr_client.drive_sync.api.get_structured_data"))
    const m = res.data.message
    if (!m) return { ...{ sales_invoices: [], quotations: [], purchase_invoices: [], purchase_orders: [], grns: [], financial_reports: [], payment_records: [], salary_records: [], attendance_records: [] }, totals: EMPTY_TOTALS }
    return {
      sales_invoices: m.sales_invoices ?? [],
      quotations: m.quotations ?? [],
      credit_notes: m.credit_notes ?? [],
      purchase_invoices: m.purchase_invoices ?? [],
      purchase_orders: m.purchase_orders ?? [],
      debit_notes: m.debit_notes ?? [],
      grns: m.grns ?? [],
      financial_reports: m.financial_reports ?? [],
      payment_records: m.payment_records ?? [],
      receipt_records: m.receipt_records ?? [],
      salary_records: m.salary_records ?? [],
      attendance_records: m.attendance_records ?? [],
      totals: { ...EMPTY_TOTALS, ...(m.totals ?? {}) },
    }
  } catch {
    return { sales_invoices: [], quotations: [], credit_notes: [], purchase_invoices: [], purchase_orders: [], debit_notes: [], grns: [], financial_reports: [], payment_records: [], receipt_records: [], salary_records: [], attendance_records: [], totals: EMPTY_TOTALS }
  }
}

export async function startBackgroundExtraction(): Promise<{ status: string; message: string; pending?: number }> {
  try {
    const res = await api.post(apiUrl("hr_client.drive_sync.api.start_background_extraction"))
    return res.data.message ?? { status: "error", message: "No response" }
  } catch {
    return { status: "error", message: "Failed to start background extraction" }
  }
}

export async function getExtractionStatus(): Promise<{ pending: number; job_active: boolean }> {
  try {
    const res = await api.get(apiUrl("hr_client.drive_sync.api.get_extraction_status"))
    return res.data.message ?? { pending: 0, job_active: false }
  } catch {
    return { pending: 0, job_active: false }
  }
}

export async function getExtractableFiles(limit = 50): Promise<ExtractableFilesResult> {
  try {
    const res = await api.get(apiUrl("hr_client.drive_sync.api.get_extractable_files"), {
      params: { limit },
    })
    const m = res.data.message ?? {}
    return { files: m.files ?? [], total_pending: m.total_pending ?? 0 }
  } catch {
    return { files: [], total_pending: 0 }
  }
}

export async function processAllFiles(_category?: string, force?: boolean): Promise<ProcessResult> {
  try {
    const res = await api.post(apiUrl("hr_client.drive_sync.api.process_all_files"),
      { limit: 50, force: force ? 1 : 0 })
    const m = res.data.message ?? {}
    return { total: m.total ?? 0, processed: m.processed ?? 0, skipped: m.skipped ?? 0, failed: m.failed ?? 0, details: [] }
  } catch {
    return { total: 0, processed: 0, skipped: 0, failed: 0, details: [] }
  }
}

export async function processSingleFile(docName: string, force?: boolean): Promise<unknown> {
  try {
    const res = await api.post(apiUrl("hr_client.drive_sync.api.process_file"),
      { drive_file_name: docName, force: force ? 1 : 0 })
    return res.data.message ?? { success: false }
  } catch {
    return { success: false }
  }
}

export async function autoLinkDocuments(): Promise<{ success: boolean; links_created: number }> {
  try {
    const res = await api.post(apiUrl("hr_client.drive_sync.api.auto_link_documents"))
    return res.data.message ?? { success: false, links_created: 0 }
  } catch {
    return { success: false, links_created: 0 }
  }
}

export const getDocumentConnections = (): Promise<{
  success: boolean
  connections: DocumentConnection[]
  total_chains: number
}> => Promise.resolve({ success: true, connections: [], total_chains: 0 })

export async function updatePaymentStatus(
  doctype: string,
  docname: string,
  status: string
): Promise<{ success: boolean }> {
  try {
    const res = await api.post(apiUrl("hr_client.drive_sync.api.update_payment_status"),
      { doctype, docname, status })
    return res.data.message ?? { success: false }
  } catch {
    return { success: false }
  }
}

export async function updateDocStatus(
  doctype: string,
  docname: string,
  status: string
): Promise<{ success: boolean }> {
  try {
    const res = await api.post(apiUrl("hr_client.drive_sync.api.update_doc_status"),
      { doctype, docname, status })
    return res.data.message ?? { success: false }
  } catch {
    return { success: false }
  }
}
