import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  TrendingUp, TrendingDown, Package,
  RefreshCw, AlertTriangle,
  Upload, CheckCircle2, XCircle,
  Loader2, Activity, Search, ArrowLeft, ChevronRight,
  BarChart2, AlertCircle,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch(method: string) {
  const res = await fetch(`/api/method/${method}`, { credentials: "include" })
  if (!res.ok) throw new Error(`Failed: ${method}`)
  return (await res.json()).message
}

async function apiPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": getCsrf() },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Request failed")
  return json.message
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface KPI { label: string; value: string; raw: number; delta?: string; delta_class?: string }

interface OpsData {
  as_of: string
  finance: {
    kpis: KPI[]
    bank_accounts: Array<{ name: string; balance: number; balance_fmt: string }>
    cash_accounts: Array<{ name: string; balance: number; balance_fmt: string }>
    gst_detail: { output_fmt: string; input_fmt: string; net_fmt: string; output_gst: number; input_credit: number; net_liability: number }
  }
  accounts: {
    kpis: KPI[]
    top_debtors: Array<{ party: string; amount: number; amount_fmt: string }>
    top_creditors: Array<{ party: string; amount: number; amount_fmt: string }>
    chart: Array<{ month: string; sales: number; purchases: number; collections: number }>
    fy_sales_fmt: string; fy_purchases_fmt: string
  }
  hr: { kpis: KPI[]; headcount: number; open_positions: number; pending_leaves: number }
  inventory: { kpis: KPI[]; brands: string[]; voucher_summary: Record<string, number> }
  executive: { kpis: KPI[] }
}

interface CashflowRow { month: string; key: string; sales: number; purchases: number; receipts: number; payments: number; net: number }

interface AgingData {
  debtors: Array<{ party: string; balance: number; balance_fmt: string; last_sale: string | null; days: number | null; bucket: string }>
  total: number; total_fmt: string
  buckets: Record<string, { amount: number; fmt: string; label: string; color: string }>
}

interface PartyStatement {
  party: string; balance: number; balance_fmt: string; group: string; is_debtor: boolean; is_creditor: boolean
  transactions: Array<{ type: string; number: string; date: string; amount: number; amount_fmt: string; narration: string }>
}

interface SearchResult { type: string; number: string; date: string; party: string; amount: number; amount_fmt: string; narration: string }

interface CreditorRow { party: string; balance: number; balance_fmt: string; last_purchase: string | null; days: number | null }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—"
  const s = d.replace(/-/g, "")
  if (s.length >= 8) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return `${s.slice(6, 8)} ${months[parseInt(s.slice(4, 6)) - 1]} ${s.slice(0, 4)}`
  }
  return d
}

function bucketBadge(bucket: string) {
  const map: Record<string, string> = {
    current: "bg-emerald-100 text-emerald-700",
    b30_60: "bg-yellow-100 text-yellow-700",
    b61_90: "bg-orange-100 text-orange-700",
    b90plus: "bg-red-100 text-red-700",
    unknown: "bg-gray-100 text-gray-500",
  }
  return map[bucket] ?? "bg-gray-100 text-gray-500"
}

function bucketLabel(bucket: string) {
  const map: Record<string, string> = { current: "0–30d", b30_60: "31–60d", b61_90: "61–90d", b90plus: "90+d", unknown: "?" }
  return map[bucket] ?? bucket
}

function voucherBadge(type: string) {
  const map: Record<string, string> = {
    Sales: "bg-indigo-100 text-indigo-700",
    "PERFORMA INVOICE": "bg-indigo-50 text-indigo-600",
    Purchase: "bg-red-100 text-red-700",
    Receipt: "bg-emerald-100 text-emerald-700",
    Payment: "bg-orange-100 text-orange-700",
    Journal: "bg-purple-100 text-purple-700",
    "Credit Note": "bg-yellow-100 text-yellow-700",
    "Debit Note": "bg-pink-100 text-pink-700",
    "Purchase Order": "bg-red-50 text-red-600",
    "Sales Order": "bg-blue-50 text-blue-600",
  }
  return map[type] ?? "bg-gray-100 text-gray-600"
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function KpiCard({ kpi, accent }: { kpi: KPI; accent?: string }) {
  const dc = kpi.delta_class === "delta-positive" ? "text-emerald-600" : kpi.delta_class === "delta-negative" ? "text-red-500" : "text-gray-400"
  return (
    <div className={`rounded-xl p-5 bg-white transition-all duration-150 hover:shadow-md ${accent ? `border-l-4 ${accent}` : ""}`}
         style={{ border: accent ? undefined : "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs font-medium mb-1 text-gray-400">{kpi.label}</p>
      <p className="text-2xl font-extrabold text-gray-900 leading-tight">{kpi.value}</p>
      {kpi.delta && <p className={`text-xs mt-1 ${dc}`}>{kpi.delta}</p>}
    </div>
  )
}

function SectionCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3 bg-slate-50 border border-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Charts ─────────────────────────────────────────────────────────────────────

function CashflowChart({ data }: { data: CashflowRow[] }) {
  const [metric, setMetric] = useState<"sales"|"cashflow">("sales")
  const maxVal = metric === "sales"
    ? Math.max(...data.flatMap(d => [d.sales, d.purchases]), 1)
    : Math.max(...data.map(d => Math.max(d.receipts, d.payments)), 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Monthly Activity — ₹ in Lakhs</p>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(["sales", "cashflow"] as const).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${metric === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {m === "sales" ? "Sales vs Purchases" : "Receipts vs Payments"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-36">
        {data.map((d, i) => {
          const a = metric === "sales" ? d.sales : d.receipts
          const b = metric === "sales" ? d.purchases : d.payments
          const netPos = d.net >= 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none">
                {d.month}: {metric === "sales" ? `₹${a}L / ₹${b}L` : `Rec ₹${a}L / Pay ₹${b}L`}
                {metric === "cashflow" && <span className={netPos ? " text-emerald-300" : " text-red-300"}> Net {netPos ? "+" : ""}₹{d.net}L</span>}
              </div>
              <div className="w-full flex gap-0.5 items-end h-28">
                <div className={`flex-1 rounded-t opacity-80 ${metric === "sales" ? "bg-indigo-500" : "bg-emerald-500"}`}
                     style={{ height: `${(a / maxVal) * 100}%` }} />
                <div className={`flex-1 rounded-t opacity-70 ${metric === "sales" ? "bg-red-400" : "bg-orange-400"}`}
                     style={{ height: `${(b / maxVal) * 100}%` }} />
              </div>
              <span className="text-[9px] text-gray-400">{d.month}</span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-2 justify-center">
        {metric === "sales"
          ? [["bg-indigo-500","Sales"],["bg-red-400","Purchases"]].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1.5 text-xs text-gray-500"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${c}`} />{l}</span>))
          : [["bg-emerald-500","Receipts"],["bg-orange-400","Payments"]].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1.5 text-xs text-gray-500"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${c}`} />{l}</span>))}
      </div>
    </div>
  )
}

// ── Party Statement Drawer ─────────────────────────────────────────────────────

function PartyDrawer({ party, onClose }: { party: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<PartyStatement>({
    queryKey: ["party-statement", party],
    queryFn: () => apiPost("hr_client.api.operations.get_party_statement", { party_name: party }),
    enabled: !!party,
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={16} /></button>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{party}</p>
            {data && (
              <p className={`text-xs mt-0.5 ${data.balance > 0 ? "text-emerald-600" : data.balance < 0 ? "text-red-500" : "text-gray-400"}`}>
                Outstanding: {data.balance_fmt} · {data.group}
              </p>
            )}
          </div>
          {data && (
            <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${data.is_debtor ? "bg-indigo-100 text-indigo-700" : data.is_creditor ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
              {data.is_debtor ? "Debtor" : data.is_creditor ? "Creditor" : "Ledger"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="text-indigo-500 animate-spin" /></div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No data found</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {data.transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No transactions found</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-4 text-xs font-semibold text-gray-400 uppercase">Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase">Type</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Note</th>
                    <th className="text-right py-2 px-4 text-xs font-semibold text-gray-400 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.transactions.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{fmtDate(t.date)}</td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${voucherBadge(t.type)}`}>{t.type}</span>
                      </td>
                      <td className="py-2.5 px-2 text-gray-400 text-xs hidden md:table-cell max-w-[160px] truncate">{t.narration}</td>
                      <td className={`py-2.5 px-4 font-mono text-sm text-right font-semibold ${t.amount > 0 ? "text-gray-900" : "text-red-500"}`}>
                        {t.amount_fmt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tally Upload ───────────────────────────────────────────────────────────────

function TallyUpload({ onDone }: { onDone: () => void }) {
  const [mastersFile, setMastersFile] = useState<File | null>(null)
  const [transFile,   setTransFile]   = useState<File | null>(null)
  const [phase, setPhase]             = useState<"idle"|"uploading"|"importing"|"done"|"error">("idle")
  const [uploadStep,  setUploadStep]  = useState("")
  const [pct,   setPct]               = useState(0)
  const [msg,   setMsg]               = useState("")
  const [err,   setErr]               = useState("")
  const pollRef    = useRef<ReturnType<typeof setInterval>|null>(null)
  const mastersRef = useRef<HTMLInputElement>(null)
  const transRef   = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function fmtSize(b: number) {
    return b >= 1e9 ? `${(b/1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b/1e6).toFixed(0)} MB` : `${(b/1e3).toFixed(0)} KB`
  }

  async function upload(file: File) {
    const fd = new FormData(); fd.append("file", file, file.name)
    const res = await fetch("/api/method/hr_client.api.operations.upload_tally_file", {
      method: "POST", credentials: "include",
      headers: { "X-Frappe-CSRF-Token": getCsrf() }, body: fd,
    })
    const json = await res.json()
    if (!res.ok || json.exc) throw new Error(json.exc || "Upload failed")
    return json.message as { path: string }
  }

  async function run() {
    if (!mastersFile || !transFile) return
    setPhase("uploading"); setErr("")
    try {
      setUploadStep("Masters"); setPct(5); setMsg(`Uploading ${mastersFile.name}…`)
      const m = await upload(mastersFile); setPct(50)
      setUploadStep("Transactions"); setMsg(`Uploading ${transFile.name} (${fmtSize(transFile.size)})…`)
      const t = await upload(transFile); setPct(100)
      setPhase("importing"); setPct(1); setMsg("Parsing Tally data…")
      await apiPost("hr_client.api.operations.run_tally_import", { masters_path: m.path, transactions_path: t.path })
      pollRef.current = setInterval(async () => {
        const s = await apiFetch("hr_client.api.operations.get_import_status") as { status: string; progress: number; message: string }
        setPct(s.progress); setMsg(s.message)
        if (s.status === "done") { clearInterval(pollRef.current!); setPhase("done"); onDone() }
        else if (s.status === "error") { clearInterval(pollRef.current!); setPhase("error"); setErr(s.message) }
      }, 2000)
    } catch (e: unknown) {
      setPhase("error"); setErr(e instanceof Error ? e.message : "Failed")
    }
  }

  function reset() {
    setPhase("idle"); setMastersFile(null); setTransFile(null)
    setPct(0); setMsg(""); setErr(""); setUploadStep("")
    if (pollRef.current) clearInterval(pollRef.current)
  }

  if (phase === "done") return (
    <div className="flex flex-col items-center gap-3 py-8">
      <CheckCircle2 size={40} className="text-emerald-500" />
      <p className="font-semibold text-gray-800">Import complete</p>
      <p className="text-sm text-gray-500 text-center">{msg}</p>
      <button onClick={reset} className="mt-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Upload Another</button>
    </div>
  )
  if (phase === "error") return (
    <div className="flex flex-col items-center gap-3 py-8">
      <XCircle size={40} className="text-red-500" />
      <p className="font-semibold text-gray-800">Import failed</p>
      <p className="text-sm text-red-500 text-center max-w-md">{err}</p>
      <button onClick={reset} className="mt-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Retry</button>
    </div>
  )
  if (phase !== "idle") return (
    <div className="space-y-3 py-4">
      <div className="flex items-center gap-2.5">
        <Loader2 size={16} className="text-indigo-500 animate-spin shrink-0" />
        <p className="text-sm text-gray-700">{msg}</p>
      </div>
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{phase === "uploading" ? `Uploading ${uploadStep}` : "Processing"}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { label: "All Masters XML", hint: "All Master_DD.MM.YYYY.xml", file: mastersFile, ref: mastersRef, set: setMastersFile },
          { label: "Transactions Masters XML", hint: "Transactions Masters_DD.MM.YYYY.xml (~1.5 GB)", file: transFile, ref: transRef, set: setTransFile },
        ].map(({ label, hint, file, ref, set }) => (
          <div key={label} onClick={() => ref.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${file ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-slate-50"}`}>
            <input ref={ref} type="file" accept=".xml" className="hidden" onChange={e => set(e.target.files?.[0] ?? null)} />
            <div className="flex items-start gap-3">
              {file ? <CheckCircle2 size={15} className="text-indigo-500 mt-0.5 shrink-0" /> : <Upload size={15} className="text-gray-300 mt-0.5 shrink-0" />}
              <div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{file ? `${file.name} (${fmtSize(file.size)})` : hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Gateway of Tally → Data → Export</p>
        <button disabled={!mastersFile || !transFile} onClick={run}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors">
          Upload & Import
        </button>
      </div>
    </div>
  )
}

// ── Voucher Search Tab ─────────────────────────────────────────────────────────

function SearchTab({ onSelectParty }: { onSelectParty: (p: string) => void }) {
  const [q, setQ]            = useState("")
  const [vtype, setVtype]    = useState("")
  const [fromD, setFromD]    = useState("")
  const [toD, setToD]        = useState("")
  const [page, setPage]      = useState(1)
  const [triggered, setTriggered] = useState(false)

  const { data, isLoading } = useQuery<{ total: number; page: number; results: SearchResult[] }>({
    queryKey: ["tally-search", q, vtype, fromD, toD, page],
    queryFn: () => apiPost("hr_client.api.operations.search_tally", { query: q, voucher_type: vtype, from_date: fromD, to_date: toD, page }),
    enabled: triggered && (q.length >= 2 || !!vtype || !!fromD),
    staleTime: 30_000,
  })

  function doSearch() { setPage(1); setTriggered(true) }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Search party, narration, or voucher no…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
        </div>
        <select value={vtype} onChange={e => setVtype(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white text-gray-700">
          <option value="">All Types</option>
          {["Sales","Purchase","Receipt","Payment","Journal","Credit Note","Debit Note","PERFORMA INVOICE","Purchase Order","Sales Order","Contra"].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input type="date" value={fromD} onChange={e => setFromD(e.target.value)}
            className="flex-1 py-2 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input type="date" value={toD} onChange={e => setToD(e.target.value)}
            className="flex-1 py-2 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={doSearch} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">Search</button>
        {triggered && <button onClick={() => { setQ(""); setVtype(""); setFromD(""); setToD(""); setTriggered(false) }} className="text-sm text-gray-400 hover:text-gray-600">Clear</button>}
        {data && <span className="text-xs text-gray-400">{data.total.toLocaleString()} results</span>}
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 size={20} className="text-indigo-500 animate-spin" /></div>}

      {data && data.results.length > 0 && (
        <>
          <div className="rounded-xl overflow-hidden border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase">Date</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase">Type</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase">Party</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">Note</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => onSelectParty(r.party)}>
                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="py-2.5 px-2"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${voucherBadge(r.type)}`}>{r.type}</span></td>
                    <td className="py-2.5 px-2 text-gray-800 font-medium max-w-[160px] truncate">{r.party || "—"}</td>
                    <td className="py-2.5 px-2 text-gray-400 text-xs hidden lg:table-cell max-w-[200px] truncate">{r.narration}</td>
                    <td className="py-2.5 px-3 font-mono text-sm text-right font-semibold text-gray-900">{r.amount_fmt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > 50 && (
            <div className="flex items-center justify-between text-sm">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 disabled:opacity-40">
                <ChevronRight size={14} className="rotate-180" /> Prev
              </button>
              <span className="text-gray-400">Page {page} of {Math.ceil(data.total / 50)}</span>
              <button disabled={page >= Math.ceil(data.total / 50)} onClick={() => setPage(p => p + 1)} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 disabled:opacity-40">
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {triggered && !isLoading && data?.results.length === 0 && (
        <div className="py-12 text-center text-gray-400">
          <Search size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No results found</p>
        </div>
      )}

      {!triggered && (
        <div className="py-12 text-center text-gray-300">
          <Search size={32} className="mx-auto mb-2" />
          <p className="text-sm">Search across 23,000+ Tally vouchers</p>
          <p className="text-xs mt-1">By party name, narration, or voucher number</p>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",     label: "Overview",    icon: Activity },
  { id: "cashflow",     label: "Cashflow",    icon: BarChart2 },
  { id: "receivables",  label: "Receivables", icon: TrendingUp },
  { id: "payables",     label: "Payables",    icon: TrendingDown },
  { id: "search",       label: "Search",      icon: Search },
  { id: "inventory",    label: "Inventory",   icon: Package },
  { id: "import",       label: "Import",      icon: Upload },
] as const

type TabId = typeof TABS[number]["id"]

export default function OperationsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab]           = useState<TabId>("overview")
  const [selectedParty, setSelectedParty] = useState<string | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery<OpsData>({
    queryKey: ["operations-data"],
    queryFn: () => apiFetch("hr_client.api.operations.get_operations_data"),
    staleTime: 1000 * 60 * 5, refetchOnMount: true,
  })

  const { data: cashflow } = useQuery<CashflowRow[]>({
    queryKey: ["tally-cashflow"],
    queryFn: () => apiFetch("hr_client.api.operations.get_cashflow_trend"),
    staleTime: 1000 * 60 * 5,
    enabled: tab === "cashflow" || tab === "overview",
  })

  const { data: aging, isLoading: agingLoading } = useQuery<AgingData>({
    queryKey: ["tally-aging"],
    queryFn: () => apiFetch("hr_client.api.operations.get_debtor_aging"),
    staleTime: 1000 * 60 * 5,
    enabled: tab === "receivables",
  })

  const { data: creditors, isLoading: credLoading } = useQuery<CreditorRow[]>({
    queryKey: ["tally-creditors"],
    queryFn: () => apiFetch("hr_client.api.operations.get_creditor_list"),
    staleTime: 1000 * 60 * 5,
    enabled: tab === "payables",
  })

  const handlePartyClick = useCallback((party: string) => { if (party) setSelectedParty(party) }, [])

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["operations-data"] })
    qc.invalidateQueries({ queryKey: ["tally-cashflow"] })
    qc.invalidateQueries({ queryKey: ["tally-aging"] })
    qc.invalidateQueries({ queryKey: ["tally-creditors"] })
    qc.invalidateQueries({ queryKey: ["tally-summary"] })
    refetch()
  }, [qc, refetch])

  if (!user) return null

  // ── Alerts ────────────────────────────────────────────────────────
  const alerts: Array<{ color: string; msg: string; tab?: TabId }> = []
  if (data) {
    const gst = data.finance.gst_detail.net_liability
    if (gst > 50_000) alerts.push({ color: "red", msg: `Net GST payable: ${data.finance.gst_detail.net_fmt}`, tab: "overview" })
    const cashRaw = data.executive.kpis[0]?.raw ?? 0
    if (cashRaw < 1_000_000) alerts.push({ color: "orange", msg: `Cash + Bank below ₹10L — ${data.executive.kpis[0]?.value}`, tab: "cashflow" })
    if (data.hr.pending_leaves > 0) alerts.push({ color: "yellow", msg: `${data.hr.pending_leaves} leave request${data.hr.pending_leaves > 1 ? "s" : ""} pending` })
  }

  if (isLoading) return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />)}
    </div>
  )

  if (error || !data) return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
        <AlertTriangle size={16} className="text-red-500 shrink-0" />
        <p className="text-sm font-semibold text-red-700">Failed to load operations data</p>
        <button onClick={() => refetch()} className="ml-auto text-sm text-red-600 underline">Retry</button>
      </div>
    </div>
  )

  const { finance, accounts, hr, inventory, executive } = data

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
          </div>
          <p className="text-sm mt-0.5 text-gray-500">Tally ground truth · {fmtDate(data.as_of)}</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} onClick={() => a.tab && setTab(a.tab)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${
                a.color === "red" ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" :
                a.color === "orange" ? "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100" :
                "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
              }`}>
              <AlertCircle size={14} className="shrink-0" />
              <span>{a.msg}</span>
              {a.tab && <ChevronRight size={13} className="ml-auto shrink-0 opacity-60" />}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-100 shadow-sm overflow-x-auto scrollbar-none">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === id ? "bg-indigo-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            }`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Executive KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {executive.kpis.map((kpi, i) => (
              <KpiCard key={i} kpi={kpi} accent={["border-l-indigo-500","border-l-emerald-500","border-l-red-400","border-l-violet-500"][i]} />
            ))}
          </div>

          {/* Financial health row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Bank Accounts</p>
              <div className="space-y-2">
                {[...finance.bank_accounts, ...finance.cash_accounts].map((b, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 truncate pr-3">{b.name}</span>
                    <span className={`text-sm font-bold ${b.balance >= 0 ? "text-gray-900" : "text-red-500"}`}>{b.balance_fmt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">GST Position</p>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Output GST</span>
                  <span className="font-semibold text-sm text-red-500">{finance.gst_detail.output_fmt}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Input Credit</span>
                  <span className="font-semibold text-sm text-emerald-600">{finance.gst_detail.input_fmt}</span>
                </div>
                <div className="border-t border-gray-100 pt-2.5 flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-800">Net Payable</span>
                  <span className={`text-base font-bold ${finance.gst_detail.net_liability > 0 ? "text-red-500" : "text-emerald-600"}`}>
                    {finance.gst_detail.net_fmt}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">HR Snapshot</p>
              <div className="space-y-2.5">
                {hr.kpis.map((k, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{k.label}</span>
                    <span className="text-sm font-bold text-gray-900">{k.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mini cashflow preview */}
          {cashflow && cashflow.length > 0 && (
            <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <CashflowChart data={cashflow.slice(-6)} />
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "View Receivables", sub: accounts.kpis[0]?.value ?? "—", tab: "receivables" as TabId, color: "text-indigo-600" },
              { label: "View Payables", sub: accounts.kpis[1]?.value ?? "—", tab: "payables" as TabId, color: "text-red-500" },
              { label: "Search Vouchers", sub: `${(23719).toLocaleString()} transactions`, tab: "search" as TabId, color: "text-violet-600" },
              { label: "Update Tally", sub: "Upload new export", tab: "import" as TabId, color: "text-gray-600" },
            ].map(({ label, sub, tab: t, color }) => (
              <button key={label} onClick={() => setTab(t)}
                className="rounded-xl p-4 bg-white text-left hover:shadow-md transition-all duration-150 group"
                style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
                <p className={`text-sm font-semibold ${color} group-hover:underline`}>{label}</p>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Cashflow ── */}
      {tab === "cashflow" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {accounts.kpis.map((k, i) => <SectionCard key={i} label={k.label} value={k.value} />)}
          </div>
          <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
            {cashflow && cashflow.length > 0
              ? <CashflowChart data={cashflow} />
              : <div className="h-36 flex items-center justify-center text-gray-300 text-sm">Loading cashflow data…</div>}
          </div>
          {cashflow && cashflow.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <table className="w-full text-sm bg-white">
                <thead className="bg-slate-50">
                  <tr>
                    {["Month","Sales","Purchases","Receipts","Payments","Net"].map(h => (
                      <th key={h} className={`py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase ${h === "Month" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...cashflow].reverse().map((r, i) => {
                    const net = r.receipts - r.payments
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-medium text-gray-800">{r.month}</td>
                        <td className="py-2.5 px-4 text-right text-indigo-700 font-mono">₹{r.sales.toFixed(1)}L</td>
                        <td className="py-2.5 px-4 text-right text-red-500 font-mono">₹{r.purchases.toFixed(1)}L</td>
                        <td className="py-2.5 px-4 text-right text-emerald-600 font-mono">₹{r.receipts.toFixed(1)}L</td>
                        <td className="py-2.5 px-4 text-right text-orange-500 font-mono">₹{r.payments.toFixed(1)}L</td>
                        <td className={`py-2.5 px-4 text-right font-mono font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {net >= 0 ? "+" : ""}₹{net.toFixed(1)}L
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Receivables ── */}
      {tab === "receivables" && (
        <div className="space-y-4">
          {agingLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="text-indigo-500 animate-spin" /></div>
          ) : aging ? (
            <>
              {/* Bucket summary */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {Object.entries(aging.buckets).map(([key, b]) => (
                  <div key={key} className={`rounded-xl p-4 border ${
                    b.color === "emerald" ? "bg-emerald-50 border-emerald-100" :
                    b.color === "yellow"  ? "bg-yellow-50 border-yellow-100" :
                    b.color === "orange"  ? "bg-orange-50 border-orange-100" :
                    b.color === "red"     ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
                  }`}>
                    <p className="text-xs font-semibold text-gray-500 mb-1">{b.label}</p>
                    <p className="text-lg font-bold text-gray-900">{b.fmt}</p>
                  </div>
                ))}
              </div>

              {/* Debtor table */}
              <div className="rounded-xl overflow-hidden bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
                <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">Outstanding Debtors</p>
                  <p className="text-xs text-gray-400">Total: {aging.total_fmt}</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase">Party</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Last Invoice</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Age</th>
                      <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {aging.debtors.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => handlePartyClick(d.party)}>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-800 truncate max-w-[200px]">{d.party}</p>
                            <ChevronRight size={12} className="text-gray-300 shrink-0" />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 text-xs hidden md:table-cell">{fmtDate(d.last_sale)}</td>
                        <td className="py-2.5 px-3 hidden md:table-cell">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bucketBadge(d.bucket)}`}>{bucketLabel(d.bucket)}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">{d.balance_fmt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Tab: Payables ── */}
      {tab === "payables" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-2 gap-3">
            {accounts.kpis.slice(1, 3).map((k, i) => <SectionCard key={i} label={k.label} value={k.value} />)}
          </div>
          {credLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="text-indigo-500 animate-spin" /></div>
          ) : creditors && creditors.length > 0 ? (
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <div className="px-5 py-3 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-800">Outstanding Creditors</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase">#</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase">Party</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Last Purchase</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {creditors.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => handlePartyClick(c.party)}>
                      <td className="py-2.5 px-4 text-gray-300 text-xs">{i + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 truncate max-w-[220px]">{c.party}</span>
                          <ChevronRight size={12} className="text-gray-300 shrink-0" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs hidden md:table-cell">{fmtDate(c.last_purchase)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-red-500">{c.balance_fmt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Tab: Search ── */}
      {tab === "search" && (
        <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
          <SearchTab onSelectParty={handlePartyClick} />
        </div>
      )}

      {/* ── Tab: Inventory ── */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {inventory.kpis.map((k, i) => <SectionCard key={i} label={k.label} value={k.value} />)}
          </div>
          <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Transaction Volume</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Sales Invoices", inventory.voucher_summary.sales],
                ["Purchase Invoices", inventory.voucher_summary.purchases],
                ["Purchase Orders", inventory.voucher_summary.purchase_orders],
                ["Sales Orders", inventory.voucher_summary.sales_orders],
                ["Receipts", inventory.voucher_summary.receipts],
                ["Payments", inventory.voucher_summary.payments],
                ["Credit Notes", inventory.voucher_summary.credit_notes],
                ["Debit Notes", inventory.voucher_summary.debit_notes],
              ].map(([l, v], i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1">{l}</p>
                  <p className="text-xl font-bold text-gray-900">{Number(v).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Product Brands ({inventory.brands.length})</p>
            <div className="flex flex-wrap gap-2">
              {inventory.brands.map((b, i) => (
                <button key={i} onClick={() => { setTab("search"); }}
                  className="px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors">
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Import ── */}
      {tab === "import" && (
        <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2 mb-5">
            <Upload size={16} className="text-indigo-500" />
            <p className="text-base font-semibold text-gray-900">Update Tally Data</p>
            <span className="text-xs text-gray-400">Upload new exports to refresh all values across the app</span>
          </div>
          <TallyUpload onDone={invalidateAll} />
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-center text-gray-300">Vera ERP · Tally data as of {fmtDate(data.as_of)}</p>

      {/* Party drawer */}
      {selectedParty && <PartyDrawer party={selectedParty} onClose={() => setSelectedParty(null)} />}
    </div>
  )
}
