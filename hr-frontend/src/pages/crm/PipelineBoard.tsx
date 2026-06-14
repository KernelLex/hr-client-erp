import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Briefcase, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import { useCRMLeads, usePendingApprovals, useApproveStage, useRejectStage } from "./useCRM"
import type { CRMLead, CRMStage, CRMApprovalRequest } from "./types"
import { STAGE_ORDER, STAGE_COLUMN_COLORS, STAGE_HEADER_COLORS } from "./types"

const OWAIS_USERS = new Set(["Administrator", "owais@veraenterprises.in"])
const ALL_STAGES: CRMStage[] = [...STAGE_ORDER, "Failed"]

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function LeadCard({ lead }: { lead: CRMLead }) {
  const navigate = useNavigate()
  const days = daysSince(lead.creation)
  const isPending = lead.stage_push_requested === 1
  const isRejected = lead.approval_status === "Rejected" && !isPending

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
      onClick={() => navigate(`/crm/${lead.name}`)}
    >
      <p className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-1">
        {lead.company_name}
      </p>
      <p className="text-xs text-gray-500 mb-2">{lead.contact_person}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">
          {lead.service_interest}
        </span>
        {isPending && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-orange-50 text-orange-700 border-orange-200">
            ⏳ Awaiting Approval
          </span>
        )}
        {isRejected && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-red-50 text-red-700 border-red-200">
            ❌ Rejected
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-400">{days === 0 ? "Today" : `${days}d ago`}</p>
        {lead.assigned_to_name && (
          <p className="text-[10px] text-gray-400 truncate max-w-[80px]">{lead.assigned_to_name}</p>
        )}
      </div>
    </div>
  )
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2].map((i) => (
        <div key={i} className="bg-gray-100 rounded-lg h-20 animate-pulse" />
      ))}
    </div>
  )
}

function PipelineColumn({ stage, leads, isLoading }: { stage: CRMStage; leads: CRMLead[]; isLoading: boolean }) {
  return (
    <div className={cn("flex flex-col rounded-lg border-t-4 bg-gray-50 min-w-[200px] w-full", STAGE_COLUMN_COLORS[stage])}>
      <div className={cn("flex items-center justify-between px-3 py-2 rounded-t-sm", STAGE_HEADER_COLORS[stage])}>
        <span className="text-xs font-semibold text-white uppercase tracking-wide">{stage}</span>
        <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded font-medium">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {isLoading ? (
          <ColumnSkeleton />
        ) : leads.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-4">No leads</p>
        ) : (
          leads.map((lead) => <LeadCard key={lead.name} lead={lead} />)
        )}
      </div>
    </div>
  )
}

function ApprovalCard({ approval }: { approval: CRMApprovalRequest }) {
  const approveStage = useApproveStage()
  const rejectStage = useRejectStage()
  const [adminNotes, setAdminNotes] = useState("")
  const [showReject, setShowReject] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const days = approval.lead_created ? daysSince(approval.lead_created) : 0

  async function handleApprove() {
    await approveStage.mutateAsync({ approvalId: approval.name, adminNotes })
  }

  async function handleReject() {
    if (!rejectionReason.trim()) return
    await rejectStage.mutateAsync({ approvalId: approval.name, rejectionReason, adminNotes })
    setShowReject(false)
    setRejectionReason("")
  }

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{approval.company_name}</p>
          <p className="text-xs text-gray-500">{approval.contact_person} · {approval.phone}</p>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1 shrink-0">
          {approval.current_stage} → {approval.requested_stage}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><span className="text-gray-400">Email: </span><span>{approval.email}</span></div>
        <div><span className="text-gray-400">Service: </span><span>{approval.service_interest}</span></div>
        <div><span className="text-gray-400">Requested by: </span><span>{approval.requested_by_name}</span></div>
        <div><span className="text-gray-400">Lead age: </span><span>{days} days</span></div>
      </div>

      {approval.request_notes && (
        <p className="text-xs text-gray-600 italic bg-gray-50 rounded p-2">"{approval.request_notes}"</p>
      )}

      {approval.lead_notes && (
        <p className="text-xs text-gray-500 line-clamp-2">{approval.lead_notes}</p>
      )}

      <div>
        <Label className="text-xs">Admin Notes</Label>
        <textarea
          className="w-full min-h-[56px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1"
          placeholder="Notes for the requester..."
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
        />
      </div>

      {!showReject ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700 gap-1"
            onClick={handleApprove}
            disabled={approveStage.isPending}
          >
            <CheckCircle size={13} />
            {approveStage.isPending ? "Approving…" : "✓ Approve"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 gap-1"
            onClick={() => setShowReject(true)}
          >
            <XCircle size={13} />
            ✗ Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-red-600">Rejection Reason *</Label>
            <textarea
              className="w-full min-h-[56px] px-3 py-2 text-sm border border-red-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-red-500 mt-1"
              placeholder="Why are you rejecting this advance?"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={handleReject}
              disabled={rejectStage.isPending || !rejectionReason.trim()}
            >
              {rejectStage.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PipelineBoard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOwais = user && OWAIS_USERS.has(user.name)
  const [approvalsOpen, setApprovalsOpen] = useState(true)

  const { data: leads = [], isLoading } = useCRMLeads()
  const { data: pendingData } = usePendingApprovals(!!isOwais)
  const pendingCount = pendingData?.count ?? 0
  const pendingApprovals = pendingData?.approvals ?? []

  const byStage = ALL_STAGES.reduce<Record<CRMStage, CRMLead[]>>(
    (acc, stage) => {
      acc[stage] = leads.filter((l) => l.status === stage)
      return acc
    },
    {} as Record<CRMStage, CRMLead[]>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Briefcase size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">CRM Pipeline</h1>
          {!isLoading && (
            <Badge variant="secondary" className="ml-2">
              {leads.length} total
            </Badge>
          )}
        </div>
        <Button onClick={() => navigate("/crm/new")} size="sm" className="gap-1">
          <Plus size={14} />
          New Lead
        </Button>
      </div>

      {/* Owais pending approvals banner */}
      {isOwais && pendingCount > 0 && (
        <button
          className="mx-6 mt-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
          onClick={() => setApprovalsOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <span>{pendingCount} pending approval{pendingCount > 1 ? "s" : ""} waiting for your review</span>
          </div>
          {approvalsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      )}

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full" style={{ minWidth: `${ALL_STAGES.length * 215}px` }}>
          {ALL_STAGES.map((stage) => (
            <div key={stage} className="flex-1">
              <PipelineColumn stage={stage} leads={byStage[stage]} isLoading={isLoading} />
            </div>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {!isLoading && (
        <div className="shrink-0 border-t bg-white px-6 py-2 flex gap-4 overflow-x-auto">
          {ALL_STAGES.map((stage) => (
            <div key={stage} className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                "inline-block w-2 h-2 rounded-full",
                stage === "Lead" ? "bg-blue-500"
                  : stage === "Discussion" ? "bg-purple-500"
                  : stage === "Quotation" ? "bg-amber-500"
                  : stage === "Order" ? "bg-orange-500"
                  : stage === "Delivery" ? "bg-teal-500"
                  : stage === "Success" ? "bg-green-500"
                  : "bg-red-500"
              )} />
              <span className="text-xs text-gray-500">{stage}: {byStage[stage].length}</span>
            </div>
          ))}
        </div>
      )}

      {/* Owais approvals panel */}
      {isOwais && approvalsOpen && pendingApprovals.length > 0 && (
        <div className="border-t bg-amber-50/40 p-6 space-y-4 max-h-[50vh] overflow-y-auto shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-600" />
            Pending Approvals ({pendingCount})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingApprovals.map((approval) => (
              <ApprovalCard key={approval.name} approval={approval} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
