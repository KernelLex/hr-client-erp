import { useMemo, useState, useRef, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api, apiUrl } from "@/lib/api"
import {
  StatCard,
  ChartCard,
  NetHighlightCard,
  AgingPill,
  AgingPillMonths,
  AgingLegend,
  SectionHeader,
  DrillDownModal,
  SummaryStat,
} from "@/components/dashboard"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Loader2, RefreshCw, Upload, Plus, Search, ChevronLeft, ChevronRight, Download } from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts"

// ── Accounts Dashboard extra types ──────────────────────────────────────────

interface VirtualAccount { gateway_name: string; available_balance: number; credit_limit: number; utilised: number }
interface ODAccount { bank_name: string; facility_name: string; sanctioned_limit: number; utilised: number; available: number; interest_rate: number }
interface FundsSummary { totals: { bank_cash: number; virtual: number; od_available: number; od_utilised: number }; banks: unknown[]; virtuals: VirtualAccount[]; od_accounts: ODAccount[] }
interface StockCatRow { movement_category: string; sku_count: number; total_stock: number }
interface InventorySummaryExtra { by_category: StockCatRow[]; negative_stock_count: number; reorder_alert_count: number; total_sku_count: number }
interface StockRow { name: string; item_code: string; item_description: string; movement_category: string; units_sold: number; reorder_level: number; suggested_po_qty: number; vendor: string }
interface StockPage { data: StockRow[]; total: number }

// ── Bank account types ─────────────────────────────────────────────────────

interface BankAccount {
  ledger_name: string; closing_balance: number; available: number;
  od_utilised: number; account_type: string; txn_count: number;
}

interface BankTxn {
  date: string; voucher_type: string; voucher_number: string;
  narration: string; party_name: string; counterparty: string;
  amount: number; credit: number; debit: number; direction: "credit" | "debit";
}

interface BankStatement {
  bank_name: string; closing_balance: number; available_balance: number;
  total: number; page: number; page_size: number;
  total_inflow: number; total_outflow: number; net: number;
  transactions: BankTxn[];
}

// ── New card types ─────────────────────────────────────────────────────────

interface ProfitabilityData {
  from_date: string; to_date: string;
  net_sales: number; gross_sales: number; credit_notes: number;
  net_purchases: number; cogs: number; closing_stock: number;
  gross_profit: number; opex_period: number; opex_ytd: number;
  net_profit: number; gross_margin_pct: number | null; net_margin_pct: number | null;
  opex_breakdown: Record<string, { total: number; categories: Record<string, number> }>;
  pop: { net_sales_pct: number | null; gross_profit_pct: number | null; prev_from: string; prev_to: string };
}

interface AgeingParty { party: string; amount: number; date: string; days: number }
interface AgeingSection { totals: Record<string, number>; grand_total: number; rows: AgeingParty[] }
interface AdvanceParty { party: string; amount: number; date: string; months: number }
interface AdvanceSection { totals: Record<string, number>; grand_total: number; rows: AdvanceParty[] }
interface AgeingCardData {
  as_of: string;
  creditors: AgeingSection; debtors: AgeingSection;
  adv_to_creditors: AdvanceSection; adv_from_debtors: AdvanceSection;
  bucket_labels: { invoice: Record<string, string>; advance: Record<string, string> };
}

interface InvGroupRow { group: string; sku_count: number; value: number }
interface InvCatRow { category: string; sku_count: number; value: number }
interface CardInventory {
  total_stock_value: number; negative_stock_value_display: number;
  active_skus: number; negative_sku_count: number; total_sku_count: number;
  reorder_alert_count: number;
  by_group: InvGroupRow[]; by_category: InvCatRow[];
}

interface OpexData {
  from_date: string; to_date: string;
  opex_period: number; opex_ytd: number;
  breakdown: Record<string, { total: number; categories: Record<string, number> }>;
}

interface TransportSourceData { total: number; entry_count: number; day_charges: number; labour_transport: number; labour_food: number }
interface TransportRow { name: string; source: string; entry_date: string; amount: number; description: string; labour_day_charges: number; labour_transport: number; labour_food: number; notes: string }
interface TransportData {
  from_date: string; to_date: string; total: number;
  by_source: Record<string, TransportSourceData>;
  recent: TransportRow[];
}

function fmtINR(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "₹0"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)} K`
  return `${sign}₹${abs.toLocaleString("en-IN")}`
}

const CAT_STYLE: Record<string, string> = {
  Fast: "bg-green-50 text-green-700 border-green-200",
  Mid:  "bg-blue-50 text-blue-700 border-blue-200",
  Slow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Dead: "bg-gray-50 text-gray-600 border-gray-200",
  Low:  "bg-orange-50 text-orange-700 border-orange-200",
  Reorder: "bg-red-50 text-red-700 border-red-200",
}

// ── Types (mirror hr_client.api.operations response shapes) ────────────────

interface Account { name: string; balance: number; balance_fmt: string }
interface Kpi { label: string; value: string; raw: number }
interface OpsData {
  as_of: string
  finance: {
    bank_accounts: Account[]
    cash_accounts: Account[]
    bank_od: number
    bank_od_fmt: string
    kpis: Kpi[]
    gst_detail: {
      output_fmt: string; input_fmt: string; net_fmt: string; net_liability: number
      period_output: number; period_input: number
      period_output_fmt: string; period_input_fmt: string
    }
  }
  accounts: { fy_sales: number; fy_purchases: number; fy_sales_fmt: string; fy_purchases_fmt: string }
  inventory: { kpis: Kpi[]; brands: string[] }
}
interface CashflowRow { month: string; key: string; sales: number; purchases: number; receipts: number; payments: number; net: number }
interface AgingBucket { amount: number; fmt: string; label: string; color: string }
interface DebtorRow { party: string; balance: number; balance_fmt: string; last_sale: string | null; days: number | null; bucket: string }
interface AgingData { debtors: DebtorRow[]; total: number; total_fmt: string; buckets: Record<string, AgingBucket> }
interface CreditorRow { party: string; balance: number; balance_fmt: string; last_purchase: string | null; days: number | null }
interface AdvanceDebtorRow { party: string; balance: number; balance_fmt: string; last_sale: string | null; months: number | null }
interface AdvanceCreditorRow { party: string; balance: number; balance_fmt: string; last_purchase: string | null; months: number | null }
interface VoucherLine { cnt: number; total: number; fmt: string }
interface FinancialSummary { sales: VoucherLine; purchase: VoucherLine; min_date: string; max_date: string; fy: string }

// ── Small fetch helper ──────────────────────────────────────────────────────

function useOps<T>(key: string, method: string, params?: Record<string, unknown>) {
  return useQuery<T>({
    queryKey: [key, params],
    queryFn: async () => {
      const res = await api.get(apiUrl(method), { params })
      return res.data.message as T
    },
    staleTime: 5 * 60_000,
  })
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  const s = d.replace(/-/g, "")
  if (s.length >= 8) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return `${s.slice(6, 8)} ${months[parseInt(s.slice(4, 6)) - 1]} ${s.slice(0, 4)}`
  }
  return d
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}

function dayBucket(days: number | null): keyof typeof DAY_BUCKET_LABEL {
  if (days == null) return "unknown"
  if (days <= 30) return "current"
  if (days <= 60) return "b30_60"
  if (days <= 90) return "b61_90"
  return "b90plus"
}
const DAY_BUCKET_LABEL = { current: "0–30 days", b30_60: "31–60 days", b61_90: "61–90 days", b90plus: "90+ days", unknown: "Unknown" }

type ModalKind = "bank" | "cash" | "creditors" | "advCreditors" | "debtors" | "advDebtors" | "cashflow" | "virtual" | "od" | "stocks"
  | "ageing_cred" | "ageing_debt" | "ageing_advcred" | "ageing_advdebt"
  | "inv_groups" | "inv_categories"
  | "opex_detail" | "transport_detail"
  | null

interface AccountingOverviewProps {
  onGoToImport: () => void
}

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

export function AccountingOverview({ onGoToImport }: AccountingOverviewProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modal, setModal] = useState<ModalKind>(null)

  // ── Bank statement state ──────────────────────────────────────────────────
  const [activeBank, setActiveBank]   = useState<string | null>(null)
  const [stmtPage, setStmtPage]       = useState(1)
  const [stmtSearch, setStmtSearch]   = useState("")
  const [stmtFrom, setStmtFrom]       = useState("")
  const [stmtTo, setStmtTo]           = useState("")
  const PAGE_SIZE = 50

  const { data: bankAccounts } = useOps<BankAccount[]>(
    "bank-accounts", "hr_client.api.operations.get_bank_accounts"
  )
  // Auto-select first bank when list loads
  useEffect(() => {
    if (bankAccounts && bankAccounts.length > 0 && !activeBank) {
      setActiveBank(bankAccounts[0].ledger_name)
    }
  }, [bankAccounts, activeBank])
  const { data: bankStmt, isLoading: stmtLoading } = useQuery<BankStatement>({
    queryKey: ["bank-stmt", activeBank, stmtPage, stmtSearch, stmtFrom, stmtTo],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.operations.get_bank_statement"), {
        params: {
          bank_name: activeBank,
          page: stmtPage,
          page_size: PAGE_SIZE,
          search: stmtSearch || undefined,
          from_date: stmtFrom || undefined,
          to_date: stmtTo || undefined,
        },
      })
      return res.data.message as BankStatement
    },
    enabled: !!activeBank,
    staleTime: 2 * 60_000,
  })

  function exportStmtCSV() {
    if (!bankStmt) return
    const rows = bankStmt.transactions
    const header = "Date,Voucher #,Type,Party,Counterparty,Narration,Debit (₹),Credit (₹)"
    const body = rows.map(r =>
      [r.date, r.voucher_number, r.voucher_type, r.party_name, r.counterparty,
       `"${(r.narration || "").replace(/"/g, "'")}"`,
       r.debit || "", r.credit || ""].join(",")
    ).join("\n")
    const blob = new Blob([header + "\n" + body], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${activeBank?.replace(/\s+/g, "_")}_statement.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Period state shared by Cards 1, 4, 5
  const [cardPeriod, setCardPeriod] = useState("mtd")
  const [cardDateFrom, setCardDateFrom] = useState("")
  const [cardDateTo, setCardDateTo] = useState("")
  const periodParams = cardPeriod === "custom"
    ? { period: "custom", custom_start: cardDateFrom, custom_end: cardDateTo }
    : { period: cardPeriod }

  // Transport: manual entry form state
  const [trSource, setTrSource] = useState("Porter")
  const [trDate, setTrDate] = useState("")
  const [trAmount, setTrAmount] = useState("")
  const [trDesc, setTrDesc] = useState("")
  const [trDayCharges, setTrDayCharges] = useState("")
  const [trTransport, setTrTransport] = useState("")
  const [trFood, setTrFood] = useState("")
  const [trSaving, setTrSaving] = useState(false)
  const [trMsg, setTrMsg] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState("")

  const { data, isLoading, error } = useOps<OpsData>("operations-data", "hr_client.api.operations.get_operations_data")
  const { data: cashflow } = useOps<CashflowRow[]>("tally-cashflow", "hr_client.api.operations.get_cashflow_trend")
  const { data: aging } = useOps<AgingData>("tally-aging", "hr_client.api.operations.get_debtor_aging")
  const { data: creditors } = useOps<CreditorRow[]>("tally-creditors", "hr_client.api.operations.get_creditor_list")
  const { data: advDebtors } = useOps<AdvanceDebtorRow[]>("adv-debtors", "hr_client.api.operations.get_advance_from_debtors")
  const { data: advCreditors } = useOps<AdvanceCreditorRow[]>("adv-creditors", "hr_client.api.operations.get_advance_to_creditors")
  const { data: availableFY = [] } = useOps<string[]>("available-fy", "hr_client.api.operations.get_available_financial_years")

  // ── Extra: Accounts Dashboard DocTypes ────────────────────────────────────
  const [stockCat, setStockCat] = useState<string | null>(null)
  const { data: fundsExtra } = useOps<FundsSummary>("funds-extra", "hr_client.api.accounts_dashboard.get_available_funds_summary")
  const { data: invExtra } = useOps<InventorySummaryExtra>("inv-extra", "hr_client.api.accounts_dashboard.get_inventory_summary")
  const { data: stockPage } = useQuery<StockPage>({
    queryKey: ["stock-page", stockCat],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.accounts_dashboard.get_stock_movement_report"), {
        params: { category: stockCat ?? "", page: 1, page_size: 100 },
      })
      return res.data.message as StockPage
    },
    enabled: !!stockCat,
    staleTime: 5 * 60_000,
  })

  // ── New card hooks ────────────────────────────────────────────────────────
  const { data: profitData, isLoading: profitLoading } = useOps<ProfitabilityData>(
    "card-profitability", "hr_client.api.profitability.get_card_profitability", periodParams
  )
  const { data: ageingCard } = useOps<AgeingCardData>(
    "card-ageing", "hr_client.api.profitability.get_card_ageing"
  )
  const { data: cardInv } = useOps<CardInventory>(
    "card-inventory", "hr_client.api.profitability.get_card_inventory"
  )
  const { data: opexData } = useOps<OpexData>(
    "card-opex", "hr_client.api.profitability.get_card_opex", periodParams
  )
  const { data: transportData } = useOps<TransportData>(
    "card-transport", "hr_client.api.profitability.get_card_transport", periodParams
  )

  const currentFY = availableFY[0]
  const prevFY = availableFY[1]
  const { data: finCurrent } = useOps<FinancialSummary>("fin-summary-current", "hr_client.api.operations.get_financial_summary", { fy: currentFY })
  const { data: finPrev } = useOps<FinancialSummary>("fin-summary-prev", "hr_client.api.operations.get_financial_summary", { fy: prevFY })

  const salesYoY = finCurrent && finPrev ? pctChange(finCurrent.sales.total, finPrev.sales.total) : null
  const purchaseYoY = finCurrent && finPrev ? pctChange(finCurrent.purchase.total, finPrev.purchase.total) : null

  const netSalesPurchase = data ? data.accounts.fy_sales - data.accounts.fy_purchases : 0
  const grossMargin = data && data.accounts.fy_sales > 0 ? (netSalesPurchase / data.accounts.fy_sales) * 100 : null

  const recentMonths = (cashflow ?? []).slice(-6)
  const latestNet = recentMonths.length > 0 ? recentMonths[recentMonths.length - 1].net : 0

  const creditorBucketTotals = useMemo(() => {
    const totals: Record<string, number> = { current: 0, b30_60: 0, b61_90: 0, b90plus: 0, unknown: 0 }
    for (const c of creditors ?? []) totals[dayBucket(c.days)] += c.balance
    return totals
  }, [creditors])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--gold)" }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-4 py-6 rounded-xl text-sm" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}>
        Failed to load accounting data. Check that a Tally import has been run.
      </div>
    )
  }

  const bankCount = data.finance.bank_accounts.length
  const cashCount = data.finance.cash_accounts.length

  // ── Table column definitions ──────────────────────────────────────────
  const accountCols: DataTableColumn<Account>[] = [
    { key: "name", header: "Ledger", render: (r) => r.name },
    { key: "balance", header: "Balance", align: "right", sortable: true, render: (r) => r.balance_fmt },
  ]
  const creditorCols: DataTableColumn<CreditorRow>[] = [
    { key: "party", header: "Vendor", render: (r) => r.party },
    { key: "last_purchase", header: "Last Purchase", render: (r) => fmtDate(r.last_purchase) },
    { key: "days", header: "Aging", sortable: true, render: (r) => (r.days != null ? <AgingPill days={r.days} /> : "—") },
    { key: "balance", header: "Due Amount", align: "right", sortable: true, render: (r) => r.balance_fmt },
  ]
  const debtorCols: DataTableColumn<DebtorRow>[] = [
    { key: "party", header: "Client", render: (r) => r.party },
    { key: "last_sale", header: "Last Invoice", render: (r) => fmtDate(r.last_sale) },
    { key: "days", header: "Aging", sortable: true, render: (r) => (r.days != null ? <AgingPill days={r.days} /> : "—") },
    { key: "balance", header: "Due Amount", align: "right", sortable: true, render: (r) => r.balance_fmt },
  ]
  const advCreditorCols: DataTableColumn<AdvanceCreditorRow>[] = [
    { key: "party", header: "Vendor", render: (r) => r.party },
    { key: "last_purchase", header: "Last Purchase", render: (r) => fmtDate(r.last_purchase) },
    { key: "months", header: "Aging", sortable: true, render: (r) => (r.months != null ? <AgingPillMonths months={r.months} /> : "—") },
    { key: "balance", header: "Advance Amount", align: "right", sortable: true, render: (r) => r.balance_fmt },
  ]
  const advDebtorCols: DataTableColumn<AdvanceDebtorRow>[] = [
    { key: "party", header: "Client", render: (r) => r.party },
    { key: "last_sale", header: "Last Invoice", render: (r) => fmtDate(r.last_sale) },
    { key: "months", header: "Aging", sortable: true, render: (r) => (r.months != null ? <AgingPillMonths months={r.months} /> : "—") },
    { key: "balance", header: "Advance Amount", align: "right", sortable: true, render: (r) => r.balance_fmt },
  ]
  const cashflowCols: DataTableColumn<CashflowRow>[] = [
    { key: "month", header: "Month" },
    { key: "sales", header: "Sales (₹L)", align: "right", render: (r) => `₹${r.sales.toFixed(1)}L` },
    { key: "purchases", header: "Purchases (₹L)", align: "right", render: (r) => `₹${r.purchases.toFixed(1)}L` },
    { key: "receipts", header: "Receipts (₹L)", align: "right", render: (r) => `₹${r.receipts.toFixed(1)}L` },
    { key: "payments", header: "Payments (₹L)", align: "right", render: (r) => `₹${r.payments.toFixed(1)}L` },
    { key: "net", header: "Net (₹L)", align: "right", sortable: true, render: (r) => `${r.net >= 0 ? "+" : ""}₹${r.net.toFixed(1)}L` },
  ]

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div
        className="flex gap-3 items-start px-4 py-3.5 rounded-xl"
        style={{ background: "var(--color-info-bg)", border: "0.5px solid #c4d4c4" }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0"
          style={{ background: "var(--brand-primary)", color: "var(--gold)" }}
        >
          ⚡
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "#2c4a3a" }}>
          <strong>One connected ledger.</strong> Every card here is computed live from your latest Tally import
          (as of {fmtDate(data.as_of)}). Click any Receivables, Payables or Cash Flow card to open its full
          drill-down report with search, sort and export.{" "}
          <button onClick={onGoToImport} className="underline font-medium" style={{ textDecorationColor: "var(--gold)" }}>
            Upload newer Tally data →
          </button>
        </p>
      </div>

      {/* ── Available Funds ── */}
      <section>
        <SectionHeader>Available Funds</SectionHeader>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <StatCard
            label="Bank Balance"
            value={data.finance.kpis.find((k) => k.label === "Bank Funds")?.value ?? "₹0"}
            sub={`${bankCount} account${bankCount === 1 ? "" : "s"}${bankCount ? " · " + data.finance.bank_accounts.map((a) => a.name).slice(0, 3).join(" · ") : ""}`}
            onClick={() => setModal("bank")}
            linkLabel="→ View Account-wise Balance"
          />
          <StatCard
            label="Cash Balance"
            value={data.finance.kpis.find((k) => k.label === "Cash in Hand")?.value ?? "₹0"}
            sub={`${cashCount} location${cashCount === 1 ? "" : "s"}`}
            onClick={() => setModal("cash")}
            linkLabel="→ View Location-wise Balance"
          />
          <StatCard
            label="Bank Overdraft Utilised"
            value={
              // Prefer VE OD Account Balance manual entry; fall back to Tally-computed figure
              fundsExtra && fundsExtra.totals.od_utilised > 0
                ? fmtINR(fundsExtra.totals.od_utilised)
                : data.finance.bank_od_fmt
            }
            variant={
              (fundsExtra?.totals.od_utilised ?? 0) + data.finance.bank_od > 0 ? "danger" : "default"
            }
            sub={
              fundsExtra && fundsExtra.od_accounts.length > 0
                ? `Manual facility data — ${fundsExtra.od_accounts.length} OD account(s)`
                : data.finance.bank_od > 0
                  ? "Tally: bank accounts in overdraft"
                  : "No OD drawn (Tally) — add VE OD Account Balance below for facility tracking"
            }
          />
        </div>
      </section>

      {/* ── Bank Account Statements ── */}
      <section>
        <SectionHeader>Bank Account Statements</SectionHeader>

        {/* Account tabs */}
        {bankAccounts && bankAccounts.length > 0 ? (
          <>
            <div className="flex gap-2 flex-wrap mb-0">
              {bankAccounts.map(acc => {
                const isActive = activeBank === acc.ledger_name
                const shortName = acc.ledger_name.length > 28
                  ? acc.ledger_name.slice(0, 26) + "…"
                  : acc.ledger_name
                return (
                  <button
                    key={acc.ledger_name}
                    onClick={() => {
                      setActiveBank(acc.ledger_name)
                      setStmtPage(1)
                      setStmtSearch("")
                    }}
                    className={`px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all border-b-0 ${
                      isActive
                        ? "text-white shadow-sm border border-b-white"
                        : "bg-white text-gray-500 border border-gray-200 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                    style={isActive ? { background: "var(--brand-primary)", borderColor: "var(--brand-primary)" } : {}}
                  >
                    <span className="block text-left">
                      {shortName}
                      <span className={`ml-2 text-xs font-normal ${isActive ? "text-[#d4c8a8]" : "text-gray-400"}`}>
                        {acc.account_type}
                      </span>
                    </span>
                    <span className={`block text-left text-xs mt-0.5 ${isActive ? "text-[#d4c8a8]" : "text-gray-400"}`}>
                      {acc.available > 0
                        ? `Available: ${fmtINR(acc.available)}`
                        : acc.od_utilised > 0
                          ? `Collected: ${fmtINR(acc.od_utilised)}`
                          : "₹0"}
                      {" · "}{acc.txn_count.toLocaleString()} txns
                    </span>
                  </button>
                )
              })}
              {!activeBank && (
                <p className="text-xs text-gray-400 self-center ml-2">← Click a bank to view its statement</p>
              )}
            </div>

            {/* Statement panel */}
            {activeBank && (
              <div className="border border-gray-200 rounded-b-xl rounded-tr-xl bg-white overflow-hidden"
                   style={{ borderTop: "2px solid var(--brand-primary)" }}>

                {/* Statement header */}
                {bankStmt && (
                  <div className="flex flex-wrap gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div>
                      <p className="text-xs text-gray-400">Current Balance</p>
                      <p className={`text-lg font-bold ${bankStmt.closing_balance < 0 ? "text-green-700" : "text-orange-600"}`}>
                        {fmtINR(Math.abs(bankStmt.closing_balance))}
                        <span className="text-xs ml-1 font-normal text-gray-400">
                          {bankStmt.closing_balance < 0 ? "Dr (available)" : "Cr (collected/OD)"}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Period Inflows</p>
                      <p className="text-sm font-semibold text-green-700">+{fmtINR(bankStmt.total_inflow)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Period Outflows</p>
                      <p className="text-sm font-semibold text-red-600">−{fmtINR(bankStmt.total_outflow)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Net</p>
                      <p className={`text-sm font-semibold ${bankStmt.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {bankStmt.net >= 0 ? "+" : "−"}{fmtINR(Math.abs(bankStmt.net))}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={exportStmtCSV}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-400">
                        <Download size={12} /> Export CSV
                      </button>
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-gray-100">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="text"
                      placeholder="Search narration, party, voucher #…"
                      value={stmtSearch}
                      onChange={e => { setStmtSearch(e.target.value); setStmtPage(1) }}
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#c8a45c]"
                    />
                  </div>
                  <input type="date" value={stmtFrom}
                    onChange={e => { setStmtFrom(e.target.value); setStmtPage(1) }}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600" />
                  <span className="text-xs text-gray-400 self-center">to</span>
                  <input type="date" value={stmtTo}
                    onChange={e => { setStmtTo(e.target.value); setStmtPage(1) }}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600" />
                  {(stmtSearch || stmtFrom || stmtTo) && (
                    <button onClick={() => { setStmtSearch(""); setStmtFrom(""); setStmtTo(""); setStmtPage(1) }}
                      className="text-xs text-gray-400 hover:text-gray-700 px-2">Clear</button>
                  )}
                </div>

                {/* Transactions table */}
                {stmtLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-gray-300" />
                  </div>
                ) : bankStmt ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 sticky top-0">
                            <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium w-24">Date</th>
                            <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium w-24">Voucher #</th>
                            <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium w-24">Type</th>
                            <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Party / Counterparty</th>
                            <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Narration</th>
                            <th className="text-right px-4 py-2.5 text-xs text-red-500 font-medium w-28">Debit (Out)</th>
                            <th className="text-right px-4 py-2.5 text-xs text-green-600 font-medium w-28">Credit (In)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bankStmt.transactions.length === 0 && (
                            <tr>
                              <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">
                                No transactions found for the selected filters.
                              </td>
                            </tr>
                          )}
                          {bankStmt.transactions.map((r, i) => (
                            <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 ${r.direction === "credit" ? "hover:bg-green-50/30" : "hover:bg-red-50/20"}`}>
                              <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.date}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap font-mono">{r.voucher_number || "—"}</td>
                              <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  r.voucher_type === "Receipt"  ? "bg-green-100 text-green-700" :
                                  r.voucher_type === "Payment"  ? "bg-red-100 text-red-700" :
                                  r.voucher_type === "Contra"   ? "bg-blue-100 text-blue-700" :
                                  r.voucher_type === "Journal"  ? "bg-yellow-100 text-yellow-700" :
                                  "bg-gray-100 text-gray-600"
                                }`}>{r.voucher_type || "—"}</span>
                              </td>
                              <td className="px-4 py-2.5 text-xs">
                                <p className="font-medium text-gray-800 truncate max-w-[160px]" title={r.party_name || r.counterparty}>
                                  {r.party_name || r.counterparty || "—"}
                                </p>
                                {r.party_name && r.counterparty && r.party_name !== r.counterparty && (
                                  <p className="text-gray-400 text-xs truncate max-w-[160px]" title={r.counterparty}>
                                    via {r.counterparty}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[220px]">
                                <p className="truncate" title={r.narration}>{r.narration || "—"}</p>
                              </td>
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                {r.debit > 0 ? (
                                  <span className="text-red-600 font-semibold text-xs">{fmtINR(r.debit)}</span>
                                ) : <span className="text-gray-200">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                {r.credit > 0 ? (
                                  <span className="text-green-700 font-semibold text-xs">{fmtINR(r.credit)}</span>
                                ) : <span className="text-gray-200">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {bankStmt.total > PAGE_SIZE && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                        <p className="text-xs text-gray-400">
                          Showing {(stmtPage - 1) * PAGE_SIZE + 1}–{Math.min(stmtPage * PAGE_SIZE, bankStmt.total)} of {bankStmt.total.toLocaleString()} transactions
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={stmtPage <= 1}
                            onClick={() => setStmtPage(p => Math.max(1, p - 1))}
                            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-100"
                          ><ChevronLeft size={14} /></button>
                          <span className="text-xs text-gray-500 px-2">Page {stmtPage} / {Math.ceil(bankStmt.total / PAGE_SIZE)}</span>
                          <button
                            disabled={stmtPage * PAGE_SIZE >= bankStmt.total}
                            onClick={() => setStmtPage(p => p + 1)}
                            className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-100"
                          ><ChevronRight size={14} /></button>
                        </div>
                      </div>
                    )}

                    {bankStmt.total > 0 && bankStmt.total <= PAGE_SIZE && (
                      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
                        <p className="text-xs text-gray-400">{bankStmt.total} transactions total</p>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">No bank accounts found. Run a Tally import to populate bank ledger data.</p>
        )}
      </section>

      {/* ── Accounts Details ── */}
      <section>
        <SectionHeader>Accounts Details</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard
            label="Sales (FY, excl. GST)"
            value={data.accounts.fy_sales_fmt}
            sub={
              <>
                {salesYoY != null && (
                  <span style={{ color: salesYoY >= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 700 }}>
                    {salesYoY >= 0 ? "↑" : "↓"} {Math.abs(salesYoY).toFixed(1)}% YoY
                  </span>
                )}
                {finCurrent && ` · ${finCurrent.sales.cnt.toLocaleString()} invoices`}
              </>
            }
            onClick={() => navigate("/sales-register")}
            linkLabel="→ View Sales Register"
          />
          <StatCard
            label="Purchases (FY, excl. GST)"
            value={data.accounts.fy_purchases_fmt}
            sub={
              <>
                {purchaseYoY != null && (
                  <span style={{ color: purchaseYoY <= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 700 }}>
                    {purchaseYoY >= 0 ? "↑" : "↓"} {Math.abs(purchaseYoY).toFixed(1)}% YoY
                  </span>
                )}
                {finCurrent && ` · ${finCurrent.purchase.cnt.toLocaleString()} bills`}
              </>
            }
            onClick={() => navigate("/purchasing")}
            linkLabel="→ View Purchase Register"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <ChartCard label="Sales — Monthly Trend (₹ Lakhs)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recentMonths} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#f0e8d8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8a8a80" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8a8a80" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`₹${Number(v)}L`, "Sales"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="sales" stroke="#1e3a2f" strokeWidth={2} dot={{ r: 3, fill: "#c8a45c" }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard label="Purchases — Monthly Trend (₹ Lakhs)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recentMonths} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#f0e8d8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8a8a80" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8a8a80" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`₹${Number(v)}L`, "Purchases"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="purchases" fill="#c8a45c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="mt-3">
          <NetHighlightCard
            label="Net (Sales − Purchases)"
            value={`₹ ${Math.abs(netSalesPurchase).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
            sub={grossMargin != null ? `Gross margin ${grossMargin.toFixed(1)}% · FY ${currentFY ?? ""}` : undefined}
          />
        </div>
      </section>

      {/* ── Statutory Compliance ── */}
      <section>
        <SectionHeader>Statutory Compliance</SectionHeader>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <StatCard
            label="Output GST Billed (FY)"
            value={data.finance.gst_detail.period_output > 0 ? data.finance.gst_detail.period_output_fmt : data.finance.gst_detail.output_fmt}
            sub={data.finance.gst_detail.period_output > 0 ? "Gross GST collected from customers" : "From GST ledger balance"}
          />
          <StatCard
            label="Input ITC Claimed (FY)"
            value={data.finance.gst_detail.period_input > 0 ? data.finance.gst_detail.period_input_fmt : data.finance.gst_detail.input_fmt}
            sub={data.finance.gst_detail.period_input > 0 ? "Gross ITC on purchases" : "From ITC ledger balance"}
          />
          <StatCard
            label="Net GST Payable to Govt"
            value={data.finance.gst_detail.net_fmt}
            variant={data.finance.gst_detail.net_liability > 0 ? "warn" : "success"}
            sub="Current ledger balance — after remittances"
          />
          {data.finance.kpis.find((k) => k.label === "TDS Payable") && (
            <StatCard
              label="TDS Payable"
              value={data.finance.kpis.find((k) => k.label === "TDS Payable")!.value}
              sub="From TDS ledgers"
            />
          )}
        </div>
      </section>

      {/* ── Receivables & Payables ── */}
      <section>
        <SectionHeader>Receivables &amp; Payables</SectionHeader>
        <AgingLegend />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <StatCard
            label="Creditors (Payables)"
            value={creditors ? (creditors.reduce((s, c) => s + c.balance, 0)).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }) : "…"}
            variant="danger"
            sub={creditors ? `${creditors.length} vendor${creditors.length === 1 ? "" : "s"}` : "Loading…"}
            onClick={() => setModal("creditors")}
            linkLabel="→ View Creditors Report"
          />
          <StatCard
            label="Advance to Creditors"
            value={advCreditors ? (advCreditors.reduce((s, c) => s + c.balance, 0)).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }) : "…"}
            sub={advCreditors ? `${advCreditors.length} vendor${advCreditors.length === 1 ? "" : "s"}` : "Loading…"}
            onClick={() => setModal("advCreditors")}
            linkLabel="→ View Advances Report"
          />
          <StatCard
            label="Debtors (Receivables)"
            value={aging?.total_fmt ?? "…"}
            sub={aging ? `${aging.debtors.length} clients` : "Loading…"}
            onClick={() => setModal("debtors")}
            linkLabel="→ View Debtors Report"
          />
          <StatCard
            label="Advance from Debtors"
            value={advDebtors ? (advDebtors.reduce((s, c) => s + c.balance, 0)).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }) : "…"}
            variant="success"
            sub={advDebtors ? `${advDebtors.length} client${advDebtors.length === 1 ? "" : "s"}` : "Loading…"}
            onClick={() => setModal("advDebtors")}
            linkLabel="→ View Advances Report"
          />
        </div>
      </section>

      {/* ── Cash & Fund Flow ── */}
      <section>
        <SectionHeader>Cash &amp; Fund Flow</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard
            label="Net Cash Flow (latest month)"
            value={`${latestNet >= 0 ? "+" : ""}₹${latestNet.toFixed(1)}L`}
            variant={latestNet >= 0 ? "success" : "danger"}
            sub="Receipts − Payments · click for monthly statement"
            onClick={() => setModal("cashflow")}
            linkLabel="→ View Full Cash Flow Report"
          />
          <ChartCard label="Cash Flow — Monthly Trend (Net, ₹ Lakhs)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recentMonths} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#f0e8d8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8a8a80" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#8a8a80" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`₹${Number(v)}L`, "Net"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="net" stroke="#16a34a" strokeWidth={2} dot={{ r: 3, fill: "#16a34a" }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      {/* ── Inventory ── */}
      <section>
        <SectionHeader>Inventory</SectionHeader>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <StatCard
            label="SKU Count"
            value={data.inventory.kpis.find((k) => k.label === "Total SKUs")?.value ?? "0"}
            sub="Item master, from Tally"
            onClick={() => navigate("/inventory")}
            linkLabel="→ View Item Master"
          />
          <StatCard
            label="Brand / Stock Groups"
            value={data.inventory.kpis.find((k) => k.label === "Brand Groups")?.value ?? "0"}
            sub={data.inventory.brands.slice(0, 3).join(" · ") || "—"}
          />
        </div>
      </section>

      {/* ── Stock Movement Analysis ── */}
      {invExtra && invExtra.total_sku_count > 0 && (
        <section>
          <SectionHeader>Stock Movement Analysis</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
            {(["Fast","Mid","Slow","Dead","Low","Reorder"] as const).map(cat => {
              const entry = invExtra.by_category.find(r => r.movement_category === cat)
              return (
                <div
                  key={cat}
                  onClick={() => { setStockCat(cat); setModal("stocks") }}
                  className={`cursor-pointer rounded-xl p-3 border hover:shadow-md transition-shadow ${CAT_STYLE[cat]}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1">{cat}</p>
                  <p className="text-xl font-bold">{entry?.sku_count ?? 0}</p>
                  <p className="text-xs opacity-70 mt-0.5">SKUs</p>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            <span>Total tracked: <strong>{invExtra.total_sku_count}</strong> items</span>
            {invExtra.reorder_alert_count > 0 && (
              <span className="text-red-600 font-medium">⚠ {invExtra.reorder_alert_count} reorder alerts</span>
            )}
          </div>
        </section>
      )}

      {/* ── CARD 1: Profitability Summary ── */}
      <section>
        <SectionHeader>Profitability Summary</SectionHeader>
        {/* Period selector */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          {(["mtd","ytd","last_month","custom"] as const).map(p => (
            <button key={p}
              onClick={() => setCardPeriod(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${cardPeriod === p ? "bg-forest-700 text-white border-forest-700" : "bg-white text-gray-600 border-gray-200 hover:border-forest-400"}`}
            >
              {p === "mtd" ? "This Month" : p === "ytd" ? "This FY" : p === "last_month" ? "Last Month" : "Custom"}
            </button>
          ))}
          {cardPeriod === "custom" && (
            <>
              <input type="date" value={cardDateFrom} onChange={e => setCardDateFrom(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={cardDateTo} onChange={e => setCardDateTo(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs" />
            </>
          )}
          {profitLoading && <Loader2 size={13} className="animate-spin text-gray-300" />}
        </div>

        {profitData && (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
              {/* Net Sales */}
              <div className="rounded-xl p-4 border" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Net Sales</p>
                <p className="text-2xl font-bold" style={{ color: "#166534" }}>{fmtINR(profitData.net_sales)}</p>
                {profitData.credit_notes > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">Gross {fmtINR(profitData.gross_sales)} − Returns {fmtINR(profitData.credit_notes)}</p>
                )}
                {profitData.pop.net_sales_pct != null && (
                  <p className="text-xs mt-1 font-medium" style={{ color: profitData.pop.net_sales_pct >= 0 ? "#16a34a" : "#dc2626" }}>
                    {profitData.pop.net_sales_pct >= 0 ? "↑" : "↓"} {Math.abs(profitData.pop.net_sales_pct)}% vs prior period
                  </p>
                )}
              </div>

              {/* COGS */}
              <div className="rounded-xl p-4 border" style={{ background: "#fff7ed", borderColor: "#fed7aa" }}>
                <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">COGS</p>
                <p className="text-2xl font-bold" style={{ color: "#9a3412" }}>{fmtINR(profitData.cogs)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Purchases in period (stock Δ≈0 proxy)</p>
                {profitData.closing_stock > 0 && (
                  <p className="text-xs text-gray-400">Closing stock: {fmtINR(profitData.closing_stock)}</p>
                )}
              </div>

              {/* Gross Profit */}
              <div className="rounded-xl p-4 border" style={{ background: profitData.gross_profit >= 0 ? "#f0fdf4" : "#fef2f2", borderColor: profitData.gross_profit >= 0 ? "#86efac" : "#fecaca" }}>
                <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Gross Profit</p>
                <p className="text-2xl font-bold" style={{ color: profitData.gross_profit >= 0 ? "#166534" : "#dc2626" }}>{fmtINR(profitData.gross_profit)}</p>
                {profitData.gross_margin_pct != null && (
                  <p className="text-xs text-gray-400 mt-0.5">Margin {profitData.gross_margin_pct}%</p>
                )}
                {profitData.pop.gross_profit_pct != null && (
                  <p className="text-xs mt-1 font-medium" style={{ color: profitData.pop.gross_profit_pct >= 0 ? "#16a34a" : "#dc2626" }}>
                    {profitData.pop.gross_profit_pct >= 0 ? "↑" : "↓"} {Math.abs(profitData.pop.gross_profit_pct)}% vs prior period
                  </p>
                )}
              </div>

              {/* Net Profit */}
              <div className="rounded-xl p-4 border" style={{ background: profitData.net_profit >= 0 ? "#f0f9ff" : "#fef2f2", borderColor: profitData.net_profit >= 0 ? "#bae6fd" : "#fecaca" }}>
                <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Net Profit</p>
                <p className="text-2xl font-bold" style={{ color: profitData.net_profit >= 0 ? "#0369a1" : "#dc2626" }}>{fmtINR(profitData.net_profit)}</p>
                <p className="text-xs text-gray-400 mt-0.5">After period Opex {fmtINR(profitData.opex_period)}</p>
                {profitData.net_margin_pct != null && (
                  <p className="text-xs mt-1 font-medium" style={{ color: profitData.net_margin_pct >= 0 ? "#0369a1" : "#dc2626" }}>
                    Net margin {profitData.net_margin_pct}%
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Period: {profitData.from_date} → {profitData.to_date}
              {" · "}Prior period: {profitData.pop.prev_from} → {profitData.pop.prev_to}
              {" · "}Tally YTD Opex: {fmtINR(profitData.opex_ytd)}
            </p>
          </>
        )}

        {!profitData && !profitLoading && (
          <p className="text-xs text-gray-400 mt-2">No Tally data available for selected period. Run a Tally import first.</p>
        )}
      </section>

      {/* ── CARD 2: Enhanced Ageing Analysis ── */}
      <section>
        <SectionHeader>Ageing Analysis</SectionHeader>
        {ageingCard ? (
          <>
            {/* Sub-table A: Creditors & Debtors by invoice due date */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">A · Invoice Ageing (by due date)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {(["creditors","debtors"] as const).map(side => {
                const s = ageingCard[side]
                const labels = ageingCard.bucket_labels.invoice
                return (
                  <div key={side} className="rounded-xl p-4 border border-gray-100 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold" style={{ color: side === "creditors" ? "#dc2626" : "#16a34a" }}>
                        {side === "creditors" ? "Creditors (Payable)" : "Debtors (Receivable)"}
                      </p>
                      <button
                        onClick={() => setModal(side === "creditors" ? "ageing_cred" : "ageing_debt")}
                        className="text-xs text-blue-600 hover:underline"
                      >→ Drill-down</button>
                    </div>
                    <p className="text-lg font-bold mb-2">{fmtINR(s.grand_total)}</p>
                    <div className="grid grid-cols-4 gap-1">
                      {Object.entries(labels).map(([k, lbl]) => (
                        <div key={k} className="text-center">
                          <p className="text-xs text-gray-400 leading-tight">{lbl}</p>
                          <p className={`text-xs font-semibold mt-0.5 ${s.totals[k] > 0 ? (k === "b90plus" ? "text-red-600" : k === "b46_90" ? "text-orange-500" : "text-gray-700") : "text-gray-300"}`}>
                            {fmtINR(s.totals[k] || 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sub-table B: Advance ageing */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">B · Advance Ageing (by advance date)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(["adv_to_creditors","adv_from_debtors"] as const).map(side => {
                const s = ageingCard[side]
                const labels = ageingCard.bucket_labels.advance
                const label = side === "adv_to_creditors" ? "Advance to Creditors" : "Advance from Debtors"
                return (
                  <div key={side} className="rounded-xl p-4 border border-gray-100 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">{label}</p>
                      <button
                        onClick={() => setModal(side === "adv_to_creditors" ? "ageing_advcred" : "ageing_advdebt")}
                        className="text-xs text-blue-600 hover:underline"
                      >→ Drill-down</button>
                    </div>
                    <p className="text-lg font-bold mb-2">{fmtINR(s.grand_total)}</p>
                    <div className="grid grid-cols-4 gap-1">
                      {Object.entries(labels).map(([k, lbl]) => (
                        <div key={k} className="text-center">
                          <p className="text-xs text-gray-400 leading-tight">{lbl}</p>
                          <p className={`text-xs font-semibold mt-0.5 ${s.totals[k] > 0 ? (k === "b24plus" ? "text-red-600" : k === "b13_24m" ? "text-orange-500" : "text-gray-700") : "text-gray-300"}`}>
                            {fmtINR(s.totals[k] || 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>As of {ageingCard.as_of} · Based on VE Creditor/Debtor Ledger & Advance tables · Click → Drill-down for full list</p>
          </>
        ) : (
          <p className="text-xs text-gray-400">No ageing data. Populate VE Creditor Ledger / VE Debtor Ledger via Tally import.</p>
        )}
      </section>

      {/* ── CARD 3: Inventory Summary ── */}
      {cardInv && (
        <section>
          <SectionHeader>Inventory Summary</SectionHeader>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <StatCard label="Total Stock Value" value={fmtINR(cardInv.total_stock_value)} sub={`${cardInv.total_sku_count} SKUs tracked`} />
            <StatCard
              label="Negative Stock (Value)"
              value={fmtINR(cardInv.negative_stock_value_display)}
              variant={cardInv.negative_stock_value_display > 0 ? "danger" : "success"}
              sub={cardInv.negative_sku_count > 0 ? `${cardInv.negative_sku_count} SKUs below zero` : "None"}
            />
            <StatCard label="Active SKUs" value={String(cardInv.active_skus)} sub="Items with non-zero stock" />
            <StatCard label="Reorder Alerts" value={String(cardInv.reorder_alert_count)} variant={cardInv.reorder_alert_count > 0 ? "warn" : "default"} sub="Stock ≤ reorder level" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl p-4 border border-gray-100 bg-white">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">By Stock Group / Brand</p>
                <button onClick={() => setModal("inv_groups")} className="text-xs text-blue-600 hover:underline">→ Full list</button>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {cardInv.by_group.slice(0, 8).map(r => (
                  <div key={r.group} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate max-w-[140px]" title={r.group}>{r.group}</span>
                    <span className="text-gray-500 shrink-0 ml-2">{r.sku_count} SKUs · {fmtINR(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-4 border border-gray-100 bg-white">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">By Movement Category</p>
                <button onClick={() => setModal("inv_categories")} className="text-xs text-blue-600 hover:underline">→ Full list</button>
              </div>
              <div className="space-y-1.5">
                {cardInv.by_category.map(r => (
                  <div key={r.category} className="flex items-center justify-between text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CAT_STYLE[r.category] || "bg-gray-50 text-gray-600"}`}>{r.category}</span>
                    <span className="text-gray-500 ml-2">{r.sku_count} SKUs · {fmtINR(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── CARD 4: Opex / Admin Expenses ── */}
      <section>
        <SectionHeader>Opex / Admin Expenses</SectionHeader>
        <p className="text-xs text-gray-400 mb-3">
          Period-specific: Vera Expense Claims + Transport Records.
          Tally Ledger shows YTD balance for expense accounts (not period-filtered).
        </p>
        {opexData ? (
          <>
            <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
              <StatCard label="Opex (Period)" value={fmtINR(opexData.opex_period)} sub={`${opexData.from_date} → ${opexData.to_date}`} />
              <StatCard label="Tally Expense Ledgers (YTD)" value={fmtINR(opexData.opex_ytd)} sub="Indirect + salary ledger balances" variant="warn" />
            </div>
            {Object.entries(opexData.breakdown).length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Source</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Category</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Amount</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(opexData.breakdown).map(([src, detail]) =>
                      Object.entries(detail.categories).map(([cat, amt], ci) => (
                        <tr key={`${src}-${cat}`} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-500">{ci === 0 ? src : ""}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{cat}</td>
                          <td className="px-3 py-2 text-xs text-right font-medium">{fmtINR(amt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {Object.entries(opexData.breakdown).length === 0 && (
              <p className="text-xs text-gray-400">No expense data for this period. Add Vera Expense Claims or Transport Records.</p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">Loading opex data…</p>
        )}
      </section>

      {/* ── CARD 5: Transport & Labour ── */}
      <section>
        <SectionHeader>Transport &amp; Labour Costs</SectionHeader>
        {transportData && (
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {(["Porter","Rapido","Other","Labour"] as const).map(src => {
              const d = transportData.by_source[src]
              return (
                <div key={src} className="rounded-xl p-3 border border-gray-100 bg-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{src}</p>
                  <p className="text-xl font-bold text-gray-800">{fmtINR(d?.total ?? 0)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{d?.entry_count ?? 0} entries</p>
                  {src === "Labour" && d && d.total > 0 && (
                    <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                      <p>Day: {fmtINR(d.day_charges)}</p>
                      <p>Transport: {fmtINR(d.labour_transport)}</p>
                      <p>Food: {fmtINR(d.labour_food)}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Manual entry form */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 mb-3">
          <p className="text-sm font-semibold text-gray-700 mb-3">Add Entry</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Source</label>
              <select value={trSource} onChange={e => setTrSource(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                <option>Porter</option><option>Rapido</option><option>Other</option><option>Labour</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <input type="date" value={trDate} onChange={e => setTrDate(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
            </div>
            {trSource === "Labour" ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Day Charges</label>
                  <input type="number" placeholder="0" value={trDayCharges} onChange={e => setTrDayCharges(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Transport</label>
                  <input type="number" placeholder="0" value={trTransport} onChange={e => setTrTransport(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Food</label>
                  <input type="number" placeholder="0" value={trFood} onChange={e => setTrFood(e.target.value)}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Amount (₹)</label>
                <input type="number" placeholder="0" value={trAmount} onChange={e => setTrAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Description</label>
              <input type="text" placeholder="Optional" value={trDesc} onChange={e => setTrDesc(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={trSaving || !trDate}
              onClick={async () => {
                setTrSaving(true); setTrMsg("")
                try {
                  const csrf = getCsrf()
                  const body: Record<string, string> = {
                    source: trSource, entry_date: trDate,
                    description: trDesc,
                  }
                  if (trSource === "Labour") {
                    body.labour_day_charges = trDayCharges || "0"
                    body.labour_transport = trTransport || "0"
                    body.labour_food = trFood || "0"
                  } else {
                    body.amount = trAmount || "0"
                  }
                  const res = await fetch("/api/method/hr_client.api.profitability.create_transport_record", {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf },
                    body: JSON.stringify(body),
                  })
                  const json = await res.json()
                  if (json.message?.success) {
                    setTrMsg("✓ Saved")
                    setTrDate(""); setTrAmount(""); setTrDesc("")
                    setTrDayCharges(""); setTrTransport(""); setTrFood("")
                    qc.invalidateQueries({ queryKey: ["card-transport"] })
                    qc.invalidateQueries({ queryKey: ["card-opex"] })
                    qc.invalidateQueries({ queryKey: ["card-profitability"] })
                  } else {
                    setTrMsg("Error saving")
                  }
                } catch { setTrMsg("Network error") }
                setTrSaving(false)
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--brand-primary)" }}
            >
              {trSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add Entry
            </button>
            {trMsg && <span className="text-xs" style={{ color: trMsg.startsWith("✓") ? "var(--color-success)" : "var(--color-danger)" }}>{trMsg}</span>}
          </div>
        </div>

        {/* CSV/Excel upload */}
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 mb-3">
          <div className="flex items-center gap-3">
            <Upload size={16} className="text-gray-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">Import from CSV / Excel</p>
              <p className="text-xs text-gray-400">Columns: source, entry_date, amount, description (+ labour_day_charges, labour_transport, labour_food for Labour rows)</p>
            </div>
            <input type="file" ref={fileInputRef} accept=".csv,.xlsx,.xls" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploading(true); setUploadMsg("")
                try {
                  const csrf = getCsrf()
                  const fd = new FormData()
                  fd.append("file", file)
                  const res = await fetch("/api/method/hr_client.api.profitability.upload_transport_csv", {
                    method: "POST", credentials: "include",
                    headers: { "X-Frappe-CSRF-Token": csrf },
                    body: fd,
                  })
                  const json = await res.json()
                  const msg = json.message
                  if (msg?.success) {
                    setUploadMsg(`✓ ${msg.message}`)
                    qc.invalidateQueries({ queryKey: ["card-transport"] })
                    qc.invalidateQueries({ queryKey: ["card-opex"] })
                    qc.invalidateQueries({ queryKey: ["card-profitability"] })
                  } else {
                    setUploadMsg(msg?.exc || "Upload failed")
                  }
                } catch { setUploadMsg("Network error") }
                setUploading(false)
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-gray-400 flex items-center gap-1 disabled:opacity-50">
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? "Uploading…" : "Choose File"}
            </button>
          </div>
          {uploadMsg && <p className="text-xs mt-2" style={{ color: uploadMsg.startsWith("✓") ? "var(--color-success)" : "var(--color-danger)" }}>{uploadMsg}</p>}
        </div>

        {/* Recent entries */}
        {transportData && transportData.recent.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Entries ({transportData.from_date} → {transportData.to_date})</p>
              <button onClick={() => setModal("transport_detail")} className="text-xs text-blue-600 hover:underline">→ All</button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-50 bg-gray-50">
                <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">Date</th>
                <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">Source</th>
                <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">Description</th>
                <th className="text-right px-3 py-2 text-xs text-gray-400 font-medium">Amount</th>
              </tr></thead>
              <tbody>
                {transportData.recent.slice(0, 10).map(r => (
                  <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500">{r.entry_date}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">{r.source}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[180px]">{r.description || "—"}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold">{fmtINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {transportData && transportData.recent.length === 0 && (
          <p className="text-xs text-gray-400">No transport records for this period. Add entries above or import from CSV.</p>
        )}
      </section>

      {/* ── Virtual Accounts & OD ── */}
      {fundsExtra && (fundsExtra.virtuals.length > 0 || fundsExtra.od_accounts.length > 0) && (
        <section>
          <SectionHeader>Payment Gateways &amp; OD Facilities</SectionHeader>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
            {fundsExtra.virtuals.length > 0 && (
              <StatCard
                label="Virtual Accounts"
                value={fmtINR(fundsExtra.totals.virtual)}
                sub={`${fundsExtra.virtuals.length} gateway${fundsExtra.virtuals.length === 1 ? "" : "s"}`}
                onClick={() => setModal("virtual")}
                linkLabel="→ View Gateway Balances"
              />
            )}
            {fundsExtra.od_accounts.length > 0 && (
              <StatCard
                label="OD Available"
                value={fmtINR(fundsExtra.totals.od_available)}
                sub={`Utilised: ${fmtINR(fundsExtra.totals.od_utilised)}`}
                variant={fundsExtra.totals.od_utilised > 0 ? "warn" : "default"}
                onClick={() => setModal("od")}
                linkLabel="→ View OD Facilities"
              />
            )}
          </div>
        </section>
      )}

      {/* ── Modals ── */}
      <DrillDownModal open={modal === "bank"} onOpenChange={(o) => !o && setModal(null)} title="Bank Balance — Account-wise">
        <DataTable columns={accountCols} rows={data.finance.bank_accounts} rowKey={(r) => r.name} searchText={(r) => r.name} defaultSortKey="balance" />
      </DrillDownModal>

      <DrillDownModal open={modal === "cash"} onOpenChange={(o) => !o && setModal(null)} title="Cash Balance — Location-wise">
        <DataTable columns={accountCols} rows={data.finance.cash_accounts} rowKey={(r) => r.name} searchText={(r) => r.name} defaultSortKey="balance" />
      </DrillDownModal>

      <DrillDownModal
        open={modal === "creditors"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Creditors (Payables) Report"
        summary={
          <>
            <SummaryStat label="Total Vendors" value={creditors?.length ?? 0} />
            <SummaryStat label="Total Due" value={`₹${(creditors ?? []).reduce((s, c) => s + c.balance, 0).toLocaleString("en-IN")}`} />
            {Object.entries(DAY_BUCKET_LABEL).filter(([k]) => k !== "unknown").map(([k, label]) => (
              <SummaryStat key={k} label={label} value={`₹${Math.round(creditorBucketTotals[k]).toLocaleString("en-IN")}`} />
            ))}
          </>
        }
      >
        <DataTable columns={creditorCols} rows={creditors ?? []} rowKey={(r) => r.party} searchText={(r) => r.party} defaultSortKey="balance" />
      </DrillDownModal>

      <DrillDownModal
        open={modal === "debtors"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Debtors (Receivables) Report"
        summary={
          aging && (
            <>
              <SummaryStat label="Total Clients" value={aging.debtors.length} />
              <SummaryStat label="Total Due" value={aging.total_fmt} />
              {Object.entries(aging.buckets).filter(([k]) => k !== "unknown").map(([k, b]) => (
                <SummaryStat key={k} label={b.label} value={b.fmt} />
              ))}
            </>
          )
        }
      >
        <DataTable columns={debtorCols} rows={aging?.debtors ?? []} rowKey={(r) => r.party} searchText={(r) => r.party} defaultSortKey="balance" />
      </DrillDownModal>

      <DrillDownModal
        open={modal === "advCreditors"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Advance to Creditors"
        summary={
          <>
            <SummaryStat label="Total Vendors" value={advCreditors?.length ?? 0} />
            <SummaryStat label="Total Advance" value={`₹${(advCreditors ?? []).reduce((s, c) => s + c.balance, 0).toLocaleString("en-IN")}`} />
          </>
        }
      >
        <DataTable columns={advCreditorCols} rows={advCreditors ?? []} rowKey={(r) => r.party} searchText={(r) => r.party} defaultSortKey="balance" />
      </DrillDownModal>

      <DrillDownModal
        open={modal === "advDebtors"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Advance from Debtors"
        summary={
          <>
            <SummaryStat label="Total Clients" value={advDebtors?.length ?? 0} />
            <SummaryStat label="Total Advance" value={`₹${(advDebtors ?? []).reduce((s, c) => s + c.balance, 0).toLocaleString("en-IN")}`} />
          </>
        }
      >
        <DataTable columns={advDebtorCols} rows={advDebtors ?? []} rowKey={(r) => r.party} searchText={(r) => r.party} defaultSortKey="balance" />
      </DrillDownModal>

      <DrillDownModal
        open={modal === "cashflow"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Cash Flow — Monthly Statement"
        summary={
          cashflow && (
            <>
              <SummaryStat label="Months shown" value={cashflow.length} />
              <SummaryStat
                label="Net (period)"
                value={`${cashflow.reduce((s, r) => s + r.net, 0) >= 0 ? "+" : ""}₹${cashflow.reduce((s, r) => s + r.net, 0).toFixed(1)}L`}
              />
            </>
          )
        }
      >
        <DataTable columns={cashflowCols} rows={[...(cashflow ?? [])].reverse()} rowKey={(r) => r.key} searchable={false} />
      </DrillDownModal>

      {/* Stock Movement drill-down */}
      <DrillDownModal
        open={modal === "stocks"}
        onOpenChange={(o) => { if (!o) { setModal(null); setStockCat(null) } }}
        title={stockCat ? `${stockCat} Moving Items` : "Stock Movement"}
        summary={stockPage && <SummaryStat label="Items" value={stockPage.total} />}
      >
        {!stockPage ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Item</th>
              <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Sales Value</th>
              <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Reorder Lvl</th>
              <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Vendor</th>
            </tr></thead>
            <tbody>
              {stockPage.data.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No items in this category yet — run a Tally import first</td></tr>
              )}
              {stockPage.data.map((r) => (
                <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-xs truncate max-w-[220px]" title={r.item_code}>{r.item_code}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-xs">{fmtINR(r.units_sold)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{r.reorder_level > 0 ? r.reorder_level.toFixed(0) : "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-[100px]">{r.vendor || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DrillDownModal>

      {/* Virtual accounts drill-down */}
      <DrillDownModal open={modal === "virtual"} onOpenChange={(o) => !o && setModal(null)} title="Payment Gateway Balances">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Gateway</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Available</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Credit Limit</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Utilised</th>
          </tr></thead>
          <tbody>
            {!fundsExtra?.virtuals.length && (
              <tr><td colSpan={4} className="text-center py-6 text-gray-400">No payment gateway accounts entered yet — add via ERPNext desk → VE Virtual Account Balance</td></tr>
            )}
            {fundsExtra?.virtuals.map((v, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium">{v.gateway_name}</td>
                <td className="px-3 py-2.5 text-right text-green-700 font-semibold">{fmtINR(v.available_balance)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{fmtINR(v.credit_limit)}</td>
                <td className="px-3 py-2.5 text-right text-orange-600">{fmtINR(v.utilised)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>

      {/* ── Ageing drill-down modals ── */}
      {(["ageing_cred","ageing_debt","ageing_advcred","ageing_advdebt"] as const).map(mk => {
        const isInvoice = mk === "ageing_cred" || mk === "ageing_debt"
        const title = mk === "ageing_cred" ? "Creditors Ageing (0–20 / 21–45 / 46–90 / 90+ days)"
          : mk === "ageing_debt" ? "Debtors Ageing (0–20 / 21–45 / 46–90 / 90+ days)"
          : mk === "ageing_advcred" ? "Advance to Creditors Ageing"
          : "Advance from Debtors Ageing"
        const section = mk === "ageing_cred" ? ageingCard?.creditors
          : mk === "ageing_debt" ? ageingCard?.debtors
          : mk === "ageing_advcred" ? ageingCard?.adv_to_creditors
          : ageingCard?.adv_from_debtors
        return (
          <DrillDownModal key={mk} open={modal === mk} onOpenChange={(o) => !o && setModal(null)} title={title}
            summary={section && <><SummaryStat label="Total" value={fmtINR(section.grand_total)} /><SummaryStat label="Entries" value={section.rows.length} /></>}
          >
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Party</th>
                <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Date</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">{isInvoice ? "Aging (days)" : "Aging (months)"}</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Amount</th>
              </tr></thead>
              <tbody>
                {!section?.rows.length && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No data</td></tr>}
                {section?.rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs font-medium">{r.party}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.date}</td>
                    <td className="px-3 py-2 text-xs text-right">
                      {isInvoice
                        ? <AgingPill days={(r as AgeingParty).days} />
                        : <AgingPillMonths months={(r as AdvanceParty).months} />
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-semibold">{fmtINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DrillDownModal>
        )
      })}

      {/* Inventory groups drill-down */}
      <DrillDownModal open={modal === "inv_groups"} onOpenChange={(o) => !o && setModal(null)} title="Stock Groups / Brands — Full List"
        summary={cardInv && <SummaryStat label="Total Stock Value" value={fmtINR(cardInv.total_stock_value)} />}
      >
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Stock Group</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">SKUs</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Value</th>
          </tr></thead>
          <tbody>
            {!cardInv?.by_group.length && <tr><td colSpan={3} className="text-center py-6 text-gray-400">No group data</td></tr>}
            {cardInv?.by_group.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 text-xs font-medium">{r.group}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-500">{r.sku_count}</td>
                <td className="px-3 py-2 text-xs text-right font-semibold">{fmtINR(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>

      {/* Inventory categories drill-down */}
      <DrillDownModal open={modal === "inv_categories"} onOpenChange={(o) => !o && setModal(null)} title="Stock Movement Categories — Full List">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Category</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">SKUs</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Value</th>
          </tr></thead>
          <tbody>
            {cardInv?.by_category.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAT_STYLE[r.category] || "bg-gray-50 text-gray-600"}`}>{r.category}</span>
                </td>
                <td className="px-3 py-2 text-xs text-right text-gray-500">{r.sku_count}</td>
                <td className="px-3 py-2 text-xs text-right font-semibold">{fmtINR(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>

      {/* Transport full list drill-down */}
      <DrillDownModal open={modal === "transport_detail"} onOpenChange={(o) => !o && setModal(null)} title="Transport & Labour — All Records"
        summary={transportData && <><SummaryStat label="Total" value={fmtINR(transportData.total)} /><SummaryStat label="Entries" value={transportData.recent.length} /></>}
      >
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Date</th>
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Source</th>
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Description</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Day Charges</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Transport</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Food</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Total</th>
          </tr></thead>
          <tbody>
            {!transportData?.recent.length && <tr><td colSpan={7} className="text-center py-6 text-gray-400">No records for this period</td></tr>}
            {transportData?.recent.map((r) => (
              <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-500">{r.entry_date}</td>
                <td className="px-3 py-2 text-xs"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{r.source}</span></td>
                <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[140px]">{r.description || "—"}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-500">{r.labour_day_charges > 0 ? fmtINR(r.labour_day_charges) : "—"}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-500">{r.labour_transport > 0 ? fmtINR(r.labour_transport) : "—"}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-500">{r.labour_food > 0 ? fmtINR(r.labour_food) : "—"}</td>
                <td className="px-3 py-2 text-xs text-right font-semibold">{fmtINR(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>

      {/* OD accounts drill-down */}
      <DrillDownModal open={modal === "od"} onOpenChange={(o) => !o && setModal(null)} title="Overdraft Facilities">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Bank</th>
            <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Facility</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Limit</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Utilised</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Available</th>
            <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Rate %</th>
          </tr></thead>
          <tbody>
            {!fundsExtra?.od_accounts.length && (
              <tr><td colSpan={6} className="text-center py-6 text-gray-400">No OD facilities entered yet — add via ERPNext desk → VE OD Account Balance</td></tr>
            )}
            {fundsExtra?.od_accounts.map((od, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium">{od.bank_name}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{od.facility_name}</td>
                <td className="px-3 py-2.5 text-right">{fmtINR(od.sanctioned_limit)}</td>
                <td className="px-3 py-2.5 text-right text-orange-600">{fmtINR(od.utilised)}</td>
                <td className="px-3 py-2.5 text-right text-green-700 font-semibold">{fmtINR(od.available)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{od.interest_rate?.toFixed(2) ?? "—"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>
    </div>
  )
}

export function RefreshHint({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={refreshing}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full disabled:opacity-50"
      style={{ background: "#fff", border: "var(--border-card)", color: "var(--text-secondary)" }}
    >
      <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  )
}
