import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  RefreshCw,
  Upload, CheckCircle2, XCircle,
  Loader2, Landmark, Search, ArrowLeft, ChevronRight,
  AlertCircle, Brain, BookOpen,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useAdminGuard } from "@/lib/useAdminGuard"
import { PageHeader } from "@/components/dashboard"
import { VoucherBrowser } from "./VoucherBrowser"
import { AccountingOverview } from "./AccountingOverview"

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

interface PartyStatement {
  party: string; balance: number; balance_fmt: string; group: string; is_debtor: boolean; is_creditor: boolean
  transactions: Array<{ type: string; number: string; date: string; amount: number; amount_fmt: string; narration: string }>
}

interface SearchResult { type: string; number: string; date: string; party: string; amount: number; amount_fmt: string; narration: string }

interface VoucherLine { cnt: number; total: number; fmt: string }
interface FinancialSummary {
  sales: VoucherLine; performa: VoucherLine; sales_order: VoucherLine
  purchase: VoucherLine; purchase_order: VoucherLine
  receipt: VoucherLine; payment: VoucherLine
  credit_note: VoucherLine; debit_note: VoucherLine
  journal: VoucherLine; contra: VoucherLine
  total_vouchers: number; min_date: string; max_date: string; fy: string
}

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

function voucherBadge(type: string) {
  const map: Record<string, string> = {
    Sales: "bg-forest-100 text-forest-700",
    "PERFORMA INVOICE": "bg-forest-50 text-forest-600",
    Purchase: "bg-red-100 text-red-700",
    Receipt: "bg-emerald-100 text-emerald-700",
    Payment: "bg-orange-100 text-orange-700",
    Journal: "bg-gold-100 text-gold-700",
    "Credit Note": "bg-yellow-100 text-yellow-700",
    "Debit Note": "bg-pink-100 text-pink-700",
    "Purchase Order": "bg-red-50 text-red-600",
    "Sales Order": "bg-blue-50 text-blue-600",
  }
  return map[type] ?? "bg-gray-100 text-gray-600"
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
            <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${data.is_debtor ? "bg-forest-100 text-forest-700" : data.is_creditor ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
              {data.is_debtor ? "Debtor" : data.is_creditor ? "Creditor" : "Ledger"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="text-forest-500 animate-spin" /></div>
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
      <button onClick={reset} className="mt-1 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700">Upload Another</button>
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
        <Loader2 size={16} className="text-forest-500 animate-spin shrink-0" />
        <p className="text-sm text-gray-700">{msg}</p>
      </div>
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{phase === "uploading" ? `Uploading ${uploadStep}` : "Processing"}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-forest-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
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
            className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${file ? "border-forest-300 bg-forest-50" : "border-gray-200 hover:border-forest-300 hover:bg-slate-50"}`}>
            <input ref={ref} type="file" accept=".xml" className="hidden" onChange={e => set(e.target.files?.[0] ?? null)} />
            <div className="flex items-start gap-3">
              {file ? <CheckCircle2 size={15} className="text-forest-500 mt-0.5 shrink-0" /> : <Upload size={15} className="text-gray-300 mt-0.5 shrink-0" />}
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
          className="px-5 py-2 bg-forest-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-forest-700 transition-colors">
          Upload & Import
        </button>
      </div>
    </div>
  )
}

// ── Voucher Search Tab ─────────────────────────────────────────────────────────

function SearchTab({ onSelectParty, totalVouchers }: { onSelectParty: (p: string) => void; totalVouchers?: number }) {
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
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-forest-400" />
        </div>
        <select value={vtype} onChange={e => setVtype(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-forest-400 bg-white text-gray-700">
          <option value="">All Types</option>
          {["Sales","Purchase","Receipt","Payment","Journal","Credit Note","Debit Note","PERFORMA INVOICE","Purchase Order","Sales Order","Contra"].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input type="date" value={fromD} onChange={e => setFromD(e.target.value)}
            className="flex-1 py-2 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-forest-400" />
          <input type="date" value={toD} onChange={e => setToD(e.target.value)}
            className="flex-1 py-2 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-forest-400" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={doSearch} className="px-5 py-2 bg-forest-600 text-white rounded-lg text-sm font-semibold hover:bg-forest-700 transition-colors">Search</button>
        {triggered && <button onClick={() => { setQ(""); setVtype(""); setFromD(""); setToD(""); setTriggered(false) }} className="text-sm text-gray-400 hover:text-gray-600">Clear</button>}
        {data && <span className="text-xs text-gray-400">{data.total.toLocaleString()} results</span>}
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 size={20} className="text-forest-500 animate-spin" /></div>}

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
          <p className="text-sm">Search across {totalVouchers ? `${totalVouchers.toLocaleString()}+` : "thousands of"} Tally vouchers</p>
          <p className="text-xs mt-1">By party name, narration, or voucher number</p>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard",    icon: Landmark },
  { id: "search",    label: "Search",       icon: Search },
  { id: "ledger",    label: "Ledger",       icon: BookOpen },
  { id: "import",    label: "Import & AI",  icon: Brain },
] as const

type TabId = typeof TABS[number]["id"]

// Query key prefixes owned by this page + AccountingOverview — invalidated together on refresh / after a Tally import.
const ACCOUNTING_QUERY_PREFIXES = new Set([
  "operations-data", "tally-cashflow", "tally-aging", "tally-creditors",
  "adv-debtors", "adv-creditors", "available-fy", "fin-summary-current",
  "fin-summary-prev", "financial-summary",
])

export default function OperationsPage() {
  const guard = useAdminGuard()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabId>("dashboard")
  const [selectedParty, setSelectedParty] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { data: finSummary } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary"],
    queryFn: () => apiFetch("hr_client.api.operations.get_financial_summary"),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const { data: availableFY = [] } = useQuery<string[]>({
    queryKey: ["available-fy"],
    queryFn: () => apiFetch("hr_client.api.operations.get_available_financial_years"),
    staleTime: 60 * 60_000,
  })

  const handlePartyClick = useCallback((party: string) => { if (party) setSelectedParty(party) }, [])

  const invalidateAll = useCallback(async () => {
    setRefreshing(true)
    await qc.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && ACCOUNTING_QUERY_PREFIXES.has(q.queryKey[0] as string),
    })
    setRefreshing(false)
  }, [qc])

  if (guard) return guard
  if (!user) return null

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <PageHeader
        workspaceLabel="Vera Enterprises Workspace"
        title="Accounting"
        right={
          <>
            {finSummary?.max_date && (
              <div className="text-xs px-3.5 py-1.5 rounded-full" style={{ background: "#fff", border: "var(--border-card)", color: "var(--text-secondary)" }}>
                Tally data through {finSummary.max_date}
              </div>
            )}
            <button
              onClick={invalidateAll}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full disabled:opacity-50"
              style={{ background: "var(--brand-primary)", color: "#fff" }}
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />

      <div className="px-6 md:px-7 pb-8 space-y-5">
        {/* Data gap notice */}
        {finSummary?.max_date && (() => {
          const gapDays = Math.floor((Date.now() - new Date(finSummary.max_date).getTime()) / 86_400_000)
          return gapDays > 20 ? (
            <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "var(--color-warning-bg)", border: "0.5px solid #fde68a" }}>
              <div className="flex items-center gap-2">
                <AlertCircle size={14} style={{ color: "var(--color-warning)" }} className="shrink-0" />
                <span className="text-sm" style={{ color: "#92400e" }}>
                  Tally data is <strong>{gapDays} days</strong> behind. Last import: {finSummary.max_date}.
                  Upload the latest XML to get current numbers.
                </span>
              </div>
              <button onClick={() => setTab("import")}
                className="shrink-0 text-xs text-white px-3 py-1.5 rounded-lg ml-3" style={{ background: "var(--color-warning)" }}>
                Upload XML →
              </button>
            </div>
          ) : null
        })()}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl overflow-x-auto scrollbar-none" style={{ background: "#fff", border: "var(--border-card)" }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
              style={tab === id ? { background: "var(--brand-primary)", color: "#fff" } : { color: "var(--text-secondary)" }}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Dashboard ── */}
        {tab === "dashboard" && <AccountingOverview onGoToImport={() => setTab("import")} />}

        {/* ── Tab: Search ── */}
        {tab === "search" && (
          <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
            <SearchTab onSelectParty={handlePartyClick} totalVouchers={finSummary?.total_vouchers} />
          </div>
        )}

        {/* ── Tab: Ledger (Voucher Browser) ── */}
        {tab === "ledger" && (
          <VoucherBrowser
            globalFy="all"
            availableFY={availableFY}
            finSummary={finSummary as unknown as Record<string, { cnt: number; total: number; fmt: string }> | undefined}
            onViewParty={handlePartyClick}
          />
        )}

        {/* ── Tab: Import & AI ── */}
        {tab === "import" && (
          <div className="rounded-xl p-5 bg-white" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center gap-2 mb-5">
              <Upload size={16} className="text-forest-500" />
              <p className="text-base font-semibold text-gray-900">Update Tally Data</p>
              <span className="text-xs text-gray-400">Upload new Tally XML exports to refresh all values across the app</span>
            </div>
            <TallyUpload onDone={invalidateAll} />
          </div>
        )}

        {/* Footer */}
        {finSummary?.max_date && (
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>Vera ERP · Tally data as of {finSummary.max_date}</p>
        )}
      </div>

      {/* Party drawer */}
      {selectedParty && <PartyDrawer party={selectedParty} onClose={() => setSelectedParty(null)} />}
    </div>
  )
}
