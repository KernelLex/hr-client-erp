import { useState, useMemo } from "react"
import {
  Landmark, TrendingUp, TrendingDown,
  ShoppingCart, Calculator, Users, PackageSearch,
  RefreshCw, Loader2, Download, Printer, Search, ChevronUp, ChevronDown,
  BarChart2, Activity, AlertTriangle, CheckCircle2,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart,
} from "recharts"
import {
  StatCard, SectionHeader, DrillDownModal, SummaryStat,
  PageHeader, HeaderPill,
} from "@/components/dashboard"
import { useAuth } from "@/context/AuthContext"
import { isAdmin } from "@/lib/constants"
import {
  useFundsSummary, useAccountsSummary, useGSTSummary, useRPSummary,
  useCashFlow, useInventorySummary, useCreditors, useCreditorAdvances,
  useDebtors, useDebtorAdvances, useStockMovement,
  useImportStatus, useTriggerImport,
} from "./hooks"
import type { Period, CreditorRow, DebtorRow, StockRow } from "./types"
import { PERIOD_LABELS } from "./types"

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtINR(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "₹0"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)} K`
  return `${sign}₹${abs.toLocaleString("en-IN")}`
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`
}

function yoyBadge(pct: number | null) {
  if (pct == null) return null
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% YoY
    </span>
  )
}

function agingColor(cat: string): string {
  return cat === "0_30" ? "text-green-700 bg-green-50" :
         cat === "31_60" ? "text-yellow-700 bg-yellow-50" :
         cat === "61_90" ? "text-orange-700 bg-orange-50" :
         "text-red-700 bg-red-50"
}

function agingLabel(cat: string): string {
  return cat === "0_30" ? "0–30d" : cat === "31_60" ? "31–60d" : cat === "61_90" ? "61–90d" : "90+d"
}

// ── Period filter ──────────────────────────────────────────────────────────────

interface PeriodFilterProps {
  value: Period
  onChange: (p: Period) => void
  customStart: string
  customEnd: string
  onCustomStart: (s: string) => void
  onCustomEnd: (s: string) => void
}

function PeriodFilter({ value, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: PeriodFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === p
              ? "text-white"
              : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
          }`}
          style={value === p ? { background: "var(--brand-primary)" } : {}}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
      {value === "custom" && (
        <div className="flex items-center gap-1 ml-1">
          <input type="date" value={customStart} onChange={e => onCustomStart(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-sm" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={customEnd} onChange={e => onCustomEnd(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-sm" />
        </div>
      )}
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-1 focus:ring-green-500" />
    </div>
  )
}

function SortButton({ field, label, sortBy, sortOrder, onSort }: {
  field: string; label: string; sortBy: string; sortOrder: string; onSort: (f: string) => void
}) {
  const active = sortBy === field
  return (
    <button onClick={() => onSort(field)} className="flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-gray-900">
      {label}
      {active ? (sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
    </button>
  )
}

function ExportXLSX({ data, filename }: { data: Record<string, unknown>[]; filename: string }) {
  const handleExport = () => {
    if (!data.length) return
    const headers = Object.keys(data[0])
    const rows = data.map(r => headers.map(h => r[h] ?? "").join(","))
    const csv = [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `${filename}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button onClick={handleExport}
      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
      <Download className="w-3.5 h-3.5" /> Export CSV
    </button>
  )
}

function PrintBtn() {
  return (
    <button onClick={() => window.print()}
      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
      <Printer className="w-3.5 h-3.5" /> Print
    </button>
  )
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded w-full" /></td>
      ))}
    </tr>
  )
}

// ── Section 1: Available Funds ─────────────────────────────────────────────────

type FundsModal = "banks" | "virtual" | "od" | null

function FundsSection({ admin }: { admin: boolean }) {
  const { data, isLoading } = useFundsSummary()
  const { data: importStatus } = useImportStatus()
  const triggerImport = useTriggerImport()
  const [modal, setModal] = useState<FundsModal>(null)

  const t = data?.totals
  const importing = importStatus?.status === "running"

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader icon={<Landmark className="w-5 h-5" />}>Available Funds</SectionHeader>
        {admin && (
          <div className="flex items-center gap-2">
            {importing && <span className="text-xs text-orange-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Importing…</span>}
            {importStatus?.status === "completed" && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{importStatus.message.split("—")[0]}</span>}
            <button
              disabled={importing || triggerImport.isPending}
              onClick={() => triggerImport.mutate()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
              style={{ background: "var(--brand-primary)" }}
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {importing ? "Importing..." : "Import from Tally"}
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Bank & Cash" value={isLoading ? "..." : fmtINR(t?.bank_cash)} sub={`${data?.banks.length ?? 0} accounts`} onClick={() => setModal("banks")} linkLabel="View accounts →" />
        <StatCard label="Virtual Accounts" value={isLoading ? "..." : fmtINR(t?.virtual)} sub={`${data?.virtuals.length ?? 0} gateways`} onClick={() => setModal("virtual")} linkLabel="View gateways →" />
        <StatCard label="OD Available" value={isLoading ? "..." : fmtINR(t?.od_available)} sub={`Utilised: ${fmtINR(t?.od_utilised ?? 0)}`} onClick={() => setModal("od")} linkLabel="View OD accounts →" variant="warn" />
        <StatCard label="Total Liquidity" value={isLoading ? "..." : fmtINR(t?.grand_total)} sub="All sources combined" variant="success" />
      </div>

      {/* Bank modal */}
      <DrillDownModal open={modal === "banks"} onOpenChange={o => !o && setModal(null)} title="Bank & Cash Accounts">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            <th className="text-left px-3 py-2 font-medium text-gray-500">Bank</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Account No</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Balance</th>
          </tr></thead>
          <tbody>
            {!data?.banks.length && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No bank accounts entered yet</td></tr>}
            {data?.banks.map((b, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium">{b.bank_name}</td>
                <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{b.account_no || "—"}</td>
                <td className="px-3 py-2.5"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{b.account_type}</span></td>
                <td className="px-3 py-2.5 text-right font-heading font-semibold">{fmtINR(b.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>

      {/* Virtual modal */}
      <DrillDownModal open={modal === "virtual"} onOpenChange={o => !o && setModal(null)} title="Virtual Account Balances">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            <th className="text-left px-3 py-2 font-medium text-gray-500">Gateway</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Available</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Credit Limit</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Utilised</th>
          </tr></thead>
          <tbody>
            {!data?.virtuals.length && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No virtual accounts entered yet</td></tr>}
            {data?.virtuals.map((v, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium">{v.gateway_name}</td>
                <td className="px-3 py-2.5 text-right text-green-700 font-heading font-semibold">{fmtINR(v.available_balance)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{fmtINR(v.credit_limit)}</td>
                <td className="px-3 py-2.5 text-right text-orange-600">{fmtINR(v.utilised)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>

      {/* OD modal */}
      <DrillDownModal open={modal === "od"} onOpenChange={o => !o && setModal(null)} title="Overdraft Accounts">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            <th className="text-left px-3 py-2 font-medium text-gray-500">Bank</th>
            <th className="text-left px-3 py-2 font-medium text-gray-500">Facility</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Limit</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Utilised</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Available</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500">Rate %</th>
          </tr></thead>
          <tbody>
            {!data?.od_accounts.length && <tr><td colSpan={6} className="text-center py-6 text-gray-400">No OD accounts entered yet</td></tr>}
            {data?.od_accounts.map((od, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium">{od.bank_name}</td>
                <td className="px-3 py-2.5 text-gray-600">{od.facility_name}</td>
                <td className="px-3 py-2.5 text-right">{fmtINR(od.sanctioned_limit)}</td>
                <td className="px-3 py-2.5 text-right text-orange-600">{fmtINR(od.utilised)}</td>
                <td className="px-3 py-2.5 text-right text-green-700 font-semibold">{fmtINR(od.available)}</td>
                <td className="px-3 py-2.5 text-right text-gray-500">{od.interest_rate?.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DrillDownModal>
    </>
  )
}

// ── Section 2: Accounts Summary ────────────────────────────────────────────────

type AcctModal = "sales" | "purchase" | null

function AccountsSummarySection({ period, customStart, customEnd }: { period: string; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = useAccountsSummary(period, customStart, customEnd)
  const [modal, setModal] = useState<AcctModal>(null)

  const chartData = useMemo(() => {
    const months = new Set([
      ...(data?.monthly_sales.map(r => r.month) ?? []),
      ...(data?.monthly_purchase.map(r => r.month) ?? []),
    ])
    return Array.from(months).sort().map(m => ({
      month: m.slice(5),
      Sales: data?.monthly_sales.find(r => r.month === m)?.amount ?? 0,
      Purchase: data?.monthly_purchase.find(r => r.month === m)?.amount ?? 0,
    }))
  }, [data])

  return (
    <>
      <SectionHeader icon={<BarChart2 className="w-5 h-5" />}>Accounts Summary</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div onClick={() => setModal("sales")} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5 font-medium uppercase tracking-wide">Total Sales</p>
              <p className="text-2xl font-heading font-bold text-green-700">{isLoading ? "..." : fmtINR(data?.sales.total)}</p>
              <p className="text-xs text-gray-400 mt-1">{data?.sales.invoice_count ?? 0} invoices · GST: {fmtINR(data?.sales.gst)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="p-2 rounded-lg bg-green-50"><TrendingUp className="w-5 h-5 text-green-600" /></div>
              {data?.sales.yoy_pct != null && yoyBadge(data.sales.yoy_pct)}
            </div>
          </div>
        </div>
        <div onClick={() => setModal("purchase")} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5 font-medium uppercase tracking-wide">Total Purchases</p>
              <p className="text-2xl font-heading font-bold text-red-700">{isLoading ? "..." : fmtINR(data?.purchase.total)}</p>
              <p className="text-xs text-gray-400 mt-1">{data?.purchase.bill_count ?? 0} bills · ITC: {fmtINR(data?.purchase.itc)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="p-2 rounded-lg bg-red-50"><ShoppingCart className="w-5 h-5 text-red-500" /></div>
              {data?.purchase.yoy_pct != null && yoyBadge(data.purchase.yoy_pct)}
            </div>
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
          <p className="text-sm font-medium text-gray-600 mb-3">Monthly Trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => fmtINR(v).replace("₹", "")} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v))} />
              <Legend />
              <Bar dataKey="Sales" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Purchase" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DrillDownModal open={modal === "sales"} onOpenChange={o => !o && setModal(null)} title="Sales Register">
        <SalesRegisterTable period={period} customStart={customStart} customEnd={customEnd} />
      </DrillDownModal>
      <DrillDownModal open={modal === "purchase"} onOpenChange={o => !o && setModal(null)} title="Purchase Register">
        <PurchaseRegisterTable period={period} customStart={customStart} customEnd={customEnd} />
      </DrillDownModal>
    </>
  )
}

function SalesRegisterTable({ period: _period, customStart: _cs, customEnd: _ce }: { period: string; customStart?: string; customEnd?: string }) {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useDebtors(search, "", "invoice_date", "desc", 1)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search customer…" />
        <ExportXLSX data={(data?.data ?? []) as unknown as Record<string, unknown>[]} filename="sales_register" />
        <PrintBtn />
      </div>
      <p className="text-xs text-gray-400 mb-2">Showing Debtors Ledger. Sales Register populates after Tally import. Total: {data?.total ?? 0}</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-3 py-2 text-gray-500 font-medium text-xs">Client</th>
          <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">Due Amount</th>
          <th className="text-left px-3 py-2 text-gray-500 font-medium text-xs">Invoice Date</th>
          <th className="text-center px-3 py-2 text-gray-500 font-medium text-xs">Status</th>
        </tr></thead>
        <tbody>
          {isLoading && <LoadingRow cols={4} />}
          {!isLoading && !data?.data.length && <tr><td colSpan={4} className="text-center py-8 text-gray-400">No sales records — run Tally import first</td></tr>}
          {data?.data.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2 font-medium">{r.client_name}</td>
              <td className="px-3 py-2 text-right font-semibold">{fmtINR(r.due_amount)}</td>
              <td className="px-3 py-2 text-gray-500 text-xs">{fmtDate(r.invoice_date)}</td>
              <td className="px-3 py-2 text-center"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PurchaseRegisterTable(_props: { period: string; customStart?: string; customEnd?: string }) {
  return (
    <div className="text-center py-8 text-gray-400">
      <ShoppingCart className="w-10 h-10 mx-auto mb-2 text-gray-200" />
      <p>Purchase register populates after running Tally import.</p>
      <p className="text-xs mt-1">Click "Import from Tally" in the Available Funds section.</p>
    </div>
  )
}

// ── Section 3: GST Summary ─────────────────────────────────────────────────────

function GSTSection({ period, customStart, customEnd }: { period: string; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = useGSTSummary(period, customStart, customEnd)
  const [open, setOpen] = useState(false)

  return (
    <>
      <SectionHeader icon={<Calculator className="w-5 h-5" />}>GST Summary</SectionHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div onClick={() => setOpen(true)} className="cursor-pointer rounded-xl p-4 bg-white border border-green-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Output GST</p>
          <p className="text-xl font-heading font-bold text-green-700">{isLoading ? "..." : fmtINR(data?.output.total)}</p>
          <p className="text-xs text-gray-400 mt-1">Collected on sales</p>
        </div>
        <div onClick={() => setOpen(true)} className="cursor-pointer rounded-xl p-4 bg-white border border-blue-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Input (ITC)</p>
          <p className="text-xl font-heading font-bold text-blue-700">{isLoading ? "..." : fmtINR(data?.input.total)}</p>
          <p className="text-xs text-gray-400 mt-1">Credit on purchases</p>
        </div>
        <div onClick={() => setOpen(true)} className="cursor-pointer rounded-xl p-4 bg-white border border-orange-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Net GST</p>
          <p className={`text-xl font-heading font-bold ${(data?.net.total ?? 0) > 0 ? "text-orange-700" : "text-green-700"}`}>
            {isLoading ? "..." : fmtINR(data?.net.total)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{(data?.net.total ?? 0) > 0 ? "Payable" : "Credit"}</p>
        </div>
        <div className="rounded-xl p-4 bg-white border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">GSTR-3B Due</p>
          <p className="text-xl font-heading font-bold text-gray-800">{data?.next_due_date ? fmtDate(data.next_due_date) : "—"}</p>
          {data?.gstr2b_mismatches ? (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />{data.gstr2b_mismatches} mismatches</p>
          ) : <p className="text-xs text-green-600 mt-1 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />No mismatches</p>}
        </div>
      </div>

      <DrillDownModal open={open} onOpenChange={o => !o && setOpen(false)} title="GST Ledger Detail">
        {data && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-3 py-2 text-gray-500 font-medium text-xs">Type</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">IGST</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">CGST</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">SGST</th>
              <th className="text-right px-3 py-2 text-gray-500 font-medium text-xs">Total</th>
            </tr></thead>
            <tbody>
              {[["Output", data.output], ["Input", data.input], ["Net", data.net]].map(([label, row]) => {
                const r = row as typeof data.output
                return (
                  <tr key={label as string} className="border-b border-gray-50">
                    <td className="px-3 py-3 font-medium">{label as string}</td>
                    <td className="px-3 py-3 text-right">{fmtINR(r.igst)}</td>
                    <td className="px-3 py-3 text-right">{fmtINR(r.cgst)}</td>
                    <td className="px-3 py-3 text-right">{fmtINR(r.sgst)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{fmtINR(r.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </DrillDownModal>
    </>
  )
}

// ── Section 4: Receivables & Payables ─────────────────────────────────────────

type RPModal = "debtors" | "debtor_adv" | "creditors" | "creditor_adv" | null

function RPSection({ period, customStart, customEnd }: { period: string; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = useRPSummary(period, customStart, customEnd)
  const [modal, setModal] = useState<RPModal>(null)

  return (
    <>
      <SectionHeader icon={<Users className="w-5 h-5" />}>Receivables &amp; Payables</SectionHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div onClick={() => setModal("debtors")} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Receivables</p>
          <p className="text-xl font-heading font-bold text-blue-700">{isLoading ? "..." : fmtINR(data?.debtors.total_outstanding)}</p>
          <p className="text-xs text-gray-400 mt-1">Net: {fmtINR(data?.debtors.net ?? 0)}</p>
          {data && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {(["0_30","31_60","61_90","90_plus"] as const).map(k => data.debtors.aging[k] > 0 && (
                <span key={k} className={`px-1.5 py-0.5 rounded text-xs ${agingColor(k)}`}>{agingLabel(k)}: {fmtINR(data.debtors.aging[k])}</span>
              ))}
            </div>
          )}
        </div>
        <div onClick={() => setModal("debtor_adv")} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Advances Received</p>
          <p className="text-xl font-heading font-bold text-teal-700">{isLoading ? "..." : fmtINR(data?.debtors.advance_received)}</p>
          <p className="text-xs text-gray-400 mt-1">From customers</p>
        </div>
        <div onClick={() => setModal("creditors")} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Payables</p>
          <p className="text-xl font-heading font-bold text-red-700">{isLoading ? "..." : fmtINR(data?.creditors.total_outstanding)}</p>
          <p className="text-xs text-gray-400 mt-1">Net: {fmtINR(data?.creditors.net ?? 0)}</p>
          {data && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {(["0_30","31_60","61_90","90_plus"] as const).map(k => data.creditors.aging[k] > 0 && (
                <span key={k} className={`px-1.5 py-0.5 rounded text-xs ${agingColor(k)}`}>{agingLabel(k)}: {fmtINR(data.creditors.aging[k])}</span>
              ))}
            </div>
          )}
        </div>
        <div onClick={() => setModal("creditor_adv")} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Advances Paid</p>
          <p className="text-xl font-heading font-bold text-orange-700">{isLoading ? "..." : fmtINR(data?.creditors.advance_paid)}</p>
          <p className="text-xs text-gray-400 mt-1">To vendors</p>
        </div>
      </div>

      <DrillDownModal open={modal === "debtors"} onOpenChange={o => !o && setModal(null)} title="Debtors Ledger">
        <DebtorsTable />
      </DrillDownModal>
      <DrillDownModal open={modal === "debtor_adv"} onOpenChange={o => !o && setModal(null)} title="Debtor Advances">
        <DebtorAdvTable />
      </DrillDownModal>
      <DrillDownModal open={modal === "creditors"} onOpenChange={o => !o && setModal(null)} title="Creditors Ledger">
        <CreditorsTable />
      </DrillDownModal>
      <DrillDownModal open={modal === "creditor_adv"} onOpenChange={o => !o && setModal(null)} title="Creditor Advances">
        <CreditorAdvTable />
      </DrillDownModal>
    </>
  )
}

function DebtorsTable() {
  const [search, setSearch] = useState("")
  const [aging, setAging] = useState("")
  const [sortBy, setSortBy] = useState("invoice_date")
  const [sortOrder, setSortOrder] = useState("desc")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useDebtors(search, aging, sortBy, sortOrder, page)

  const toggleSort = (f: string) => {
    if (sortBy === f) setSortOrder(o => o === "asc" ? "desc" : "asc")
    else { setSortBy(f); setSortOrder("desc") }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search client…" />
        <select value={aging} onChange={e => { setAging(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All aging</option>
          <option value="0_30">0–30 days</option>
          <option value="31_60">31–60 days</option>
          <option value="61_90">61–90 days</option>
          <option value="90_plus">90+ days</option>
        </select>
        <ExportXLSX data={(data?.data ?? []) as unknown as Record<string, unknown>[]} filename="debtors_ledger" />
        <PrintBtn />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-3 py-2"><SortButton field="client_name" label="Client" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} /></th>
          <th className="text-right px-3 py-2"><SortButton field="due_amount" label="Due Amt" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} /></th>
          <th className="text-left px-3 py-2"><SortButton field="invoice_date" label="Invoice Date" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} /></th>
          <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Aging</th>
          <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Status</th>
        </tr></thead>
        <tbody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => <LoadingRow key={i} cols={5} />)}
          {!isLoading && !data?.data.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No debtor records — run Tally import first</td></tr>}
          {data?.data.map((r: DebtorRow) => (
            <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium">{r.client_name}</td>
              <td className="px-3 py-2.5 text-right font-heading font-semibold">{fmtINR(r.due_amount)}</td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{fmtDate(r.invoice_date)}</td>
              <td className="px-3 py-2.5 text-center">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agingColor(r.aging_category)}`}>{r.aging_days}d</span>
              </td>
              <td className="px-3 py-2.5 text-center">
                <span className={`px-2 py-0.5 rounded text-xs ${r.status === "Overdue" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.total ?? 0) > 50 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>Showing {Math.min(50, data?.total ?? 0)} of {data?.total} records</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">←</button>
            <button disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DebtorAdvTable() {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useDebtorAdvances(search, "advance_date", "desc", 1)
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search client…" />
        <ExportXLSX data={(data?.data ?? []) as unknown as Record<string, unknown>[]} filename="debtor_advances" />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Client</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Advance</th>
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Date</th>
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Project</th>
          <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Age (mo)</th>
        </tr></thead>
        <tbody>
          {isLoading && <LoadingRow cols={5} />}
          {!isLoading && !data?.data.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No debtor advances found</td></tr>}
          {data?.data.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium">{r.client_name}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-teal-700">{fmtINR(r.advance_amount)}</td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{fmtDate(r.advance_date)}</td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{r.project || "—"}</td>
              <td className="px-3 py-2.5 text-center"><span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs">{r.aging_months}mo</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreditorsTable() {
  const [search, setSearch] = useState("")
  const [aging, setAging] = useState("")
  const [sortBy, setSortBy] = useState("invoice_date")
  const [sortOrder, setSortOrder] = useState("desc")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useCreditors(search, aging, sortBy, sortOrder, page)

  const toggleSort = (f: string) => {
    if (sortBy === f) setSortOrder(o => o === "asc" ? "desc" : "asc")
    else { setSortBy(f); setSortOrder("desc") }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search vendor…" />
        <select value={aging} onChange={e => { setAging(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All aging</option>
          <option value="0_30">0–30 days</option>
          <option value="31_60">31–60 days</option>
          <option value="61_90">61–90 days</option>
          <option value="90_plus">90+ days</option>
        </select>
        <ExportXLSX data={(data?.data ?? []) as unknown as Record<string, unknown>[]} filename="creditors_ledger" />
        <PrintBtn />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-3 py-2"><SortButton field="vendor_name" label="Vendor" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} /></th>
          <th className="text-right px-3 py-2"><SortButton field="due_amount" label="Due Amt" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} /></th>
          <th className="text-left px-3 py-2"><SortButton field="invoice_date" label="Invoice Date" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} /></th>
          <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Aging</th>
          <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Status</th>
        </tr></thead>
        <tbody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => <LoadingRow key={i} cols={5} />)}
          {!isLoading && !data?.data.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No creditor records — run Tally import first</td></tr>}
          {data?.data.map((r: CreditorRow) => (
            <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium">{r.vendor_name}</td>
              <td className="px-3 py-2.5 text-right font-heading font-semibold text-red-700">{fmtINR(r.due_amount)}</td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{fmtDate(r.invoice_date)}</td>
              <td className="px-3 py-2.5 text-center">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agingColor(r.aging_category)}`}>{r.aging_days}d</span>
              </td>
              <td className="px-3 py-2.5 text-center">
                <span className={`px-2 py-0.5 rounded text-xs ${r.status === "Overdue" ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.total ?? 0) > 50 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>Showing {Math.min(50, data?.total ?? 0)} of {data?.total}</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">←</button>
            <button disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CreditorAdvTable() {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useCreditorAdvances(search, "advance_date", "desc", 1)
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search vendor…" />
        <ExportXLSX data={(data?.data ?? []) as unknown as Record<string, unknown>[]} filename="creditor_advances" />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Vendor</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Advance</th>
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Date</th>
          <th className="text-center px-3 py-2 text-xs text-gray-500 font-medium">Age (mo)</th>
        </tr></thead>
        <tbody>
          {isLoading && <LoadingRow cols={4} />}
          {!isLoading && !data?.data.length && <tr><td colSpan={4} className="text-center py-8 text-gray-400">No creditor advances found</td></tr>}
          {data?.data.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium">{r.vendor_name}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-orange-700">{fmtINR(r.advance_amount)}</td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{fmtDate(r.advance_date)}</td>
              <td className="px-3 py-2.5 text-center"><span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full text-xs">{r.aging_months}mo</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Section 5: Cash Flow ───────────────────────────────────────────────────────

function CashFlowSection({ period, customStart, customEnd }: { period: string; customStart?: string; customEnd?: string }) {
  const { data, isLoading } = useCashFlow(period, customStart, customEnd)
  const [open, setOpen] = useState(false)

  const sections = data?.sections ?? {}
  const ACTIVITY_COLORS: Record<string, string> = { Operating: "#16a34a", Investing: "#0891b2", Financing: "#d97706" }

  return (
    <>
      <SectionHeader icon={<Activity className="w-5 h-5" />}>Cash Flow Statement</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {["Operating", "Investing", "Financing"].map(at => {
          const s = sections[at]
          const net = s?.net ?? 0
          const color = ACTIVITY_COLORS[at]
          return (
            <div key={at} onClick={() => setOpen(true)} className="cursor-pointer rounded-xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md">
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color }}>{at}</p>
              <p className={`text-xl font-heading font-bold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>
                {isLoading ? "..." : fmtINR(net)}
              </p>
              <p className="text-xs text-gray-400 mt-1">In: {fmtINR(s?.total_inflow ?? 0)} · Out: {fmtINR(s?.total_outflow ?? 0)}</p>
            </div>
          )
        })}
      </div>

      {(data?.monthly_series.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
          <p className="text-sm font-medium text-gray-600 mb-3">Monthly Cash Flow</p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data!.monthly_series.map(r => ({ ...r, net: r.inflow - r.outflow }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => fmtINR(v).replace("₹", "")} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => fmtINR(Number(v))} />
              <Bar dataKey="inflow" fill="#16a34a" name="Inflow" radius={[3, 3, 0, 0]} />
              <Bar dataKey="outflow" fill="#dc2626" name="Outflow" radius={[3, 3, 0, 0]} />
              <Line dataKey="net" stroke="#0891b2" strokeWidth={2} dot={false} name="Net" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <DrillDownModal open={open} onOpenChange={o => !o && setOpen(false)} title="Cash Flow Statement">
        {data && (
          <>
            {["Operating", "Investing", "Financing"].map(at => {
              const s = sections[at]
              if (!s) return null
              return (
                <div key={at} className="mb-5">
                  <h4 className="font-heading font-semibold text-base mb-2" style={{ color: ACTIVITY_COLORS[at] }}>{at} Activities</h4>
                  <table className="w-full text-sm mb-1">
                    <thead><tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-3 py-1.5 text-xs text-gray-500 font-medium">Line Item</th>
                      <th className="text-right px-3 py-1.5 text-xs text-gray-500 font-medium">Inflow</th>
                      <th className="text-right px-3 py-1.5 text-xs text-gray-500 font-medium">Outflow</th>
                      <th className="text-right px-3 py-1.5 text-xs text-gray-500 font-medium">Net</th>
                    </tr></thead>
                    <tbody>
                      {s.items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-3 py-2">{item.line_item}</td>
                          <td className="px-3 py-2 text-right text-green-700">{fmtINR(item.inflow)}</td>
                          <td className="px-3 py-2 text-right text-red-600">{fmtINR(item.outflow)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmtINR(item.net)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2">Subtotal</td>
                        <td className="px-3 py-2 text-right text-green-700">{fmtINR(s.total_inflow)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{fmtINR(s.total_outflow)}</td>
                        <td className="px-3 py-2 text-right">{fmtINR(s.net)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })}
            <div className="rounded-lg p-3 mt-2" style={{ background: "var(--cream, #fef9f0)" }}>
              <SummaryStat label="Net Cash Flow" value={fmtINR(data.grand_total.net)} />
            </div>
          </>
        )}
        {!data && <div className="text-center py-8 text-gray-400">No cash flow data — run Tally import first</div>}
      </DrillDownModal>
    </>
  )
}

// ── Section 6: Inventory ───────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Fast: "bg-green-50 text-green-700 border-green-200",
  Mid: "bg-blue-50 text-blue-700 border-blue-200",
  Slow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Dead: "bg-gray-50 text-gray-600 border-gray-200",
  Low: "bg-orange-50 text-orange-700 border-orange-200",
  Reorder: "bg-red-50 text-red-700 border-red-200",
}

type StockModal = string | null

function InventorySection() {
  const { data, isLoading } = useInventorySummary()
  const [modal, setModal] = useState<StockModal>(null)

  return (
    <>
      <SectionHeader icon={<PackageSearch className="w-5 h-5" />}>Inventory &amp; Stock</SectionHeader>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl p-4 bg-white border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Total SKUs</p>
          <p className="text-2xl font-heading font-bold">{isLoading ? "..." : (data?.total_sku_count ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl p-4 bg-white border border-red-100 shadow-sm">
          <p className="text-xs text-red-500 font-medium uppercase tracking-wide mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Reorder Alerts</p>
          <p className="text-2xl font-heading font-bold text-red-700">{isLoading ? "..." : (data?.reorder_alert_count ?? 0)}</p>
        </div>
        <div className="rounded-xl p-4 bg-white border border-orange-100 shadow-sm">
          <p className="text-xs text-orange-500 font-medium uppercase tracking-wide mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Negative Stock</p>
          <p className="text-2xl font-heading font-bold text-orange-700">{isLoading ? "..." : (data?.negative_stock_count ?? 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {(["Fast","Mid","Slow","Dead","Low","Reorder"] as const).map(cat => {
          const entry = data?.by_category.find(r => r.movement_category === cat)
          return (
            <div key={cat} onClick={() => setModal(cat)} className={`cursor-pointer rounded-xl p-3 border hover:shadow-md transition-shadow ${CAT_COLOR[cat]}`}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1">{cat}</p>
              <p className="text-lg font-heading font-bold">{entry?.sku_count ?? 0}</p>
              <p className="text-xs opacity-70">SKUs</p>
            </div>
          )
        })}
      </div>

      {modal && (
        <DrillDownModal open={!!modal} onOpenChange={o => !o && setModal(null)} title={`${modal} Moving Items`}>
          <StockTable category={modal} />
        </DrillDownModal>
      )}
    </>
  )
}

function StockTable({ category }: { category: string }) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useStockMovement(category, search, page)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search item…" />
        <ExportXLSX data={(data?.data ?? []) as unknown as Record<string, unknown>[]} filename={`stock_${category}`} />
        <PrintBtn />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Item</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Units Sold</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">On Hand</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Turnover</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Reorder Lvl</th>
          <th className="text-right px-3 py-2 text-xs text-gray-500 font-medium">Sugg. PO</th>
          <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium">Vendor</th>
        </tr></thead>
        <tbody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => <LoadingRow key={i} cols={7} />)}
          {!isLoading && !data?.data.length && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No items in this category</td></tr>}
          {data?.data.map((r: StockRow) => (
            <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2.5"><div className="font-medium text-xs">{r.item_code}</div><div className="text-gray-400 text-xs truncate max-w-32">{r.item_description}</div></td>
              <td className="px-3 py-2.5 text-right">{r.units_sold.toFixed(1)}</td>
              <td className="px-3 py-2.5 text-right font-medium">{r.stock_on_hand.toFixed(1)}</td>
              <td className="px-3 py-2.5 text-right text-gray-500">{r.turnover_days.toFixed(0)}d</td>
              <td className="px-3 py-2.5 text-right text-gray-500">{r.reorder_level.toFixed(1)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-orange-700">{r.suggested_po_qty > 0 ? r.suggested_po_qty.toFixed(0) : "—"}</td>
              <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-24">{r.vendor || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.total ?? 0) > 50 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>Showing {Math.min(page * 50, data?.total ?? 0)} of {data?.total}</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">←</button>
            <button disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AccountsDashboard() {
  const { user } = useAuth()
  const admin = isAdmin(user?.name)

  const [period, setPeriod] = useState<Period>("ytd")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  const cs = period === "custom" ? customStart : undefined
  const ce = period === "custom" ? customEnd : undefined

  return (
    <div className="p-6 max-w-7xl mx-auto" style={{ background: "var(--bg-app, #F8FAFC)", minHeight: "100vh" }}>
      <PageHeader
        workspaceLabel="Finance & Governance"
        title="Accounts Dashboard"
        right={<HeaderPill>Funds · GST · Receivables · Cash Flow · Inventory</HeaderPill>}
      />

      <div className="mb-6">
        <PeriodFilter
          value={period} onChange={setPeriod}
          customStart={customStart} customEnd={customEnd}
          onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
        />
      </div>

      <div className="space-y-8">
        <FundsSection admin={admin} />
        <AccountsSummarySection period={period} customStart={cs} customEnd={ce} />
        <GSTSection period={period} customStart={cs} customEnd={ce} />
        <RPSection period={period} customStart={cs} customEnd={ce} />
        <CashFlowSection period={period} customStart={cs} customEnd={ce} />
        <InventorySection />
      </div>
    </div>
  )
}
