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

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") {
    if (v === 0) return "0"
    if (Math.abs(v) > 100) return `₹${v.toLocaleString("en-IN")}`
    return String(v)
  }
  return String(v)
}

const confColor = (score: number) =>
  score >= 70 ? "text-green-700 bg-green-50 border-green-200"
    : score >= 40 ? "text-yellow-700 bg-yellow-50 border-yellow-200"
    : "text-red-700 bg-red-50 border-red-200"

const statusColor = (s: string) =>
  ({ Verified: "bg-green-100 text-green-800", Corrected: "bg-blue-100 text-blue-800",
     "Needs Review": "bg-yellow-100 text-yellow-800", Unverified: "bg-gray-100 text-gray-600" }[s] ?? "bg-gray-100 text-gray-600")

// ── Stats Strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: { total: number; verified: number; corrected: number; needs_review: number; unverified: number; avg_confidence: number } }) {
  const pct = stats.total > 0 ? Math.round(((stats.verified + stats.corrected) / stats.total) * 100) : 0
  const cards = [
    { label: "Total", value: stats.total, color: "text-indigo-600" },
    { label: "Verified", value: stats.verified + stats.corrected, color: "text-green-600" },
    { label: "Needs Review", value: stats.needs_review, color: "text-yellow-600" },
    { label: "Unverified", value: stats.unverified, color: "text-gray-500" },
    { label: "Done Rate", value: `${pct}%`, color: pct >= 70 ? "text-green-600" : "text-red-600" },
    { label: "Avg Confidence", value: `${stats.avg_confidence}%`, color: stats.avg_confidence >= 70 ? "text-green-600" : stats.avg_confidence >= 40 ? "text-yellow-600" : "text-red-600" },
  ]
  return (
    <div className="grid grid-cols-6 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl p-4 border shadow-sm text-center">
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Field Card ────────────────────────────────────────────────────────────────

function FieldCard({ fc, editMode, edits, setEdits }: {
  fc: FieldComp
  editMode: boolean
  edits: Record<string, string>
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const borderCls = fc.confidence_color === "red" ? "border-red-200 bg-red-50/40"
    : fc.confidence_color === "yellow" ? "border-yellow-200 bg-yellow-50/30"
    : "border-gray-200 bg-white"
  const badgeCls = fc.confidence_color === "green" ? "bg-green-50 text-green-700 border-green-200"
    : fc.confidence_color === "yellow" ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    : "bg-red-50 text-red-700 border-red-200"
  const val = edits[fc.field] !== undefined ? edits[fc.field] : String(fc.current_value ?? "")

  return (
    <div className={`rounded-lg border p-3 ${borderCls}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700">{fc.label}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badgeCls}`}>{fc.confidence}%</span>
      </div>
      {editMode ? (
        <input
          className="w-full text-sm border rounded px-2 py-1 bg-white"
          value={val}
          onChange={(e) => setEdits((p) => ({ ...p, [fc.field]: e.target.value }))}
          placeholder={`Enter ${fc.label}...`}
        />
      ) : (
        <div className="text-sm text-gray-900 font-medium">{fmt(fc.current_value)}</div>
      )}
      {fc.original_value !== null && fc.original_value !== undefined && String(fc.original_value) !== String(fc.current_value) && (
        <div className="text-xs text-gray-400 mt-1">AI extracted: <span className="font-medium text-orange-600">{fmt(fc.original_value)}</span></div>
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ doctype, docname, onClose, onVerified }: {
  doctype: string; docname: string; onClose: () => void; onVerified: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [rightTab, setRightTab] = useState<"document" | "raw">("document")
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const { data: detail, isLoading } = useQuery({
    queryKey: ["verify-detail", doctype, docname],
    queryFn: () => getVerificationDetail(doctype, docname),
    staleTime: 0,
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      const hasEdits = Object.keys(edits).length > 0
      await quickAction(doctype, docname, hasEdits ? "correct" : "approve", hasEdits ? (edits as Record<string, unknown>) : undefined)
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
      onVerified()
    } finally { setSaving(false) }
  }

  const origData: Record<string, unknown> = (() => {
    try { return JSON.parse(((detail?.record as Record<string, unknown>)?.original_extracted as string) ?? "{}") }
    catch { return {} }
  })()
  const _skipOrig = new Set(["drive_file","extraction_method","verification_status","confidence_score","extraction_attempts"])

  const fields = detail?.field_comparison ?? []
  const lowFields = fields.filter((f: FieldComp) => f.confidence < 40)
  const midFields = fields.filter((f: FieldComp) => f.confidence >= 40 && f.confidence < 70)
  const highFields = fields.filter((f: FieldComp) => f.confidence >= 70)

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={onClose}>
      <div className="ml-auto w-full max-w-5xl bg-white flex flex-col h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-gray-800">{doctype.replace("VE ", "")}</span>
              <span className="text-gray-400 font-mono text-sm">{docname}</span>
              {detail && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(detail.verification_status)}`}>{detail.verification_status}</span>}
              {detail && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confColor(detail.overall_confidence)}`}>{detail.overall_confidence}% confidence</span>}
            </div>
            {detail?.drive_file && (
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                <span>📄 {detail.drive_file.file_name}</span>
                {detail.drive_file.file_date && <span>· {detail.drive_file.file_date}</span>}
                {detail.drive_file.drive_view_link && (
                  <a href={detail.drive_file.drive_view_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">
                    Open in Drive ↗
                  </a>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="ml-4 p-2 rounded-lg hover:bg-gray-200 text-gray-500 text-xl leading-none">✕</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>
        ) : detail ? (
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* LEFT: Fields */}
            <div className="w-3/5 flex flex-col border-r overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
                <span className="text-sm font-semibold text-gray-700">
                  Extracted Fields
                  {fields.length > 0 && <span className="ml-1 text-xs text-gray-400 font-normal">({fields.length})</span>}
                </span>
                <button
                  onClick={() => { setEditMode(!editMode); if (editMode) setEdits({}) }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${editMode ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                >
                  {editMode ? "Cancel" : "Edit Fields"}
                </button>
              </div>
              {fields.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 p-6 text-center">
                  <span className="text-4xl">🔍</span>
                  <p className="text-sm font-medium">No extracted fields available</p>
                  <p className="text-xs text-gray-300 max-w-xs">AI extraction produced no structured data. View Raw Data tab for the original output.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                  {lowFields.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">⚠ Low Confidence — Please Verify</div>
                      <div className="space-y-2">{lowFields.map((fc: FieldComp) => <FieldCard key={fc.field} fc={fc} editMode={editMode} edits={edits} setEdits={setEdits} />)}</div>
                    </div>
                  )}
                  {midFields.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mb-2">Medium Confidence</div>
                      <div className="space-y-2">{midFields.map((fc: FieldComp) => <FieldCard key={fc.field} fc={fc} editMode={editMode} edits={edits} setEdits={setEdits} />)}</div>
                    </div>
                  )}
                  {highFields.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">✓ High Confidence</div>
                      <div className="space-y-2">{highFields.map((fc: FieldComp) => <FieldCard key={fc.field} fc={fc} editMode={editMode} edits={edits} setEdits={setEdits} />)}</div>
                    </div>
                  )}
                </div>
              )}
              <div className="px-4 py-3 border-t bg-gray-50 flex gap-2 shrink-0">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {saving ? "Saving..." : Object.keys(edits).length > 0 ? "✓ Save Corrections" : "✓ Approve As-Is"}
                </button>
                <button onClick={async () => { await quickAction(doctype, docname, "reject"); qc.invalidateQueries({ queryKey: ["all-extracted"] }); onVerified() }}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50">
                  ✗ Reject
                </button>
              </div>
            </div>

            {/* RIGHT: Document / Raw */}
            <div className="w-2/5 flex flex-col overflow-hidden bg-gray-50">
              <div className="flex items-center gap-1 px-4 py-2 border-b bg-white shrink-0">
                <button onClick={() => setRightTab("document")} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${rightTab === "document" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>📄 Document</button>
                <button onClick={() => setRightTab("raw")} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${rightTab === "raw" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{"{ }"} Raw Data</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {rightTab === "document" && (
                  <div className="p-5 space-y-4">
                    {detail.drive_file?.drive_view_link ? (
                      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm text-center">
                        <div className="text-5xl mb-3">📄</div>
                        <h3 className="font-semibold text-gray-800 text-sm mb-2 break-words leading-relaxed">{detail.drive_file.file_name}</h3>
                        <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
                          <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{detail.drive_file.doc_type}</span>
                          {detail.drive_file.file_date && <span className="text-xs text-gray-400">{detail.drive_file.file_date}</span>}
                        </div>
                        <a href={detail.drive_file.drive_view_link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 w-full justify-center transition-colors">
                          Open Document in Drive ↗
                        </a>
                        <p className="text-xs text-gray-400 mt-3">Opens in new tab · sign in to Google if prompted</p>
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
                        <div className="text-4xl mb-3">🔗</div>
                        <p className="text-sm font-medium text-gray-600">No Drive link available</p>
                        <p className="text-xs text-gray-400 mt-1">This record has no linked Google Drive file</p>
                      </div>
                    )}
                    {Object.keys(origData).filter(k => !_skipOrig.has(k)).length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AI Raw Extraction</div>
                        <div className="space-y-1.5">
                          {Object.entries(origData).filter(([k]) => !_skipOrig.has(k)).map(([k, v]) => (
                            <div key={k} className="flex items-start justify-between gap-2 text-xs">
                              <span className="text-gray-500 shrink-0 capitalize">{k.replace(/_/g, " ")}</span>
                              <span className="text-gray-800 font-medium text-right break-all">{fmt(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {rightTab === "raw" && (
                  <div className="p-4 space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Structured Record</div>
                      <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                        {JSON.stringify(Object.fromEntries(Object.entries(detail.record as Record<string, unknown>).filter(([k]) => !["owner","modified_by","docstatus","idx","original_extracted","extraction_history"].includes(k))), null, 2)}
                      </pre>
                    </div>
                    {Object.keys(origData).length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Original AI Extraction</div>
                        <pre className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                          {JSON.stringify(origData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">Failed to load details</div>
        )}
      </div>
    </div>
  )
}

// ── All Records Mode ──────────────────────────────────────────────────────────

function AllRecordsMode({ records, statusFilter, setStatusFilter, doctypeFilter, setDoctypeFilter, onView }: {
  records: ExtractedRecord[]; statusFilter: string; setStatusFilter: (v: string) => void
  doctypeFilter: string; setDoctypeFilter: (v: string) => void; onView: (r: ExtractedRecord) => void
}) {
  const [q, setQ] = useState("")
  const allDoctypes = [...new Set(records.map((r) => r.doctype))].sort()
  const filtered = records.filter((r) => {
    if (statusFilter && r.verification_status !== statusFilter) return false
    if (doctypeFilter && r.doctype !== doctypeFilter) return false
    if (q) { const lq = q.toLowerCase(); return (r.party || "").toLowerCase().includes(lq) || r.docname.toLowerCase().includes(lq) }
    return true
  })

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48" placeholder="Search party or record ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Unverified">Unverified</option>
          <option value="Needs Review">Needs Review</option>
          <option value="Verified">Verified</option>
          <option value="Corrected">Corrected</option>
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900" value={doctypeFilter} onChange={(e) => setDoctypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {allDoctypes.map((dt) => <option key={dt} value={dt}>{dt.replace("VE ", "")}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                {["#", "Type", "Record ID", "Party / Employee", "Amount", "Date", "Confidence", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium text-gray-600 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No records match filters</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.docname} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => onView(r)}>
                  <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">{r.doctype.replace("VE ", "")}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.docname}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs max-w-36 truncate" title={r.party || undefined}>{r.party || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{r.amount ? `₹${r.amount.toLocaleString("en-IN")}` : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.date || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confColor(r.confidence_score)}`}>{r.confidence_score}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(r.verification_status)}`}>{r.verification_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-indigo-600 hover:underline" onClick={(e) => { e.stopPropagation(); onView(r) }}>Verify →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t">Showing {filtered.length} of {records.length} records</div>
      </div>
    </div>
  )
}

// ── Auto-Verify Mode ──────────────────────────────────────────────────────────

function AutoVerifyMode({ onDone }: { onDone: (n: number) => void }) {
  const [threshold, setThreshold] = useState(75)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ autoVerified: number; needsReview: number } | null>(null)
  const qc = useQueryClient()

  const run = async () => {
    setRunning(true)
    try {
      await resetAutoVerified()
      const res = await autoVerifyAll(threshold)
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
      setResult({ autoVerified: res.auto_verified, needsReview: res.needs_review })
    } finally { setRunning(false) }
  }

  if (result) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="text-5xl mb-4">🤖</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Auto-Verify Complete</h2>
      <p className="text-gray-500 mb-8">Processed all unverified records at {threshold}% threshold</p>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4"><div className="text-3xl font-bold text-green-600">{result.autoVerified}</div><div className="text-sm text-green-700 mt-1">Auto-verified ✓</div></div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4"><div className="text-3xl font-bold text-yellow-600">{result.needsReview}</div><div className="text-sm text-yellow-700 mt-1">Need Review →</div></div>
      </div>
      {result.needsReview > 0 && <button onClick={() => onDone(result.needsReview)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700">Review {result.needsReview} Records →</button>}
      <button onClick={() => setResult(null)} className="ml-3 text-gray-500 hover:underline text-sm">Run again</button>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-white rounded-2xl border shadow-sm p-8">
        <div className="text-4xl mb-4 text-center">🤖</div>
        <h2 className="text-xl font-bold text-gray-800 text-center mb-6">Auto-Verify Records</h2>
        <div className="mb-6">
          <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-3">
            <span>Confidence Threshold</span>
            <span className="text-indigo-600 font-bold">{threshold}%</span>
          </label>
          <input type="range" min={50} max={95} value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value))} className="w-full accent-indigo-600" />
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 mb-6 text-sm text-indigo-700">
          ≥{threshold}% → <strong>Auto-verified</strong> · Below → <strong>Flagged for review</strong>
        </div>
        <button onClick={run} disabled={running} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">
          {running ? "Running..." : "Run Auto-Verify"}
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
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState({ approved: 0, corrected: 0, rejected: 0, skipped: 0 })

  const reviewRecords = [...allRecords].filter((r) => r.verification_status !== "Verified" && r.verification_status !== "Corrected")
  const current = reviewRecords[idx]
  const progress = reviewRecords.length > 0 ? Math.round((idx / reviewRecords.length) * 100) : 0

  const { data: detail } = useQuery({
    queryKey: ["verify-detail", current?.doctype, current?.docname],
    queryFn: () => getVerificationDetail(current.doctype, current.docname),
    staleTime: 30_000, enabled: !!current,
  })

  const handleAction = useCallback(async (action: "approve" | "reject" | "correct" | "skip") => {
    if (!current || isProcessing) return
    setIsProcessing(true)
    try {
      const hasEdits = Object.keys(edits).length > 0
      const act = action === "correct" && !hasEdits ? "approve" : action
      await quickAction(current.doctype, current.docname, act, hasEdits ? edits as Record<string, unknown> : undefined)
      setSummary((p) => ({ ...p, [act === "approve" ? "approved" : act === "correct" ? "corrected" : act === "reject" ? "rejected" : "skipped"]: p[act === "approve" ? "approved" : act === "correct" ? "corrected" : act === "reject" ? "rejected" : "skipped"] + 1 }))
      setIdx((i) => i + 1)
      setEdits({})
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
    } finally { setIsProcessing(false) }
  }, [current, isProcessing, edits, qc])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return
      if (e.key === "a" || e.key === "A") handleAction("approve")
      if (e.key === "r" || e.key === "R") handleAction("reject")
      if (e.key === "s" || e.key === "S") handleAction("skip")
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [handleAction])

  if (reviewRecords.length === 0) return <div className="text-center py-16"><div className="text-5xl mb-4">✅</div><h2 className="text-2xl font-bold text-gray-800 mb-2">All Caught Up!</h2><p className="text-gray-500">No records need review.</p></div>
  if (idx >= reviewRecords.length) return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">🏆</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Review Complete!</h2>
      <div className="flex justify-center gap-6 text-sm mt-4">
        {(["approved","corrected","rejected","skipped"] as const).map((k) => (
          <div key={k} className="text-center">
            <div className={`text-2xl font-bold ${k==="approved"?"text-green-600":k==="corrected"?"text-blue-600":k==="rejected"?"text-red-600":"text-gray-500"}`}>{summary[k]}</div>
            <div className="text-gray-500 capitalize">{k}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const fields = detail?.field_comparison ?? []
  const lowFields = fields.filter((f: FieldComp) => f.confidence < 60)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
        <span>Record {idx + 1} of {reviewRecords.length}</span>
        <span className="text-xs text-gray-400">A=Approve · R=Reject · S=Skip</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-5">
        <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="bg-white rounded-2xl border shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <span className="font-bold text-gray-800">{current.doctype.replace("VE ", "")}</span>
            <span className="text-gray-400 text-sm ml-2">{current.docname}</span>
            {current.party && <span className="ml-2 text-sm text-gray-600">· {current.party}</span>}
          </div>
          <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${confColor(current.confidence_score)}`}>{current.confidence_score}%</span>
        </div>
        <div className="p-6">
          {detail?.drive_file?.drive_view_link && (
            <div className="mb-4 p-3 bg-indigo-50 rounded-xl flex items-center justify-between">
              <span className="text-sm text-indigo-700 truncate">📄 {detail.drive_file.file_name}</span>
              <a href={detail.drive_file.drive_view_link} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-indigo-600 hover:underline font-medium shrink-0">Open ↗</a>
            </div>
          )}
          {lowFields.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-red-700 mb-3">⚠ Verify These Fields</h4>
              <div className="space-y-2">
                {lowFields.map((fc: FieldComp) => (
                  <div key={fc.field} className="flex items-center gap-3 p-3 rounded-lg border border-red-100 bg-red-50/30">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500">{fc.label}</div>
                      <input className="text-sm border rounded px-2 py-1 w-full mt-1 bg-white"
                        value={edits[fc.field] !== undefined ? edits[fc.field] : String(fc.current_value ?? "")}
                        onChange={(e) => setEdits((p) => ({ ...p, [fc.field]: e.target.value }))} />
                    </div>
                    <span className="text-xs text-red-500 shrink-0">{fc.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500 py-4">{fields.length === 0 ? "No extraction data available" : "✓ All fields have good confidence"}</p>
          )}
        </div>
        <div className="px-6 pb-5 grid grid-cols-3 gap-2 text-sm">
          <button onClick={() => handleAction("approve")} disabled={isProcessing} className="py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 text-center">
            <div>✓ Approve</div><div className="text-xs opacity-75">[A]</div>
          </button>
          <button onClick={() => handleAction("correct")} disabled={isProcessing} className="py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 text-center">
            <div>✏ Fix & Save</div>
          </button>
          <button onClick={() => handleAction("reject")} disabled={isProcessing} className="py-2 border border-red-300 text-red-600 rounded-xl font-medium hover:bg-red-50 disabled:opacity-50 text-center">
            <div>✗ Reject</div><div className="text-xs opacity-75">[R]</div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Accuracy Table ────────────────────────────────────────────────────────────

function AccuracyTable() {
  const { data } = useQuery({ queryKey: ["accuracy-stats"], queryFn: getAccuracyStats, staleTime: 60_000 })
  if (!data?.success || !data.by_doctype?.length) return null
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden mt-6">
      <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">Extraction Quality by Type</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left">
            {["DocType", "Total", "Verified", "Avg Conf.", "Rate"].map((h) => (
              <th key={h} className="px-4 py-2 text-xs font-medium text-gray-500 text-right first:text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.by_doctype.map((row) => (
            <tr key={row.doctype} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2 text-xs text-gray-700">{row.doctype.replace("VE ", "")}</td>
              <td className="px-4 py-2 text-right text-gray-600 text-xs">{row.total}</td>
              <td className="px-4 py-2 text-right text-green-600 text-xs">{row.verified + row.corrected}</td>
              <td className="px-4 py-2 text-right">
                <span className={`text-xs font-medium ${row.avg_confidence >= 70 ? "text-green-600" : row.avg_confidence >= 40 ? "text-yellow-600" : "text-red-600"}`}>{Math.round(row.avg_confidence)}%</span>
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 bg-gray-200 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${row.verification_rate}%` }} /></div>
                  <span className="text-xs text-gray-500">{Math.round(row.verification_rate)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function VerificationPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>("all")
  const [statusFilter, setStatusFilter] = useState("")
  const [doctypeFilter, setDoctypeFilter] = useState("")
  const [detailRecord, setDetailRecord] = useState<{ doctype: string; docname: string } | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["all-extracted", statusFilter, doctypeFilter],
    queryFn: () => getAllExtractedRecords(statusFilter || undefined, doctypeFilter || undefined),
    staleTime: 0, refetchOnMount: "always",
  })

  const records = data?.records ?? []
  const stats = data?.stats ?? { total: 0, verified: 0, corrected: 0, needs_review: 0, unverified: 0, manual_required: 0, avg_confidence: 0 }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Verification</h1>
          <p className="text-gray-500 text-sm mt-1">Review and verify AI-extracted document data</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border rounded-lg">↻ Refresh</button>
          <button onClick={() => navigate("/business")} className="text-sm text-indigo-600 hover:underline">Business Dashboard →</button>
        </div>
      </div>

      {!isLoading && <StatsStrip stats={stats} />}
      {!isLoading && stats.manual_required > 0 && (
        <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700 flex items-center gap-2">
          <span>⚠ {stats.manual_required} record(s) require manual review</span>
          <button onClick={() => setMode("review")} className="ml-auto text-orange-600 font-medium hover:underline">Review Now →</button>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(["all", "auto", "review"] as const).map((k) => (
          <button key={k} onClick={() => setMode(k)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${mode === k ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
            <span>{k === "all" ? "📋" : k === "auto" ? "🤖" : "👆"}</span>
            <span>{k === "all" ? "All Records" : k === "auto" ? "Auto-Verify" : "Review Mode"}</span>
            {k === "review" && stats.needs_review > 0 && (
              <span className="bg-yellow-400 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{stats.needs_review}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading records...</div>
      ) : mode === "all" ? (
        <>
          <AllRecordsMode records={records} statusFilter={statusFilter} setStatusFilter={setStatusFilter} doctypeFilter={doctypeFilter} setDoctypeFilter={setDoctypeFilter} onView={(r) => setDetailRecord({ doctype: r.doctype, docname: r.docname })} />
          <AccuracyTable />
        </>
      ) : mode === "auto" ? (
        <AutoVerifyMode onDone={() => { setMode("review"); refetch() }} />
      ) : (
        <ReviewMode allRecords={records} />
      )}

      {detailRecord && (
        <DetailPanel doctype={detailRecord.doctype} docname={detailRecord.docname}
          onClose={() => setDetailRecord(null)}
          onVerified={() => { setDetailRecord(null); qc.invalidateQueries({ queryKey: ["all-extracted"] }) }} />
      )}
    </div>
  )
}
