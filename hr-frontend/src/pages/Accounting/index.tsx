import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Landmark, LayoutList, Building2, FileText, CreditCard, Receipt,
  Building, FileCheck, ShoppingCart, FileOutput, FileInput, BookOpen,
  TrendingUp, TrendingDown, Boxes, ArrowDownRight, Activity, Target,
  BarChart3, RefreshCw, AlertCircle, Clock,
} from "lucide-react"
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


// ── Types & constants ─────────────────────────────────────────────────────────

const COMPANY = "Vera Enterprises"

const TABS = [
  { id: "coa",                  label: "Chart of Accounts",    icon: LayoutList    },
  { id: "cost-centers",         label: "Cost Centers",          icon: Building2     },
  { id: "journal",              label: "Journal Entries",       icon: FileText      },
  { id: "payment",              label: "Payment Entries",       icon: CreditCard    },
  { id: "receipts",             label: "Receipts",              icon: Receipt       },
  { id: "bank-recon",           label: "Bank Reconciliation",   icon: Building      },
  { id: "sales-invoices",       label: "Sales Invoices",        icon: FileCheck     },
  { id: "purchase-bills",       label: "Purchase Bills",        icon: ShoppingCart  },
  { id: "credit-notes",         label: "Credit Notes",          icon: FileOutput    },
  { id: "debit-notes",          label: "Debit Notes",           icon: FileInput     },
  { id: "general-ledger",       label: "General Ledger",        icon: BookOpen      },
  { id: "ar",                   label: "Accounts Receivable",   icon: TrendingUp    },
  { id: "ap",                   label: "Accounts Payable",      icon: TrendingDown  },
  { id: "fixed-assets",         label: "Fixed Assets",          icon: Boxes         },
  { id: "depreciation",         label: "Depreciation",          icon: ArrowDownRight},
  { id: "cash-flow",            label: "Cash Flow",             icon: Activity      },
  { id: "budgeting",            label: "Budgeting",             icon: Target        },
  { id: "financial-statements", label: "Financial Statements",  icon: BarChart3     },
] as const

type TabId = (typeof TABS)[number]["id"]

// ── Tally staleness info ──────────────────────────────────────────────────────

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

// ── Coming Soon placeholder ───────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Clock size={40} className="mb-4 text-gray-200" />
      <p className="text-base font-semibold text-gray-400">{label}</p>
      <p className="text-sm text-gray-300 mt-1">This tab will be built in a future update.</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const guard = useAdminGuard()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get("tab")
    return (TABS.find(x => x.id === t)?.id ?? "coa") as TabId
  })

  function changeTab(id: TabId) {
    setTab(id)
    setSearchParams({ tab: id }, { replace: true })
  }

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
      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
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
                Accounting
              </h1>
              <p className="text-xs" style={{ color: "var(--text-secondary, #6a6a5c)" }}>
                {COMPANY} · Finance &amp; Governance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
        </div>

        {/* Stale data warning */}
        {gapDays > 20 && (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
            style={{ background: "var(--color-warning-bg, #fff7ed)", border: "0.5px solid #fde68a" }}
          >
            <AlertCircle size={14} style={{ color: "var(--color-warning, #ea580c)" }} className="shrink-0" />
            <span style={{ color: "#92400e" }}>
              Tally data is <strong>{gapDays} days</strong> behind (last import: {finSummary!.max_date}).
              Upload the latest XML via the <strong>Import &amp; AI</strong> tab in <strong>Accounting</strong>.
            </span>
          </div>
        )}
      </div>

      {/* ── 18-tab bar ── */}
      <div className="bg-white border-b border-gray-100 overflow-x-auto scrollbar-none">
        <div className="flex min-w-max px-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => changeTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? "border-[#1e3a2f] text-[#1e3a2f]"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200"
              }`}
            >
              <Icon size={13} className={tab === id ? "text-[#c8a45c]" : ""} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="p-6 max-w-7xl mx-auto">
        <div
          className="bg-white rounded-xl p-6"
          style={{ border: "var(--border-card, 0.5px solid #e0d9cb)", boxShadow: "var(--shadow-card)" }}
        >
          <TabContent tab={tab} />
        </div>
      </div>
    </div>
  )
}

function TabContent({ tab }: { tab: TabId }) {
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
      return <ComingSoon label={TABS.find(t => t.id === tab)?.label ?? tab} />
  }
}
