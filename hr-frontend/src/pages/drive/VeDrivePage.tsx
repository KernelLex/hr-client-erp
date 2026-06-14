import { useState } from "react"
import { toast } from "sonner"
import { RefreshCw, ExternalLink, Check, Flag, X, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useDashboardStats,
  useDriveFiles,
  useSyncNow,
  useMarkReviewed,
  useFlagFile,
  useAnalyseFile,
  type DriveFile,
  type AnalysisResult,
} from "./useDrive"

const CATEGORIES = ["All", "Sales", "Purchase", "Accounts", "HR", "Logistics"] as const

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Sales:     { bg: "#dcfce7", text: "#166534" },
  Purchase:  { bg: "#fee2e2", text: "#991b1b" },
  Accounts:  { bg: "#ede9fe", text: "#5b21b6" },
  HR:        { bg: "#fef3c7", text: "#92400e" },
  Logistics: { bg: "#dbeafe", text: "#1e40af" },
  Other:     { bg: "#f3f4f6", text: "#374151" },
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  New:      { bg: "#dcfce7", text: "#166534" },
  Reviewed: { bg: "#f3f4f6", text: "#6b7280" },
  Flagged:  { bg: "#fee2e2", text: "#991b1b" },
}

const EMPLOYEES = [
  {
    name: "Maaz",
    category: "Sales",
    color: "#1D9E75",
    bg: "#f0fdf9",
    required: ["Quotation", "Sales Order", "Sales Invoice", "Receipt"],
  },
  {
    name: "Lookman",
    category: "Purchase",
    color: "#F97316",
    bg: "#fff7ed",
    required: ["Purchase Order", "Purchase Invoice", "GRN", "Transport Doc"],
  },
  {
    name: "Manjunath",
    category: "Accounts",
    color: "#8B5CF6",
    bg: "#f5f3ff",
    required: ["Trial Balance", "Profit & Loss", "Balance Sheet", "Ledger"],
  },
  {
    name: "Bhagya",
    category: "HR",
    color: "#F59E0B",
    bg: "#fffbeb",
    required: ["Attendance", "Payroll Summary", "Bank Reconciliation"],
  },
]

function Pill({
  label,
  bg,
  text,
}: {
  label: string
  bg: string
  text: string
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}

function FlagModal({
  file,
  onConfirm,
  onClose,
}: {
  file: DriveFile
  onConfirm: (notes: string) => void
  onClose: () => void
}) {
  const [notes, setNotes] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Flag File
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3 font-mono truncate">{file.file_name}</p>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          rows={3}
          placeholder="Add notes (optional)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white border-0"
            onClick={() => onConfirm(notes)}
          >
            <Flag size={13} className="mr-1" /> Flag
          </Button>
        </div>
      </div>
    </div>
  )
}

function AnalysisPanel({
  file,
  result,
  loading,
  onClose,
}: {
  file: DriveFile
  result: AnalysisResult | null
  loading: boolean
  onClose: () => void
}) {
  const aiPrompt = (action: string) => {
    const prompts: Record<string, string> = {
      summarise: `Summarise the document: ${file.file_name}`,
      anomalies: `Flag any financial anomalies or irregularities in: ${file.file_name}`,
      compare: `Compare ${file.file_name} with last month's equivalent document and highlight changes`,
    }
    window.open(
      `https://claude.ai/new?q=${encodeURIComponent(prompts[action])}`,
      "_blank"
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            File Analysis
          </p>
          <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate max-w-xs">
            {file.file_name}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {["summarise", "anomalies", "compare"].map((a) => (
            <button
              key={a}
              onClick={() => aiPrompt(a)}
              className="text-[11px] px-3 py-1.5 rounded-md border font-medium transition-colors"
              style={{
                borderColor: "#1D9E75",
                color: "#1D9E75",
                backgroundColor: "#f0fdf9",
              }}
            >
              {a === "summarise" && "✦ Summarise"}
              {a === "anomalies" && "⚠ Flag anomalies"}
              {a === "compare" && "⇌ Compare"}
            </button>
          ))}
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
          <RefreshCw size={14} className="animate-spin" />
          Loading file content…
        </div>
      )}

      {!loading && result?.type === "spreadsheet" && (
        <>
          <p className="text-[11px] text-gray-400 mb-2">
            Showing up to 30 rows (total: {result.total_rows})
          </p>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="min-w-full text-[11px]">
              <tbody>
                {result.rows?.map((row, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className="px-3 py-1.5 border-b border-gray-50 whitespace-nowrap text-gray-700"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && result?.type === "pdf" && (
        <>
          <p className="text-[11px] text-gray-400 mb-2">First 3 pages — text extract</p>
          <pre className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-[11px] max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-gray-700 leading-relaxed">
            {result.text || "(no text extracted)"}
          </pre>
        </>
      )}

      {!loading && result?.type === "unknown" && (
        <p className="text-sm text-gray-400 py-4">
          Preview not available for this file type.
        </p>
      )}
    </div>
  )
}

export function VeDrivePage() {
  const [category, setCategory] = useState("All")
  const [flagTarget, setFlagTarget] = useState<DriveFile | null>(null)
  const [analysisFile, setAnalysisFile] = useState<DriveFile | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: files = [], isLoading: filesLoading } = useDriveFiles(category)
  const syncNow = useSyncNow()
  const markReviewed = useMarkReviewed()
  const flagFile = useFlagFile()
  const analyseFile = useAnalyseFile()

  function handleSync() {
    syncNow.mutate(undefined, {
      onSuccess: () => toast.success("Drive synced successfully"),
      onError: () => toast.error("Sync failed — check error log"),
    })
  }

  function handleReviewed(f: DriveFile) {
    markReviewed.mutate(f.name, {
      onSuccess: () => toast.success("Marked as reviewed"),
    })
  }

  function handleFlag(f: DriveFile) {
    setFlagTarget(f)
  }

  function confirmFlag(notes: string) {
    if (!flagTarget) return
    flagFile.mutate(
      { docname: flagTarget.name, notes },
      {
        onSuccess: () => {
          toast.success("File flagged")
          setFlagTarget(null)
        },
      }
    )
  }

  function handleView(f: DriveFile) {
    if (f.drive_view_link) window.open(f.drive_view_link, "_blank")
    setAnalysisFile(f)
    setAnalysisResult(null)
    if (f.drive_file_id && f.file_extension) {
      analyseFile.mutate(
        { drive_file_id: f.drive_file_id, file_extension: f.file_extension },
        { onSuccess: setAnalysisResult }
      )
    }
  }

  // Build employee status data from loaded files
  const docTypesByCategory: Record<string, Set<string>> = {}
  const countByCategory: Record<string, number> = {}
  files.forEach((f) => {
    if (!docTypesByCategory[f.category]) docTypesByCategory[f.category] = new Set()
    if (f.doc_type) docTypesByCategory[f.category].add(f.doc_type)
    countByCategory[f.category] = (countByCategory[f.category] || 0) + 1
  })

  function formatLastSync(dt: string) {
    if (!dt || dt === "Never") return "Never"
    try {
      const d = new Date(dt.replace(" ", "T"))
      const diff = Math.floor((Date.now() - d.getTime()) / 60000)
      if (diff < 1) return "Just now"
      if (diff < 60) return `${diff}m ago`
      if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
      return `${Math.floor(diff / 1440)}d ago`
    } catch {
      return dt
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#1D9E75" }}
          >
            <FolderOpen size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Drive Dashboard
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Vera Enterprises — Google Drive &nbsp;·&nbsp; Last sync:{" "}
              {statsLoading ? "…" : formatLastSync(stats?.last_sync ?? "Never")}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncNow.isPending}
          className="text-white border-0 flex items-center gap-2"
          style={{ backgroundColor: "#1D9E75" }}
        >
          <RefreshCw size={14} className={syncNow.isPending ? "animate-spin" : ""} />
          {syncNow.isPending ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Files This Month", value: stats?.total ?? "—", accent: "#1D9E75" },
          { label: "Pending Review", value: stats?.pending ?? "—", accent: "#F59E0B" },
          { label: "Flagged", value: stats?.flagged ?? "—", accent: "#EF4444" },
          { label: "Last Sync", value: statsLoading ? "…" : formatLastSync(stats?.last_sync ?? "Never"), accent: "#6366F1" },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm"
            style={{ borderLeft: `3px solid ${c.accent}` }}
          >
            <p className="text-2xl font-bold" style={{ color: c.accent }}>
              {c.value}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap mb-5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className="px-4 py-1.5 rounded-full text-[13px] font-medium border-2 transition-all"
            style={{
              borderColor: category === cat ? "#1D9E75" : "#e5e7eb",
              backgroundColor: category === cat ? "#1D9E75" : "#fff",
              color: category === cat ? "#fff" : "#555",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Analysis panel */}
      {analysisFile && (
        <AnalysisPanel
          file={analysisFile}
          result={analysisResult}
          loading={analyseFile.isPending}
          onClose={() => { setAnalysisFile(null); setAnalysisResult(null) }}
        />
      )}

      {/* File Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        {filesLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No files found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-2 border-gray-100 bg-gray-50">
                  {["File Name", "Category", "Doc Type", "Party", "Date", "Status", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const catC = CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.Other
                  const stC = STATUS_COLORS[f.status] ?? STATUS_COLORS.New
                  return (
                    <tr
                      key={f.name}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[11px] max-w-[220px]">
                        <span
                          title={f.file_name}
                          className="block truncate text-gray-700"
                        >
                          {f.file_name.length > 38
                            ? f.file_name.slice(0, 38) + "…"
                            : f.file_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Pill label={f.category || "—"} {...catC} />
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {f.doc_type || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {f.party_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {f.file_date || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Pill label={f.status} {...stC} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleView(f)}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md text-white font-medium transition-opacity hover:opacity-90"
                            style={{ backgroundColor: "#1D9E75" }}
                          >
                            <ExternalLink size={11} /> View
                          </button>
                          {f.status !== "Reviewed" && (
                            <button
                              onClick={() => handleReviewed(f)}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition-colors"
                            >
                              <Check size={11} />
                            </button>
                          )}
                          {f.status !== "Flagged" && (
                            <button
                              onClick={() => handleFlag(f)}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border border-red-200 text-red-500 font-medium hover:bg-red-50 transition-colors"
                            >
                              <Flag size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Status Cards */}
      <div className="mb-2">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Employee Upload Status — June 2026
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {EMPLOYEES.map((emp) => {
            const count = countByCategory[emp.category] ?? 0
            const present = docTypesByCategory[emp.category] ?? new Set()
            const pct = Math.min(100, Math.round((count / 10) * 100))
            return (
              <div
                key={emp.name}
                className="rounded-xl p-4 border"
                style={{
                  backgroundColor: emp.bg,
                  borderColor: emp.color + "33",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>
                      {emp.name}
                    </p>
                    <p className="text-[11px] text-gray-400">{emp.category}</p>
                  </div>
                  <span
                    className="text-2xl font-bold"
                    style={{ color: emp.color }}
                  >
                    {count}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-200 rounded-full mb-3">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: emp.color }}
                  />
                </div>
                {/* Doc type checklist */}
                <div className="space-y-1">
                  {emp.required.map((t) => {
                    const ok = present.has(t)
                    return (
                      <div
                        key={t}
                        className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: ok ? "#1D9E75" : "#EF4444" }}
                      >
                        <span>{ok ? "✓" : "✗"}</span>
                        <span>{t}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Flag Modal */}
      {flagTarget && (
        <FlagModal
          file={flagTarget}
          onConfirm={confirmFlag}
          onClose={() => setFlagTarget(null)}
        />
      )}
    </div>
  )
}
