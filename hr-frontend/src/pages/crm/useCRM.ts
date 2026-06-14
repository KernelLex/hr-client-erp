import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiUrl } from "@/lib/api"
import type { CRMLead, CRMApprovalRequest, CRMQuotationItem } from "./types"

async function get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get(apiUrl(`hr_client.api.crm.${endpoint}`), { params })
  const msg = res.data.message
  if (msg?.success === false) throw new Error(msg?.error ?? "Request failed")
  return msg as T
}

async function post<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const res = await api.post(apiUrl(`hr_client.api.crm.${endpoint}`), body)
  const msg = res.data.message
  if (msg?.success === false) throw new Error(msg?.error ?? "Request failed")
  return msg as T
}

export function useCRMLeads() {
  return useQuery({
    queryKey: ["crm_leads"],
    queryFn: () => get<{ leads: CRMLead[] }>("get_all_leads").then((r) => r.leads),
    staleTime: 30_000,
  })
}

export function useCRMLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ["crm_lead", leadId],
    queryFn: () =>
      get<{ lead: CRMLead }>("get_lead", { lead_id: leadId }).then((r) => r.lead),
    enabled: !!leadId,
    staleTime: 15_000,
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, string>) =>
      post<{ lead: CRMLead }>("create_lead", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_leads"] })
      toast.success("Lead created")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, data }: { leadId: string; data: Record<string, string> }) =>
      post("update_lead", { lead_id: leadId, data: JSON.stringify(data) }),
    onSuccess: (_r, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["crm_leads"] })
      qc.invalidateQueries({ queryKey: ["crm_lead", leadId] })
      toast.success("Lead updated")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRequestNextStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, requestNotes }: { leadId: string; requestNotes?: string }) =>
      post("request_next_stage", { lead_id: leadId, request_notes: requestNotes ?? "" }),
    onSuccess: (_r, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["crm_leads"] })
      qc.invalidateQueries({ queryKey: ["crm_lead", leadId] })
      qc.invalidateQueries({ queryKey: ["crm_pending_approvals"] })
      toast.success("Stage advance requested — awaiting Owais's approval")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useApproveStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ approvalId, adminNotes }: { approvalId: string; adminNotes?: string }) =>
      post("approve_stage", { approval_id: approvalId, admin_notes: adminNotes ?? "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_leads"] })
      qc.invalidateQueries({ queryKey: ["crm_pending_approvals"] })
      toast.success("Approved — lead advanced!")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRejectStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      approvalId,
      rejectionReason,
      adminNotes,
    }: {
      approvalId: string
      rejectionReason: string
      adminNotes?: string
    }) =>
      post("reject_stage", {
        approval_id: approvalId,
        rejection_reason: rejectionReason,
        admin_notes: adminNotes ?? "",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_leads"] })
      qc.invalidateQueries({ queryKey: ["crm_pending_approvals"] })
      toast.success("Stage advance rejected")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useMarkFailed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, reason }: { leadId: string; reason: string }) =>
      post("mark_failed", { lead_id: leadId, reason }),
    onSuccess: (_r, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["crm_leads"] })
      qc.invalidateQueries({ queryKey: ["crm_lead", leadId] })
      toast.success("Lead marked as failed")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function usePendingApprovals(enabled = true) {
  return useQuery({
    queryKey: ["crm_pending_approvals"],
    queryFn: () =>
      get<{ approvals: CRMApprovalRequest[]; count: number }>("get_pending_approvals"),
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      leadId,
      items,
      terms,
      validityDays,
      taxPercent,
    }: {
      leadId: string
      items: CRMQuotationItem[]
      terms?: string
      validityDays?: number
      taxPercent?: number
    }) =>
      post("create_quotation", {
        lead_id: leadId,
        items: JSON.stringify(items),
        terms: terms ?? "",
        validity_days: validityDays ?? 30,
        tax_percent: taxPercent ?? 18,
      }),
    onSuccess: (_r, { leadId }) => {
      qc.invalidateQueries({ queryKey: ["crm_lead", leadId] })
      toast.success("Quotation generated")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
