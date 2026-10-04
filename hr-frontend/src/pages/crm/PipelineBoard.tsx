import { OWAIS_USERS } from "@/lib/constants"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/context/AuthContext"
import { useCRMLeads, usePendingApprovals, useApproveStage, useRejectStage } from "./useCRM"
import type { CRMLead, CRMStage, CRMApprovalRequest } from "./types"
import { STAGE_ORDER, STAGE_COLUMN_COLORS } from "./types"

const ALL_STAGES: CRMStage[] = [...STAGE_ORDER, "Failed"]

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

// Reference `.card` — white surface, hairline border, lifts on hover.
function LeadCard({ lead }: { lead: CRMLead }) {
  const navigate = useNavigate()
  const days = daysSince(lead.creation)
  const isPending = lead.stage_push_requested === 1
  const isRejected = lead.approval_status === "Rejected" && !isPending

  return (
    <div
      className="cursor-pointer rounded-md p-2.5 transition-shadow"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      onClick={() => navigate(`/crm/${lead.name}`)}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-2)" }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <p className="text-[13px] font-medium leading-snug mb-0.5 line-clamp-1" style={{ color: "var(--text-primary)" }}>
        {lead.company_name}
      </p>
      <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{lead.contact_person}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className="ui-badge">{lead.service_interest}</span>
        {isPending && <span className="ui-badge pending">◴ Awaiting</span>}
        {isRejected && <span className="ui-badge" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}>✕ Rejected</span>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{days === 0 ? "Today" : `${days}d ago`}</span>
        {lead.assigned_to_name && (
          <span className="text-[11px] truncate max-w-[90px]" style={{ color: "var(--text-tertiary)" }}>{lead.assigned_to_name}</span>
        )}
      </div>
    </div>
  )
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2].map((i) => <div key={i} className="skeleton h-16" />)}
    </div>
  )
}

// Reference `.bcol` — neutral column, a thin ink rail conveys pipeline depth.
function PipelineColumn({ stage, leads, isLoading }: { stage: CRMStage; leads: CRMLead[]; isLoading: boolean }) {
  return (
    <div className="flex flex-col rounded-lg overflow-hidden" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
      <div className="h-[3px] w-full" style={{ background: STAGE_COLUMN_COLORS[stage] }} />
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{stage}</span>
        <span className="text-[11px] font-medium rounded-full px-1.5 min-w-[18px] text-center" style={{ background: "var(--bg-surface)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 pt-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {isLoading ? <ColumnSkeleton />
          : leads.length === 0 ? <p className="text-[11px] text-center py-4" style={{ color: "var(--text-disabled)" }}>No leads</p>
          : leads.map((lead) => <LeadCard key={lead.name} lead={lead} />)}
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
    <div className="ui-panel space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{approval.company_name}</p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{approval.contact_person} · {approval.phone}</p>
        </div>
        <div className="ui-badge info shrink-0">{approval.current_stage} → {approval.requested_stage}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        <div><span style={{ color: "var(--text-tertiary)" }}>Email: </span>{approval.email}</div>
        <div><span style={{ color: "var(--text-tertiary)" }}>Service: </span>{approval.service_interest}</div>
        <div><span style={{ color: "var(--text-tertiary)" }}>Requested by: </span>{approval.requested_by_name}</div>
        <div><span style={{ color: "var(--text-tertiary)" }}>Lead age: </span>{days} days</div>
      </div>

      {approval.request_notes && (
        <p className="text-xs italic rounded p-2" style={{ color: "var(--text-secondary)", background: "var(--bg-subtle)" }}>"{approval.request_notes}"</p>
      )}
      {approval.lead_notes && <p className="text-xs line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{approval.lead_notes}</p>}

      <div>
        <Label className="text-xs">Admin Notes</Label>
        <textarea
          className="inp mt-1 w-full min-h-[56px] resize-y py-2"
          placeholder="Notes for the requester..."
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
        />
      </div>

      {!showReject ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 gap-1" onClick={handleApprove} disabled={approveStage.isPending}>
            <CheckCircle size={13} />
            {approveStage.isPending ? "Approving…" : "Approve"}
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => setShowReject(true)}>
            <XCircle size={13} /> Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs" style={{ color: "var(--color-danger)" }}>Rejection Reason *</Label>
            <textarea
              className="inp mt-1 w-full min-h-[56px] resize-y py-2"
              style={{ borderColor: "var(--color-danger)" }}
              placeholder="Why are you rejecting this advance?"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" className="flex-1" onClick={handleReject} disabled={rejectStage.isPending || !rejectionReason.trim()}>
              {rejectStage.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
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
    (acc, stage) => { acc[stage] = leads.filter((l) => l.status === stage); return acc },
    {} as Record<CRMStage, CRMLead[]>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Slim toolbar (the hub already carries the CRM title) */}
      <div className="flex items-center justify-between px-6 pt-1 pb-3">
        <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          {isLoading ? "Loading…" : `${leads.length} leads across ${STAGE_ORDER.length} stages`}
        </p>
        <Button onClick={() => navigate("/crm/new")} size="sm" className="gap-1">
          <Plus size={14} /> New Lead
        </Button>
      </div>

      {/* Owais pending approvals banner */}
      {isOwais && pendingCount > 0 && (
        <button
          className="mx-6 mb-3 flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--overlay-hover)]"
          style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-strong)", color: "var(--text-primary)" }}
          onClick={() => setApprovalsOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} />
            {pendingCount} pending approval{pendingCount > 1 ? "s" : ""} waiting for your review
          </span>
          {approvalsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      )}

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto px-6 pb-4">
        <div className="grid gap-3 h-full" style={{ gridTemplateColumns: `repeat(${ALL_STAGES.length}, minmax(190px, 1fr))` }}>
          {ALL_STAGES.map((stage) => (
            <PipelineColumn key={stage} stage={stage} leads={byStage[stage]} isLoading={isLoading} />
          ))}
        </div>
      </div>

      {/* Owais approvals panel */}
      {isOwais && approvalsOpen && pendingApprovals.length > 0 && (
        <div className="border-t p-6 space-y-4 max-h-[50vh] overflow-y-auto shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-subtle)" }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <AlertTriangle size={14} /> Pending Approvals ({pendingCount})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingApprovals.map((approval) => <ApprovalCard key={approval.name} approval={approval} />)}
          </div>
        </div>
      )}
    </div>
  )
}
