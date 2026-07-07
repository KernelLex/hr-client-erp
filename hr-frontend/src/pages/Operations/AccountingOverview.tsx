import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
import { Loader2, RefreshCw } from "lucide-react"
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts"

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
    gst_detail: { output_fmt: string; input_fmt: string; net_fmt: string; net_liability: number }
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

type ModalKind = "bank" | "cash" | "creditors" | "advCreditors" | "debtors" | "advDebtors" | "cashflow" | null

interface AccountingOverviewProps {
  onGoToImport: () => void
}

export function AccountingOverview({ onGoToImport }: AccountingOverviewProps) {
  const navigate = useNavigate()
  const [modal, setModal] = useState<ModalKind>(null)

  const { data, isLoading, error } = useOps<OpsData>("operations-data", "hr_client.api.operations.get_operations_data")
  const { data: cashflow } = useOps<CashflowRow[]>("tally-cashflow", "hr_client.api.operations.get_cashflow_trend")
  const { data: aging } = useOps<AgingData>("tally-aging", "hr_client.api.operations.get_debtor_aging")
  const { data: creditors } = useOps<CreditorRow[]>("tally-creditors", "hr_client.api.operations.get_creditor_list")
  const { data: advDebtors } = useOps<AdvanceDebtorRow[]>("adv-debtors", "hr_client.api.operations.get_advance_from_debtors")
  const { data: advCreditors } = useOps<AdvanceCreditorRow[]>("adv-creditors", "hr_client.api.operations.get_advance_to_creditors")
  const { data: availableFY = [] } = useOps<string[]>("available-fy", "hr_client.api.operations.get_available_financial_years")

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
    <div className="space-y-7">
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
            value={data.finance.bank_od_fmt}
            variant={data.finance.bank_od > 0 ? "danger" : "success"}
            sub={data.finance.bank_od > 0 ? "Across accounts currently overdrawn" : "No overdraft outstanding"}
          />
        </div>
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
          <StatCard label="Output GST" value={data.finance.gst_detail.output_fmt} sub="Collected on sales" />
          <StatCard label="Input GST (ITC)" value={data.finance.gst_detail.input_fmt} sub="Credit on purchases" />
          <StatCard
            label="Net GST Payable"
            value={data.finance.gst_detail.net_fmt}
            variant={data.finance.gst_detail.net_liability > 0 ? "warn" : "success"}
            sub="Output − Input credit"
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
        <p className="text-[11px] mt-2.5" style={{ color: "var(--text-muted)" }}>
          Stock valuation, fast/slow-moving and re-order analysis need item-level quantity tracking, which isn't
          in the current Tally export — only the item master (name, HSN, GST%, rate) is available today.
        </p>
      </section>

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
