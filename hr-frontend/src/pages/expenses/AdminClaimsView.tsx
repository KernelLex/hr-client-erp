import { useState } from "react"
import { useNavigate, Navigate } from "react-router-dom"
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { useAllClaims, useApproveClaim, useRejectClaim, useMonthlyExpenseSummary } from "./useExpenses"
import type { ExpenseClaim, ClaimStatus } from "./types"
import { MONTHS } from "./types"

const OWAIS_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

function fmt(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
}

function statusClass(status: ClaimStatus) {
  return status === "Approved" ? "bg-green-100 text-green-800"
    : status === "Rejected" ? "bg-red-100 text-red-800"
    : "bg-orange-100 text-orange-800"
}

function typeClass(type: string) {
  return type === "Petrol" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
}

function PendingClaimCard({ claim }: { claim: ExpenseClaim }) {
  const approve = useApproveClaim()
  const reject = useRejectClaim()
  const [adminNotes, setAdminNotes] = useState("")
  const [showReject, setShowReject] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const receipt = claim.claim_type === "Petrol" ? claim.fuel_receipt : claim.material_receipt

  async function handleApprove() {
    await approve.mutateAsync({ claimId: claim.name, adminNotes })
  }
  async function handleReject() {
    if (!rejectionReason.trim()) return
    await reject.mutateAsync({ claimId: claim.name, rejectionReason, adminNotes })
    setShowReject(false)
  }

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{claim.employee_name}</p>
          <p className="text-xs text-gray-500">{claim.employee_email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={cn("text-[10px]", typeClass(claim.claim_type))}>
            {claim.claim_type === "Petrol" ? "⛽" : "📦"} {claim.claim_type}
          </Badge>
          <p className="font-bold text-base text-gray-900">{fmt(claim.amount)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><span className="text-gray-400">Date: </span>{claim.claim_date}</div>
        <div><span className="text-gray-400">Purpose: </span><span className="line-clamp-1">{claim.purpose}</span></div>
        {claim.claim_type === "Petrol" && (
          <>
            {claim.km_driven > 0 && <div><span className="text-gray-400">KM: </span>{claim.km_driven}</div>}
            {claim.vehicle_number && <div><span className="text-gray-400">Vehicle: </span>{claim.vehicle_number}</div>}
            {(claim.route_from || claim.route_to) && (
              <div className="col-span-2">
                <span className="text-gray-400">Route: </span>
                {claim.route_from} → {claim.route_to}
              </div>
            )}
          </>
        )}
        {claim.claim_type === "Material" && (
          <>
            {claim.material_description && (
              <div className="col-span-2"><span className="text-gray-400">Description: </span>{claim.material_description}</div>
            )}
            {claim.vendor_name && <div><span className="text-gray-400">Vendor: </span>{claim.vendor_name}</div>}
          </>
        )}
      </div>

      {claim.pdf_path && (
        <a href={claim.pdf_path} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <ExternalLink size={11} /> Download PDF Receipt
        </a>
      )}
      {receipt && (
        <a href={receipt} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline">
          <ExternalLink size={11} /> {claim.claim_type === "Material" ? "View Invoice" : "View Receipt"}
        </a>
      )}

      <div>
        <Label className="text-xs">Admin Notes</Label>
        <textarea
          className="w-full min-h-[56px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1"
          placeholder="Notes for the employee..."
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
        />
      </div>

      {!showReject ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 gap-1"
            onClick={handleApprove} disabled={approve.isPending}>
            <CheckCircle size={13} />
            {approve.isPending ? "Approving…" : "✓ Approve"}
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 gap-1"
            onClick={() => setShowReject(true)}>
            <XCircle size={13} /> ✗ Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-red-600">Rejection Reason *</Label>
            <textarea
              className="w-full min-h-[56px] px-3 py-2 text-sm border border-red-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-red-500 mt-1"
              placeholder="Why are you rejecting this claim?"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" className="flex-1"
              onClick={handleReject}
              disabled={reject.isPending || !rejectionReason.trim()}>
              {reject.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function AllClaimsTable({ claims }: { claims: ExpenseClaim[] }) {
  const [filterStatus, setFilterStatus] = useState("")
  const [filterType, setFilterType] = useState("")

  const filtered = claims.filter((c) => {
    if (filterStatus && c.status !== filterStatus) return false
    if (filterType && c.claim_type !== filterType) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="Petrol">Petrol</option>
          <option value="Material">Material</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Employee</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Date</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Type</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Purpose</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Amount</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Status</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Attachment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-gray-400 text-sm">No claims found</td></tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.name} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-xs">{c.employee_name}</p>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{c.claim_date}</td>
                  <td className="px-4 py-2">
                    <Badge className={cn("text-[10px]", typeClass(c.claim_type))}>
                      {c.claim_type === "Petrol" ? "⛽" : "📦"} {c.claim_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] truncate">{c.purpose}</td>
                  <td className="px-4 py-2 text-xs text-right font-medium">{fmt(c.amount)}</td>
                  <td className="px-4 py-2">
                    <Badge className={cn("text-[10px]", statusClass(c.status))}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {c.claim_type === "Petrol" && c.pdf_path && (
                      <a href={c.pdf_path} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> PDF
                      </a>
                    )}
                    {c.claim_type === "Material" && c.material_receipt && (
                      <a href={c.material_receipt} target="_blank" rel="noopener noreferrer"
                        className="text-purple-600 hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> Invoice
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AdminClaimsView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOwais = user && OWAIS_USERS.has(user.name)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const { data, isLoading } = useAllClaims()
  const { data: summaryData } = useMonthlyExpenseSummary(selectedMonth, selectedYear, !!isOwais)

  if (!isOwais) return <Navigate to="/expenses" replace />

  const allClaims = data?.claims ?? []
  const pendingClaims = allClaims.filter((c) => c.status === "Pending")
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/expenses")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> My Claims
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Expense Claims — Admin View</h1>
      </div>

      {/* Pending banner */}
      {pendingClaims.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <span>{pendingClaims.length} claim{pendingClaims.length > 1 ? "s" : ""} awaiting your review</span>
        </div>
      )}

      {/* Pending claims */}
      {pendingClaims.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">Pending Approvals ({pendingClaims.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingClaims.map((c) => <PendingClaimCard key={c.name} claim={c} />)}
          </div>
        </div>
      )}

      {/* Monthly summary */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Monthly Summary</h2>
          <select
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {summaryData?.summary && summaryData.summary.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm bg-white">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Employee</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Claims</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Total</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Approved</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Pending</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Rejected</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Petrol</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Material</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.summary.map((s) => (
                  <tr key={s.employee} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-xs">{s.employee_name}</td>
                    <td className="px-4 py-2 text-xs text-right text-gray-600">{s.claim_count}</td>
                    <td className="px-4 py-2 text-xs text-right font-medium">{fmt(s.total_claimed)}</td>
                    <td className="px-4 py-2 text-xs text-right text-green-700">{fmt(s.total_approved)}</td>
                    <td className="px-4 py-2 text-xs text-right text-orange-700">{fmt(s.total_pending)}</td>
                    <td className="px-4 py-2 text-xs text-right text-red-700">{fmt(s.total_rejected)}</td>
                    <td className="px-4 py-2 text-xs text-right text-blue-700">{fmt(s.petrol_total)}</td>
                    <td className="px-4 py-2 text-xs text-right text-purple-700">{fmt(s.material_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No claims for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
        )}
      </div>

      {/* All claims table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">All Claims ({allClaims.length})</h2>
        {isLoading ? (
          <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <AllClaimsTable claims={allClaims} />
        )}
      </div>
    </div>
  )
}
