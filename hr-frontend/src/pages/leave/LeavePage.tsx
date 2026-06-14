import { useRef, useState, useMemo, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { CalendarDays, Clock, CheckCircle2, XCircle, Plus, Paperclip, FileText, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useMyLeaves, useApplyLeave, useLeaveDocuments, useUploadLeaveDocument } from "./useLeave"
import { LEAVE_TYPES } from "./types"
import type { LeaveApplication } from "./types"

const MAX_LEAVES_PER_MONTH = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function calcWorkingDays(from: string, to: string): number {
  if (!from || !to) return 0
  const f = new Date(from), t = new Date(to)
  if (t < f) return 0
  let count = 0, d = new Date(f)
  while (d <= t) {
    if (d.getDay() !== 0) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    Approved: "bg-green-100 text-green-700 border border-green-200",
    Rejected: "bg-red-100 text-red-700 border border-red-200",
  }
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  )
}

// ── Leave Documents Panel ─────────────────────────────────────────────────────

function LeaveDocumentsPanel({ leaveId }: { leaveId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data, isLoading } = useLeaveDocuments(leaveId)
  const upload = useUploadLeaveDocument(leaveId)
  const [open, setOpen] = useState(false)

  const files = data?.files ?? []

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = ""
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 mt-1"
      >
        <Paperclip size={11} />
        {files.length > 0 ? `${files.length} document${files.length > 1 ? "s" : ""}` : "Attach documents"}
      </button>
    )
  }

  return (
    <div className="mt-2 border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-700 flex items-center gap-1">
          <Paperclip size={11} /> Supporting Documents
        </p>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">hide</button>
      </div>

      {isLoading ? (
        <div className="h-8 bg-gray-200 rounded animate-pulse" />
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-400">No documents attached yet.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2">
              <FileText size={12} className="text-gray-400 shrink-0" />
              <a
                href={f.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline truncate"
              >
                {f.file_name}
              </a>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={upload.isPending}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
      >
        <Upload size={11} />
        {upload.isPending ? "Uploading…" : "Upload document"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

// ── Apply Form ────────────────────────────────────────────────────────────────

function ApplyLeaveForm({ leaves, onSuccess, initialType = "" }: { leaves: LeaveApplication[]; onSuccess: () => void; initialType?: string }) {
  const [leaveType, setLeaveType] = useState(initialType)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [reason, setReason] = useState("")
  const applyMutation = useApplyLeave()

  const totalDays = useMemo(() => calcWorkingDays(fromDate, toDate), [fromDate, toDate])
  const today = new Date().toISOString().slice(0, 10)

  // Count non-rejected leaves in the selected month for client-side hint
  const leavesThisMonth = useMemo(() => {
    if (!fromDate) return 0
    const key = getMonthKey(fromDate)
    return leaves.filter(
      (l) => l.status !== "Rejected" && getMonthKey(l.from_date) === key,
    ).length
  }, [fromDate, leaves])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!leaveType || !fromDate || !toDate || !reason.trim()) {
      toast.error("Please fill in all required fields")
      return
    }
    if (toDate < fromDate) {
      toast.error("End date must be on or after start date")
      return
    }
    if (leavesThisMonth >= MAX_LEAVES_PER_MONTH) {
      const month = new Date(fromDate).toLocaleString("en-IN", { month: "long", year: "numeric" })
      toast.error(`You have reached the maximum of ${MAX_LEAVES_PER_MONTH} leaves for ${month}.`)
      return
    }

    const res = await applyMutation.mutateAsync({ leave_type: leaveType, from_date: fromDate, to_date: toDate, reason })
    if (res.success) {
      toast.success("Leave request submitted successfully")
      setLeaveType(""); setFromDate(""); setToDate(""); setReason("")
      onSuccess()
    } else {
      toast.error(res.error ?? "Failed to submit leave request")
    }
  }

  return (
    <Card id="apply-leave-form" className="bg-white shadow-sm border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Plus size={15} className="text-blue-500" />
          Apply for Leave
          {initialType && (
            <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#F3E8FF", color: "#7C3AED" }}>
              {initialType}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Leave Type <span className="text-red-500">*</span>
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select leave type…</option>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                From Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={fromDate}
                min={today}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  if (toDate && e.target.value > toDate) setToDate(e.target.value)
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                To Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={toDate}
                min={fromDate || today}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {fromDate && toDate && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <Clock size={14} className="text-blue-500" />
              <span className="text-sm text-blue-700">
                <span className="font-semibold">{totalDays}</span> working day{totalDays !== 1 ? "s" : ""} (Sundays excluded)
              </span>
            </div>
          )}

          {/* 5-leave/month warning */}
          {fromDate && leavesThisMonth >= MAX_LEAVES_PER_MONTH && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              You have reached the maximum of {MAX_LEAVES_PER_MONTH} leaves for{" "}
              {new Date(fromDate).toLocaleString("en-IN", { month: "long", year: "numeric" })}.
            </div>
          )}
          {fromDate && leavesThisMonth > 0 && leavesThisMonth < MAX_LEAVES_PER_MONTH && (
            <p className="text-xs text-gray-500">
              {leavesThisMonth}/{MAX_LEAVES_PER_MONTH} leaves used this month
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Briefly explain the reason for your leave…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <Button
            type="submit"
            disabled={applyMutation.isPending || leavesThisMonth >= MAX_LEAVES_PER_MONTH}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm"
          >
            {applyMutation.isPending ? "Submitting…" : "Submit Leave Request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Leave Balance Card ────────────────────────────────────────────────────────

function LeaveBalanceCard({ leaves }: { leaves: LeaveApplication[] }) {
  const approved = leaves.filter((l) => l.status === "Approved")
  const byType: Record<string, number> = {}
  for (const l of approved) {
    byType[l.leave_type] = (byType[l.leave_type] ?? 0) + l.total_days
  }

  const pending = leaves.filter((l) => l.status === "Pending").length
  const total = approved.reduce((s, l) => s + l.total_days, 0)

  // Current month count
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`
  const thisMonthCount = leaves.filter(
    (l) => l.status !== "Rejected" && getMonthKey(l.from_date) === currentMonthKey,
  ).length

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <CalendarDays size={15} className="text-emerald-500" />
          Leave This Year
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{total}</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Days taken</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pending}</p>
            <p className="text-[11px] text-yellow-600 mt-0.5">Pending</p>
          </div>
        </div>

        {/* This month usage */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 font-medium mb-1.5">
            This Month ({now.toLocaleString("en-IN", { month: "short" })})
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${thisMonthCount >= MAX_LEAVES_PER_MONTH ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min((thisMonthCount / MAX_LEAVES_PER_MONTH) * 100, 100)}%` }}
              />
            </div>
            <span className={`text-xs font-semibold ${thisMonthCount >= MAX_LEAVES_PER_MONTH ? "text-red-600" : "text-gray-700"}`}>
              {thisMonthCount}/{MAX_LEAVES_PER_MONTH}
            </span>
          </div>
        </div>

        {Object.keys(byType).length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">By Type</p>
            {Object.entries(byType).map(([type, days]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-xs text-gray-600 truncate">{type}</span>
                <span className="text-xs font-semibold text-gray-800">{days}d</span>
              </div>
            ))}
          </div>
        )}

        {Object.keys(byType).length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">No approved leaves yet this year</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── History Table ─────────────────────────────────────────────────────────────

function LeaveHistoryTable({ leaves, isLoading }: { leaves: LeaveApplication[]; isLoading: boolean }) {
  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Clock size={15} className="text-gray-500" />
          My Leave History
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-3 animate-pulse py-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
          </div>
        ) : leaves.length === 0 ? (
          <div className="py-10 text-center">
            <CalendarDays size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">You have no leave requests yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Type", "From", "To", "Days", "Reason", "Applied", "Status", "Docs"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave) => (
                <>
                  <tr key={leave.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">{leave.leave_type}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatDate(leave.from_date)}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatDate(leave.to_date)}</td>
                    <td className="px-3 py-3 text-gray-600">{leave.total_days}</td>
                    <td className="px-3 py-3 text-gray-600 max-w-[200px]">
                      <p className="truncate" title={leave.reason}>{leave.reason}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(leave.applied_on)}</td>
                    <td className="px-3 py-3"><StatusBadge status={leave.status} /></td>
                    <td className="px-3 py-3">
                      <LeaveDocumentsPanel leaveId={leave.name} />
                    </td>
                  </tr>
                  {leave.status === "Rejected" && leave.admin_remarks && (
                    <tr key={`${leave.name}-remarks`} className="border-b border-gray-50 bg-red-50">
                      <td colSpan={8} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
                          <span className="text-xs text-red-700">
                            <span className="font-semibold">Reason: </span>{leave.admin_remarks}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {leave.status === "Approved" && leave.admin_remarks && (
                    <tr key={`${leave.name}-remarks`} className="border-b border-gray-50 bg-green-50">
                      <td colSpan={8} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
                          <span className="text-xs text-green-700">{leave.admin_remarks}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeavePage() {
  const [searchParams] = useSearchParams()
  const { data, isLoading } = useMyLeaves()
  const leaves = data?.success ? data.data : []
  const [_refresh, setRefresh] = useState(0)

  // Pre-select leave type from ?type= query param (e.g. from Happy Holiday button)
  const preSelectedType = searchParams.get("type") ?? ""

  useEffect(() => {
    if (preSelectedType) {
      const el = document.getElementById("apply-leave-form")
      if (el) {
        // Small delay so the page has rendered
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
      }
    }
  }, [preSelectedType])

  return (
    <div className="p-6 max-w-6xl space-y-6 min-h-full">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Leave</h1>
        <p className="text-sm text-gray-500 mt-0.5">Apply for leave and track your requests</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ApplyLeaveForm leaves={leaves} onSuccess={() => setRefresh((n) => n + 1)} initialType={preSelectedType} />
          <LeaveHistoryTable leaves={leaves} isLoading={isLoading} />
        </div>

        <div>
          <LeaveBalanceCard leaves={leaves} />
        </div>
      </div>
    </div>
  )
}
