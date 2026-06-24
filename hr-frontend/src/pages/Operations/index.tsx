import { useState, useRef, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  TrendingUp, TrendingDown, Users, Package,
  Briefcase, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  CircleDollarSign, Receipt, Upload, CheckCircle2, XCircle, Loader2,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

// ── API ────────────────────────────────────────────────────────────────────────

async function getOperationsData() {
  const res = await fetch("/api/method/hr_client.api.operations.get_operations_data", {
    credentials: "include",
  })
  if (!res.ok) throw new Error("Failed to load operations data")
  const json = await res.json()
  return json.message
}

async function uploadTallyFile(file: File): Promise<{ path: string; filename: string; size: number }> {
  const form = new FormData()
  form.append("file", file, file.name)
  const res = await fetch("/api/method/hr_client.api.operations.upload_tally_file", {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": getCsrf() },
    body: form,
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Upload failed")
  return json.message
}

async function runTallyImport(mastersPath: string, transactionsPath: string) {
  const res = await fetch("/api/method/hr_client.api.operations.run_tally_import", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": getCsrf() },
    body: JSON.stringify({ masters_path: mastersPath, transactions_path: transactionsPath }),
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Import failed")
  return json.message
}

async function getImportStatus(): Promise<{ status: string; progress: number; message: string }> {
  const res = await fetch("/api/method/hr_client.api.operations.get_import_status", { credentials: "include" })
  const json = await res.json()
  return json.message
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface KPI {
  label: string
  value: string
  raw: number
  delta?: string
  delta_class?: string
}

interface OpsData {
  as_of: string
  finance: {
    kpis: KPI[]
    bank_accounts: Array<{ name: string; balance: number; balance_fmt: string }>
    cash_accounts: Array<{ name: string; balance: number; balance_fmt: string }>
    gst_detail: {
      output_fmt: string; input_fmt: string; net_fmt: string
      output_gst: number; input_credit: number; net_liability: number
    }
  }
  accounts: {
    kpis: KPI[]
    top_debtors: Array<{ party: string; amount: number; amount_fmt: string }>
    top_creditors: Array<{ party: string; amount: number; amount_fmt: string }>
    chart: Array<{ month: string; sales: number; purchases: number; collections: number }>
    fy_sales_fmt: string
    fy_purchases_fmt: string
  }
  hr: {
    kpis: KPI[]
    headcount: number
    open_positions: number
    pending_leaves: number
  }
  crm: {
    kpis: KPI[]
    by_stage: Record<string, number>
    recent_leads: Array<{ name: string; title: string; status: string; assigned_to: string }>
  }
  inventory: {
    kpis: KPI[]
    brands: string[]
    voucher_summary: Record<string, number>
  }
  executive: { kpis: KPI[] }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d || d.length < 8) return "—"
  const y = d.slice(0, 4), m = d.slice(4, 6), day = d.slice(6, 8)
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${day} ${months[parseInt(m) - 1]} ${y}`
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    Lead: "bg-blue-100 text-blue-700",
    Discussion: "bg-purple-100 text-purple-700",
    Quotation: "bg-yellow-100 text-yellow-700",
    Order: "bg-green-100 text-green-700",
    Delivery: "bg-teal-100 text-teal-700",
    Success: "bg-emerald-100 text-emerald-800",
    Failed: "bg-red-100 text-red-700",
  }
  return map[status] ?? "bg-gray-100 text-gray-600"
}

// ── Components ─────────────────────────────────────────────────────────────────

function ExecKPICard({ kpi }: { kpi: KPI }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{kpi.label}</p>
      <p className="font-mono text-2xl font-bold text-[#0B2545] leading-tight">{kpi.value}</p>
      {kpi.delta && (
        <p className={`text-xs mt-2 ${
          kpi.delta_class === "delta-positive" ? "text-green-600" :
          kpi.delta_class === "delta-negative" ? "text-red-500" : "text-gray-400"
        }`}>{kpi.delta}</p>
      )}
    </div>
  )
}

function SectionKPICard({ kpi }: { kpi: KPI }) {
  return (
    <div className="bg-[#F8F6F1] rounded-lg p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{kpi.label}</p>
      <p className="font-mono text-xl font-bold text-[#0B2545]">{kpi.value}</p>
    </div>
  )
}

function SectionCard({
  icon, title, badge, children, defaultOpen = true,
}: {
  icon: React.ReactNode
  title: string
  badge?: string | number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border-t-4 border-[#C9A96E] shadow-sm mb-5">
      <button
        className="w-full flex items-center justify-between px-7 py-5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-[#C9A96E]">{icon}</span>
          <span className="font-serif text-xl font-semibold text-[#0B2545]">{title}</span>
          {badge !== undefined && (
            <span className="ml-1 bg-[#C9A96E] text-[#061935] text-xs font-bold px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <span className="text-gray-400">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>
      {open && <div className="px-7 pb-7">{children}</div>}
    </div>
  )
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function BarChart({ data }: { data: OpsData["accounts"]["chart"] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.sales, d.purchases, d.collections]), 1)
  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 h-36">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex gap-0.5 items-end h-28">
              <div
                className="flex-1 bg-[#0B2545] rounded-t opacity-80"
                style={{ height: `${(d.sales / maxVal) * 100}%` }}
                title={`Sales: ₹${d.sales}L`}
              />
              <div
                className="flex-1 bg-[#C9A96E] rounded-t opacity-80"
                style={{ height: `${(d.purchases / maxVal) * 100}%` }}
                title={`Purchases: ₹${d.purchases}L`}
              />
              <div
                className="flex-1 bg-green-500 rounded-t opacity-70"
                style={{ height: `${(d.collections / maxVal) * 100}%` }}
                title={`Collections: ₹${d.collections}L`}
              />
            </div>
            <span className="text-[9px] text-gray-400 text-center">{d.month}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-2 justify-center">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 bg-[#0B2545] rounded-sm inline-block" /> Sales
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 bg-[#C9A96E] rounded-sm inline-block" /> Purchases
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-sm inline-block" /> Collections
        </span>
      </div>
    </div>
  )
}

// ── Tally Upload Panel ─────────────────────────────────────────────────────────

function TallyUploadPanel({ onImportDone }: { onImportDone: () => void }) {
  const [mastersFile, setMastersFile]   = useState<File | null>(null)
  const [transFile,   setTransFile]     = useState<File | null>(null)
  const [_mastersPath, setMastersPath]  = useState("")
  const [_transPath,   setTransPath]    = useState("")
  const [phase, setPhase]               = useState<"idle"|"uploading"|"importing"|"done"|"error">("idle")
  const [uploadStep, setUploadStep]     = useState<""|"masters"|"transactions">("")
  const [uploadPct,  setUploadPct]      = useState(0)
  const [importProgress, setImportProgress] = useState(0)
  const [statusMsg,  setStatusMsg]      = useState("")
  const [errorMsg,   setErrorMsg]       = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mastersRef = useRef<HTMLInputElement>(null)
  const transRef   = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function fmtSize(bytes: number) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
  }

  async function handleUploadAndImport() {
    if (!mastersFile || !transFile) return
    setPhase("uploading")
    setErrorMsg("")
    try {
      // Upload Masters
      setUploadStep("masters")
      setUploadPct(0)
      setStatusMsg(`Uploading ${mastersFile.name}…`)
      const m = await uploadTallyFile(mastersFile)
      setMastersPath(m.path)
      setUploadPct(50)

      // Upload Transactions
      setUploadStep("transactions")
      setStatusMsg(`Uploading ${transFile.name} (${fmtSize(transFile.size)})…`)
      const t = await uploadTallyFile(transFile)
      setTransPath(t.path)
      setUploadPct(100)

      // Trigger import
      setPhase("importing")
      setImportProgress(1)
      setStatusMsg("Import queued — parsing Tally data…")
      await runTallyImport(m.path, t.path)

      // Poll status
      pollRef.current = setInterval(async () => {
        const s = await getImportStatus()
        setImportProgress(s.progress)
        setStatusMsg(s.message)
        if (s.status === "done") {
          clearInterval(pollRef.current!)
          setPhase("done")
          onImportDone()
        } else if (s.status === "error") {
          clearInterval(pollRef.current!)
          setPhase("error")
          setErrorMsg(s.message)
        }
      }, 2000)
    } catch (e: unknown) {
      setPhase("error")
      setErrorMsg(e instanceof Error ? e.message : "Upload failed")
    }
  }

  function reset() {
    setPhase("idle"); setMastersFile(null); setTransFile(null)
    setMastersPath(""); setTransPath(""); setUploadPct(0)
    setImportProgress(0); setStatusMsg(""); setErrorMsg("")
    setUploadStep("")
    if (pollRef.current) clearInterval(pollRef.current)
  }

  return (
    <div className="bg-white rounded-xl border-t-4 border-[#C9A96E] shadow-sm mb-5">
      <div className="px-7 py-5 flex items-center gap-3 border-b border-gray-100">
        <Upload size={20} className="text-[#C9A96E]" />
        <span className="font-serif text-xl font-semibold text-[#0B2545]">Update Tally Data</span>
        <span className="text-xs text-gray-400 ml-2">Upload new Tally exports to refresh all values across the app</span>
      </div>

      <div className="px-7 py-6">
        {phase === "done" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 size={40} className="text-green-500" />
            <p className="font-semibold text-green-700">Import complete!</p>
            <p className="text-sm text-gray-500">{statusMsg}</p>
            <button onClick={reset} className="mt-2 px-4 py-2 bg-[#0B2545] text-white rounded-lg text-sm">
              Upload Another
            </button>
          </div>
        ) : phase === "error" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <XCircle size={40} className="text-red-500" />
            <p className="font-semibold text-red-700">Import failed</p>
            <p className="text-sm text-red-500 text-center max-w-md">{errorMsg}</p>
            <button onClick={reset} className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Retry</button>
          </div>
        ) : phase === "uploading" || phase === "importing" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="text-[#C9A96E] animate-spin shrink-0" />
              <p className="text-sm text-gray-700">{statusMsg}</p>
            </div>
            {phase === "uploading" && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{uploadStep === "masters" ? "Uploading All Masters" : "Uploading Transactions"}</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#C9A96E] rounded-full transition-all duration-300" style={{ width: `${uploadPct}%` }} />
                </div>
              </div>
            )}
            {phase === "importing" && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Parsing + writing to database</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#0B2545] rounded-full transition-all duration-500" style={{ width: `${importProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Masters file */}
              <div
                onClick={() => mastersRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all ${
                  mastersFile ? "border-[#C9A96E] bg-amber-50" : "border-gray-200 hover:border-[#C9A96E]"
                }`}
              >
                <input ref={mastersRef} type="file" accept=".xml" className="hidden"
                  onChange={e => setMastersFile(e.target.files?.[0] ?? null)} />
                <div className="flex items-start gap-3">
                  {mastersFile ? <CheckCircle2 size={18} className="text-[#C9A96E] mt-0.5 shrink-0" /> : <Upload size={18} className="text-gray-300 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold text-[#0B2545]">All Masters XML</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {mastersFile ? `${mastersFile.name} (${fmtSize(mastersFile.size)})` : "e.g. All Master_DD.MM.YYYY.xml"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactions file */}
              <div
                onClick={() => transRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all ${
                  transFile ? "border-[#C9A96E] bg-amber-50" : "border-gray-200 hover:border-[#C9A96E]"
                }`}
              >
                <input ref={transRef} type="file" accept=".xml" className="hidden"
                  onChange={e => setTransFile(e.target.files?.[0] ?? null)} />
                <div className="flex items-start gap-3">
                  {transFile ? <CheckCircle2 size={18} className="text-[#C9A96E] mt-0.5 shrink-0" /> : <Upload size={18} className="text-gray-300 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold text-[#0B2545]">Transactions Masters XML</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {transFile ? `${transFile.name} (${fmtSize(transFile.size)})` : "e.g. Transactions Masters_DD.MM.YYYY.xml (~1.5 GB)"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Both files are exported from Tally → Gateway of Tally → Data → Export
              </p>
              <button
                disabled={!mastersFile || !transFile}
                onClick={handleUploadAndImport}
                className="px-5 py-2 bg-[#0B2545] text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#13315C] transition-colors"
              >
                Upload & Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data, isLoading, error, refetch, isFetching } = useQuery<OpsData>({
    queryKey: ["operations-data"],
    queryFn: getOperationsData,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: true,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-4">
          <AlertTriangle className="text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-red-700">Failed to load operations data</p>
            <p className="text-sm text-red-500 mt-1">{String(error ?? "Unknown error")}</p>
          </div>
          <button onClick={() => refetch()} className="ml-auto text-sm text-red-600 underline">Retry</button>
        </div>
      </div>
    )
  }

  const { finance, accounts, hr, crm, inventory, executive } = data
  const maxDebtor = accounts.top_debtors[0]?.amount ?? 1
  const maxCreditor = accounts.top_creditors[0]?.amount ?? 1

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 pb-4 border-b border-[#C9A96E]">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#0B2545]">VERA ENTERPRISES</h1>
          <p className="text-xs italic text-[#A88B52] mt-0.5">Live Supervisor Dashboard</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Data as of</p>
          <p className="font-serif text-lg text-[#0B2545] font-medium">{formatDate(data.as_of)}</p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-[#0B2545] ml-auto"
          >
            <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Executive KPIs ── */}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Executive Snapshot</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {executive.kpis.map((kpi, i) => <ExecKPICard key={i} kpi={kpi} />)}
      </div>

      {/* ── Finance ── */}
      <SectionCard icon={<CircleDollarSign size={20} />} title="Finance" defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {finance.kpis.map((k, i) => <SectionKPICard key={i} kpi={k} />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Bank Accounts */}
          <div className="col-span-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Bank Accounts</p>
            <div className="space-y-2">
              {finance.bank_accounts.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-700 truncate pr-2">{b.name}</span>
                  <span className={`font-mono text-sm font-semibold ${b.balance >= 0 ? "text-[#0B2545]" : "text-red-500"}`}>
                    {b.balance_fmt}
                  </span>
                </div>
              ))}
              {finance.cash_accounts.map((c, i) => (
                <div key={`c${i}`} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-700">{c.name}</span>
                  <span className={`font-mono text-sm font-semibold ${c.balance >= 0 ? "text-[#0B2545]" : "text-red-500"}`}>
                    {c.balance_fmt}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* GST Position */}
          <div className="col-span-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">GST Position</p>
            <div className="bg-[#F8F6F1] rounded-xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Output GST (liability)</span>
                <span className="font-mono font-semibold text-red-600">{finance.gst_detail.output_fmt}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Input Credit (ITC)</span>
                <span className="font-mono font-semibold text-green-600">{finance.gst_detail.input_fmt}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-800">Net GST Payable</span>
                <span className={`font-mono text-lg font-bold ${finance.gst_detail.net_liability > 0 ? "text-red-600" : "text-green-600"}`}>
                  {finance.gst_detail.net_fmt}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Accounts ── */}
      <SectionCard icon={<Receipt size={20} />} title="Accounts Receivable & Payable" defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {accounts.kpis.map((k, i) => <SectionKPICard key={i} kpi={k} />)}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Debtors */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <TrendingUp size={12} className="text-[#C9A96E]" /> Top Receivables (Debtors)
            </p>
            <div className="space-y-2">
              {accounts.top_debtors.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{d.party}</span>
                  <MiniBar value={d.amount} max={maxDebtor} color="bg-[#0B2545]" />
                  <span className="font-mono text-xs font-semibold text-[#0B2545] w-20 text-right">{d.amount_fmt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Creditors */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <TrendingDown size={12} className="text-[#C9A96E]" /> Top Payables (Creditors)
            </p>
            <div className="space-y-2">
              {accounts.top_creditors.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{c.party}</span>
                  <MiniBar value={c.amount} max={maxCreditor} color="bg-[#C9A96E]" />
                  <span className="font-mono text-xs font-semibold text-[#C9A96E] w-20 text-right">{c.amount_fmt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly Chart */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Monthly Activity (Last 6 Months · ₹ in Lakhs)
          </p>
          <BarChart data={accounts.chart} />
        </div>
      </SectionCard>

      {/* ── HR ── */}
      <SectionCard icon={<Users size={20} />} title="Human Resources" badge={hr.headcount} defaultOpen>
        <div className="grid grid-cols-3 gap-3">
          {hr.kpis.map((k, i) => <SectionKPICard key={i} kpi={k} />)}
        </div>
        {hr.pending_leaves > 0 && (
          <div className="mt-4 flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
            <AlertTriangle size={14} className="text-yellow-500" />
            <span className="text-sm text-yellow-700">
              {hr.pending_leaves} leave request{hr.pending_leaves > 1 ? "s" : ""} awaiting approval
            </span>
          </div>
        )}
      </SectionCard>

      {/* ── CRM / Projects ── */}
      <SectionCard icon={<Briefcase size={20} />} title="CRM Pipeline" badge={crm.kpis[0]?.value} defaultOpen>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {crm.kpis.map((k, i) => <SectionKPICard key={i} kpi={k} />)}
        </div>

        {/* Stage breakdown */}
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(crm.by_stage).map(([stage, count]) => (
            <div key={stage} className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor(stage)}`}>
              {stage}: {count}
            </div>
          ))}
        </div>

        {/* Recent leads */}
        {crm.recent_leads.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Recent Leads</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0B2545] text-white text-xs uppercase tracking-wide">
                  <th className="text-left py-2 px-3 rounded-tl">Lead</th>
                  <th className="text-left py-2 px-3">Stage</th>
                  <th className="text-left py-2 px-3 rounded-tr">Owner</th>
                </tr>
              </thead>
              <tbody>
                {crm.recent_leads.map((lead, i) => (
                  <tr key={lead.name} className={i % 2 === 0 ? "bg-white" : "bg-[#F8F6F1]"}>
                    <td className="py-2 px-3 font-medium text-[#0B2545]">{lead.title}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{lead.assigned_to || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Inventory ── */}
      <SectionCard icon={<Package size={20} />} title="Inventory & Products" badge={`${(inventory.kpis[0]?.raw ?? 0).toLocaleString()} SKUs`} defaultOpen={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {inventory.kpis.map((k, i) => <SectionKPICard key={i} kpi={k} />)}
        </div>

        {/* Transaction summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ["Sales Invoices", inventory.voucher_summary.sales],
            ["Purchase Invoices", inventory.voucher_summary.purchases],
            ["Purchase Orders", inventory.voucher_summary.purchase_orders],
            ["Credit Notes", inventory.voucher_summary.credit_notes],
          ].map(([label, val], i) => (
            <div key={i} className="bg-[#F8F6F1] rounded-lg p-3 text-center">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-1">{label}</p>
              <p className="font-mono text-xl font-bold text-[#0B2545]">{Number(val).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Brands */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Product Brands in Catalogue</p>
          <div className="flex flex-wrap gap-2">
            {inventory.brands.map((b, i) => (
              <span key={i} className="px-3 py-1 bg-white border border-[#E8E8E8] rounded-full text-xs font-medium text-[#0B2545] hover:border-[#C9A96E] transition-colors">
                {b}
              </span>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Tally Upload */}
      <TallyUploadPanel onImportDone={() => {
        qc.invalidateQueries({ queryKey: ["operations-data"] })
        qc.invalidateQueries({ queryKey: ["tally-summary"] })
        refetch()
      }} />

      {/* Footer */}
      <div className="mt-2 pt-4 border-t border-gray-200 flex justify-between text-xs text-gray-400">
        <span>VERA Operations · Tally data as of {formatDate(data.as_of)}</span>
        <span>Owais Ahmed Khan · Director · VERA ENTERPRISES</span>
      </div>

    </div>
  )
}
