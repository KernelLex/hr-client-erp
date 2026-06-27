import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2, AlertTriangle, Loader2, Play, Square,
  ChevronLeft, ChevronRight, ArrowLeftRight, ShieldCheck,
  RefreshCw, BookOpen, ThumbsUp, ThumbsDown,
} from "lucide-react"
import {
  getEnrichmentStats, getEnrichmentStatus, startEnrichment, stopEnrichment,
  getAnomalyQueue, getNormalizationQueue, markAnomalyReviewed, bulkDismissAnomalies,
  type EnrichmentStats, type EnrichmentStatus, type AnomalyRow,
} from "@/api/tally_enrich"
import { VoucherDocument, type VoucherRow } from "@/pages/Operations/VoucherBrowser"

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  "B2B Sales":       "#16a34a",
  "B2C Sales":       "#0d9488",
  "B2B Purchase":    "#dc2626",
  "Project":         "#2563eb",
  "Stock Movement":  "#6b7280",
  "Collection":      "#059669",
  "Payment":         "#d97706",
  "Journal/Contra":  "#7c3aed",
  "Other":           "#94a3b8",
}

function fmtShort(d: string): string {
  if (!d || d.length < 10) return "—"
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const [y, m, day] = d.split("-")
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`
}

function anomalyToVoucherRow(a: AnomalyRow): VoucherRow {
  return {
    name:           a.voucher_name,
    voucher_type:   a.voucher_type,
    voucher_number: a.voucher_number,
    voucher_date:   a.voucher_date,
    party_name:     a.party_name,
    amount:         a.amount,
    amount_fmt:     a.amount_fmt,
    narration:      a.narration,
    debit_ledger:   a.debit_ledger,
    credit_ledger:  a.credit_ledger,
  }
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: EnrichmentStats }) {
  const pct = stats.total > 0 ? Math.round((stats.enriched / stats.total) * 100) : 0
  const cards = [
    { label: "Total Vouchers", value: stats.total.toLocaleString(),     color: "#4f46e5", bg: "#eef2ff" },
    { label: "Enriched by AI", value: stats.enriched.toLocaleString(),  color: "#059669", bg: "#ecfdf5" },
    { label: "Pending",        value: stats.pending.toLocaleString(),    color: "#d97706", bg: "#fffbeb" },
    { label: "Anomalies",      value: stats.anomalies.toLocaleString(),  color: "#dc2626", bg: "#fef2f2" },
    { label: "Human Verified", value: stats.verified.toLocaleString(),   color: "#0891b2", bg: "#ecfeff" },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{c.label}</p>
            <p className="text-2xl font-bold font-mono" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-600">Enrichment coverage</span>
            <span className="text-xs font-bold text-indigo-600">{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                 style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{stats.enriched.toLocaleString()} / {stats.total.toLocaleString()}</span>
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ stats, onRefreshStats }: { stats: EnrichmentStats; onRefreshStats: () => void }) {
  const qc = useQueryClient()
  const [jobMsg, setJobMsg] = useState("")

  const { data: statusData } = useQuery<EnrichmentStatus>({
    queryKey: ["enrich-status"],
    queryFn: getEnrichmentStatus,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
    staleTime: 0,
  })

  const isRunning = statusData?.status === "running"

  useEffect(() => {
    if (statusData?.status === "done") {
      onRefreshStats()
    }
  }, [statusData?.status, onRefreshStats])

  const startMut = useMutation({
    mutationFn: startEnrichment,
    onSuccess: (r) => {
      setJobMsg(r.queued ? `Started — ${(r.pending ?? 0).toLocaleString()} vouchers queued` : (r.message ?? "Already enriched"))
      qc.invalidateQueries({ queryKey: ["enrich-status"] })
    },
  })

  const stopMut = useMutation({
    mutationFn: stopEnrichment,
    onSuccess: () => {
      setJobMsg("Stopped")
      qc.invalidateQueries({ queryKey: ["enrich-status"] })
    },
  })

  const totalCatCount = Object.values(stats.categories).reduce((s, n) => s + n, 0)

  return (
    <div className="grid grid-cols-2 gap-5">
      {/* Enrichment control card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <BookOpen size={18} className="text-indigo-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Ollama Enrichment</h3>
            <p className="text-xs text-gray-400">Uses local llama3.1 model</p>
          </div>
          {isRunning && <Loader2 size={16} className="text-indigo-500 animate-spin ml-auto" />}
        </div>

        {isRunning && statusData && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{statusData.message || "Processing…"}</span>
              <span>{statusData.progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                   style={{ width: `${statusData.progress}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {statusData.processed.toLocaleString()} / {statusData.total.toLocaleString()} vouchers
            </p>
          </div>
        )}

        {!isRunning && statusData?.status === "done" && (
          <div className="mb-4 flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <CheckCircle2 size={14} /> <span>{statusData.message}</span>
          </div>
        )}

        {jobMsg && !isRunning && <p className="text-xs text-gray-500 mb-3">{jobMsg}</p>}

        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button onClick={() => startMut.mutate()}
              disabled={startMut.isPending || stats.pending === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {startMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {stats.pending === 0 ? "All enriched" : `Enrich ${stats.pending.toLocaleString()} pending`}
            </button>
          ) : (
            <button onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
              <Square size={13} /> Stop
            </button>
          )}
          <button onClick={onRefreshStats}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4">Transaction Categories</h3>
        {totalCatCount === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No categories yet — start enrichment to classify vouchers</p>
        ) : (
          <div className="space-y-2.5">
            {Object.entries(stats.categories).sort(([,a],[,b]) => b - a).map(([cat, cnt]) => {
              const pct = Math.round((cnt / totalCatCount) * 100)
              const color = CAT_COLORS[cat] || "#94a3b8"
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-gray-700 font-medium">{cat}</span>
                    <span className="text-gray-400 font-mono">{cnt.toLocaleString()} · {pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Anomalies tab ─────────────────────────────────────────────────────────────

function AnomaliesTab({ anomalyCount }: { anomalyCount: number }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openVoucher, setOpenVoucher] = useState<AnomalyRow | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["anomaly-queue", page],
    queryFn: () => getAnomalyQueue(page),
    staleTime: 30_000,
  })

  const reviewMut = useMutation({
    mutationFn: ({ guid, confirmed }: { guid: string; confirmed: boolean }) =>
      markAnomalyReviewed(guid, confirmed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["anomaly-queue"] })
      qc.invalidateQueries({ queryKey: ["enrich-stats"] })
    },
  })

  const dismissAllMut = useMutation({
    mutationFn: (guids: string[]) => bulkDismissAnomalies(guids),
    onSuccess: () => {
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ["anomaly-queue"] })
      qc.invalidateQueries({ queryKey: ["enrich-stats"] })
    },
  })

  const rows = data?.rows ?? []
  const allGuids = rows.map(r => r.tally_guid)
  const allSelected = allGuids.length > 0 && allGuids.every(g => selected.has(g))

  if (anomalyCount === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 bg-white rounded-2xl border border-gray-100">
        <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center">
          <CheckCircle2 size={26} className="text-green-500" />
        </div>
        <p className="font-semibold text-gray-700">No anomalies found</p>
        <p className="text-sm text-gray-400">All enriched vouchers passed anomaly checks</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 bg-gray-50/40">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={allSelected}
              onChange={() => allSelected ? setSelected(new Set()) : setSelected(new Set(allGuids))}
              className="rounded border-gray-300 text-indigo-600 cursor-pointer" />
            <span className="text-xs text-gray-500">
              {selected.size > 0 ? `${selected.size} selected` : `${data?.total ?? anomalyCount} anomalies`}
            </span>
            {isFetching && <Loader2 size={13} className="text-gray-400 animate-spin" />}
          </div>
          {selected.size > 0 && (
            <button onClick={() => dismissAllMut.mutate([...selected])}
              disabled={dismissAllMut.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
              {dismissAllMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
              Dismiss {selected.size} as OK
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Loader2 size={22} className="text-indigo-400 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No anomalies need review</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr className="bg-gray-50/80">
                <th className="w-8 py-3 px-4"></th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Party</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Anomaly Reason</th>
                <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Conf.</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <tr key={row.tally_guid} onClick={() => setOpenVoucher(row)}
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(row.tally_guid)}
                      onChange={e => {
                        const s = new Set(selected)
                        e.target.checked ? s.add(row.tally_guid) : s.delete(row.tally_guid)
                        setSelected(s)
                      }}
                      className="rounded border-gray-300 text-indigo-600 cursor-pointer" />
                  </td>
                  <td className="py-3 px-4 text-gray-400 text-xs font-mono whitespace-nowrap">{fmtShort(row.voucher_date)}</td>
                  <td className="py-3 px-4 text-xs font-medium text-gray-600">{row.voucher_type}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-800 truncate max-w-[160px]">{row.party_name || row.debit_ledger || "—"}</p>
                    {row.party_norm && row.party_norm !== row.party_name && (
                      <p className="text-[10px] text-indigo-500 truncate max-w-[160px]">{row.party_norm}</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-700 line-clamp-2">{row.anomaly_reason || "Flagged by AI"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-sm text-gray-700">{row.amount_fmt}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-xs font-bold ${row.confidence < 70 ? "text-red-500" : "text-gray-400"}`}>
                      {row.confidence}%
                    </span>
                  </td>
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => reviewMut.mutate({ guid: row.tally_guid, confirmed: false })}
                        title="Mark as OK"
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                        <ThumbsUp size={13} />
                      </button>
                      <button onClick={() => reviewMut.mutate({ guid: row.tally_guid, confirmed: true })}
                        title="Confirm anomaly"
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <ThumbsDown size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50 bg-gray-50/40">
            <span className="text-xs text-gray-400">{data.total} anomalies · 25 per page</span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 rounded-lg hover:bg-white transition-all">
                <ChevronLeft size={12} /> Prev
              </button>
              <span className="text-xs text-gray-500 px-3">{page} / {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 rounded-lg hover:bg-white transition-all">
                Next <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {openVoucher && (
        <VoucherDocument
          voucher={anomalyToVoucherRow(openVoucher)}
          onClose={() => setOpenVoucher(null)}
          onViewParty={() => setOpenVoucher(null)}
        />
      )}
    </>
  )
}

// ── Normalizations tab ────────────────────────────────────────────────────────

function NormalizationsTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ["norm-queue", page],
    queryFn: () => getNormalizationQueue(page),
    staleTime: 60_000,
  })
  const rows = data?.rows ?? []

  if (!isLoading && rows.length === 0 && page === 1) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 bg-white rounded-2xl border border-gray-100">
        <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center">
          <CheckCircle2 size={26} className="text-teal-500" />
        </div>
        <p className="font-semibold text-gray-700">No normalizations pending</p>
        <p className="text-sm text-gray-400">Party names are consistent across all enriched vouchers</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/40">
        <p className="text-xs text-gray-500">
          Ollama detected {data?.total ?? "—"} party name variations that may be normalized.
          Normalized names improve party matching in receivables and payables statements.
        </p>
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 size={22} className="text-indigo-400 animate-spin" /></div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr className="bg-gray-50/80">
              <th className="text-left py-3 px-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Original (in Tally)</th>
              <th className="py-3 px-3 w-8 text-gray-300"><ArrowLeftRight size={13} /></th>
              <th className="text-left py-3 px-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Normalized (by AI)</th>
              <th className="text-right py-3 px-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vouchers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                <td className="py-3 px-5">
                  <span className="font-mono text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{row.original || "—"}</span>
                </td>
                <td className="py-3 px-3 text-gray-300 text-center"><ChevronRight size={13} /></td>
                <td className="py-3 px-5 font-medium text-gray-800">{row.normalized}</td>
                <td className="py-3 px-5 text-right">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{row.count}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50 bg-gray-50/40">
          <span className="text-xs text-gray-400">{data.total} variations</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 rounded-lg hover:bg-white">
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="text-xs text-gray-500 px-3">{page} / {data.pages}</span>
            <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 rounded-lg hover:bg-white">
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",       label: "Overview",        icon: BookOpen },
  { id: "anomalies",      label: "Anomalies",       icon: AlertTriangle },
  { id: "normalizations", label: "Normalizations",  icon: ArrowLeftRight },
] as const
type TabId = typeof TABS[number]["id"]

export default function VerificationPage() {
  const [tab, setTab] = useState<TabId>("overview")
  const qc = useQueryClient()

  const { data: stats, isLoading } = useQuery<EnrichmentStats>({
    queryKey: ["enrich-stats"],
    queryFn: getEnrichmentStats,
    staleTime: 30_000,
  })

  if (isLoading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 size={28} className="text-indigo-400 animate-spin" />
        <p className="text-sm text-gray-400">Loading verification data…</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tally Data Verification</h1>
          <p className="text-sm text-gray-400 mt-0.5">AI enrichment · anomaly detection · party name normalization</p>
        </div>
        <div className="flex items-center gap-2">
          {stats.anomalies > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              <AlertTriangle size={12} /> {stats.anomalies} anomalies need review
            </span>
          )}
          {stats.pending === 0 && stats.enriched > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
              <ShieldCheck size={12} /> All vouchers enriched
            </span>
          )}
        </div>
      </div>

      <StatsStrip stats={stats} />

      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          const badge = t.id === "anomalies" ? stats.anomalies : 0
          return (
            <button key={t.id} onClick={() => setTab(t.id as TabId)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <Icon size={14} />
              {t.label}
              {badge > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab stats={stats} onRefreshStats={() => qc.invalidateQueries({ queryKey: ["enrich-stats"] })} />
      )}
      {tab === "anomalies" && <AnomaliesTab anomalyCount={stats.anomalies} />}
      {tab === "normalizations" && <NormalizationsTab />}
    </div>
  )
}
