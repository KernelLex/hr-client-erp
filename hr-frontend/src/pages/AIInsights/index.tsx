import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Bot, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Minus, FileText, Loader2, Download, BarChart2, Sparkles
} from "lucide-react"
import {
  getDashboardInsights, comparePeriods, generateReport,
  type DashboardInsights, type PeriodComparison, type ReportResult
} from "@/api/ai"
import { checkAIStatus } from "@/api/ai"
import { useAuth } from "@/context/AuthContext"

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#ca8a04" : "#dc2626"

  return (
    <svg width="128" height="128" className="-rotate-90">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle
        cx="64" cy="64" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
  )
}

function HealthScoreCard({ data, onRefresh, isLoading }: {
  data?: DashboardInsights
  onRefresh: () => void
  isLoading: boolean
}) {
  const score = data?.health_score
  const label = data?.health_label

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Business Health Score</h2>
          <p className="text-sm text-gray-500">AI analysis of all financial data</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 border border-indigo-200 px-3 py-1.5 rounded-lg"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Vera AI is analysing your data…</p>
          </div>
        </div>
      ) : !data?.success ? (
        <div className="text-center py-8">
          <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {data?.reason === "Ollama not running"
              ? "Ollama is not running. Start it to see AI insights."
              : "Click Refresh to generate insights."}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-8">
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

          <div className="flex-1 space-y-4">
            {label && (
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                label === "Excellent" ? "bg-green-100 text-green-800" :
                label === "Good" ? "bg-blue-100 text-blue-800" :
                label === "Fair" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              }`}>
                <Sparkles className="w-4 h-4" />
                {label}
              </div>
            )}

            {data.insights && data.insights.length > 0 && (
              <ul className="space-y-1.5">
                {data.insights.map((ins, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-indigo-400 flex-shrink-0">•</span>
                    {ins}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AlertsCard({ alerts, recommendations }: { alerts?: string[]; recommendations?: string[] }) {
  if (!alerts?.length && !recommendations?.length) return null

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {alerts && alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Action Required
          </h3>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="text-sm text-red-700 flex gap-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
          <h3 className="font-semibold text-indigo-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Recommendations
          </h3>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="text-sm text-indigo-700 flex gap-2">
                <span className="flex-shrink-0 font-bold">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PeriodComparisonCard() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7)

  const [p1, setP1] = useState(lastMonth)
  const [p2, setP2] = useState(currentMonth)

  const { mutate, data, isPending } = useMutation({
    mutationFn: () => comparePeriods(p1, p2),
  })

  const comparison = data as PeriodComparison | undefined

  const TrendIcon = comparison?.trend === "improving" ? TrendingUp :
    comparison?.trend === "declining" ? TrendingDown : Minus
  const trendColor = comparison?.trend === "improving" ? "text-green-600" :
    comparison?.trend === "declining" ? "text-red-600" : "text-gray-500"

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Period Comparison</h2>
          <p className="text-sm text-gray-500">Compare two time periods</p>
        </div>
        <BarChart2 className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex items-end gap-3 mb-5">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Period 1</label>
          <input
            type="month"
            value={p1}
            onChange={e => setP1(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Period 2</label>
          <input
            type="month"
            value={p2}
            onChange={e => setP2(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
          Compare
        </button>
      </div>

      {isPending && (
        <div className="text-center py-6 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Analysing periods…</p>
        </div>
      )}

      {comparison?.success && !isPending && (
        <div className="space-y-4">
          {comparison.trend && (
            <div className={`flex items-center gap-2 text-sm font-medium ${trendColor}`}>
              <TrendIcon className="w-4 h-4" />
              {comparison.trend.charAt(0).toUpperCase() + comparison.trend.slice(1)} trend
              {comparison.revenue_change_pct !== undefined && (
                <span className="text-xs text-gray-500 font-normal ml-1">
                  (revenue {comparison.revenue_change_pct > 0 ? "+" : ""}{comparison.revenue_change_pct?.toFixed(1)}%)
                </span>
              )}
            </div>
          )}

          {comparison.summary && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{comparison.summary}</p>
          )}

          {comparison.key_differences && comparison.key_differences.length > 0 && (
            <ul className="space-y-1">
              {comparison.key_differences.map((d, i) => (
                <li key={i} className="text-sm text-gray-600 flex gap-2">
                  <span className="text-gray-400">→</span>{d}
                </li>
              ))}
            </ul>
          )}

          {comparison.recommendation && (
            <div className="border-l-4 border-indigo-300 pl-3 text-sm text-indigo-700">
              {comparison.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const REPORT_TYPES = [
  { id: "executive_summary", label: "Executive Summary", icon: "📊" },
  { id: "cash_flow", label: "Cash Flow Analysis", icon: "💧" },
  { id: "sales_analysis", label: "Sales Analysis", icon: "💼" },
  { id: "vendor_analysis", label: "Vendor Analysis", icon: "🤝" },
  { id: "risk_report", label: "Risk Report", icon: "⚠️" },
]

function ReportGeneratorCard() {
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
          <p className="text-sm text-gray-500">Generate business reports using AI</p>
        </div>
        <FileText className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
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
        disabled={isPending}
        className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 mb-4"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isPending ? "Generating…" : "Generate Report"}
      </button>

      {isPending && (
        <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Vera AI is writing your report…</p>
        </div>
      )}

      {report?.success && report.report && !isPending && (
        <div>
          <div className="flex justify-end mb-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1 rounded-lg"
            >
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
          <pre className="bg-gray-50 border rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-96 overflow-y-auto font-sans leading-relaxed">
            {report.report}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AIInsights() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const isAdmin =
    user?.name === "owais@veraenterprises.in" || user?.name === "Administrator"

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: checkAIStatus,
    staleTime: 30_000,
    // Always re-check Ollama status on navigation — it might have started/stopped
    refetchOnMount: "always",
  })

  const {
    data: insights,
    isLoading: insightsLoading,
    isFetching: insightsFetching,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    // Cache for 5 minutes — LLM is slow, avoid calling on every navigation.
    // refetchOnMount: "always" ensures a failed/stale response is retried when
    // the user navigates back, without clearing the cached data while refetching.
    staleTime: 5 * 60_000,
    refetchOnMount: "always",
    // retry: 1 so a transient Ollama failure doesn't permanently poison the cache
    retry: 1,
  })

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Bot className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p>AI Insights is admin-only.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
              <p className="text-sm text-gray-500">Powered by Vera AI · Ollama</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            status?.ready
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-gray-100 border-gray-200 text-gray-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status?.ready ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {status?.ready ? `AI Online · ${status.active_model}` : "AI Offline"}
          </div>
          <button
            onClick={() => navigate("/business")}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg"
          >
            ← Business Dashboard
          </button>
        </div>
      </div>

      {!status?.ready && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>Ollama is not running.</strong> Start it with <code className="bg-amber-100 px-1.5 py-0.5 rounded">ollama serve</code> and then pull a model: <code className="bg-amber-100 px-1.5 py-0.5 rounded">ollama pull llama3.1</code>
        </div>
      )}

      <HealthScoreCard
        data={insights}
        onRefresh={() => refetchInsights()}
        isLoading={insightsLoading || insightsFetching}
      />

      <AlertsCard alerts={insights?.alerts} recommendations={insights?.recommendations} />

      <PeriodComparisonCard />

      <ReportGeneratorCard />
    </div>
  )
}
