// ── Funds ──────────────────────────────────────────────────────────────────────
export interface BankAccount { bank_name: string; account_no: string; account_type: string; balance: number; last_synced: string | null }
export interface VirtualAccount { gateway_name: string; available_balance: number; credit_limit: number; utilised: number }
export interface ODAccount { bank_name: string; facility_name: string; sanctioned_limit: number; utilised: number; available: number; interest_rate: number }
export interface FundsSummary {
  totals: { bank_cash: number; virtual: number; od_available: number; od_utilised: number; grand_total: number }
  banks: BankAccount[]
  virtuals: VirtualAccount[]
  od_accounts: ODAccount[]
}

// ── Accounts Summary ───────────────────────────────────────────────────────────
export interface MonthlySeries { month: string; amount: number }
export interface AccountsSummary {
  period: { start: string; end: string }
  sales: { total: number; excl_gst: number; gst: number; invoice_count: number; yoy_pct: number | null }
  purchase: { total: number; excl_gst: number; itc: number; bill_count: number; yoy_pct: number | null }
  monthly_sales: MonthlySeries[]
  monthly_purchase: MonthlySeries[]
}

// ── GST ────────────────────────────────────────────────────────────────────────
export interface GSTTotals { igst: number; cgst: number; sgst: number; total: number }
export interface GSTSummary {
  period: { start: string; end: string }
  output: GSTTotals; input: GSTTotals; net: GSTTotals
  next_due_date: string
  gstr2b_mismatches: number
}

// ── Receivables & Payables ─────────────────────────────────────────────────────
export interface AgingBuckets { "0_30": number; "31_60": number; "61_90": number; "90_plus": number }
export interface RPSummary {
  debtors: { total_outstanding: number; advance_received: number; net: number; aging: AgingBuckets }
  creditors: { total_outstanding: number; advance_paid: number; net: number; aging: AgingBuckets }
}

// ── Creditor / Debtor reports ─────────────────────────────────────────────────
export interface CreditorRow { name: string; vendor_name: string; due_amount: number; invoice_date: string; status: string; aging_days: number; aging_category: string }
export interface CreditorAdvRow { name: string; vendor_name: string; advance_amount: number; advance_date: string; aging_months: number }
export interface DebtorRow { name: string; client_name: string; due_amount: number; invoice_date: string; status: string; aging_days: number; aging_category: string }
export interface DebtorAdvRow { name: string; client_name: string; advance_amount: number; advance_date: string; project: string; aging_months: number }

export interface PaginatedResult<T> { data: T[]; total: number; page: number; page_size: number }

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export interface CashFlowItem { line_item: string; inflow: number; outflow: number; net: number }
export interface CashFlowSection { items: CashFlowItem[]; total_inflow: number; total_outflow: number; net: number }
export interface CashFlowMonthly { period: string; inflow: number; outflow: number }
export interface CashFlowStatement {
  period: { start: string; end: string }
  sections: Record<string, CashFlowSection>
  grand_total: { inflow: number; outflow: number; net: number }
  monthly_series: CashFlowMonthly[]
}

// ── Inventory ─────────────────────────────────────────────────────────────────
export interface CategoryCount { movement_category: string; sku_count: number; total_stock: number }
export interface InventorySummary { by_category: CategoryCount[]; negative_stock_count: number; reorder_alert_count: number; total_sku_count: number }
export interface StockRow { name: string; item_code: string; item_description: string; period: string; movement_category: string; units_sold: number; stock_on_hand: number; turnover_days: number; safety_level: number; reorder_level: number; suggested_po_qty: number; vendor: string }

// ── Import status ─────────────────────────────────────────────────────────────
export interface ImportStatus { status: string; progress: number; message: string }

// ── Period filter ─────────────────────────────────────────────────────────────
export type Period = "today" | "mtd" | "ytd" | "last_year" | "custom"
export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  mtd: "Month to Date",
  ytd: "Year to Date (FY)",
  last_year: "Last Year (FY)",
  custom: "Custom",
}
