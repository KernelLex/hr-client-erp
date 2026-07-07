import { useState, useRef, useCallback } from "react"
import { isAdmin as _isAdmin, currentFYLabel, prevFYLabel, recentFYLabels } from "@/lib/constants"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, ReferenceLine,
} from "recharts"
import {
  Sparkles, Download, Save, Trash2, Search, Filter,
  BarChart2, TrendingUp, PieChart as PieChartIcon, Activity,
  Loader2, Bot, ChevronRight, X, Check, Copy,
  FileText, Package, IndianRupee, Users, AlertTriangle, MapPin,
  ArrowLeftRight, FileQuestion, LayoutGrid, List,
  Eye, Plus, Layers,
} from "lucide-react"
import {
  getAvailablePresets, getPresetGraph, generateGraphData, saveGraph,
  getSavedGraphs, getSavedGraph, deleteGraph, getGraphCsvData, getGraphStats,
  type ChartData, type GraphCategory, type SavedGraph, type GraphPreset,
} from "@/api/graphs"
import { checkAIStatus } from "@/api/ai"
import { useAuth } from "@/context/AuthContext"

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  if (!n && n !== 0) return "₹0"
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)} K`
  return `₹${n.toLocaleString("en-IN")}`
}

function fmtVal(n: unknown): string {
  if (typeof n !== "number") return String(n ?? "")
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`
  if (n >= 1000) return `${(n / 1000).toFixed(1)} K`
  return n.toLocaleString("en-IN")
}

const CHART_COLORS = [
  "#1e3a2f","#16a34a","#dc2626","#0891b2","#d97706","#c8a45c",
  "#be185d","#0e7490","#b45309","#1e3a2f","#065f46","#9a3412",
  "#1e3a5f","#4a044e","#064e3b",
]

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  TrendingUp, BarChart2, PieChart: PieChartIcon, Activity, Users, Package,
  IndianRupee, AlertTriangle, MapPin, ArrowLeftRight, FileQuestion, FileText, Layers,
}

const CATEGORY_COLORS: Record<string, string> = {
  Sales: "text-green-700 bg-green-50 border-green-200",
  Purchase: "text-red-700 bg-red-50 border-red-200",
  Finance: "text-forest-700 bg-forest-50 border-forest-200",
  Inventory: "text-teal-700 bg-teal-50 border-teal-200",
  Custom: "text-gray-700 bg-gray-50 border-gray-200",
}

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: "Bar", line: "Line", area: "Area", pie: "Pie", donut: "Donut",
  bar_horizontal: "Horiz. Bar", composed: "Composed",
}

type Tab = "generate" | "presets" | "saved"

// ── custom tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[140px]">
      {label != null && <p className="text-xs font-semibold text-gray-500 mb-1.5">{String(label)}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: String(p.color || p.fill || "#999") }} />
          <span className="text-gray-600">{String(p.name || p.dataKey)}:</span>
          <span className="font-semibold text-gray-900">
            {typeof p.value === "number" ? fmtVal(p.value) : String(p.value ?? "")}
          </span>
        </div>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3">
      <p className="text-xs font-semibold text-gray-700">{String(p.name)}</p>
      <p className="text-sm font-bold text-gray-900 mt-0.5">{fmtVal(p.value as number)}</p>
      <p className="text-xs text-gray-400">{String(p.payload?.count || "")}</p>
    </div>
  )
}

// ── chart renderer ────────────────────────────────────────────────────────────

interface ChartRendererProps {
  chartData: ChartData
  height?: number
  animate?: boolean
}

function ChartRenderer({ chartData, height = 340, animate = true }: ChartRendererProps) {
  const { data, chart_type, x_key, y_keys, value_key, label_key, colors } = chartData

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <p className="text-sm">No data available</p>
      </div>
    )
  }

  const resolveColor = (key: string, idx: number) =>
    (colors && colors[key]) ? colors[key] : CHART_COLORS[idx % CHART_COLORS.length]

  const yKeysList = y_keys && y_keys.length > 0 ? y_keys : (
    x_key ? Object.keys(data[0] || {}).filter(k => k !== x_key && k !== "fill" && k !== "count") : []
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xAxisTick = ({ x, y, payload }: any) => {
    const val = String(payload?.value ?? "")
    const short = val.length > 14 ? val.slice(0, 13) + "…" : val
    return <text x={x} y={y + 8} textAnchor="middle" fontSize={11} fill="#6b7280">{short}</text>
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yAxisTick = ({ x, y, payload }: any) => {
    return <text x={x - 4} y={y + 4} textAnchor="end" fontSize={11} fill="#6b7280">{fmtVal(payload?.value)}</text>
  }

  // Horizontal bar — label_key on Y axis, value_key on X
  if (chart_type === "bar_horizontal") {
    const lk = label_key || "party"
    const vk = value_key || "amount"
    const sorted = [...data].sort((a, b) => (b[vk] as number) - (a[vk] as number))
    const color = (colors && colors[vk]) ? colors[vk] : "#1e3a2f"
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, sorted.length * 36 + 40)}>
        <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis type="number" tickFormatter={v => fmtVal(v as number)} tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis
            type="category"
            dataKey={lk}
            width={160}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tick={({ x, y, payload }: any) => {
              const v = String(payload?.value ?? "")
              const s = v.length > 22 ? v.slice(0, 21) + "…" : v
              return <text x={x} y={y + 4} textAnchor="end" fontSize={11} fill="#374151">{s}</text>
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey={vk} fill={color} radius={[0, 4, 4, 0]} isAnimationActive={animate}
            label={{ position: "right", formatter: (v: unknown) => fmtVal(v as number), fontSize: 10, fill: "#6b7280" }} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Pie / Donut
  if (chart_type === "pie" || chart_type === "donut") {
    const vk = value_key || "value"
    const lk = label_key || "name"
    const innerRadius = chart_type === "donut" ? 60 : 0
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            outerRadius={height / 2 - 50}
            innerRadius={innerRadius}
            dataKey={vk}
            nameKey={lk}
            isAnimationActive={animate}
            label={false}
            labelLine={false}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={String(entry.fill || CHART_COLORS[i % CHART_COLORS.length])}
              />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
          <Legend formatter={(v) => <span style={{ fontSize: 11, color: "#374151" }}>{String(v).slice(0, 18)}</span>} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  // Composed (bar + line)
  if (chart_type === "composed") {
    const xk = x_key || "month"
    const lineKeys = yKeysList.filter(k => k.toLowerCase().includes("rate") || k.toLowerCase().includes("pct") || k.toLowerCase().includes("growth") || k.toLowerCase().includes("net"))
    const barKeys  = yKeysList.filter(k => !lineKeys.includes(k))
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={xk} tick={xAxisTick} />
          <YAxis yAxisId="left" tickFormatter={v => fmtVal(v as number)} tick={{ fontSize: 11, fill: "#6b7280" }} />
          {lineKeys.length > 0 && (
            <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#6b7280" }} />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
          <ReferenceLine yAxisId="left" y={0} stroke="#e5e7eb" />
          {barKeys.map((k, i) => (
            <Bar key={k} yAxisId="left" dataKey={k} fill={resolveColor(k, i)} radius={[3, 3, 0, 0]}
              isAnimationActive={animate} maxBarSize={40} />
          ))}
          {lineKeys.map((k, i) => (
            <Line key={k} yAxisId="right" type="monotone" dataKey={k}
              stroke={resolveColor(k, barKeys.length + i)} strokeWidth={2}
              dot={{ r: 3 }} isAnimationActive={animate} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  // Area
  if (chart_type === "area") {
    const xk = x_key || "month"
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 24 }}>
          <defs>
            {yKeysList.map((k, i) => (
              <linearGradient key={k} id={`grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={resolveColor(k, i)} stopOpacity={0.3} />
                <stop offset="95%" stopColor={resolveColor(k, i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={xk} tick={xAxisTick} />
          <YAxis tickFormatter={v => fmtVal(v as number)} tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
          {yKeysList.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stroke={resolveColor(k, i)} strokeWidth={2}
              fill={`url(#grad_${i})`} isAnimationActive={animate} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  // Line
  if (chart_type === "line") {
    const xk = x_key || "month"
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={xk} tick={xAxisTick} />
          <YAxis tickFormatter={v => fmtVal(v as number)} tick={yAxisTick} />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
          {yKeysList.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={resolveColor(k, i)} strokeWidth={2.5}
              dot={{ r: 3, fill: resolveColor(k, i) }} activeDot={{ r: 5 }} isAnimationActive={animate} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // Default: Bar
  const xk = x_key || "month"
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xk} tick={xAxisTick} />
        <YAxis tickFormatter={v => fmtVal(v as number)} tick={yAxisTick} />
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
        {yKeysList.map((k, i) => (
          <Bar key={k} dataKey={k} fill={resolveColor(k, i)} radius={[3, 3, 0, 0]}
            isAnimationActive={animate} maxBarSize={48} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── chart panel (preview + actions) ──────────────────────────────────────────

interface ChartPanelProps {
  chartData: ChartData
  onSave: (data: ChartData, thumbnail?: string) => void
  isSaving: boolean
  savedName?: string | null
  presetId?: string
}

function ChartPanel({ chartData, onSave, isSaving, savedName }: ChartPanelProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  const exportPNG = useCallback(async () => {
    if (!chartRef.current) return
    try {
      const { default: html2canvas } = await import("html2canvas")
      const canvas = await html2canvas(chartRef.current, { backgroundColor: "#ffffff", scale: 2 })
      const link = document.createElement("a")
      link.download = `${chartData.title || "chart"}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } catch {
      alert("PNG export failed. Try again.")
    }
  }, [chartData.title])

  const exportCSV = useCallback(() => {
    const { data } = chartData
    if (!data || data.length === 0) return
    const keys = Object.keys(data[0])
    const lines = [keys.join(",")]
    for (const row of data) {
      lines.push(keys.map(k => {
        const v = String(row[k] ?? "")
        return v.includes(",") ? `"${v}"` : v
      }).join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${chartData.title || "chart"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [chartData])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(chartData.data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${chartData.title || "chart"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [chartData])

  const handleSave = useCallback(async () => {
    let thumbnail: string | undefined
    if (chartRef.current) {
      try {
        const { default: html2canvas } = await import("html2canvas")
        const canvas = await html2canvas(chartRef.current, { backgroundColor: "#ffffff", scale: 1 })
        thumbnail = canvas.toDataURL("image/jpeg", 0.7)
      } catch { /* ignore thumbnail error */ }
    }
    onSave(chartData, thumbnail)
  }, [chartData, onSave])

  const copyData = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(chartData.data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [chartData])

  const catClass = CATEGORY_COLORS[chartData.category || "Custom"] || CATEGORY_COLORS.Custom

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${catClass}`}>
              {chartData.category || "Custom"}
            </span>
            <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">
              {CHART_TYPE_LABELS[chartData.chart_type || "bar"] || chartData.chart_type}
            </span>
            {savedName && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-gray-900 leading-tight">{chartData.title || "Chart"}</h3>
          {chartData.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{chartData.description}</p>
          )}
          {chartData.data && (
            <p className="text-xs text-gray-400 mt-1">{chartData.data.length} data points</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={copyData} title="Copy JSON"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={exportJSON} title="Export JSON"
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <FileText className="w-4 h-4" />
          </button>
          <button onClick={exportCSV} title="Export CSV"
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportPNG} title="Export PNG"
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !!savedName}
            className="flex items-center gap-1.5 text-sm bg-forest-600 text-white px-3 py-1.5 rounded-lg hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {savedName ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartRef} className="p-4 bg-white">
        <ChartRenderer chartData={chartData} />
      </div>

      {/* Data summary */}
      {chartData.data && chartData.data.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center gap-6 text-xs text-gray-500 flex-wrap">
          <span>{chartData.data.length} rows</span>
          {chartData.y_keys && chartData.y_keys.map(k => {
            const vals = chartData.data.map(r => Number(r[k] ?? 0)).filter(v => !isNaN(v))
            const total = vals.reduce((a, b) => a + b, 0)
            const max = Math.max(...vals)
            return (
              <span key={k}>
                <strong>{k}:</strong> total {fmtINR(total)} · max {fmtINR(max)}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── preset card ───────────────────────────────────────────────────────────────

interface PresetCardProps {
  preset: GraphPreset
  onLoad: (preset: GraphPreset) => void
  isLoading: boolean
}

function PresetCard({ preset, onLoad, isLoading }: PresetCardProps) {
  const Icon = ICON_MAP[preset.icon] || BarChart2
  const catClass = CATEGORY_COLORS[preset.category] || CATEGORY_COLORS.Custom
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-forest-100 transition-all group cursor-pointer"
      onClick={() => !isLoading && onLoad(preset)}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: preset.color + "18" }}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{preset.title}</p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full border mt-1 inline-block ${catClass}`}>
            {preset.category}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{preset.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">
          {CHART_TYPE_LABELS[preset.chart_type] || preset.chart_type}
        </span>
        <button
          disabled={isLoading}
          className="flex items-center gap-1 text-xs text-forest-600 group-hover:text-forest-800 font-medium"
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
          {isLoading ? "Loading…" : "View"}
        </button>
      </div>
    </div>
  )
}

// ── saved graph card ──────────────────────────────────────────────────────────

interface SavedCardProps {
  graph: SavedGraph
  onOpen: (g: SavedGraph) => void
  onDelete: (name: string) => void
  onExportCSV: (name: string) => void
  deleting: boolean
}

function SavedCard({ graph, onOpen, onDelete, onExportCSV, deleting }: SavedCardProps) {
  const [confirmDel, setConfirmDel] = useState(false)
  const catClass = CATEGORY_COLORS[graph.category] || CATEGORY_COLORS.Custom

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-forest-100 transition-all overflow-hidden">
      {/* Thumbnail or placeholder */}
      <div className="h-28 bg-gradient-to-br from-gray-50 to-forest-50 flex items-center justify-center border-b border-gray-100 cursor-pointer"
        onClick={() => onOpen(graph)}>
        {graph.thumbnail_data ? (
          <img src={graph.thumbnail_data} alt={graph.title} className="w-full h-full object-cover" />
        ) : (
          <BarChart2 className="w-10 h-10 text-forest-200" />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{graph.title}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${catClass}`}>{graph.category}</span>
              <span className="text-xs text-gray-400 border border-gray-200 rounded-full px-1.5 py-0.5">
                {CHART_TYPE_LABELS[graph.chart_type] || graph.chart_type}
              </span>
            </div>
          </div>
        </div>
        {graph.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{graph.description}</p>
        )}
        {graph.query_text && (
          <p className="text-xs text-gray-400 italic line-clamp-1 mb-3">"{graph.query_text}"</p>
        )}
        <p className="text-xs text-gray-400 mb-3">
          {new Date(graph.creation).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => onOpen(graph)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-forest-600 text-white py-1.5 rounded-lg hover:bg-forest-700 transition-colors">
            <Eye className="w-3 h-3" /> Open
          </button>
          <button onClick={() => onExportCSV(graph.name)}
            className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" title="Export CSV">
            <Download className="w-3.5 h-3.5" />
          </button>
          {confirmDel ? (
            <div className="flex gap-1">
              <button onClick={() => { onDelete(graph.name); setConfirmDel(false) }} disabled={deleting}
                className="p-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setConfirmDel(false)}
                className="p-1.5 text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)}
              className="p-1.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-200 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function GraphsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = _isAdmin(user?.name)

  const [activeTab, setActiveTab] = useState<Tab>("generate")
  const [currentChart, setCurrentChart] = useState<ChartData | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)

  // Generate tab state
  const [query, setQuery]               = useState("")
  const [chartTypeHint, setChartTypeHint] = useState("auto")
  const [dateFrom, setDateFrom]         = useState("")
  const [dateTo, setDateTo]             = useState("")
  const [fy, setFy]                     = useState("")

  // Presets tab state
  const [presetSearch, setPresetSearch] = useState("")
  const [presetCat, setPresetCat]       = useState<GraphCategory | "All">("All")
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null)

  // Saved tab state
  const [savedSearch, setSavedSearch]   = useState("")
  const [savedCat, setSavedCat]         = useState<GraphCategory | "All">("All")
  const [viewMode, setViewMode]         = useState<"grid" | "list">("grid")
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [openedGraph, setOpenedGraph]   = useState<ChartData | null>(null)

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: checkAIStatus,
    staleTime: 30_000,
  })
  const aiReady = !!aiStatus?.ready

  const { data: presetsData } = useQuery({
    queryKey: ["graph-presets"],
    queryFn: getAvailablePresets,
    staleTime: Infinity,
  })
  const presets = presetsData?.presets || []

  const { data: savedData, refetch: refetchSaved } = useQuery({
    queryKey: ["saved-graphs", savedCat],
    queryFn: () => getSavedGraphs(savedCat === "All" ? undefined : savedCat),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const savedGraphs = savedData?.graphs || []

  const { data: statsData } = useQuery({
    queryKey: ["graph-stats"],
    queryFn: getGraphStats,
    staleTime: 30_000,
  })

  // Generate
  const generateMut = useMutation({
    mutationFn: () => generateGraphData(query, chartTypeHint, dateFrom || undefined, dateTo || undefined, fy || undefined),
    onSuccess: (d) => {
      if (d.success) { setCurrentChart(d); setSavedName(null) }
    },
  })

  // Save
  const saveMut = useMutation({
    mutationFn: (args: { data: ChartData; thumbnail?: string }) =>
      saveGraph({
        title: args.data.title || "Untitled Chart",
        chart_type: args.data.chart_type || "bar",
        data_json: JSON.stringify(args.data.data),
        config_json: JSON.stringify({
          x_key: args.data.x_key,
          y_keys: args.data.y_keys,
          value_key: args.data.value_key,
          label_key: args.data.label_key,
          colors: args.data.colors,
        }),
        query_text: args.data.query_text,
        category: args.data.category,
        description: args.data.description,
        thumbnail_data: args.thumbnail,
      }),
    onSuccess: (r) => {
      if (r.success && r.name) {
        setSavedName(r.name)
        qc.invalidateQueries({ queryKey: ["saved-graphs"] })
        qc.invalidateQueries({ queryKey: ["graph-stats"] })
      }
    },
  })

  // Delete
  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteGraph(name),
    onSuccess: () => {
      refetchSaved()
      qc.invalidateQueries({ queryKey: ["graph-stats"] })
      setDeletingName(null)
    },
  })

  const handleSaveChart = useCallback((data: ChartData, thumbnail?: string) => {
    saveMut.mutate({ data, thumbnail })
  }, [saveMut])

  const handleLoadPreset = useCallback(async (preset: GraphPreset) => {
    setLoadingPreset(preset.id)
    try {
      const result = await getPresetGraph(preset.id)
      if (result.success) {
        setCurrentChart(result)
        setSavedName(null)
        setActiveTab("generate")
      }
    } finally {
      setLoadingPreset(null)
    }
  }, [])

  const handleOpenSaved = useCallback(async (g: SavedGraph) => {
    const r = await getSavedGraph(g.name)
    if (r.success) {
      const chart: ChartData = {
        success: true,
        title: r.graph.title,
        description: r.graph.description,
        chart_type: r.graph.chart_type,
        category: r.graph.category,
        query_text: r.graph.query_text,
        data: r.graph.data || [],
        ...(r.graph.config || {}),
      }
      setOpenedGraph(chart)
    }
  }, [])

  const handleExportSavedCSV = useCallback(async (name: string) => {
    const r = await getGraphCsvData(name)
    if (r.success && r.csv) {
      const blob = new Blob([r.csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = r.filename || "chart.csv"
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [])

  const filteredPresets = presets.filter(p => {
    const matchCat = presetCat === "All" || p.category === presetCat
    const matchSearch = !presetSearch || p.title.toLowerCase().includes(presetSearch.toLowerCase()) ||
      p.description.toLowerCase().includes(presetSearch.toLowerCase())
    return matchCat && matchSearch
  })

  const filteredSaved = savedGraphs.filter(g => {
    const matchSearch = !savedSearch || g.title.toLowerCase().includes(savedSearch.toLowerCase()) ||
      (g.query_text || "").toLowerCase().includes(savedSearch.toLowerCase())
    return matchSearch
  })

  const EXAMPLE_QUERIES = [
    "Show me monthly sales for the last 12 months",
    "Top 15 customers by revenue this financial year",
    "Voucher type breakdown as a pie chart",
    "Monthly cashflow trend — receipts vs payments",
    "Top vendors by purchase amount",
    "Sales growth rate month over month",
    "Outstanding debtors by balance",
    `Compare FY ${prevFYLabel()} vs FY ${currentFYLabel()}`,
  ]

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-400">
        <BarChart2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p>Financial Graphs is admin-only.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-forest-600 to-gold-600 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Graphs</h1>
            <p className="text-sm text-gray-400">AI-powered charts from your Tally data</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statsData && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="border border-gray-200 rounded-full px-3 py-1.5 bg-white">
                {statsData.total} saved graph{statsData.total !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            aiReady ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-100 border-gray-200 text-gray-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${aiReady ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {aiReady ? `AI · ${aiStatus?.active_model}` : "AI Offline"}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 gap-0">
        {([
          { id: "generate", label: "Generate", icon: Sparkles },
          { id: "presets",  label: `Presets (${presets.length})`, icon: Layers },
          { id: "saved",    label: `Saved (${savedData?.total ?? 0})`, icon: Save },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? "border-forest-600 text-forest-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── GENERATE TAB ── */}
      {activeTab === "generate" && (
        <div className="space-y-5">
          {!aiReady && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <Bot className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Ollama is offline — AI generation unavailable</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  You can still load preset charts. Start Ollama with:
                  <code className="ml-1 bg-amber-100 px-1.5 py-0.5 rounded text-xs">ollama serve</code>
                </p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-5">
            {/* Left: query builder */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-forest-500" /> AI Query
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Describe what you want to see</label>
                    <textarea
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="e.g. Show me monthly sales vs purchases for the last year"
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 resize-none"
                    />
                  </div>

                  {/* Chart type hint */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Chart type (optional)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(["auto","bar","line","area","pie","bar_horizontal","composed"] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setChartTypeHint(t)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            chartTypeHint === t
                              ? "bg-forest-600 text-white border-forest-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-forest-300"
                          }`}
                        >
                          {t === "auto" ? "Auto" : CHART_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date filters */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Financial year</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {["", ...recentFYLabels(3)].map(f => (
                        <button key={f} onClick={() => { setFy(f); setDateFrom(""); setDateTo("") }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            fy === f ? "bg-forest-600 text-white border-forest-600" : "bg-white text-gray-600 border-gray-200 hover:border-forest-300"
                          }`}>
                          {f || "All Time"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">From date</label>
                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setFy("") }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-forest-300" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">To date</label>
                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setFy("") }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-forest-300" />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => generateMut.mutate()}
                    disabled={!query.trim() || generateMut.isPending || !aiReady}
                    className="w-full flex items-center justify-center gap-2 bg-forest-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {generateMut.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                      : <><Sparkles className="w-4 h-4" /> Generate Chart</>}
                  </button>
                  {generateMut.isPending && (
                    <p className="text-xs text-gray-400 text-center">Analysing query · querying data · building chart…</p>
                  )}
                  {generateMut.data && !generateMut.data.success && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      {generateMut.data.error || "Generation failed"}
                    </p>
                  )}
                </div>
              </div>

              {/* Example queries */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Example queries</h3>
                <div className="space-y-1.5">
                  {EXAMPLE_QUERIES.map(q => (
                    <button
                      key={q}
                      onClick={() => setQuery(q)}
                      className="w-full text-left text-xs text-gray-600 hover:text-forest-600 hover:bg-forest-50 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: chart preview */}
            <div className="lg:col-span-2">
              {currentChart ? (
                <ChartPanel
                  chartData={currentChart}
                  onSave={handleSaveChart}
                  isSaving={saveMut.isPending}
                  savedName={savedName}
                />
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center h-[440px] text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-forest-50 flex items-center justify-center mb-4">
                    <BarChart2 className="w-8 h-8 text-forest-300" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">Your chart will appear here</h3>
                  <p className="text-sm text-gray-400 max-w-xs">
                    Type a query in plain English and click Generate, or browse presets to load a chart instantly.
                  </p>
                  <button
                    onClick={() => setActiveTab("presets")}
                    className="mt-5 flex items-center gap-2 text-sm text-forest-600 border border-forest-200 px-4 py-2 rounded-xl hover:bg-forest-50 transition-colors"
                  >
                    <Layers className="w-4 h-4" /> Browse Presets
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PRESETS TAB ── */}
      {activeTab === "presets" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={presetSearch}
                onChange={e => setPresetSearch(e.target.value)}
                placeholder="Search presets…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["All", "Sales", "Purchase", "Finance", "Inventory"] as const).map(cat => (
                <button key={cat} onClick={() => setPresetCat(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    presetCat === cat ? "bg-forest-600 text-white border-forest-600" : "bg-white text-gray-600 border-gray-200 hover:border-forest-300"
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPresets.map(preset => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onLoad={handleLoadPreset}
                isLoading={loadingPreset === preset.id}
              />
            ))}
            {filteredPresets.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400">
                <Filter className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No presets match your search</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SAVED TAB ── */}
      {activeTab === "saved" && (
        <div className="space-y-4">
          {/* Stats strip */}
          {statsData && statsData.total > 0 && (
            <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
              <span className="font-medium text-gray-700">{statsData.total} graphs</span>
              {Object.entries(statsData.by_category).map(([cat, cnt]) => (
                <span key={cat} className={`px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.Custom}`}>
                  {cat}: {cnt}
                </span>
              ))}
              <span className="text-gray-300">|</span>
              {Object.entries(statsData.by_type).map(([t, cnt]) => (
                <span key={t} className="text-gray-500">{CHART_TYPE_LABELS[t] || t}: {cnt}</span>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={savedSearch}
                onChange={e => setSavedSearch(e.target.value)}
                placeholder="Search saved graphs…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["All", "Sales", "Purchase", "Finance", "Inventory", "Custom"] as const).map(cat => (
                <button key={cat} onClick={() => setSavedCat(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    savedCat === cat ? "bg-forest-600 text-white border-forest-600" : "bg-white text-gray-600 border-gray-200 hover:border-forest-300"
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="ml-auto flex border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode("grid")}
                className={`p-2 ${viewMode === "grid" ? "bg-forest-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")}
                className={`p-2 ${viewMode === "list" ? "bg-forest-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {filteredSaved.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Save className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-base font-medium text-gray-500 mb-1">No saved graphs yet</p>
              <p className="text-sm text-gray-400 mb-5">Generate a chart and click Save to keep it here</p>
              <button onClick={() => setActiveTab("generate")}
                className="inline-flex items-center gap-2 text-sm text-forest-600 border border-forest-200 px-4 py-2 rounded-xl hover:bg-forest-50">
                <Plus className="w-4 h-4" /> Create your first graph
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSaved.map(g => (
                <SavedCard
                  key={g.name}
                  graph={g}
                  onOpen={handleOpenSaved}
                  onDelete={(name) => { setDeletingName(name); deleteMut.mutate(name) }}
                  onExportCSV={handleExportSavedCSV}
                  deleting={deletingName === g.name && deleteMut.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Title</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Category</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Type</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Created</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredSaved.map(g => (
                    <tr key={g.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{g.title}</p>
                        {g.query_text && <p className="text-xs text-gray-400 italic mt-0.5 truncate max-w-xs">"{g.query_text}"</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[g.category] || CATEGORY_COLORS.Custom}`}>
                          {g.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">{CHART_TYPE_LABELS[g.chart_type] || g.chart_type}</td>
                      <td className="px-3 py-3 text-xs text-gray-400">
                        {new Date(g.creation).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleOpenSaved(g)}
                            className="flex items-center gap-1 text-xs text-forest-600 hover:text-forest-800 px-2.5 py-1 border border-forest-200 rounded-lg hover:bg-forest-50 transition-colors">
                            <Eye className="w-3 h-3" /> Open
                          </button>
                          <button onClick={() => handleExportSavedCSV(g.name)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setDeletingName(g.name); deleteMut.mutate(g.name) }}
                            disabled={deletingName === g.name && deleteMut.isPending}
                            className="p-1.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-200 transition-colors">
                            {deletingName === g.name && deleteMut.isPending
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Opened saved graph overlay ── */}
      {openedGraph && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenedGraph(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{openedGraph.title}</h2>
              <button onClick={() => setOpenedGraph(null)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <ChartPanel
                chartData={openedGraph}
                onSave={handleSaveChart}
                isSaving={saveMut.isPending}
                savedName={null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
