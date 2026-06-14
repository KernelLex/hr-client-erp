import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { RefreshCw, ExternalLink, Check, Flag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getDriveStats,
  getDriveFiles,
  syncDrive,
  markReviewed,
  flagFile,
  analyseFile,
  type DriveFile,
  type AnalysisResult,
} from "@/api/accounts"

const CATEGORIES = ["All", "Sales", "Purchase", "Accounts", "HR", "Logistics"] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  Sales:     { bg: "#dcfce7", text: "#166534" },
  Purchase:  { bg: "#fee2e2", text: "#991b1b" },
  Accounts:  { bg: "#ede9fe", text: "#5b21b6" },
  HR:        { bg: "#fef3c7", text: "#92400e" },
  Logistics: { bg: "#dbeafe", text: "#1e40af" },
  Other:     { bg: "#f3f4f6", text: "#374151" },
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  New:      { bg: "#dcfce7", text: "#166534" },
  Reviewed: { bg: "#f3f4f6", text: "#6b7280" },
  Flagged:  { bg: "#fee2e2", text: "#991b1b" },
}

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent: string
}) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-col gap-1"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <span className="text-2xl font-bold" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  )
}

const METHOD_CONFIG: Record<string, { dot: string; label: string; tip: string }> = {
  drive_api:         { dot: "#16a34a", label: "●", tip: "Confirmed by Google Drive" },
  last_modifier:     { dot: "#2563eb", label: "●", tip: "Detected from last edit" },
  folder_path:       { dot: "#94a3b8", label: "~", tip: "Estimated from folder location" },
  drive_api_unknown: { dot: "#f97316", label: "⚠", tip: "Not a Vera Enterprises account" },
}

function UploaderBadge({ name, method }: { name?: string; method?: string }) {
  if (!name || name === "Unknown") {
    return (
      <span title="Could not detect uploader" className="text-[11px] text-red-400 flex items-center gap-1">
        <span>⚠</span> Unknown
      </span>
    )
  }
  const cfg = method ? METHOD_CONFIG[method] : null
  return (
    <span
      className="flex items-center gap-1 text-[11px]"
      title={cfg?.tip ?? ""}
      style={{ color: "var(--text-primary)" }}
    >
      {cfg && <span style={{ color: cfg.dot, fontSize: "10px" }}>{cfg.label}</span>}
      {name}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: i === 0 ? "70%" : "60%" }} />
        </td>
      ))}
    </tr>
  )
}

function FlagModal({
  file,
  onConfirm,
  onClose,
  loading,
}: {
  file: DriveFile
  onConfirm: (notes: string) => void
  onClose: () => void
  loading: boolean
}) {
  const [notes, setNotes] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[15px]" style={{ color: "var(--text-primary)" }}>
            Flag Document
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X size={14} className="text-gray-400" />
          </button>
        </div>
        <p
          className="text-[11px] font-mono bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate"
          style={{ color: "var(--text-secondary)" }}
          title={file.file_name}
        >
          {file.file_name}
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Reason for flagging <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-xs resize-none focus:outline-none focus:ring-2 transition-shadow"
          style={{ focusRingColor: "#1D9E75" } as React.CSSProperties}
          rows={3}
          placeholder="Describe the issue with this document…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!notes.trim() || loading}
            onClick={() => onConfirm(notes.trim())}
            className="text-white border-0 flex items-center gap-1.5"
            style={{ backgroundColor: notes.trim() && !loading ? "#EF4444" : "#fca5a5" }}
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Flag size={12} />}
            Flag Document
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
  const aiPrompts: Record<string, string> = {
    summarise: `Summarise this file: ${file.file_name}`,
    anomalies: `Flag anomalies in this file: ${file.file_name}`,
    compare: `Compare with last month: ${file.file_name}`,
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            File Analysis
          </p>
          <p
            className="text-[11px] text-gray-400 font-mono mt-0.5 truncate"
            title={file.file_name}
          >
            {file.file_name}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {Object.entries(aiPrompts).map(([key, prompt]) => (
            <button
              key={key}
              onClick={() =>
                window.open(
                  `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
                  "_blank"
                )
              }
              className="text-[11px] px-3 py-1.5 rounded-lg border font-medium transition-colors hover:bg-[#f0fdf9]"
              style={{ borderColor: "#1D9E75", color: "#1D9E75" }}
            >
              {key === "summarise" && "✦ Summarise"}
              {key === "anomalies" && "⚠ Flag anomalies"}
              {key === "compare" && "⇌ Compare"}
            </button>
          ))}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X size={13} className="text-gray-400" />
          </button>
        </div>
      </div>

      {/* Panel body */}
      <div className="px-5 py-4">
        {loading && (
          <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
            <RefreshCw size={14} className="animate-spin" />
            Loading file content…
          </div>
        )}

        {!loading && result?.type === "spreadsheet" && (
          <>
            <p className="text-[11px] text-gray-400 mb-2">
              Showing up to 30 rows · total {result.total_rows} rows
            </p>
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="min-w-full text-[11px]">
                <tbody>
                  {result.rows?.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
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
            <p className="text-[11px] text-gray-400 mb-2">
              Extracted text · first 3 pages
            </p>
            <pre className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-[11px] max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-gray-700 leading-relaxed font-mono">
              {result.text || "(no text could be extracted from this PDF)"}
            </pre>
          </>
        )}

        {!loading && result?.type === "unknown" && (
          <p className="text-sm text-gray-400 py-4">
            Preview not available for this file type.
          </p>
        )}

        {!loading && !result && !loading && (
          <p className="text-sm text-gray-400 py-4">
            Could not load file analysis.
          </p>
        )}
      </div>
    </div>
  )
}

function formatLastSync(dt: string): string {
  if (!dt || dt === "Never") return "Never"
  try {
    const d = new Date(dt.replace(" ", "T"))
    const diff = Math.floor((Date.now() - d.getTime()) / 60000)
    if (diff < 1) return "Just now"
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  } catch {
    return dt
  }
}

export function DriveDocumentsTab() {
  const qc = useQueryClient()
  const [category, setCategory] = useState<Category>("All")
  const [flagTarget, setFlagTarget] = useState<DriveFile | null>(null)
  const [analysisFile, setAnalysisFile] = useState<DriveFile | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)

  // Stats — auto refresh every 5 minutes
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["drive_stats"],
    queryFn: getDriveStats,
    refetchInterval: 1000 * 60 * 5,
  })

  // Files
  const { data: files, isLoading: filesLoading, isError: filesError } = useQuery({
    queryKey: ["drive_files", category],
    queryFn: () => getDriveFiles(category),
  })

  // Mutations
  const syncMutation = useMutation({
    mutationFn: syncDrive,
    onSuccess: () => {
      toast.success("Sync complete")
      qc.invalidateQueries({ queryKey: ["drive_files"] })
      qc.invalidateQueries({ queryKey: ["drive_stats"] })
    },
    onError: () => toast.error("Sync failed — check connection"),
  })

  const reviewedMutation = useMutation({
    mutationFn: (docname: string) => markReviewed(docname),
    onSuccess: () => {
      toast.success("Marked as reviewed")
      qc.invalidateQueries({ queryKey: ["drive_files"] })
      qc.invalidateQueries({ queryKey: ["drive_stats"] })
    },
  })

  const flagMutation = useMutation({
    mutationFn: ({ docname, notes }: { docname: string; notes: string }) =>
      flagFile(docname, notes),
    onSuccess: () => {
      toast.success("Document flagged")
      setFlagTarget(null)
      qc.invalidateQueries({ queryKey: ["drive_files"] })
      qc.invalidateQueries({ queryKey: ["drive_stats"] })
    },
  })

  const analyseMutation = useMutation({
    mutationFn: ({ id, ext }: { id: string; ext: string }) =>
      analyseFile(id, ext),
    onSuccess: setAnalysisResult,
    onError: () => setAnalysisResult({ type: "unknown" }),
  })

  function handleView(f: DriveFile) {
    if (f.drive_view_link) window.open(f.drive_view_link, "_blank")
    setAnalysisFile(f)
    setAnalysisResult(null)
    if (f.drive_file_id && f.file_extension) {
      analyseMutation.mutate({ id: f.drive_file_id, ext: f.file_extension })
    }
    // Scroll into view after render
    setTimeout(() => {
      document.getElementById("analysis-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Vera Enterprises — Documents
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Last sync:{" "}
            {statsLoading ? "…" : formatLastSync(stats?.last_sync ?? "Never")}
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="text-white border-0 flex items-center gap-2 text-sm"
          style={{ backgroundColor: "#1D9E75" }}
        >
          <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
          {syncMutation.isPending ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Files This Month"
          value={statsLoading ? "…" : (stats?.total ?? 0)}
          accent="#1D9E75"
        />
        <StatCard
          label="Pending Review"
          value={statsLoading ? "…" : (stats?.pending ?? 0)}
          accent="#F59E0B"
        />
        <StatCard
          label="Flagged Files"
          value={statsLoading ? "…" : (stats?.flagged ?? 0)}
          accent="#EF4444"
        />
        <StatCard
          label="Last Sync"
          value={statsLoading ? "…" : formatLastSync(stats?.last_sync ?? "Never")}
          accent="#6366F1"
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setCategory(cat)
              setAnalysisFile(null)
              setAnalysisResult(null)
            }}
            className="px-4 py-1.5 rounded-full text-[13px] font-medium border-2 transition-all whitespace-nowrap shrink-0"
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

      {/* File table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filesError ? (
          <div className="py-12 text-center">
            <p className="text-sm text-red-400 font-medium">Could not load documents — check connection</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-2 border-gray-100 bg-gray-50">
                  {["File Name", "Category", "Doc Type", "Party", "Date", "Uploaded By", "Status", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filesLoading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  : !files?.length
                  ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                        No documents found for this category
                      </td>
                    </tr>
                  )
                  : files.map((f) => {
                      const catStyle = CATEGORY_STYLE[f.category] ?? CATEGORY_STYLE.Other
                      const stStyle = STATUS_STYLE[f.status] ?? STATUS_STYLE.New
                      return (
                        <tr
                          key={f.name}
                          className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                        >
                          <td className="px-4 py-3 max-w-[200px]">
                            <span
                              className="block truncate font-mono text-[11px] text-gray-700"
                              title={f.file_name}
                            >
                              {f.file_name.length > 40
                                ? f.file_name.slice(0, 40) + "…"
                                : f.file_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge label={f.category || "—"} {...catStyle} />
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-[12px]">
                            {f.doc_type || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-[12px]">
                            {f.party_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-[12px]">
                            {f.file_date || "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <UploaderBadge
                              name={f.uploaded_by_name}
                              method={f.upload_detected_method}
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge label={f.status} {...stStyle} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleView(f)}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg text-white font-medium transition-opacity hover:opacity-90"
                                style={{ backgroundColor: "#1D9E75" }}
                                title="Open in Drive + analyse"
                              >
                                <ExternalLink size={11} />
                                View
                              </button>
                              {f.status !== "Reviewed" && (
                                <button
                                  onClick={() => reviewedMutation.mutate(f.name)}
                                  disabled={reviewedMutation.isPending}
                                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                  title="Mark as reviewed"
                                >
                                  <Check size={13} />
                                </button>
                              )}
                              {f.status !== "Flagged" && (
                                <button
                                  onClick={() => setFlagTarget(f)}
                                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors"
                                  title="Flag this document"
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

      {/* Analysis panel — below table */}
      {analysisFile && (
        <div id="analysis-panel">
          <AnalysisPanel
            file={analysisFile}
            result={analysisResult}
            loading={analyseMutation.isPending}
            onClose={() => {
              setAnalysisFile(null)
              setAnalysisResult(null)
            }}
          />
        </div>
      )}

      {/* Flag modal */}
      {flagTarget && (
        <FlagModal
          file={flagTarget}
          loading={flagMutation.isPending}
          onConfirm={(notes) =>
            flagMutation.mutate({ docname: flagTarget.name, notes })
          }
          onClose={() => setFlagTarget(null)}
        />
      )}
    </div>
  )
}
