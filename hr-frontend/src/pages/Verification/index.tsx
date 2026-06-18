import { useState, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  RefreshCw, ExternalLink, CheckCircle, XCircle, SkipForward,
  AlertTriangle, ChevronRight, Table2, Zap, ClipboardCheck, RotateCcw,
  Folder, FileText, Home,
} from "lucide-react"
import {
  getAllExtractedRecords, resetAutoVerified, autoVerifyAll,
  getVerificationDetail, quickAction, getAccuracyStats, ExtractedRecord,
} from "../../api/ai"

// ── Folder navigation ─────────────────────────────────────────────────────────

const VERIFY_MODULE_STRUCTURE = {
  Sales: {
    label: "Sales",
    color: { bg: "#f0fdf4", text: "#15803d" },
    doctypes: [
      { label: "Sale Invoices",      value: "VE Sales Invoice" },
      { label: "Sale Orders",        value: "VE Sales Order" },
      { label: "Performa Invoices",  value: "VE Quotation" },
      { label: "Credit Notes",       value: "VE Credit Note" },
    ],
  },
  Purchase: {
    label: "Purchase",
    color: { bg: "#fff1f2", text: "#be123c" },
    doctypes: [
      { label: "Purchase Invoices",  value: "VE Purchase Invoice" },
      { label: "Purchase Orders",    value: "VE Purchase Order" },
      { label: "Debit Notes",        value: "VE Debit Note" },
    ],
  },
  Accounts: {
    label: "Accounts",
    color: { bg: "#f5f3ff", text: "#6d28d9" },
    doctypes: [
      { label: "Payment Vouchers",   value: "VE Payment Record" },
      { label: "Financial Reports",  value: "VE Financial Report" },
    ],
  },
  HR: {
    label: "HR & Payroll",
    color: { bg: "#fffbeb", text: "#92400e" },
    doctypes: [
      { label: "Salary Records",     value: "VE Salary Record" },
      { label: "Attendance Records", value: "VE Attendance Record" },
    ],
  },
} as const

type VerifyModuleKey = keyof typeof VERIFY_MODULE_STRUCTURE

function vStats(recs: ExtractedRecord[]) {
  const verified = recs.filter(r => r.verification_status === "Verified" || r.verification_status === "Corrected").length
  const needs_review = recs.filter(r => r.verification_status === "Needs Review").length
  const pct = recs.length > 0 ? Math.round((verified / recs.length) * 100) : 0
  return { total: recs.length, verified, needs_review, pct }
}

function ModuleVerifyFolderCard({ modKey, records, onClick }: {
  modKey: VerifyModuleKey; records: ExtractedRecord[]; onClick: () => void
}) {
  const m = VERIFY_MODULE_STRUCTURE[modKey]
  const dts = m.doctypes.map(d => d.value) as string[]
  const s = vStats(records.filter(r => dts.includes(r.doctype)))
  return (
    <button onClick={onClick}
      className="group relative bg-white rounded-2xl border border-gray-100 p-5 text-left transition-all hover:shadow-lg hover:border-gray-200 hover:-translate-y-1 active:translate-y-0 w-full overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ backgroundColor: m.color.text }} />
      <div className="flex items-start justify-between mb-4 mt-1">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: m.color.bg }}>
          <Folder size={22} style={{ color: m.color.text }} strokeWidth={1.5} />
        </div>
        {s.needs_review > 0 && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700">
            {s.needs_review} to review
          </span>
        )}
      </div>
      <p className="font-bold text-[15px] text-gray-800 group-hover:text-indigo-600 transition-colors">{m.label}</p>
      <p className="text-[12px] text-gray-400 mt-0.5">{m.doctypes.length} categories · {s.total} records</p>
      {s.total > 0 && (
        <div className="mt-3.5">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400">{s.verified} verified</span>
            <span className="font-semibold" style={{ color: m.color.text }}>{s.pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.pct}%`, backgroundColor: m.color.text }} />
          </div>
        </div>
      )}
      <ChevronRight size={15} className="absolute right-4 bottom-4 text-gray-200 group-hover:text-indigo-400 transition-all group-hover:translate-x-0.5" />
    </button>
  )
}

function DoctypeVerifyFolderCard({ dt, records, modKey, onClick }: {
  dt: { label: string; value: string }; records: ExtractedRecord[]; modKey: VerifyModuleKey; onClick: () => void
}) {
  const m = VERIFY_MODULE_STRUCTURE[modKey]
  const s = vStats(records.filter(r => r.doctype === dt.value))
  return (
    <button onClick={onClick}
      className="group bg-white rounded-xl border border-gray-100 p-4 text-left transition-all hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 active:translate-y-0 w-full flex items-center gap-3.5"
      style={{ borderLeftWidth: 3, borderLeftColor: m.color.text }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: m.color.bg }}>
        <FileText size={17} style={{ color: m.color.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[13px] text-gray-800 group-hover:text-indigo-600 transition-colors truncate">{dt.label}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {s.total > 0
            ? <><span className="font-semibold" style={{ color: m.color.text }}>{s.verified}</span> verified · {s.total} records{s.needs_review > 0 && <span className="text-amber-600 ml-1">· {s.needs_review} to review</span>}</>
            : "No records yet"}
        </p>
        {s.total > 0 && s.pct > 0 && (
          <div className="mt-1.5 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: m.color.text }} />
          </div>
        )}
      </div>
      <ChevronRight size={14} className="text-gray-200 group-hover:text-indigo-400 transition-all group-hover:translate-x-0.5 shrink-0" />
    </button>
  )
}

// ── Types & helpers ───────────────────────────────────────────────────────────

type Mode = "all" | "auto" | "review"

interface FieldComp {
  field: string; label: string; current_value: unknown; original_value: unknown
  confidence: number; was_changed: boolean
  confidence_label: "High" | "Medium" | "Low"; confidence_color: "green" | "yellow" | "red"
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") {
    if (v === 0) return "0"
    if (Math.abs(v) > 100) return `₹${v.toLocaleString("en-IN")}`
    return String(v)
  }
  return String(v)
}

function confClass(score: number) {
  return score >= 70 ? "text-green-700 bg-green-50 ring-1 ring-green-200"
    : score >= 40 ? "text-yellow-700 bg-yellow-50 ring-1 ring-yellow-200"
    : "text-red-700 bg-red-50 ring-1 ring-red-200"
}

function statusClass(s: string) {
  return ({ Verified: "bg-green-100 text-green-800", Corrected: "bg-blue-100 text-blue-800",
    "Needs Review": "bg-amber-100 text-amber-800", Unverified: "bg-gray-100 text-gray-600" }[s] ?? "bg-gray-100 text-gray-600")
}

// ── Stats Strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: { total: number; verified: number; corrected: number; needs_review: number; unverified: number; avg_confidence: number } }) {
  const done = stats.verified + stats.corrected
  const pct = stats.total > 0 ? Math.round((done / stats.total) * 100) : 0
  const items = [
    { label: "Total Records", value: stats.total, color: "#6366f1" },
    { label: "Verified", value: done, color: "#16a34a" },
    { label: "Needs Review", value: stats.needs_review, color: "#d97706" },
    { label: "Unverified", value: stats.unverified, color: "#6b7280" },
    { label: "Done Rate", value: `${pct}%`, color: pct >= 70 ? "#16a34a" : "#dc2626" },
    { label: "Avg Confidence", value: `${stats.avg_confidence}%`, color: stats.avg_confidence >= 70 ? "#16a34a" : stats.avg_confidence >= 40 ? "#d97706" : "#dc2626" },
  ]
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
      {items.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm text-center" style={{ borderTopWidth: 3, borderTopColor: c.color }}>
          <div className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
          <div className="text-[11px] text-gray-500 mt-1 leading-tight">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Field Card ────────────────────────────────────────────────────────────────

function FieldCard({ fc, editMode, edits, setEdits }: {
  fc: FieldComp; editMode: boolean
  edits: Record<string, string>; setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const borderCls = fc.confidence_color === "red" ? "border-red-200 bg-red-50/30"
    : fc.confidence_color === "yellow" ? "border-yellow-200 bg-yellow-50/20"
    : "border-gray-100 bg-white"
  const badgeCls = fc.confidence_color === "green" ? "bg-green-50 text-green-700 ring-1 ring-green-200"
    : fc.confidence_color === "yellow" ? "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200"
    : "bg-red-50 text-red-700 ring-1 ring-red-200"
  const val = edits[fc.field] !== undefined ? edits[fc.field] : String(fc.current_value ?? "")

  return (
    <div className={`rounded-lg border p-3 ${borderCls}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{fc.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${badgeCls}`}>{fc.confidence}%</span>
      </div>
      {editMode ? (
        <input
          className="w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={val}
          onChange={(e) => setEdits((p) => ({ ...p, [fc.field]: e.target.value }))}
          placeholder={`Enter ${fc.label}…`}
        />
      ) : (
        <div className="text-[13px] text-gray-900 font-medium">{fmt(fc.current_value)}</div>
      )}
      {fc.original_value !== null && fc.original_value !== undefined && String(fc.original_value) !== String(fc.current_value) && (
        <div className="text-[10px] text-gray-400 mt-1">AI extracted: <span className="font-medium text-amber-600">{fmt(fc.original_value)}</span></div>
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
  const [saving, setSaving] = useState(false)
  const [reextracting, setReextracting] = useState(false)
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

  const handleReextract = async () => {
    setReextracting(true)
    try {
      await quickAction(doctype, docname, "reject")
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
      onVerified()
    } finally { setReextracting(false) }
  }

  const origData: Record<string, unknown> = (() => {
    try { return JSON.parse(((detail?.record as Record<string, unknown>)?.original_extracted as string) ?? "{}") }
    catch { return {} }
  })()
  const skipFields = new Set(["drive_file","extraction_method","verification_status","confidence_score","extraction_attempts"])

  const fields = detail?.field_comparison ?? []
  const lowFields = fields.filter((f: FieldComp) => f.confidence < 40)
  const midFields = fields.filter((f: FieldComp) => f.confidence >= 40 && f.confidence < 70)
  const highFields = fields.filter((f: FieldComp) => f.confidence >= 70)
  const hasDriveLink = !!detail?.drive_file?.drive_view_link

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/50" onClick={onClose}>
      <div className="ml-auto w-full max-w-6xl bg-white flex flex-col h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3.5 border-b bg-gray-50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-gray-800 text-[14px]">{doctype.replace("VE ", "")}</span>
              <span className="text-gray-400 font-mono text-[12px]">{docname}</span>
              {detail && <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusClass(detail.verification_status)}`}>{detail.verification_status}</span>}
              {detail && <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${confClass(detail.overall_confidence)}`}>{detail.overall_confidence}% confidence</span>}
            </div>
            {detail?.drive_file && (
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                <span className="font-medium text-gray-600">{detail.drive_file.file_name}</span>
                {detail.drive_file.file_date && <span>· {detail.drive_file.file_date}</span>}
                {hasDriveLink && (
                  <a href={detail.drive_file.drive_view_link} target="_blank" rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline font-medium flex items-center gap-1">
                    <ExternalLink size={10} /> Open in Drive
                  </a>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center text-lg transition-colors">
            ×
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400 space-y-3">
              <RefreshCw size={28} className="animate-spin mx-auto text-indigo-300" />
              <p className="text-sm">Loading document details…</p>
            </div>
          </div>
        ) : detail ? (
          <div className="flex-1 flex overflow-hidden min-h-0">

            {/* LEFT: Extracted Fields */}
            <div className="w-[55%] flex flex-col border-r overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
                <span className="text-[13px] font-semibold text-gray-700">
                  Extracted Fields
                  {fields.length > 0 && <span className="ml-1 text-[11px] text-gray-400 font-normal">({fields.length} fields)</span>}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={handleReextract} disabled={reextracting}
                    className="text-[12px] px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 font-medium flex items-center gap-1 transition-colors">
                    <RotateCcw size={11} className={reextracting ? "animate-spin" : ""} />
                    {reextracting ? "Re-extracting…" : "Re-extract"}
                  </button>
                  <button
                    onClick={() => { setEditMode(!editMode); if (editMode) setEdits({}) }}
                    className={`text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-colors ${editMode ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {editMode ? "Cancel" : "Edit Fields"}
                  </button>
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 p-8 text-center">
                  <AlertTriangle size={32} className="text-gray-200" />
                  <p className="text-sm font-medium">No extracted fields</p>
                  <p className="text-[12px] text-gray-300 max-w-xs">AI extraction produced no structured data. Click Re-extract to run the AI again.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                  {lowFields.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={11} /> Low Confidence — Verify against source
                      </div>
                      <div className="space-y-2">{lowFields.map((fc: FieldComp) => <FieldCard key={fc.field} fc={fc} editMode={editMode} edits={edits} setEdits={setEdits} />)}</div>
                    </div>
                  )}
                  {midFields.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2">Medium Confidence</div>
                      <div className="space-y-2">{midFields.map((fc: FieldComp) => <FieldCard key={fc.field} fc={fc} editMode={editMode} edits={edits} setEdits={setEdits} />)}</div>
                    </div>
                  )}
                  {highFields.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-green-600 uppercase tracking-wider mb-2">High Confidence</div>
                      <div className="space-y-2">{highFields.map((fc: FieldComp) => <FieldCard key={fc.field} fc={fc} editMode={editMode} edits={edits} setEdits={setEdits} />)}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 py-3.5 border-t bg-gray-50 flex gap-2 shrink-0">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  <CheckCircle size={14} />
                  {saving ? "Saving…" : Object.keys(edits).length > 0 ? "Save Corrections & Approve" : "Approve As-Is"}
                </button>
                <button
                  onClick={async () => { await quickAction(doctype, docname, "reject"); qc.invalidateQueries({ queryKey: ["all-extracted"] }); onVerified() }}
                  className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-[13px] font-semibold hover:bg-red-50 flex items-center gap-2 transition-colors">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>

            {/* RIGHT: Source Document */}
            <div className="w-[45%] flex flex-col overflow-hidden bg-gray-50/50">
              <div className="px-4 py-3 border-b bg-white shrink-0">
                <span className="text-[13px] font-semibold text-gray-700">Source Document</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Drive file card */}
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm text-center">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ExternalLink size={24} className="text-indigo-400" />
                  </div>
                  {detail.drive_file ? (
                    <>
                      <h3 className="font-semibold text-gray-800 text-[13px] mb-2 break-words leading-relaxed">
                        {detail.drive_file.file_name}
                      </h3>
                      <div className="flex items-center justify-center gap-2 flex-wrap mb-5">
                        <span className="text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{detail.drive_file.doc_type}</span>
                        {detail.drive_file.file_date && <span className="text-[11px] text-gray-400">{detail.drive_file.file_date}</span>}
                      </div>
                      {hasDriveLink ? (
                        <>
                          <a href={detail.drive_file.drive_view_link} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-[13px] hover:bg-indigo-700 transition-colors shadow-sm">
                            <ExternalLink size={14} /> Open in Google Drive
                          </a>
                          <p className="text-[11px] text-gray-400 mt-2.5">Opens in new tab · compare against the extracted fields on the left</p>
                        </>
                      ) : (
                        <p className="text-[13px] text-gray-400">No Drive link available</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-medium text-gray-500 mb-1">No linked document</p>
                      <p className="text-[12px] text-gray-400">This record has no associated Drive file</p>
                    </>
                  )}
                </div>

                {/* AI raw extraction */}
                {Object.keys(origData).filter(k => !skipFields.has(k)).length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">AI Raw Extraction</div>
                    <div className="space-y-2">
                      {Object.entries(origData).filter(([k]) => !skipFields.has(k)).map(([k, v]) => (
                        <div key={k} className="flex items-start justify-between gap-2">
                          <span className="text-[11px] text-gray-500 shrink-0 capitalize">{k.replace(/_/g, " ")}</span>
                          <span className="text-[11px] text-gray-800 font-medium text-right break-all">{fmt(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Failed to load details</div>
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
  const [bulking, setBulking] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const qc = useQueryClient()

  const allDoctypes = [...new Set(records.map((r) => r.doctype))].sort()
  const filtered = records.filter((r) => {
    if (statusFilter && r.verification_status !== statusFilter) return false
    if (doctypeFilter && r.doctype !== doctypeFilter) return false
    if (q) { const lq = q.toLowerCase(); return (r.party || "").toLowerCase().includes(lq) || r.docname.toLowerCase().includes(lq) }
    return true
  })

  const highConfUnverified = records.filter(r => r.verification_status === "Unverified" && r.confidence_score >= 75)

  const bulkApprove = async () => {
    if (!highConfUnverified.length) return
    setBulking(true)
    try {
      for (const r of highConfUnverified) await quickAction(r.doctype, r.docname, "approve")
      qc.invalidateQueries({ queryKey: ["all-extracted"] })
      setBanner(`Approved ${highConfUnverified.length} high-confidence records`)
      setTimeout(() => setBanner(null), 3000)
    } finally { setBulking(false) }
  }

  const statusChips = [
    { label: "All", value: "", count: records.length },
    { label: "Unverified", value: "Unverified", count: records.filter(r => r.verification_status === "Unverified").length },
    { label: "Needs Review", value: "Needs Review", count: records.filter(r => r.verification_status === "Needs Review").length },
    { label: "Verified", value: "Verified", count: records.filter(r => r.verification_status === "Verified").length },
    { label: "Corrected", value: "Corrected", count: records.filter(r => r.verification_status === "Corrected").length },
  ]

  return (
    <div>
      {banner && (
        <div className="fixed top-5 right-5 z-50 bg-green-700 text-white text-[13px] px-4 py-2.5 rounded-xl shadow-lg">
          {banner}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {statusChips.map((c) => (
            <button key={c.value} onClick={() => setStatusFilter(c.value)}
              className={`text-[12px] px-3 py-1.5 rounded-lg font-medium border transition-colors ${statusFilter === c.value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {c.label}
              <span className={`ml-1.5 text-[10px] ${statusFilter === c.value ? "opacity-80" : "text-gray-400"}`}>{c.count}</span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {highConfUnverified.length > 0 && (
            <button onClick={bulkApprove} disabled={bulking}
              className="text-[12px] px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 border border-green-600 flex items-center gap-1.5 transition-colors">
              <CheckCircle size={12} />
              {bulking ? "Approving…" : `Approve High Conf. (${highConfUnverified.length})`}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] flex-1 min-w-48 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="Search by party or record ID…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={doctypeFilter} onChange={(e) => setDoctypeFilter(e.target.value)}>
          <option value="">All Document Types</option>
          {allDoctypes.map((dt) => <option key={dt} value={dt}>{dt.replace("VE ", "")}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50/60">
                {["#", "Type", "Record ID", "Party / Employee", "Amount", "Date", "Confidence", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-[13px] text-gray-400">No records match the current filters</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.docname}
                  className={`border-b hover:bg-indigo-50/20 cursor-pointer transition-colors group ${r.manual_review_required ? "bg-amber-50/30" : ""}`}
                  onClick={() => onView(r)}>
                  <td className="px-4 py-3 text-[11px] text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-semibold">{r.doctype.replace("VE ", "")}</span>
                    {r.manual_review_required && <AlertTriangle size={11} className="inline ml-1.5 text-amber-500" />}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">{r.docname}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-700 max-w-[140px] truncate whitespace-nowrap" title={r.party || undefined}>{r.party || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-700 font-medium whitespace-nowrap">{r.amount ? `₹${r.amount.toLocaleString("en-IN")}` : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-400 whitespace-nowrap">{r.date || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${confClass(r.confidence_score)}`}>{r.confidence_score}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusClass(r.verification_status)}`}>{r.verification_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-[12px] text-indigo-600 hover:underline font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onView(r) }}>
                      {r.verification_status === "Verified" || r.verification_status === "Corrected" ? "View" : "Verify"} <ChevronRight size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 text-[11px] text-gray-400 border-t flex items-center justify-between bg-gray-50/40">
          <span>Showing {filtered.length} of {records.length} records</span>
          <span>Click any row to open detail panel</span>
        </div>
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
    <div className="max-w-md mx-auto text-center py-16">
      <div className="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <CheckCircle size={36} className="text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Auto-Verify Complete</h2>
      <p className="text-[13px] text-gray-500 mb-8">Processed at {threshold}% confidence threshold</p>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-600">{result.autoVerified}</div>
          <div className="text-[12px] text-green-700 mt-1 font-medium">Auto-verified</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-amber-600">{result.needsReview}</div>
          <div className="text-[12px] text-amber-700 mt-1 font-medium">Need review</div>
        </div>
      </div>
      {result.needsReview > 0 && (
        <button onClick={() => onDone(result.needsReview)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors">
          Review {result.needsReview} Records
        </button>
      )}
      <button onClick={() => setResult(null)} className="block mx-auto mt-3 text-[13px] text-gray-400 hover:underline">Run again with different threshold</button>
    </div>
  )

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Zap size={28} className="text-indigo-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 text-center mb-1">Auto-Verify Records</h2>
        <p className="text-[13px] text-gray-500 text-center mb-7">AI-extracted records above the confidence threshold will be automatically marked as verified</p>

        <div className="mb-6">
          <div className="flex items-center justify-between text-[13px] font-semibold text-gray-700 mb-3">
            <span>Confidence Threshold</span>
            <span className="text-indigo-600 text-[15px]">{threshold}%</span>
          </div>
          <input type="range" min={50} max={95} value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            className="w-full accent-indigo-600" />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>50% (lenient)</span>
            <span>95% (strict)</span>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-[13px] text-gray-600">
          Records scoring <strong className="text-indigo-600">{threshold}%+</strong> will be auto-verified.
          Records below will be flagged for manual review.
        </div>

        <button onClick={run} disabled={running}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
          {running ? <><RefreshCw size={15} className="animate-spin" /> Running…</> : <><Zap size={15} /> Run Auto-Verify</>}
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

  const pending = allRecords.filter(r => r.verification_status !== "Verified" && r.verification_status !== "Corrected")
  const current = pending[idx]
  const pct = pending.length > 0 ? Math.round((idx / pending.length) * 100) : 0

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
      const key = act === "approve" ? "approved" : act === "correct" ? "corrected" : act === "reject" ? "rejected" : "skipped"
      setSummary((p) => ({ ...p, [key]: p[key as keyof typeof p] + 1 }))
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

  if (pending.length === 0) return (
    <div className="text-center py-16">
      <div className="w-20 h-20 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <CheckCircle size={36} className="text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">All Caught Up</h2>
      <p className="text-[13px] text-gray-500">No records pending review.</p>
    </div>
  )

  if (idx >= pending.length) return (
    <div className="text-center py-16">
      <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <ClipboardCheck size={36} className="text-indigo-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Review Complete</h2>
      <div className="flex justify-center gap-8 text-sm mt-6">
        {(["approved","corrected","rejected","skipped"] as const).map((k) => (
          <div key={k} className="text-center">
            <div className={`text-2xl font-bold ${k === "approved" ? "text-green-600" : k === "corrected" ? "text-blue-600" : k === "rejected" ? "text-red-500" : "text-gray-400"}`}>{summary[k]}</div>
            <div className="text-[12px] text-gray-500 capitalize mt-0.5">{k}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const fields = detail?.field_comparison ?? []
  const lowFields = fields.filter((f: FieldComp) => f.confidence < 60)
  const hasDriveLink = !!detail?.drive_file?.drive_view_link

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between text-[12px] text-gray-500 mb-3">
        <span>Record {idx + 1} of {pending.length}</span>
        <span className="text-gray-400">Keyboard: A = Approve, R = Reject, S = Skip</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6">
        <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50/60 flex items-center justify-between">
          <div>
            <span className="font-bold text-gray-800 text-[14px]">{current.doctype.replace("VE ", "")}</span>
            <span className="text-gray-400 text-[12px] ml-2">{current.docname}</span>
            {current.party && <span className="ml-2 text-[12px] text-gray-600">· {current.party}</span>}
          </div>
          <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg ${confClass(current.confidence_score)}`}>{current.confidence_score}%</span>
        </div>

        <div className="p-5">
          {hasDriveLink && detail?.drive_file && (
            <a href={detail.drive_file.drive_view_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors">
              <span className="text-[12px] text-indigo-700 font-medium truncate">{detail.drive_file.file_name}</span>
              <span className="text-[11px] text-indigo-600 font-semibold shrink-0 ml-2 flex items-center gap-1"><ExternalLink size={11} /> Open</span>
            </a>
          )}

          {lowFields.length > 0 ? (
            <div>
              <h4 className="text-[12px] font-semibold text-red-700 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Low confidence — verify these fields
              </h4>
              <div className="space-y-2">
                {lowFields.map((fc: FieldComp) => (
                  <div key={fc.field} className="flex items-center gap-3 p-3 rounded-lg border border-red-100 bg-red-50/20">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-gray-500 mb-1">{fc.label}</div>
                      <input
                        className="text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={edits[fc.field] !== undefined ? edits[fc.field] : String(fc.current_value ?? "")}
                        onChange={(e) => setEdits((p) => ({ ...p, [fc.field]: e.target.value }))}
                      />
                    </div>
                    <span className="text-[10px] text-red-600 font-bold shrink-0">{fc.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-[13px] text-gray-400 py-4">
              {fields.length === 0 ? "No extraction data available" : "All fields have good confidence"}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 grid grid-cols-3 gap-2">
          <button onClick={() => handleAction("approve")} disabled={isProcessing}
            className="py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors text-center">
            <div className="text-[13px] flex items-center justify-center gap-1.5"><CheckCircle size={14} /> Approve</div>
            <div className="text-[10px] opacity-60 mt-0.5">[A]</div>
          </button>
          <button onClick={() => handleAction("correct")} disabled={isProcessing}
            className="py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            <div className="text-[13px]">Fix & Save</div>
          </button>
          <button onClick={() => handleAction("skip")} disabled={isProcessing}
            className="py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors text-center">
            <div className="text-[13px] flex items-center justify-center gap-1.5"><SkipForward size={14} /> Skip</div>
            <div className="text-[10px] opacity-60 mt-0.5">[S]</div>
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mt-5">
      <div className="px-4 py-3 border-b text-[13px] font-semibold text-gray-700">Extraction Quality by Document Type</div>
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50/60">
            {["Document Type", "Total", "Verified", "Avg Confidence", "Verification Rate"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.by_doctype.map((row) => (
            <tr key={row.doctype} className="border-b hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-[12px] text-gray-700 font-medium">{row.doctype.replace("VE ", "")}</td>
              <td className="px-4 py-3 text-[12px] text-gray-600">{row.total}</td>
              <td className="px-4 py-3 text-[12px] text-green-600 font-medium">{row.verified + row.corrected}</td>
              <td className="px-4 py-3">
                <span className={`text-[12px] font-semibold ${row.avg_confidence >= 70 ? "text-green-600" : row.avg_confidence >= 40 ? "text-amber-600" : "text-red-600"}`}>
                  {Math.round(row.avg_confidence)}%
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${row.verification_rate}%` }} />
                  </div>
                  <span className="text-[12px] text-gray-500 w-8 text-right shrink-0">{Math.round(row.verification_rate)}%</span>
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
  const [detailRecord, setDetailRecord] = useState<{ doctype: string; docname: string } | null>(null)

  // Folder navigation state (drives the doctype filter)
  const [navModule, setNavModule] = useState<VerifyModuleKey | "All">("All")
  const [navDocType, setNavDocType] = useState<string>("All")

  const isAtHome    = navModule === "All"
  const isAtModule  = navModule !== "All" && navDocType === "All"
  const isAtDocType = navModule !== "All" && navDocType !== "All"
  const curMod      = navModule !== "All" ? VERIFY_MODULE_STRUCTURE[navModule as VerifyModuleKey] : null

  function goToModule(mod: VerifyModuleKey | "All") {
    setNavModule(mod); setNavDocType("All")
  }
  function goToDoctype(dt: string) {
    setNavDocType(dt)
  }
  function switchMode(m: Mode) {
    setMode(m)
    if (m !== "all") { setNavModule("All"); setNavDocType("All") }
  }
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["all-extracted"],
    queryFn: () => getAllExtractedRecords(),
    staleTime: 0, refetchOnMount: "always",
  })

  const records = data?.records ?? []
  const stats = data?.stats ?? { total: 0, verified: 0, corrected: 0, needs_review: 0, unverified: 0, manual_required: 0, avg_confidence: 0 }

  const modeItems: { key: Mode; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "all", label: "All Records", icon: <Table2 size={14} /> },
    { key: "auto", label: "Auto-Verify", icon: <Zap size={14} /> },
    { key: "review", label: "Review Mode", icon: <ClipboardCheck size={14} />, badge: stats.needs_review || undefined },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Verification</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Review and verify AI-extracted document data from Google Drive</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => navigate("/business")}
            className="flex items-center gap-1.5 text-[12px] text-indigo-600 hover:text-indigo-800 px-3 py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
            Business Dashboard <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && <StatsStrip stats={stats} />}

      {/* Manual review warning */}
      {!isLoading && stats.manual_required > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <span className="text-[13px] text-amber-800 font-medium">
            {stats.manual_required} record{stats.manual_required !== 1 ? "s" : ""} flagged for manual review after 3 failed extraction attempts
          </span>
          <button onClick={() => setMode("review")} className="ml-auto text-[12px] text-amber-700 font-semibold hover:underline shrink-0 flex items-center gap-1">
            Review Now <ChevronRight size={11} />
          </button>
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex gap-2 mb-6">
        {modeItems.map((m) => (
          <button key={m.key} onClick={() => switchMode(m.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all ${mode === m.key ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
            {m.icon}
            {m.label}
            {m.badge && m.badge > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${mode === m.key ? "bg-white/20 text-white" : "bg-amber-400 text-white"}`}>
                {m.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mode content */}
      {isLoading ? (
        <div className="text-center py-16">
          <RefreshCw size={24} className="animate-spin mx-auto text-indigo-300 mb-3" />
          <p className="text-[13px] text-gray-400">Loading records…</p>
        </div>
      ) : mode === "all" ? (
        <>
          {/* Breadcrumb */}
          {!isAtHome && (
            <nav className="flex items-center gap-1.5 text-[13px] mb-1">
              <button onClick={() => goToModule("All")} className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors">
                <Home size={13} /><span>Verification</span>
              </button>
              <ChevronRight size={13} className="text-gray-300" />
              <button
                onClick={() => goToModule(navModule as VerifyModuleKey)}
                className={`transition-colors ${isAtModule ? "text-gray-800 font-semibold" : "text-indigo-600 hover:text-indigo-800"}`}
              >
                {curMod?.label}
              </button>
              {isAtDocType && (
                <>
                  <ChevronRight size={13} className="text-gray-300" />
                  <span className="text-gray-800 font-semibold">
                    {curMod?.doctypes.find(d => d.value === navDocType)?.label ?? navDocType.replace("VE ", "")}
                  </span>
                </>
              )}
            </nav>
          )}

          {/* Home — module folder grid */}
          {isAtHome && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Modules</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(VERIFY_MODULE_STRUCTURE) as VerifyModuleKey[]).map((mod) => (
                  <ModuleVerifyFolderCard key={mod} modKey={mod} records={records} onClick={() => goToModule(mod)} />
                ))}
              </div>
            </section>
          )}

          {/* Module — doctype folder grid */}
          {isAtModule && curMod && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Categories in {curMod.label}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {curMod.doctypes.map((dt) => (
                  <DoctypeVerifyFolderCard
                    key={dt.value} dt={dt} records={records}
                    modKey={navModule as VerifyModuleKey}
                    onClick={() => goToDoctype(dt.value)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* DocType — filtered records table */}
          {isAtDocType && (
            <AllRecordsMode
              records={records}
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              doctypeFilter={navDocType}
              setDoctypeFilter={(dt) => dt ? setNavDocType(dt) : goToModule(navModule as VerifyModuleKey)}
              onView={(r) => setDetailRecord({ doctype: r.doctype, docname: r.docname })}
            />
          )}

          {/* Accuracy table always shown at home */}
          {isAtHome && <AccuracyTable />}
        </>
      ) : mode === "auto" ? (
        <AutoVerifyMode onDone={() => { switchMode("review"); refetch() }} />
      ) : (
        <ReviewMode allRecords={records} />
      )}

      {detailRecord && (
        <DetailPanel
          doctype={detailRecord.doctype}
          docname={detailRecord.docname}
          onClose={() => setDetailRecord(null)}
          onVerified={() => { setDetailRecord(null); qc.invalidateQueries({ queryKey: ["all-extracted"] }) }}
        />
      )}
    </div>
  )
}
