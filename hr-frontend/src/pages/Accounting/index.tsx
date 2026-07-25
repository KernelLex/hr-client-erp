import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Landmark, RefreshCw, AlertCircle, Clock } from "lucide-react"
import { useAdminGuard } from "@/lib/useAdminGuard"
import { ChartOfAccountsTab } from "./ChartOfAccountsTab"
import { VoucherListTab } from "./VoucherListTab"
import { RegisterListTab } from "./RegisterListTab"
import { GeneralLedgerTab } from "./GeneralLedgerTab"
import { ReceivablePayableTab } from "./ReceivablePayableTab"
import { CashFlowTab } from "./CashFlowTab"
import { FinancialStatementsTab } from "./FinancialStatementsTab"
import { BankReconciliationTab } from "./BankReconciliationTab"
import { FixedAssetsTab } from "./FixedAssetsTab"
import { DepreciationTab } from "./DepreciationTab"

const COMPANY = "Vera Enterprises"

const TAB_LABELS: Record<string, string> = {
  "coa":                  "Chart of Accounts",
  "cost-centers":         "Cost Centers",
  "journal":              "Journal Entries",
  "payment":              "Payment Entries",
  "receipts":             "Receipts",
  "bank-recon":           "Bank Reconciliation",
  "sales-invoices":       "Sales Invoices",
  "purchase-bills":       "Purchase Bills",
  "credit-notes":         "Credit Notes",
  "debit-notes":          "Debit Notes",
  "general-ledger":       "General Ledger",
  "ar":                   "Accounts Receivable",
  "ap":                   "Accounts Payable",
  "fixed-assets":         "Fixed Assets",
  "depreciation":         "Depreciation",
  "cash-flow":            "Cash Flow",
  "budgeting":            "Budgeting",
  "financial-statements": "Financial Statements",
}

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

interface FinSummary { max_date: string; total_vouchers: number }

async function fetchFinSummary(): Promise<FinSummary> {
  const res = await fetch(
    "/api/method/hr_client.api.operations.get_financial_summary",
    { credentials: "include", headers: { "X-Frappe-CSRF-Token": getCsrf() } },
  )
  if (!res.ok) throw new Error("Failed")
  return (await res.json()).message
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Clock size={40} className="mb-4 text-gray-200" />
      <p className="text-base font-semibold text-gray-400">{label}</p>
      <p className="text-sm text-gray-300 mt-1">This section will be built in a future update.</p>
    </div>
  )
}

export default function AccountingPage() {
  const guard = useAdminGuard()
  const [searchParams] = useSearchParams()

  // Derive active tab directly from URL — sidebar navigation updates the URL
  // which re-renders this component with the correct tab, no useState needed.
  const tab = searchParams.get("tab") ?? "coa"
  const tabLabel = TAB_LABELS[tab] ?? "Accounting"

  const { data: finSummary } = useQuery<FinSummary>({
    queryKey: ["financial-summary"],
    queryFn: fetchFinSummary,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  if (guard) return guard

  const gapDays = finSummary?.max_date
    ? Math.floor((Date.now() - new Date(finSummary.max_date).getTime()) / 86_400_000)
    : 0

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app, #f5efe4)" }}>
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow shrink-0"
              style={{ background: "#1e3a2f" }}
            >
              <Landmark className="w-5 h-5 text-[#c8a45c]" />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: "var(--text-primary, #2c2c2a)" }}>
                {tabLabel}
              </h1>
              <p className="text-xs" style={{ color: "var(--text-secondary, #6a6a5c)" }}>
                {COMPANY} · Finance &amp; Governance
              </p>
            </div>
          </div>

          {finSummary?.max_date && (
            <div
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
              style={{ borderColor: "#e0d9cb", color: "var(--text-secondary, #6a6a5c)" }}
            >
              <RefreshCw size={11} />
              Tally data through {finSummary.max_date}
            </div>
          )}
        </div>

        {gapDays > 20 && (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
            style={{ background: "var(--color-warning-bg, #fff7ed)", border: "0.5px solid #fde68a" }}
          >
            <AlertCircle size={14} style={{ color: "var(--color-warning, #ea580c)" }} className="shrink-0" />
            <span style={{ color: "#92400e" }}>
              Tally data is <strong>{gapDays} days</strong> behind (last import: {finSummary!.max_date}).
              Re-import the latest XML to refresh.
            </span>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="px-6 py-5 max-w-7xl mx-auto">
        <div
          className="bg-white rounded-xl p-5"
          style={{ border: "var(--border-card, 0.5px solid #e0d9cb)", boxShadow: "var(--shadow-card)" }}
        >
          <TabContent tab={tab} />
        </div>
      </div>
    </div>
  )
}

function TabContent({ tab }: { tab: string }) {
  switch (tab) {
    case "coa":
      return <ChartOfAccountsTab />
    case "cost-centers":
      return <ComingSoon label="Cost Centers" />
    case "journal":
      return <VoucherListTab voucherType="Journal" noun="Journal Entries" />
    case "payment":
      return <VoucherListTab voucherType="Payment" noun="Payment Entries" />
    case "receipts":
      return <VoucherListTab voucherType="Receipt" noun="Receipts" />
    case "bank-recon":
      return <BankReconciliationTab />
    case "sales-invoices":
      return (
        <RegisterListTab
          endpoint="get_sales_invoices" noun="Sales Invoices"
          numberField="invoice_no" numberLabel="Invoice #" dateField="invoice_date"
          partyField="customer" partyLabel="Customer" gstField="gst_amount" gstLabel="GST"
        />
      )
    case "purchase-bills":
      return (
        <RegisterListTab
          endpoint="get_purchase_bills" noun="Purchase Bills"
          numberField="bill_no" numberLabel="Bill #" dateField="bill_date"
          partyField="vendor" partyLabel="Vendor" gstField="itc_amount" gstLabel="ITC"
        />
      )
    case "credit-notes":
      return <VoucherListTab voucherType="Credit Note" noun="Credit Notes" />
    case "debit-notes":
      return <VoucherListTab voucherType="Debit Note" noun="Debit Notes" />
    case "general-ledger":
      return <GeneralLedgerTab />
    case "ar":
      return <ReceivablePayableTab kind="receivable" />
    case "ap":
      return <ReceivablePayableTab kind="payable" />
    case "fixed-assets":
      return <FixedAssetsTab />
    case "depreciation":
      return <DepreciationTab />
    case "cash-flow":
      return <CashFlowTab />
    case "budgeting":
      return <ComingSoon label="Budgeting" />
    case "financial-statements":
      return <FinancialStatementsTab />
    default:
      return <ComingSoon label={TAB_LABELS[tab] ?? tab} />
  }
}
