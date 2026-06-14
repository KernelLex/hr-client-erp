import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiUrl } from "@/lib/api"
import type { ExpenseClaim, MonthlySummary } from "./types"

const BASE = "hr_client.api.expenses"

async function get<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get(apiUrl(`${BASE}.${method}`), { params })
  const msg = res.data.message
  if (msg?.success === false) throw new Error(msg?.error ?? "Request failed")
  return msg as T
}

async function post<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await api.post(apiUrl(`${BASE}.${method}`), body)
  const msg = res.data.message
  if (msg?.success === false) throw new Error(msg?.error ?? "Request failed")
  return msg as T
}

export function useMyClaims() {
  return useQuery({
    queryKey: ["my_expense_claims"],
    queryFn: () => get<{ claims: ExpenseClaim[] }>("get_my_claims").then((r) => r.claims),
    staleTime: 30_000,
  })
}

export function useAllClaims() {
  return useQuery({
    queryKey: ["all_expense_claims"],
    queryFn: () =>
      get<{ claims: ExpenseClaim[]; by_employee: { employee: string; employee_name: string; employee_email: string; claims: ExpenseClaim[] }[] }>("get_all_claims"),
    staleTime: 30_000,
  })
}

export function useSubmitClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => post<{ claim: ExpenseClaim }>("submit_claim", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my_expense_claims"] })
      qc.invalidateQueries({ queryKey: ["expense_monthly_summary"] })
      const msg = res.claim?.claim_type === "Petrol" && res.claim?.pdf_path
        ? "Claim submitted — PDF receipt opening…"
        : "Claim submitted successfully"
      toast.success(msg)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useApproveClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ claimId, adminNotes }: { claimId: string; adminNotes?: string }) =>
      post("approve_claim", { claim_id: claimId, admin_notes: adminNotes ?? "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_expense_claims"] })
      qc.invalidateQueries({ queryKey: ["my_expense_claims"] })
      qc.invalidateQueries({ queryKey: ["expense_monthly_summary"] })
      toast.success("Claim approved")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useRejectClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ claimId, rejectionReason, adminNotes }: { claimId: string; rejectionReason: string; adminNotes?: string }) =>
      post("reject_claim", { claim_id: claimId, rejection_reason: rejectionReason, admin_notes: adminNotes ?? "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_expense_claims"] })
      qc.invalidateQueries({ queryKey: ["my_expense_claims"] })
      qc.invalidateQueries({ queryKey: ["expense_monthly_summary"] })
      toast.success("Claim rejected")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useMonthlyExpenseSummary(month: number, year: number, enabled = true) {
  return useQuery({
    queryKey: ["expense_monthly_summary", month, year],
    queryFn: () =>
      get<{ summary: MonthlySummary[]; month: number; year: number }>("get_monthly_summary", {
        month,
        year,
      }),
    enabled,
    staleTime: 60_000,
  })
}
