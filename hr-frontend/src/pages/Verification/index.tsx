import { useState, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  getAllExtractedRecords,
  resetAutoVerified,
  autoVerifyAll,
  getVerificationDetail,
  quickAction,
  getAccuracyStats,
  ExtractedRecord,
} from "../../api/ai"

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = "all" | "auto" | "review"

interface FieldComp {
  field: string
  label: string
  current_value: unknown
  original_value: unknown
  confidence: number
  was_changed: boolean
  confidence_label: "High" | "Medium" | "Low"
  confidence_color: "green" | "yellow" | "red"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const confidenceColor = (score: number) =>
  score >= 70
    ? "text-green-700 bg-green-50 border-green-200"
    : score >= 40
    ? "text-yellow-700 bg-yellow-50 border-yellow-200"
    : "text-red-700 bg-red-50 border-red-200"

const statusColor = (status: string) =>
  ({
    Verified: "bg-green-100 text-green-800",
    Corrected: "bg-blue-100 text-blue-800",
    "Needs Review": "bg-yellow-100 text-yellow-800",
    Unverified: "bg-gray-100 text-gray-600",
  }[status] ?? "bg-gray-100 text-gray-600")

const prioritySort = (a: ExtractedRecord, b: ExtractedRecord) => {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
  if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority]
  return a.confidence_score - b.confidence_score
}

// ── Stats Strip ───────────────────────────────────────────────────────────────

function StatsStrip({
  stats,
}: {
  stats: {
    total: number
    verified: number
    corrected: number
    needs_review: number
    unverified: number
    avg_confidence: number
  }
}) {
  const cards = [
    { label: "Total Records", value: stats.total, color: "text-indigo-600" },
    { label: "Verified", value: stats.verified + stats.corrected, color: "text-green-600" },
    { label: "Needs Review", value: stats.needs_review, color: "text-yellow-600" },
    { label: "Unverified", value: stats.unverified, color: "text-gray-600" },
    {
      label: "Avg Confidence",
      value: `${stats.avg_confidence}%`,
      color:
        stats.avg_confidence >= 70
          ? "text-green-600"
          : stats.avg_confidence >= 40
          ? "text-yellow-600"
          : "text-red-600",
    },
  ]
  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl p-4 border shadow-sm text-center">
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Detail Panel (Side-by-Side) ───────────────────────────────────────────────

function DetailPanel({
  doctype,
  docname,
  onClose,
  onVerified,
}: {
  doctype: string
  docname: string
  onClose: () => void
  onVerified: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [sourceTab, setSourceTab] = useState<"source" | "raw" | "history">("source")
  const [searchQuery, setSearchQuery] = useState("")
  const [saving, setSaving] = useState(false)

  const { data: detail, isLoading } = useQuery({
    queryKey: ["verify-detail", doctype, docname],
    queryFn: () => getVerificationDetail(doctype, docname),
    staleTime: 0,
  })

  const qc = useQueryClient()

  const handleSave = async () => {
    setSaving(true)
    try {
      const hasEdits = Object.keys(edits).length > 0
      await quickAction(
        doctype,
        docname,
        hasEdits ? "correct" : "approve",
        hasEdits ? (edits as Record<string, unknown>) : undefined,
      )
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
      qc.invalidateQueries({ queryKey: ["accuracy-stats"] })
      onVerified()
    } finally {
      setSaving(false)
    }
  }

  const sourceText = detail?.source_content || ""
  const displayText = searchQuery && searchQuery.length >= 2
    ? sourceText.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")).map((part) =>
        part.toLowerCase() === searchQuery.toLowerCase()
          ? `[${part}]`
          : part
      ).join("")
    : sourceText

  const extractionHistory: Array<{
    attempt: number
    timestamp: string
    confidence: number
    method: string
    quality: number
  }> = (() => {
    try {
      return JSON.parse(
        ((detail?.record as Record<string, unknown>)?.extraction_history as string) || "[]",
      )
    } catch {
      return []
    }
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={onClose}>
      <div
        className="ml-auto w-full max-w-5xl bg-white flex flex-col h-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-800">{doctype}</span>
              <span className="text-gray-500 font-mono text-sm">{docname}</span>
              {detail && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(detail.verification_status)}`}
                >
                  {detail.verification_status}
                </span>
              )}
            </div>
            {detail && (
              <div className="text-xs text-gray-500 mt-1">
                Confidence: <span className="font-semibold">{detail.overall_confidence}%</span>
                {" · "}Attempt #{((detail.record as Record<string, unknown>)?.extraction_attempts as number) || 1}
                {(detail.record as Record<string, unknown>)?.manual_review_required
                  ? " · ⚠ Manual Review Required"
                  : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>
        ) : detail ? (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* LEFT: Extracted Fields */}
            <div className="w-1/2 flex flex-col border-r overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
                <span className="text-sm font-semibold text-gray-700">Extracted Fields</span>
                <button
                  onClick={() => {
                    setEditMode(!editMode)
                    if (editMode) setEdits({})
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${
                    editMode
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {editMode ? "Cancel Edits" : "Edit All Fields"}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {detail.field_comparison.map((fc: FieldComp) => (
                  <div
                    key={fc.field}
                    className={`rounded-lg border p-3 ${
                      fc.confidence_color === "red"
                        ? "border-red-200 bg-red-50/30"
                        : fc.confidence_color === "yellow"
                        ? "border-yellow-200 bg-yellow-50/30"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600">{fc.label}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                          fc.confidence_color === "green"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : fc.confidence_color === "yellow"
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {fc.confidence}% {fc.confidence_label}
                      </span>
                    </div>
                    {editMode ? (
                      <input
                        className="w-full text-sm border rounded px-2 py-1 bg-white"
                        value={
                          edits[fc.field] !== undefined
                            ? edits[fc.field]
                            : String(fc.current_value ?? "")
                        }
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [fc.field]: e.target.value }))
                        }
                      />
                    ) : (
                      <div className="text-sm text-gray-900 font-medium">
                        {String(fc.current_value ?? "—")}
                      </div>
                    )}
                    {fc.was_changed && (
                      <div className="text-xs text-orange-600 mt-1">
                        Original: {String(fc.original_value ?? "—")}
                      </div>
                    )}
                    {!editMode &&
                      fc.confidence_color !== "green" &&
                      fc.original_value !== null &&
                      fc.original_value !== undefined &&
                      String(fc.original_value) !== String(fc.current_value) && (
                        <button
                          className="mt-1 text-xs text-indigo-600 hover:underline"
                          onClick={() =>
                            setEdits((prev) => ({
                              ...prev,
                              [fc.field]: String(fc.original_value ?? ""),
                            }))
                          }
                        >
                          ← Apply original: {String(fc.original_value ?? "")}
                        </button>
                      )}
                  </div>
                ))}
              </div>
              {/* Action bar */}
              <div className="px-4 py-3 border-t bg-gray-50 flex gap-2 shrink-0">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : Object.keys(edits).length > 0
                    ? "✓ Save Corrections"
                    : "✓ Approve As-Is"}
                </button>
                <button
                  onClick={async () => {
                    await quickAction(doctype, docname, "reject")
                    qc.invalidateQueries({ queryKey: ["all-extracted"] })
                    onVerified()
                  }}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
                >
                  Reject & Re-extract
                </button>
              </div>
            </div>

            {/* RIGHT: Source Document */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-white shrink-0 flex-wrap">
                {(["source", "raw", "history"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSourceTab(tab)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                      sourceTab === tab
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {tab === "source" ? "Source Text" : tab === "raw" ? "Raw Data" : "History"}
                  </button>
                ))}
                {sourceTab === "source" && (
                  <input
                    className="ml-auto text-xs border rounded px-2 py-1 w-28"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {sourceTab === "source" && (
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                    {displayText || "No source text available"}
                  </pre>
                )}
                {sourceTab === "raw" && (
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
                    {JSON.stringify(detail.record, null, 2)}
                  </pre>
                )}
                {sourceTab === "history" && (
                  <div className="space-y-3">
                    {extractionHistory.length === 0 ? (
                      <div className="text-gray-400 text-sm">No extraction history</div>
                    ) : (
                      extractionHistory.map((h, i) => (
                        <div key={i} className="border rounded-lg p-3 bg-gray-50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">Attempt #{h.attempt}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                h.confidence >= 70
                                  ? "bg-green-100 text-green-700"
                                  : h.confidence >= 40
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {h.confidence}%
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(h.timestamp).toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Method: {h.method} · Quality: {h.quality}%
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              {detail.drive_file && (
                <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 shrink-0">
                  <span>📄 {detail.drive_file.file_name}</span>
                  {detail.drive_file.drive_view_link && (
                    <a
                      href={detail.drive_file.drive_view_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-indigo-600 hover:underline"
                    >
                      Open in Drive ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Failed to load details
          </div>
        )}
      </div>
    </div>
  )
}

// ── All Records Mode ──────────────────────────────────────────────────────────

function AllRecordsMode({
  records,
  statusFilter,
  setStatusFilter,
  doctypeFilter,
  setDoctypeFilter,
  onView,
}: {
  records: ExtractedRecord[]
  statusFilter: string
  setStatusFilter: (v: string) => void
  doctypeFilter: string
  setDoctypeFilter: (v: string) => void
  onView: (r: ExtractedRecord) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const allDoctypes = [...new Set(records.map((r) => r.doctype))].sort()

  const filtered = records.filter((r) => {
    if (statusFilter && r.verification_status !== statusFilter) return false
    if (doctypeFilter && r.doctype !== doctypeFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        (r.party || "").toLowerCase().includes(q) ||
        r.docname.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
          placeholder="Search party name or record ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="Unverified">Unverified</option>
          <option value="Needs Review">Needs Review</option>
          <option value="Verified">Verified</option>
          <option value="Corrected">Corrected</option>
        </select>
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
          value={doctypeFilter}
          onChange={(e) => setDoctypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {allDoctypes.map((dt) => (
            <option key={dt} value={dt}>
              {dt.replace("VE ", "")}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600 text-xs">#</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs">DocType</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs">Record</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs">Party</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs text-center">Conf.</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs text-center">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs text-center">Tries</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-xs"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    No records match filters
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr
                    key={r.docname}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${
                      r.manual_review_required ? "bg-orange-50/40" : ""
                    }`}
                    onClick={() => onView(r)}
                  >
                    <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                        {r.doctype.replace("VE ", "")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.docname}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{r.party || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {r.amount ? `₹${r.amount.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.date || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confidenceColor(r.confidence_score)}`}
                      >
                        {r.confidence_score}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(r.verification_status)}`}
                      >
                        {r.verification_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                      {r.extraction_attempts || 1}
                      {r.manual_review_required && (
                        <span className="ml-1 text-orange-500">⚠</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          onView(r)
                        }}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t">
          Showing {filtered.length} of {records.length} records
        </div>
      </div>
    </div>
  )
}

// ── Auto-Verify Mode ──────────────────────────────────────────────────────────

function AutoVerifyMode({ onDone }: { onDone: (needsReview: number) => void }) {
  const [threshold, setThreshold] = useState(75)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    autoVerified: number
    needsReview: number
  } | null>(null)
  const qc = useQueryClient()

  const handleRun = async () => {
    setRunning(true)
    try {
      await resetAutoVerified()
      const res = await autoVerifyAll(threshold)
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
      qc.invalidateQueries({ queryKey: ["accuracy-stats"] })
      setResult({ autoVerified: res.auto_verified, needsReview: res.needs_review })
    } finally {
      setRunning(false)
    }
  }

  if (result) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">🤖</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Auto-Verify Complete</h2>
        <p className="text-gray-500 mb-8">
          AI processed all unverified records at {threshold}% threshold
        </p>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-3xl font-bold text-green-600">{result.autoVerified}</div>
            <div className="text-sm text-green-700 mt-1">Auto-verified ✓</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="text-3xl font-bold text-yellow-600">{result.needsReview}</div>
            <div className="text-sm text-yellow-700 mt-1">Need Review →</div>
          </div>
        </div>
        {result.needsReview > 0 && (
          <button
            onClick={() => onDone(result.needsReview)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700"
          >
            Review {result.needsReview} Records →
          </button>
        )}
        <button
          onClick={() => setResult(null)}
          className="ml-3 text-gray-500 hover:underline text-sm"
        >
          Run again
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-white rounded-2xl border shadow-sm p-8">
        <div className="text-4xl mb-4 text-center">🤖</div>
        <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Auto-Verify Records</h2>
        <p className="text-gray-500 text-sm text-center mb-8">
          AI will verify records meeting the confidence threshold. Previous AI verifications are
          reset first so all records are re-evaluated.
        </p>

        <div className="mb-6">
          <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-3">
            <span>Confidence Threshold</span>
            <span className="text-indigo-600 font-bold">{threshold}%</span>
          </label>
          <input
            type="range"
            min={50}
            max={95}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>50% (permissive)</span>
            <span>95% (strict)</span>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-xl p-4 mb-6 text-sm text-indigo-700">
          Records with ≥{threshold}% confidence → <strong>Auto-verified</strong>
          <br />
          Records below {threshold}% → <strong>Flagged for review</strong>
        </div>

        <button
          onClick={handleRun}
          disabled={running}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {running ? "Running..." : "Run Auto-Verify"}
        </button>
      </div>
    </div>
  )
}

// ── Swipe Card (Review Mode) ──────────────────────────────────────────────────

function SwipeCard({
  record,
  onAction,
  isProcessing,
}: {
  record: ExtractedRecord
  onAction: (
    action: "approve" | "reject" | "correct" | "skip",
    edits?: Record<string, string>,
  ) => void
  isProcessing: boolean
}) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [showSource, setShowSource] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ["verify-detail", record.doctype, record.docname],
    queryFn: () => getVerificationDetail(record.doctype, record.docname),
    staleTime: 30_000,
  })

  const problemFields = (detail?.field_comparison ?? []).filter(
    (fc: FieldComp) => fc.confidence < 60,
  )
  const goodFields = (detail?.field_comparison ?? []).filter((fc: FieldComp) => fc.confidence >= 60)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (e.key === "a" || e.key === "A") onAction("approve")
      if (e.key === "f" || e.key === "F") onAction("correct", edits)
      if (e.key === "r" || e.key === "R") onAction("reject")
      if (e.key === "s" || e.key === "S") onAction("skip")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [edits, onAction])

  return (
    <div className="bg-white rounded-2xl border shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <span className="font-bold text-gray-800">{record.doctype.replace("VE ", "")}</span>
          <span className="text-gray-400 text-sm ml-2">{record.docname}</span>
          {record.manual_review_required && (
            <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              ⚠ Manual Required
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold px-3 py-1 rounded-full border ${confidenceColor(record.confidence_score)}`}
          >
            {record.confidence_score}%
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(record.verification_status)}`}
          >
            {record.verification_status}
          </span>
        </div>
      </div>

      <div className="p-6">
        {problemFields.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-red-700 mb-3">⚠ Low Confidence Fields</h4>
            <div className="space-y-2">
              {problemFields.map((fc: FieldComp) => (
                <div
                  key={fc.field}
                  className="flex items-center gap-3 p-3 rounded-lg border border-red-100 bg-red-50/30"
                >
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">{fc.label}</div>
                    <input
                      className="text-sm border rounded px-2 py-1 w-full mt-1 bg-white"
                      value={
                        edits[fc.field] !== undefined
                          ? edits[fc.field]
                          : String(fc.current_value ?? "")
                      }
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [fc.field]: e.target.value }))
                      }
                    />
                  </div>
                  <span className="text-xs text-red-500 shrink-0">{fc.confidence}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {goodFields.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-600 mb-2">✓ Good Fields</h4>
            <div className="grid grid-cols-2 gap-2">
              {goodFields.slice(0, 6).map((fc: FieldComp) => (
                <div key={fc.field} className="p-2 rounded-lg border border-green-100 bg-green-50/30">
                  <div className="text-xs text-gray-500">{fc.label}</div>
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {String(fc.current_value ?? "—")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail?.source_content && (
          <div className="mb-2">
            <button
              onClick={() => setShowSource(!showSource)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {showSource ? "▼" : "▶"} Source Document
            </button>
            {showSource && (
              <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-3 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                {detail.source_content.slice(0, 800)}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="px-6 pb-5 grid grid-cols-4 gap-2 text-sm">
        <button
          onClick={() => onAction("approve")}
          disabled={isProcessing}
          className="py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 text-center"
        >
          <div>✓ Approve</div>
          <div className="text-xs opacity-75">[A]</div>
        </button>
        <button
          onClick={() => onAction("correct", edits)}
          disabled={isProcessing}
          className="py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 text-center"
        >
          <div>✏ Fix & OK</div>
          <div className="text-xs opacity-75">[F]</div>
        </button>
        <button
          onClick={() => onAction("reject")}
          disabled={isProcessing}
          className="py-2 border border-red-300 text-red-600 rounded-xl font-medium hover:bg-red-50 disabled:opacity-50 text-center"
        >
          <div>✗ Reject</div>
          <div className="text-xs opacity-75">[R]</div>
        </button>
        <button
          onClick={() => onAction("skip")}
          disabled={isProcessing}
          className="py-2 border border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50 text-center"
        >
          <div>→ Skip</div>
          <div className="text-xs opacity-75">[S]</div>
        </button>
      </div>
    </div>
  )
}

// ── Review Mode ───────────────────────────────────────────────────────────────

function ReviewMode({ allRecords }: { allRecords: ExtractedRecord[] }) {
  const qc = useQueryClient()
  const [idx, setIdx] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [summary, setSummary] = useState({
    approved: 0,
    corrected: 0,
    rejected: 0,
    skipped: 0,
  })

  const reviewRecords = [...allRecords]
    .filter(
      (r) => r.verification_status !== "Verified" && r.verification_status !== "Corrected",
    )
    .sort(prioritySort)

  const current = reviewRecords[idx]
  const progress =
    reviewRecords.length > 0 ? Math.round((idx / reviewRecords.length) * 100) : 0

  const handleAction = useCallback(
    async (
      action: "approve" | "reject" | "correct" | "skip",
      edits?: Record<string, string>,
    ) => {
      if (!current || isProcessing) return
      setIsProcessing(true)
      try {
        const hasEdits = edits && Object.keys(edits).length > 0
        const actualAction =
          action === "correct" && !hasEdits ? "approve" : action
        await quickAction(
          current.doctype,
          current.docname,
          actualAction,
          hasEdits ? (edits as Record<string, unknown>) : undefined,
        )
        setSummary((prev) => {
          const key =
            actualAction === "approve"
              ? "approved"
              : actualAction === "correct"
              ? "corrected"
              : actualAction === "reject"
              ? "rejected"
              : "skipped"
          return { ...prev, [key]: prev[key] + 1 }
        })
        setIdx((i) => i + 1)
        qc.invalidateQueries({ queryKey: ["all-extracted"] })
      } finally {
        setIsProcessing(false)
      }
    },
    [current, isProcessing, qc],
  )

  if (reviewRecords.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">All Caught Up!</h2>
        <p className="text-gray-500">
          No records need review. Run Auto-Verify to process new extractions.
        </p>
      </div>
    )
  }

  if (idx >= reviewRecords.length) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Review Complete!</h2>
        <p className="text-gray-500 mb-6">All records have been processed.</p>
        <div className="flex justify-center gap-6 text-sm">
          {[
            { label: "Approved", val: summary.approved, color: "text-green-600" },
            { label: "Corrected", val: summary.corrected, color: "text-blue-600" },
            { label: "Rejected", val: summary.rejected, color: "text-red-600" },
            { label: "Skipped", val: summary.skipped, color: "text-gray-500" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
        <span>
          Record {idx + 1} of {reviewRecords.length}
        </span>
        <span className="text-xs text-gray-400">
          A=Approve · F=Fix&amp;Approve · R=Reject · S=Skip
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-5">
        <div
          className="bg-indigo-500 h-2 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <SwipeCard
        key={`${current.doctype}-${current.docname}`}
        record={current}
        onAction={handleAction}
        isProcessing={isProcessing}
      />
    </div>
  )
}

// ── Accuracy Table ────────────────────────────────────────────────────────────

function AccuracyTable() {
  const { data } = useQuery({
    queryKey: ["accuracy-stats"],
    queryFn: getAccuracyStats,
    staleTime: 60_000,
  })
  if (!data?.success || !data.by_doctype?.length) return null

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden mt-6">
      <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
        Verification by DocType
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            <th className="px-4 py-2 text-xs font-medium text-gray-500">DocType</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Total</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Verified</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Corrected</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Avg Conf.</th>
            <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.by_doctype.map((row) => (
            <tr key={row.doctype} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2 text-xs text-gray-700">
                {row.doctype.replace("VE ", "")}
              </td>
              <td className="px-4 py-2 text-right text-gray-600">{row.total}</td>
              <td className="px-4 py-2 text-right text-green-600">{row.verified}</td>
              <td className="px-4 py-2 text-right text-blue-600">{row.corrected}</td>
              <td className="px-4 py-2 text-right">
                <span
                  className={`text-xs font-medium ${
                    row.avg_confidence >= 70
                      ? "text-green-600"
                      : row.avg_confidence >= 40
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {Math.round(row.avg_confidence)}%
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full"
                      style={{ width: `${row.verification_rate}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.round(row.verification_rate)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VerificationPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>("all")
  const [statusFilter, setStatusFilter] = useState("")
  const [doctypeFilter, setDoctypeFilter] = useState("")
  const [detailRecord, setDetailRecord] = useState<{
    doctype: string
    docname: string
  } | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["all-extracted", statusFilter, doctypeFilter],
    queryFn: () =>
      getAllExtractedRecords(statusFilter || undefined, doctypeFilter || undefined),
    staleTime: 0,
    refetchOnMount: "always",
  })

  const records = data?.records ?? []
  const stats = data?.stats ?? {
    total: 0,
    verified: 0,
    corrected: 0,
    needs_review: 0,
    unverified: 0,
    manual_required: 0,
    avg_confidence: 0,
  }

  const modes: { key: Mode; label: string; icon: string }[] = [
    { key: "all", label: "All Records", icon: "📋" },
    { key: "auto", label: "Auto-Verify", icon: "🤖" },
    { key: "review", label: "Review Mode", icon: "👆" },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Verification</h1>
          <p className="text-gray-500 text-sm mt-1">
            Review and verify AI-extracted document data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border rounded-lg"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => navigate("/business")}
            className="text-sm text-indigo-600 hover:underline"
          >
            Business Dashboard →
          </button>
        </div>
      </div>

      {!isLoading && <StatsStrip stats={stats} />}

      {!isLoading && stats.manual_required > 0 && (
        <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700 flex items-center gap-2">
          <span>⚠</span>
          <span>
            {stats.manual_required} record(s) require manual review — AI extraction failed
            after 3 attempts
          </span>
          <button
            onClick={() => setMode("review")}
            className="ml-auto text-orange-600 font-medium hover:underline"
          >
            Review Now →
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              mode === m.key
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
            {m.key === "review" && stats.needs_review > 0 && (
              <span className="bg-yellow-400 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {stats.needs_review}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading records...</div>
      ) : mode === "all" ? (
        <>
          <AllRecordsMode
            records={records}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            doctypeFilter={doctypeFilter}
            setDoctypeFilter={setDoctypeFilter}
            onView={(r) =>
              setDetailRecord({ doctype: r.doctype, docname: r.docname })
            }
          />
          <AccuracyTable />
        </>
      ) : mode === "auto" ? (
        <AutoVerifyMode
          onDone={(_n) => {
            setMode("review")
            refetch()
          }}
        />
      ) : (
        <ReviewMode allRecords={records} />
      )}

      {detailRecord && (
        <DetailPanel
          doctype={detailRecord.doctype}
          docname={detailRecord.docname}
          onClose={() => setDetailRecord(null)}
          onVerified={() => {
            setDetailRecord(null)
            qc.invalidateQueries({ queryKey: ["all-extracted"] })
          }}
        />
      )}
    </div>
  )
}
