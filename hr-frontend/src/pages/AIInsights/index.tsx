import { useState } from "react"
import { isAdmin as _isAdmin, currentFYLabel } from "@/lib/constants"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Bot, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus,
  FileText, Loader2, BarChart2, Sparkles, ArrowLeft, Download,
  IndianRupee, ShoppingCart, FileQuestion, Package, ChevronRight,
} from "lucide-react"
import {
  checkAIStatus, getDashboardInsights, comparePeriods, generateReport, getBusinessSnapshot,
  type DashboardInsights, type PeriodComparison, type ReportResult, type BusinessSnapshot,
} from "@/api/ai"
import { useAuth } from "@/context/AuthContext"

function fmtINR(n: number): string {
  if (!n) return "₹0"
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return `₹${n.toLocaleString("en-IN")}`
}

function ScoreRing({ score }: { score: number }) {
  const r = 48
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#ca8a04" : "#dc2626"
  return (
    <svg width="120" height="120" className="-rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
  )
}

function SnapshotCards({ data, loading }: { data?: BusinessSnapshot; loading: boolean }) {
  const cards = [
    {
      label: `FY ${currentFYLabel()} Sales`,
      value: fmtINR(data?.fy_sales ?? 0),
      sub: `${(data?.sales_count ?? 0).toLocaleString("en-IN")} sales vouchers`,
      icon: TrendingUp,
      bg: "bg-green-50",
      text: "text-green-600",
      border: "border-green-100",
    },
    {
      label: `FY ${currentFYLabel()} Purchases`,
      value: fmtINR(data?.fy_purchases ?? 0),
      sub: `${(data?.purchase_count ?? 0).toLocaleString("en-IN")} purchase vouchers`,
      icon: ShoppingCart,
      bg: "bg-red-50",
      text: "text-red-600",
      border: "border-red-100",
    },
    {
      label: "Sundry Debtors",
      value: fmtINR(data?.sundry_debtors ?? 0),
      sub: `${data?.debtor_count ?? 0} parties`,
      icon: IndianRupee,
      bg: "bg-indigo-50",
      text: "text-indigo-600",
      border: "border-indigo-100",
    },
    {
      label: "Sundry Creditors",
      value: fmtINR(data?.sundry_creditors ?? 0),
      sub: `${data?.creditor_count ?? 0} parties`,
      icon: Package,
      bg: "bg-orange-50",
      text: "text-orange-600",
      border: "border-orange-100",
    },
    {
      label: "GST Payable (Output)",
      value: fmtINR(data?.gst_payable ?? 0),
      sub: `Input credit: ${fmtINR(data?.input_gst_credit ?? 0)}`,
      icon: FileQuestion,
      bg: "bg-yellow-50",
      text: "text-yellow-600",
      border: "border-yellow-100",
    },
    {
      label: "Cash + Bank",
      value: fmtINR((data?.cash_in_hand ?? 0) + (data?.bank_balance ?? 0)),
      sub: `Cash ₹${fmtINR(data?.cash_in_hand ?? 0)} · Bank ${fmtINR(data?.bank_balance ?? 0)}`,
      icon: BarChart2,
      bg: "bg-emerald-50",
      text: "text-emerald-600",
      border: "border-emerald-100",
    },
    {
      label: "FY Collections",
      value: fmtINR(data?.fy_collections ?? 0),
      sub: `${(data?.receipt_count ?? 0).toLocaleString("en-IN")} receipts`,
      icon: Download,
      bg: "bg-blue-50",
      text: "text-blue-600",
      border: "border-blue-100",
    },
    {
      label: "Total Vouchers",
      value: (data?.total_vouchers ?? 0).toLocaleString("en-IN"),
      sub: `${(data?.total_ledgers ?? 0).toLocaleString("en-IN")} ledgers · ${(data?.stock_item_count ?? 0).toLocaleString("en-IN")} SKUs`,
      icon: FileText,
      bg: "bg-gray-50",
      text: "text-gray-600",
      border: "border-gray-100",
    },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="bg-white rounded-xl border p-4 h-28 animate-pulse">
            <div className="w-9 h-9 rounded-lg bg-gray-100 mb-3" />
            <div className="h-6 bg-gray-100 rounded w-3/4 mb-1" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => {
        const Icon = card.icon
        return (
          <div key={card.label} className={`bg-white rounded-xl border ${card.border} p-4`}>
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${card.text}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{card.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        )
      })}
    </div>
  )
}

function TopPartiesCard({ data }: { data?: BusinessSnapshot }) {
  const debtors  = Object.entries(data?.top_debtors  ?? {}).slice(0, 5)
  const creditors = Object.entries(data?.top_creditors ?? {}).slice(0, 5)
  if (!debtors.length && !creditors.length) return null
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {debtors.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
            Top Debtors (Outstanding)
          </h3>
          <div className="space-y-2">
            {debtors.map(([name, amt]) => (
              <div key={name} className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-700 truncate">{name}</span>
                <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap">{fmtINR(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {creditors.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            Top Creditors (Outstanding)
          </h3>
          <div className="space-y-2">
            {creditors.map(([name, amt]) => (
              <div key={name} className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-700 truncate">{name}</span>
                <span className="text-sm font-semibold text-orange-600 whitespace-nowrap">{fmtINR(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HealthCard({
  data,
  isLoading,
  aiReady,
  onRefresh,
}: {
  data?: DashboardInsights
  isLoading: boolean
  aiReady: boolean
  onRefresh: () => void
}) {
  const score = data?.health_score
  const label = data?.health_label

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Business Health Score</h2>
          <p className="text-sm text-gray-500">AI analysis of all your financial data</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading || !aiReady}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Analysing…" : "Refresh"}
        </button>
      </div>

      {!aiReady ? (
        <div className="text-center py-8 text-gray-400">
          <Bot className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Start Ollama to get AI health analysis</p>
          <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-2 inline-block">ollama serve</code>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Vera AI is analysing your data…</p>
            <p className="text-xs text-gray-400 mt-1">This takes 15–30 seconds</p>
          </div>
        </div>
      ) : !data?.success ? (
        <div className="text-center py-8 text-gray-400">
          <Bot className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">
            {data?.reason === "LLM did not return valid JSON"
              ? "AI returned an unexpected response — try refreshing"
              : "Click Refresh to generate the health score"}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-6">
            <div className="relative flex-shrink-0">
              {score !== undefined && <ScoreRing score={score} />}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${
                  (score ?? 0) >= 75 ? "text-green-600" :
                  (score ?? 0) >= 50 ? "text-yellow-600" : "text-red-600"
                }`}>{score}</span>
                <span className="text-xs text-gray-400">/100</span>
              </div>
            </div>
            <div className="flex-1 pt-1">
              {label && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium mb-3 ${
                  label === "Excellent" ? "bg-green-100 text-green-800" :
                  label === "Good" ? "bg-blue-100 text-blue-800" :
                  label === "Fair" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                }`}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {label}
                </span>
              )}
              {data.insights && data.insights.length > 0 && (
                <ul className="space-y-1.5">
                  {data.insights.map((ins, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <ChevronRight className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                      {typeof ins === "string" ? ins : JSON.stringify(ins)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {((data.alerts && data.alerts.length > 0) || (data.recommendations && data.recommendations.length > 0)) && (
            <div className="grid md:grid-cols-2 gap-4 pt-1 border-t border-gray-100">
              {data.alerts && data.alerts.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Action Required
                  </h4>
                  <ul className="space-y-1.5">
                    {data.alerts.map((a, i) => (
                      <li key={i} className="text-xs text-red-700 flex gap-1.5">
                        <span className="flex-shrink-0 mt-0.5">•</span>
                        {typeof a === "string" ? a : JSON.stringify(a)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.recommendations && data.recommendations.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-indigo-800 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Recommendations
                  </h4>
                  <ul className="space-y-1.5">
                    {data.recommendations.map((r, i) => (
                      <li key={i} className="text-xs text-indigo-700 flex gap-1.5">
                        <span className="font-bold flex-shrink-0">{i + 1}.</span>
                        {typeof r === "string" ? r : JSON.stringify(r)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PeriodCompareCard({ aiReady }: { aiReady: boolean }) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7)
  const [p1, setP1] = useState(lastMonth)
  const [p2, setP2] = useState(currentMonth)

  const { mutate, data, isPending } = useMutation({
    mutationFn: () => comparePeriods(p1, p2),
  })
  const result = data as PeriodComparison | undefined

  const TrendIcon = result?.trend === "improving" ? TrendingUp :
    result?.trend === "declining" ? TrendingDown : Minus
  const trendColor = result?.trend === "improving" ? "text-green-600" :
    result?.trend === "declining" ? "text-red-600" : "text-gray-500"

  const maxVal = Math.max(
    result?.period1_data?.sales ?? 0,
    result?.period2_data?.sales ?? 0,
    result?.period1_data?.purchases ?? 0,
    result?.period2_data?.purchases ?? 0,
    1,
  )
  const pct = (v: number) => `${Math.max(4, Math.round((v / maxVal) * 100))}%`

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Period Comparison</h2>
          <p className="text-sm text-gray-500">Compare sales and purchases across two months</p>
        </div>
        <BarChart2 className="w-5 h-5 text-gray-300" />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Period 1</label>
          <input type="month" value={p1} onChange={e => setP1(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Period 2</label>
          <input type="month" value={p2} onChange={e => setP2(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending || !aiReady}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
          Compare
        </button>
        {!aiReady && <p className="text-xs text-gray-400">Requires Ollama</p>}
      </div>

      {isPending && (
        <div className="text-center py-6 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Querying database and running AI analysis…</p>
        </div>
      )}

      {result?.success && !isPending && (
        <div className="space-y-5">
          {/* Data bars */}
          <div className="space-y-5">
            {(["sales", "purchases"] as const).map(metric => (
              <div key={metric}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {metric === "sales" ? "Sales Revenue" : "Purchases"}
                </p>
                <div className="space-y-2">
                  {([
                    { period: p1, data: result.period1_data, shade: metric === "sales" ? "bg-indigo-400" : "bg-purple-400" },
                    { period: p2, data: result.period2_data, shade: metric === "sales" ? "bg-indigo-600" : "bg-purple-600" },
                  ] as const).map(({ period, data: pd, shade }) => {
                    const val = pd?.[metric] ?? 0
                    return (
                      <div key={period} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-16 text-right shrink-0">{period}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                          <div
                            className={`h-6 ${shade} rounded-full transition-all duration-700 flex items-center justify-end pr-2 min-w-[2rem]`}
                            style={{ width: pct(val) }}
                          >
                            <span className="text-white text-xs font-medium whitespace-nowrap">{fmtINR(val)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Trend row */}
          <div className="flex items-center gap-3 pt-1">
            <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColor}`}>
              <TrendIcon className="w-4 h-4" />
              {result.trend ? result.trend.charAt(0).toUpperCase() + result.trend.slice(1) : ""} trend
            </div>
            {result.revenue_change_pct !== undefined && (
              <span className="text-xs text-gray-400">
                Sales {result.revenue_change_pct >= 0 ? "+" : ""}{result.revenue_change_pct.toFixed(1)}%
                {result.expense_change_pct !== undefined && (
                  <> · Purchases {result.expense_change_pct >= 0 ? "+" : ""}{result.expense_change_pct.toFixed(1)}%</>
                )}
              </span>
            )}
          </div>

          {result.summary && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{result.summary}</p>
          )}

          {result.key_differences && result.key_differences.length > 0 && (
            <ul className="space-y-1">
              {result.key_differences.map((d, i) => (
                <li key={i} className="text-sm text-gray-600 flex gap-2">
                  <span className="text-gray-300 flex-shrink-0">→</span>{d}
                </li>
              ))}
            </ul>
          )}

          {result.recommendation && (
            <div className="border-l-4 border-indigo-300 pl-3 text-sm text-indigo-700 italic">
              {result.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const REPORT_TYPES = [
  { id: "executive_summary", label: "Executive Summary", icon: "📊" },
  { id: "cash_flow", label: "Cash Flow", icon: "💧" },
  { id: "sales_analysis", label: "Sales Analysis", icon: "💼" },
  { id: "vendor_analysis", label: "Vendor Analysis", icon: "🤝" },
  { id: "risk_report", label: "Risk Report", icon: "⚠️" },
]

function ReportCard({ aiReady }: { aiReady: boolean }) {
  const [selected, setSelected] = useState("executive_summary")
  const { mutate, data, isPending, reset } = useMutation({
    mutationFn: () => generateReport(selected),
  })
  const report = data as ReportResult | undefined

  const handleDownload = () => {
    if (!report?.report) return
    const blob = new Blob([report.report], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vera-${selected}-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">AI Report Generator</h2>
          <p className="text-sm text-gray-500">Generate professional business reports from your data</p>
        </div>
        <FileText className="w-5 h-5 text-gray-300" />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {REPORT_TYPES.map(rt => (
          <button
            key={rt.id}
            onClick={() => { setSelected(rt.id); reset() }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              selected === rt.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
            }`}
          >
            <span>{rt.icon}</span> {rt.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => mutate()}
        disabled={isPending || !aiReady}
        className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed mb-4"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isPending ? "Generating report…" : "Generate Report"}
      </button>
      {!aiReady && <p className="text-xs text-gray-400 mb-4">Requires Ollama to generate reports</p>}

      {isPending && (
        <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Writing your report… (30–60 seconds)</p>
        </div>
      )}

      {report?.success && report.report && !isPending && (
        <div>
          <div className="flex justify-end mb-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1 rounded-lg"
            >
              <Download className="w-4 h-4" /> Download .txt
            </button>
          </div>
          <pre className="bg-gray-50 border rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-[500px] overflow-y-auto font-sans leading-relaxed">
            {report.report}
          </pre>
        </div>
      )}

      {report && !report.success && !isPending && (
        <p className="text-sm text-red-600 mt-2">
          {report.reason === "Ollama not running"
            ? "AI is offline. Start Ollama to generate reports."
            : "Report generation failed. Please try again."}
        </p>
      )}
    </div>
  )
}

export default function AIInsights() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const isAdmin = _isAdmin(user?.name)

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: checkAIStatus,
    staleTime: 30_000,
    refetchOnMount: true,
  })

  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ["business-snapshot"],
    queryFn: getBusinessSnapshot,
    staleTime: 5 * 60_000,
  })

  const {
    data: insights,
    isLoading: insightsLoading,
    isFetching: insightsFetching,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    retry: 1,
    enabled: !!status?.ready,
  })

  const aiReady = !!status?.ready

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Bot className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p>AI Insights is admin-only.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
            <p className="text-sm text-gray-400">Powered by Vera AI · Ollama</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            aiReady
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-gray-100 border-gray-200 text-gray-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${aiReady ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {aiReady ? `Online · ${status?.active_model}` : "AI Offline"}
          </div>
          <button
            onClick={() => navigate("/business")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" /> Business
          </button>
        </div>
      </div>

      {/* Offline banner */}
      {!aiReady && status !== undefined && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Ollama is offline</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Business data is shown below, but AI analysis requires Ollama.
              Start with: <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">ollama serve</code>
            </p>
          </div>
        </div>
      )}

      {/* Business snapshot — always visible */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Business Snapshot</h2>
        <SnapshotCards data={snapshot as BusinessSnapshot | undefined} loading={snapshotLoading} />

        {/* GST net position alert */}
        {(snapshot?.gst_payable ?? 0) > (snapshot?.input_gst_credit ?? 0) && (
          <div className="mt-3 flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
            <p className="text-sm text-yellow-700">
              Net GST payable: <strong>{fmtINR((snapshot?.gst_payable ?? 0) - (snapshot?.input_gst_credit ?? 0))}</strong> (Output GST minus Input Credit)
            </p>
          </div>
        )}
      </section>

      {/* Top debtors + creditors */}
      <TopPartiesCard data={snapshot as BusinessSnapshot | undefined} />

      {/* AI Health Score */}
      <HealthCard
        data={insights}
        isLoading={insightsLoading || insightsFetching}
        aiReady={aiReady}
        onRefresh={() => refetchInsights()}
      />

      {/* Period Comparison */}
      <PeriodCompareCard aiReady={aiReady} />

      {/* Report Generator */}
      <ReportCard aiReady={aiReady} />
    </div>
  )
}
