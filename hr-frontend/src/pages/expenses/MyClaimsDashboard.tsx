import { useState } from "react"
import type React from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Receipt, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { useMyClaims, useMonthlyExpenseSummary } from "./useExpenses"
import type { ExpenseClaim, ClaimStatus } from "./types"
import { MONTHS } from "./types"

const OWAIS_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

function fmt(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
}

function statusClass(status: ClaimStatus) {
  return status === "Approved"
    ? "bg-green-100 text-green-800"
    : status === "Rejected"
    ? "bg-red-100 text-red-800"
    : "bg-orange-100 text-orange-800"
}

function typeStyle(type: string): React.CSSProperties {
  return type === "Petrol"
    ? { backgroundColor: "#DBEAFE", color: "#1E40AF" }
    : { backgroundColor: "#EDE9FE", color: "#5B21B6" }
}

function ClaimRow({ claim }: { claim: ExpenseClaim }) {
  const [expanded, setExpanded] = useState(false)
  const receipt = claim.claim_type === "Petrol" ? claim.fuel_receipt : claim.material_receipt

  return (
    <div
      className="rounded-[10px] overflow-hidden transition-all duration-150"
      style={{ border: "1px solid #E2E8F0", marginBottom: "8px" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = "#A5B4FC"
        el.style.boxShadow = "var(--shadow-card-hover)"
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = "#E2E8F0"
        el.style.boxShadow = "none"
      }}
    >
      <button
        className="w-full flex items-center gap-3 bg-white text-left transition-colors"
        style={{ padding: "14px 18px" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded"
              style={typeStyle(claim.claim_type)}
            >
              {claim.claim_type === "Petrol" ? "⛽" : "📦"} {claim.claim_type}
            </span>
            <span className="text-xs text-gray-500">{claim.claim_date}</span>
          </div>
          <p className="text-sm text-gray-800 truncate">{claim.purpose}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-sm text-gray-900">{fmt(claim.amount)}</p>
          <Badge className={cn("text-[10px] mt-1", statusClass(claim.status))}>{claim.status}</Badge>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-2 text-sm">
          {claim.claim_type === "Petrol" && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {claim.km_driven > 0 && <div><span className="text-gray-500">KM: </span>{claim.km_driven}</div>}
              {claim.vehicle_number && <div><span className="text-gray-500">Vehicle: </span>{claim.vehicle_number}</div>}
              {claim.route_from && <div><span className="text-gray-500">From: </span>{claim.route_from}</div>}
              {claim.route_to && <div><span className="text-gray-500">To: </span>{claim.route_to}</div>}
            </div>
          )}
          {claim.claim_type === "Material" && (
            <div className="space-y-1 text-xs">
              {claim.material_description && <div><span className="text-gray-500">Description: </span>{claim.material_description}</div>}
              {claim.vendor_name && <div><span className="text-gray-500">Vendor: </span>{claim.vendor_name}</div>}
            </div>
          )}
          {receipt && (
            <a href={receipt} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <ExternalLink size={11} /> View Receipt
            </a>
          )}
          {claim.status === "Approved" && (
            <div className="bg-green-50 border border-green-100 rounded p-2 text-xs text-green-800">
              ✅ Approved by Owais{claim.reviewed_on ? ` on ${claim.reviewed_on.slice(0, 10)}` : ""}
              {claim.admin_notes && <div className="mt-1 text-green-700">Note: {claim.admin_notes}</div>}
            </div>
          )}
          {claim.status === "Rejected" && (
            <div className="bg-red-50 border border-red-100 rounded p-2 text-xs text-red-800">
              ❌ Rejected{claim.reviewed_on ? ` on ${claim.reviewed_on.slice(0, 10)}` : ""}
              {claim.rejection_reason && <div className="mt-1 font-medium">Reason: {claim.rejection_reason}</div>}
              {claim.admin_notes && <div className="mt-1 text-red-700">Note: {claim.admin_notes}</div>}
            </div>
          )}
          {claim.status === "Pending" && (
            <div className="bg-orange-50 border border-orange-100 rounded p-2 text-xs text-orange-700">
              ⏳ Awaiting Owais's review
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SummaryCardConfig {
  label: string
  amount: number
  bg: string
  border: string
  amountColor: string
  labelColor: string
}

function SummaryCard({ label, amount, bg, border, amountColor, labelColor }: SummaryCardConfig) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: "12px" }}
    >
      <p className="text-xs font-medium" style={{ color: labelColor }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: amountColor }}>{fmt(amount)}</p>
    </div>
  )
}

export function MyClaimsDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOwais = user && OWAIS_USERS.has(user.name)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const { data: allClaims = [], isLoading } = useMyClaims()
  const { data: summaryData } = useMonthlyExpenseSummary(selectedMonth, selectedYear)

  const summary = summaryData?.summary?.[0]

  const filteredClaims = allClaims.filter((c) => {
    if (!c.claim_date) return false
    const d = new Date(c.claim_date)
    return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear
  })

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt size={20} className="text-gray-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">My Expense Claims</h1>
            <p className="text-sm text-gray-500">{allClaims.length} total claims</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwais && (
            <Button variant="outline" size="sm" onClick={() => navigate("/expenses/admin")}>
              Admin View
            </Button>
          )}
          <Button size="sm" onClick={() => navigate("/expenses/new")} className="gap-1">
            <Plus size={14} /> New Claim
          </Button>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2">
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
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Claimed" amount={summary?.total_claimed ?? 0}
          bg="#FFFFFF" border="#A5B4FC" amountColor="#3730A3" labelColor="#4338CA"
        />
        <SummaryCard
          label="Approved" amount={summary?.total_approved ?? 0}
          bg="#ECFDF5" border="#6EE7B7" amountColor="#065F46" labelColor="#047857"
        />
        <SummaryCard
          label="Pending" amount={summary?.total_pending ?? 0}
          bg="#FFFBEB" border="#FCD34D" amountColor="#92400E" labelColor="#B45309"
        />
        <SummaryCard
          label="Rejected" amount={summary?.total_rejected ?? 0}
          bg="#FEF2F2" border="#FCA5A5" amountColor="#991B1B" labelColor="#DC2626"
        />
      </div>

      {/* Claims list */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">
          {MONTHS[selectedMonth - 1]} {selectedYear} — {filteredClaims.length} claim{filteredClaims.length !== 1 ? "s" : ""}
        </h2>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))
        ) : filteredClaims.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Receipt size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No claims for this month</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/expenses/new")}>
              Submit a Claim
            </Button>
          </div>
        ) : (
          filteredClaims.map((claim) => <ClaimRow key={claim.name} claim={claim} />)
        )}
      </div>
    </div>
  )
}
