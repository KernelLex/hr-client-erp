import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, XCircle, Download } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  useAllLeaves, useApproveLeave, useRejectLeave, useLeaveSummary, useEmployeeLeaveHistory,
} from "@/pages/leave/useLeave"
import type { LeaveApplication } from "@/pages/leave/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function initials(name?: string) {
  if (!name) return "?"
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending:  "bg-yellow-100 text-yellow-700",
    Approved: "bg-green-100 text-green-700",
    Rejected: "bg-red-100 text-red-700",
  }
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  )
}

// ── Reject Modal ──────────────────────────────────────────────────────────────

interface RejectModalProps {
  leave: LeaveApplication
  onClose: () => void
  onConfirm: (remarks: string) => void
  isPending: boolean
}

function RejectModal({ leave, onClose, onConfirm, isPending }: RejectModalProps) {
  const [remarks, setRemarks] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Reject Leave Request</h2>
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-medium text-gray-800">{leave.employee_name}</span> ·{" "}
          {leave.leave_type} · {formatDate(leave.from_date)} → {formatDate(leave.to_date)} ({leave.total_days}d)
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Reason for rejection <span className="text-red-500">*</span>
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          placeholder="Enter reason for rejection…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => remarks.trim() && onConfirm(remarks)}
            disabled={!remarks.trim() || isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isPending ? "Rejecting…" : "Reject Leave"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Approve Confirm Dialog ────────────────────────────────────────────────────

interface ApproveDialogProps {
  leave: LeaveApplication
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}

function ApproveDialog({ leave, onClose, onConfirm, isPending }: ApproveDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-2">Approve Leave?</h2>
        <p className="text-sm text-gray-600 mb-5">
          Approve <span className="font-semibold text-gray-800">{leave.total_days} day{leave.total_days !== 1 ? "s" : ""}</span> of{" "}
          <span className="font-semibold">{leave.leave_type}</span> for{" "}
          <span className="font-semibold text-gray-800">{leave.employee_name}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? "Approving…" : "✓ Approve"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Leave Card (Pending tab) ──────────────────────────────────────────────────

function LeaveCard({ leave }: { leave: LeaveApplication }) {
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const approveMut = useApproveLeave()
  const rejectMut = useRejectLeave()

  async function handleApprove() {
    const res = await approveMut.mutateAsync({ leave_id: leave.name })
    if (res.success) {
      toast.success(`Leave approved for ${leave.employee_name}`)
      setShowApprove(false)
    } else {
      toast.error(res.error ?? "Failed to approve")
    }
  }

  async function handleReject(remarks: string) {
    const res = await rejectMut.mutateAsync({ leave_id: leave.name, admin_remarks: remarks })
    if (res.success) {
      toast.success(`Leave rejected for ${leave.employee_name}`)
      setShowReject(false)
    } else {
      toast.error(res.error ?? "Failed to reject")
    }
  }

  const dept = leave.department?.replace(/ - V$/, "") ?? ""

  return (
    <>
      <Card className="bg-white shadow-sm border border-gray-200 hover:border-blue-200 transition-colors">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="size-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-blue-700">{initials(leave.employee_name)}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{leave.employee_name}</span>
                {dept && (
                  <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{dept}</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                <span className="font-medium text-gray-800">{leave.leave_type}</span>
                <span>·</span>
                <span>{formatDate(leave.from_date)} → {formatDate(leave.to_date)}</span>
                <span>·</span>
                <span className="font-semibold text-gray-700">{leave.total_days}d</span>
              </div>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">{leave.reason}</p>
              <p className="text-[11px] text-gray-400 mt-1">Applied {formatDate(leave.applied_on)}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setShowApprove(true)}
                className="h-8 bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
              >
                <CheckCircle2 size={13} /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowReject(true)}
                className="h-8 border-red-200 text-red-700 hover:bg-red-50 text-xs gap-1"
              >
                <XCircle size={13} /> Reject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showApprove && (
        <ApproveDialog
          leave={leave}
          onClose={() => setShowApprove(false)}
          onConfirm={handleApprove}
          isPending={approveMut.isPending}
        />
      )}
      {showReject && (
        <RejectModal
          leave={leave}
          onClose={() => setShowReject(false)}
          onConfirm={handleReject}
          isPending={rejectMut.isPending}
        />
      )}
    </>
  )
}

// ── Tab 1: Pending Requests ───────────────────────────────────────────────────

function PendingTab() {
  const { data, isLoading } = useAllLeaves("Pending")
  const pending = data?.success ? data.data : []

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <CheckCircle2 size={40} className="text-green-300 mx-auto mb-3" />
          <p className="text-base font-medium text-gray-500">No pending requests 🎉</p>
          <p className="text-sm text-gray-400 mt-1">All leave requests have been reviewed</p>
        </div>
      ) : (
        pending.map((leave) => <LeaveCard key={leave.name} leave={leave} />)
      )}
    </div>
  )
}

// ── Tab 2: All Requests ───────────────────────────────────────────────────────

function AllRequestsTab() {
  const [statusFilter, setStatusFilter] = useState("All")
  const { data, isLoading } = useAllLeaves(statusFilter)
  const leaves = data?.success ? data.data : []

  const STATUS_OPTIONS = ["All", "Pending", "Approved", "Rejected"]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
            {s !== "All" && data?.success && (
              <span className="ml-1 opacity-70">({data.data.filter((l) => s === "All" || l.status === s).length})</span>
            )}
          </button>
        ))}
      </div>

      <Card className="bg-white shadow-sm border-0">
        <CardContent className="pt-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Employee", "Type", "From", "To", "Days", "Applied", "Status", "Remarks"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-gray-50">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : leaves.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">No leave requests found</td></tr>
              ) : (
                leaves.map((leave) => (
                  <tr key={leave.name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">{leave.employee_name}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{leave.leave_type}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatDate(leave.from_date)}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatDate(leave.to_date)}</td>
                    <td className="px-3 py-3 text-gray-600">{leave.total_days}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(leave.applied_on)}</td>
                    <td className="px-3 py-3"><StatusBadge status={leave.status} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[150px]">
                      <span className="truncate block" title={leave.admin_remarks}>{leave.admin_remarks || "—"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Employee History Drawer ───────────────────────────────────────────────────

function EmployeeHistoryModal({ email, name, onClose }: { email: string; name: string; onClose: () => void }) {
  const { data, isLoading } = useEmployeeLeaveHistory(email)
  const leaves = data?.success ? data.data : []
  const approved = leaves.filter((l) => l.status === "Approved")
  const totalDays = approved.reduce((s, l) => s + l.total_days, 0)
  const byType: Record<string, number> = {}
  for (const l of approved) {
    byType[l.leave_type] = (byType[l.leave_type] ?? 0) + l.total_days
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{name} — Leave History</h2>
            <p className="text-xs text-gray-500">{totalDays} total days taken · {leaves.filter((l) => l.status === "Pending").length} pending</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-medium">✕</button>
        </div>

        {/* Summary */}
        {Object.keys(byType).length > 0 && (
          <div className="px-6 py-3 border-b border-gray-50 flex gap-4 flex-wrap">
            {Object.entries(byType).map(([type, days]) => (
              <span key={type} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                {type}: <strong>{days}d</strong>
              </span>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
            </div>
          ) : leaves.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No leave history</p>
          ) : (
            leaves.map((leave) => (
              <div key={leave.name} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{leave.leave_type}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {formatDate(leave.from_date)} → {formatDate(leave.to_date)} · {leave.total_days}d
                    </span>
                  </div>
                  <StatusBadge status={leave.status} />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">{leave.reason}</p>
                {leave.admin_remarks && (
                  <p className="text-xs text-gray-500 mt-1 italic">Admin: {leave.admin_remarks}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">Applied {formatDate(leave.applied_on)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab 3: By Employee ────────────────────────────────────────────────────────

function ByEmployeeTab() {
  const { data, isLoading } = useAllLeaves("All")
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  const [openName, setOpenName] = useState("")
  const leaves = data?.success ? data.data : []

  const byEmployee: Record<string, { name: string; dept: string; pending: number; approved: number; email: string }> = {}
  for (const l of leaves) {
    if (!byEmployee[l.employee]) {
      byEmployee[l.employee] = {
        name: l.employee_name,
        dept: l.department?.replace(/ - V$/, "") ?? "",
        pending: 0,
        approved: 0,
        email: "",
      }
    }
    if (l.status === "Pending") byEmployee[l.employee].pending++
    if (l.status === "Approved") byEmployee[l.employee].approved++
  }

  return (
    <div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl" />)}
        </div>
      ) : Object.keys(byEmployee).length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No leave requests submitted yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(byEmployee).map(([empId, emp]) => (
            <Card key={empId} className="bg-white shadow-sm border border-gray-200">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-700">{initials(emp.name)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{emp.name}</p>
                    {emp.dept && <p className="text-xs text-gray-500">{emp.dept}</p>}
                  </div>
                </div>
                <div className="flex gap-3 mb-3">
                  {emp.pending > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                      {emp.pending} pending
                    </span>
                  )}
                  {emp.approved > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {emp.approved} approved
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                  onClick={() => {
                    // Look up email from leaves
                    const sample = leaves.find((l) => l.employee === empId)
                    const userEmail = sample?.employee ?? empId
                    setOpenEmail(userEmail)
                    setOpenName(emp.name)
                  }}
                >
                  View History
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {openEmail && (
        <EmployeeHistoryModal
          email={openEmail}
          name={openName}
          onClose={() => setOpenEmail(null)}
        />
      )}
    </div>
  )
}

// ── Tab 4: Summary Report ─────────────────────────────────────────────────────

function SummaryTab() {
  const { data, isLoading } = useLeaveSummary()
  const summary = data?.success ? data.data : []

  function exportCSV() {
    if (!summary.length) return
    const headers = ["Employee", "Department", "Total Days", "Casual", "Sick", "Emergency", "WFH", "Other", "Pending", "Approved", "Rejected"]
    const rows = summary.map((s) => [
      s.employee_name,
      s.department?.replace(/ - V$/, "") ?? "",
      s.total_days_taken,
      s.by_type["Casual Leave"] ?? 0,
      s.by_type["Sick Leave"] ?? 0,
      s.by_type["Emergency Leave"] ?? 0,
      s.by_type["Work From Home"] ?? 0,
      Object.entries(s.by_type).filter(([t]) => !["Casual Leave","Sick Leave","Emergency Leave","Work From Home"].includes(t)).reduce((n, [,v]) => n+v, 0),
      s.pending,
      s.approved,
      s.rejected,
    ])
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url; a.download = `leave_summary_${new Date().getFullYear()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Year {data?.year ?? new Date().getFullYear()} · Approved leaves only</p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={exportCSV} disabled={!summary.length}>
          <Download size={12} /> Export CSV
        </Button>
      </div>
      <Card className="bg-white shadow-sm border-0">
        <CardContent className="pt-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Employee", "Dept", "Total Days", "Casual", "Sick", "Emergency", "WFH", "Pending", "Approved", "Rejected"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-gray-50">
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-gray-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : summary.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-400">No leave data for this year</td></tr>
              ) : (
                summary.map((s) => (
                  <tr key={s.employee} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">{s.employee_name}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{s.department?.replace(/ - V$/, "") ?? "—"}</td>
                    <td className="px-3 py-3 font-semibold text-gray-800">{s.total_days_taken}</td>
                    <td className="px-3 py-3 text-gray-600">{s.by_type["Casual Leave"] ?? 0}</td>
                    <td className="px-3 py-3 text-gray-600">{s.by_type["Sick Leave"] ?? 0}</td>
                    <td className="px-3 py-3 text-gray-600">{s.by_type["Emergency Leave"] ?? 0}</td>
                    <td className="px-3 py-3 text-gray-600">{s.by_type["Work From Home"] ?? 0}</td>
                    <td className="px-3 py-3">
                      {s.pending > 0 ? (
                        <span className="text-yellow-700 font-medium">{s.pending}</span>
                      ) : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-3 py-3 text-green-700 font-medium">{s.approved}</td>
                    <td className="px-3 py-3 text-red-600">{s.rejected}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type LeaveTab = "pending" | "all" | "by-employee" | "summary"

export function LeaveAdminPanel() {
  const [activeTab, setActiveTab] = useState<LeaveTab>("pending")
  const { data: pendingData } = useAllLeaves("Pending")
  const pendingCount = pendingData?.success ? pendingData.data.length : 0

  const TABS: { key: LeaveTab; label: string; badge?: number }[] = [
    { key: "pending", label: "Pending", badge: pendingCount },
    { key: "all", label: "All Requests" },
    { key: "by-employee", label: "By Employee" },
    { key: "summary", label: "Summary" },
  ]

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
              activeTab === key
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "pending" && <PendingTab />}
      {activeTab === "all" && <AllRequestsTab />}
      {activeTab === "by-employee" && <ByEmployeeTab />}
      {activeTab === "summary" && <SummaryTab />}
    </div>
  )
}
