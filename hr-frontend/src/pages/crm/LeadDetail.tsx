import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import {
  useCRMLead, useRequestNextStage, useApproveStage, useRejectStage,
  useMarkFailed, useCreateQuotation,
} from "./useCRM"
import type { CRMStage, CRMQuotationItem } from "./types"
import { STAGE_ORDER, STAGE_COLORS, STAGE_HEADER_COLORS } from "./types"

const OWAIS_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function StageProgressBar({ current }: { current: CRMStage }) {
  const isFailed = current === "Failed"
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGE_ORDER.map((stage, idx) => {
        const currentIdx = STAGE_ORDER.indexOf(current as CRMStage)
        const isPast = idx < currentIdx
        const isCurrent = stage === current && !isFailed
        return (
          <div key={stage} className="flex items-center gap-1">
            <div className={cn(
              "px-2.5 py-1 rounded text-xs font-medium",
              isCurrent ? cn(STAGE_HEADER_COLORS[stage], "text-white")
                : isPast ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-400"
            )}>
              {isPast ? "✓ " : ""}{stage}
            </div>
            {idx < STAGE_ORDER.length - 1 && (
              <div className={cn("w-4 h-0.5", isPast ? "bg-green-400" : "bg-gray-200")} />
            )}
          </div>
        )
      })}
      {isFailed && (
        <div className="ml-2 px-2.5 py-1 rounded text-xs font-medium bg-red-600 text-white">Failed</div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  )
}

function RequestAdvanceModal({
  open, onClose, leadId, currentStage,
}: {
  open: boolean; onClose: () => void; leadId: string; currentStage: CRMStage
}) {
  const requestNext = useRequestNextStage()
  const currentIdx = STAGE_ORDER.indexOf(currentStage)
  const nextStage = currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1
    ? STAGE_ORDER[currentIdx + 1] : null
  const [notes, setNotes] = useState("")

  async function handleSubmit() {
    if (!nextStage) return
    await requestNext.mutateAsync({ leadId, requestNotes: notes })
    setNotes("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>Request Stage Advance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-600">
            Request to advance from <strong>{currentStage}</strong> → <strong>{nextStage}</strong>.
            Owais will review and approve.
          </p>
          <div>
            <Label>Notes for Owais (optional)</Label>
            <textarea
              className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
              placeholder="Add context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={requestNext.isPending || !nextStage}>
            {requestNext.isPending ? "Submitting…" : `Request → ${nextStage}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MarkFailedModal({ open, onClose, leadId }: { open: boolean; onClose: () => void; leadId: string }) {
  const markFailed = useMarkFailed()
  const [reason, setReason] = useState("")

  async function handleSubmit() {
    if (!reason.trim()) return
    await markFailed.mutateAsync({ leadId, reason })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <AlertTriangle size={18} /> Mark Lead as Failed
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-600">Please provide a reason.</p>
          <div>
            <Label>Reason *</Label>
            <textarea
              className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-red-500 mt-1"
              placeholder="Why is this lead failed?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={markFailed.isPending || !reason.trim()}>
            {markFailed.isPending ? "Marking…" : "Mark as Failed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuotationBuilder({ leadId }: { leadId: string }) {
  const createQuotation = useCreateQuotation()
  const [items, setItems] = useState<CRMQuotationItem[]>([
    { item_description: "", quantity: 1, unit_price: 0, amount: 0 },
  ])
  const [terms, setTerms] = useState("")
  const [validity, setValidity] = useState(30)
  const [tax, setTax] = useState(18)

  function addItem() {
    setItems((prev) => [...prev, { item_description: "", quantity: 1, unit_price: 0, amount: 0 }])
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateItem(idx: number, field: keyof CRMQuotationItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const total = subtotal + (subtotal * tax) / 100

  async function handleGenerate() {
    if (items.some((i) => !i.item_description)) return
    await createQuotation.mutateAsync({ leadId, items, terms, validityDays: validity, taxPercent: tax })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-start">
            <div>
              {idx === 0 && <Label className="text-xs">Description</Label>}
              <Input placeholder="Service description" value={item.item_description}
                onChange={(e) => updateItem(idx, "item_description", e.target.value)} className="text-sm" />
            </div>
            <div>
              {idx === 0 && <Label className="text-xs">Qty</Label>}
              <Input type="number" min={0} value={item.quantity}
                onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} className="text-sm" />
            </div>
            <div>
              {idx === 0 && <Label className="text-xs">Unit Price (₹)</Label>}
              <Input type="number" min={0} value={item.unit_price}
                onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)} className="text-sm" />
            </div>
            <div>
              {idx === 0 && <div className="text-xs invisible">x</div>}
              <Button type="button" variant="ghost" size="sm"
                className="text-red-400 hover:text-red-600 p-1 h-8 w-8"
                onClick={() => removeItem(idx)} disabled={items.length === 1}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
        <Plus size={12} /> Add Item
      </Button>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Tax %</Label>
          <Input type="number" min={0} max={100} value={tax}
            onChange={(e) => setTax(parseFloat(e.target.value) || 0)} className="text-sm" />
        </div>
        <div>
          <Label className="text-xs">Validity (days)</Label>
          <Input type="number" min={1} value={validity}
            onChange={(e) => setValidity(parseInt(e.target.value) || 30)} className="text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Terms & Conditions</Label>
        <textarea
          className="w-full min-h-[60px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms..." />
      </div>
      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Subtotal</span>
          <span>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Tax ({tax}%)</span>
          <span>₹{((subtotal * tax) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
      <Button onClick={handleGenerate}
        disabled={createQuotation.isPending || items.some((i) => !i.item_description)}
        className="w-full">
        {createQuotation.isPending ? "Generating PDF…" : "Generate Quotation & PDF"}
      </Button>
    </div>
  )
}

function AdminApprovalPanel({ leadId, pendingApproval }: {
  leadId: string
  pendingApproval: { name: string; requested_stage: CRMStage; current_stage: CRMStage; request_notes?: string }
}) {
  const approveStage = useApproveStage()
  const rejectStage = useRejectStage()
  const [adminNotes, setAdminNotes] = useState("")
  const [showReject, setShowReject] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  // leadId used for invalidation via the hooks
  void leadId

  async function handleApprove() {
    await approveStage.mutateAsync({ approvalId: pendingApproval.name, adminNotes })
  }
  async function handleReject() {
    if (!rejectionReason.trim()) return
    await rejectStage.mutateAsync({ approvalId: pendingApproval.name, rejectionReason, adminNotes })
    setShowReject(false)
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        <p className="font-semibold text-amber-800 text-sm">Approval Required</p>
      </div>
      <p className="text-sm text-gray-700">
        Stage advance: <strong>{pendingApproval.current_stage} → {pendingApproval.requested_stage}</strong>
      </p>
      {pendingApproval.request_notes && (
        <p className="text-xs text-gray-600 italic bg-white rounded p-2 border border-amber-100">
          "{pendingApproval.request_notes}"
        </p>
      )}
      <div>
        <Label className="text-xs">Admin Notes</Label>
        <textarea
          className="w-full min-h-[60px] px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1"
          placeholder="Notes for the requester..." value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)} />
      </div>
      {!showReject ? (
        <div className="flex gap-2">
          <Button className="flex-1 bg-green-600 hover:bg-green-700 gap-1" onClick={handleApprove}
            disabled={approveStage.isPending}>
            <CheckCircle size={14} />
            {approveStage.isPending ? "Approving…" : "✓ Approve"}
          </Button>
          <Button variant="destructive" className="flex-1 gap-1" onClick={() => setShowReject(true)}>
            <XCircle size={14} /> ✗ Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-red-600">Rejection Reason *</Label>
            <textarea
              className="w-full min-h-[60px] px-3 py-2 text-sm border border-red-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-red-500 mt-1"
              placeholder="Why rejecting?" value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" onClick={handleReject}
              disabled={rejectStage.isPending || !rejectionReason.trim()}>
              {rejectStage.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOwais = user && OWAIS_USERS.has(user.name)

  const { data: lead, isLoading, error } = useCRMLead(id)

  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showFailedModal, setShowFailedModal] = useState(false)

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-48" />
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="p-6">
        <p className="text-red-500">Failed to load lead details.</p>
        <Button variant="outline" onClick={() => navigate("/crm")} className="mt-3">Back to Pipeline</Button>
      </div>
    )
  }

  const currentIdx = STAGE_ORDER.indexOf(lead.status as CRMStage)
  const nextStage = currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1
    ? STAGE_ORDER[currentIdx + 1] : null

  const isTerminal = lead.status === "Failed" || lead.status === "Success"
  const isPendingApproval = lead.stage_push_requested === 1
  const isRejected = lead.approval_status === "Rejected" && !isPendingApproval
  const canRequestAdvance = !isTerminal && !isPendingApproval && nextStage !== null

  const stageIdx = STAGE_ORDER.indexOf(lead.status as CRMStage)
  const isQuotationStageOrBeyond = stageIdx >= STAGE_ORDER.indexOf("Quotation")

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div>
        <button onClick={() => navigate("/crm")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
          <ArrowLeft size={14} /> Back to Pipeline
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{lead.lead_title}</h1>
            <p className="text-gray-500 text-sm">{lead.name}</p>
          </div>
          <Badge className={cn("text-xs", STAGE_COLORS[lead.status])}>{lead.status}</Badge>
        </div>
      </div>

      <Card className="bg-white shadow-sm border-0">
        <CardContent className="pt-4 pb-4">
          <StageProgressBar current={lead.status} />
        </CardContent>
      </Card>

      {/* Stage Action Section */}
      {!isTerminal && (
        <div>
          {isPendingApproval ? (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800">
              <span>⏳</span>
              <span>Awaiting Owais's approval to advance to <strong>{nextStage}</strong></span>
            </div>
          ) : isRejected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                <span>❌</span>
                <span>Stage advance was rejected{lead.rejection_reason ? `: ${lead.rejection_reason}` : ""}</span>
              </div>
              {nextStage && (
                <Button onClick={() => setShowAdvanceModal(true)} variant="outline" size="sm" className="gap-1">
                  Re-request advance → {nextStage}
                </Button>
              )}
            </div>
          ) : canRequestAdvance ? (
            <Button
              className="bg-green-600 hover:bg-green-700 gap-2"
              onClick={() => setShowAdvanceModal(true)}
            >
              Push to {nextStage} →
            </Button>
          ) : null}
        </div>
      )}

      {lead.status === "Success" && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          ✅ Lead successfully closed!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-4">
          <Card className="bg-white shadow-sm border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <InfoRow label="Company" value={lead.company_name} />
              <InfoRow label="Contact Person" value={lead.contact_person} />
              <InfoRow label="Phone" value={lead.phone} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Service Interest" value={lead.service_interest} />
              <InfoRow label="Source" value={lead.source} />
              <InfoRow label="Assigned To" value={lead.assigned_to_name || lead.assigned_to} />
              {lead.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Notes</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
              {lead.rejection_reason && (
                <div className="col-span-2">
                  <p className="text-xs text-red-500">Rejection Reason</p>
                  <p className="text-sm text-red-700">{lead.rejection_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {isQuotationStageOrBeyond && (
            <Card className="bg-white shadow-sm border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quotation</CardTitle>
              </CardHeader>
              <CardContent>
                {lead.quotation ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{lead.quotation.quotation_number}</p>
                      </div>
                      <p className="font-bold text-lg text-gray-900">
                        ₹{lead.quotation.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    {lead.quotation.pdf_attachment && (
                      <a href={lead.quotation.pdf_attachment} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                        📄 View PDF
                      </a>
                    )}
                  </div>
                ) : (
                  <QuotationBuilder leadId={lead.name} />
                )}
              </CardContent>
            </Card>
          )}

          {lead.approval_history && lead.approval_history.length > 0 && (
            <Card className="bg-white shadow-sm border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Approval History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lead.approval_history.map((a) => (
                    <div key={a.name} className="flex items-start gap-3 text-sm">
                      <div className={cn(
                        "mt-0.5 w-2 h-2 rounded-full shrink-0",
                        a.approval_status === "Approved" ? "bg-green-500"
                          : a.approval_status === "Rejected" ? "bg-red-500"
                          : "bg-amber-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600">
                          <strong>{a.requested_by_name || a.requested_by}</strong> requested{" "}
                          {a.current_stage} → {a.requested_stage}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(a.creation).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        {a.admin_notes && (
                          <p className="text-xs text-gray-500 italic mt-0.5">Owais: "{a.admin_notes}"</p>
                        )}
                      </div>
                      <Badge className={cn(
                        "text-[10px] shrink-0",
                        a.approval_status === "Approved" ? "bg-green-100 text-green-800"
                          : a.approval_status === "Rejected" ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      )}>
                        {a.approval_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {isOwais && lead.pending_approval && (
            <AdminApprovalPanel
              leadId={lead.name}
              pendingApproval={{
                name: lead.pending_approval.name,
                requested_stage: lead.pending_approval.requested_stage,
                current_stage: lead.pending_approval.current_stage,
                request_notes: lead.pending_approval.request_notes,
              }}
            />
          )}

          {lead.status !== "Failed" && (
            <Button variant="destructive" size="sm" className="w-full text-xs"
              onClick={() => setShowFailedModal(true)}>
              Mark as Failed
            </Button>
          )}

          <Card className="bg-gray-50 shadow-none border border-gray-200">
            <CardContent className="pt-4 space-y-2">
              <div>
                <p className="text-xs text-gray-400">Created</p>
                <p className="text-xs text-gray-700">
                  {new Date(lead.creation).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  {" "}({daysSince(lead.creation)}d ago)
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Last Updated</p>
                <p className="text-xs text-gray-700">
                  {new Date(lead.modified).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showAdvanceModal && (
        <RequestAdvanceModal open={showAdvanceModal} onClose={() => setShowAdvanceModal(false)}
          leadId={lead.name} currentStage={lead.status as CRMStage} />
      )}
      {showFailedModal && (
        <MarkFailedModal open={showFailedModal} onClose={() => setShowFailedModal(false)} leadId={lead.name} />
      )}
    </div>
  )
}
