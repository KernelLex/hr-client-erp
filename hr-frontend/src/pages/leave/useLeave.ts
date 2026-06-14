import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiUrl } from "@/lib/api"
import type { LeaveApplication, LeaveDocument, LeaveSummaryItem, Holiday, LeavePolicy } from "./types"

const BASE = "hr_client.api.leave"

function leaveUrl(method: string) {
  return apiUrl(`${BASE}.${method}`)
}

// ── Holiday & policy hooks ─────────────────────────────────────────────────

export function useHolidays() {
  return useQuery<Holiday[]>({
    queryKey: ["holidays_2026"],
    queryFn: () => api.get(leaveUrl("get_holidays")).then((r) => r.data.message),
    staleTime: 1000 * 60 * 60, // 1 hr — static data
  })
}

export function useLeavePolicy() {
  return useQuery<LeavePolicy>({
    queryKey: ["leave_policy"],
    queryFn: () => api.get(leaveUrl("get_leave_policy")).then((r) => r.data.message),
    staleTime: 1000 * 60 * 60,
  })
}

// ── Employee hooks ─────────────────────────────────────────────────────────

export function useMyLeaves() {
  return useQuery<{ success: boolean; data: LeaveApplication[] }>({
    queryKey: ["my_leaves"],
    queryFn: () => api.get(leaveUrl("get_my_leaves")).then((r) => r.data.message),
    staleTime: 1000 * 30,
  })
}

export function useApplyLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      leave_type: string
      from_date: string
      to_date: string
      reason: string
    }) =>
      api
        .post(leaveUrl("apply_leave"), payload)
        .then((r) => r.data.message as { success: boolean; data?: LeaveApplication; error?: string }),
    onSuccess: (res) => {
      if (res.success) {
        qc.invalidateQueries({ queryKey: ["my_leaves"] })
        qc.invalidateQueries({ queryKey: ["all_leaves"] })
        qc.invalidateQueries({ queryKey: ["leave_summary"] })
      }
    },
  })
}

// ── Admin hooks ────────────────────────────────────────────────────────────

export function useAllLeaves(status = "All", employeeEmail?: string) {
  return useQuery<{ success: boolean; data: LeaveApplication[] }>({
    queryKey: ["all_leaves", status, employeeEmail],
    queryFn: () =>
      api
        .get(leaveUrl("get_all_leaves"), {
          params: { status, ...(employeeEmail ? { employee_email: employeeEmail } : {}) },
        })
        .then((r) => r.data.message),
    staleTime: 1000 * 30,
  })
}

export function useEmployeeLeaveHistory(employeeEmail: string) {
  return useQuery<{ success: boolean; employee: Record<string, string>; data: LeaveApplication[] }>({
    queryKey: ["employee_leave_history", employeeEmail],
    queryFn: () =>
      api
        .get(leaveUrl("get_employee_leave_history"), { params: { employee_email: employeeEmail } })
        .then((r) => r.data.message),
    staleTime: 1000 * 30,
    enabled: !!employeeEmail,
  })
}

export function useLeaveSummary() {
  return useQuery<{ success: boolean; data: LeaveSummaryItem[]; year: string }>({
    queryKey: ["leave_summary"],
    queryFn: () => api.get(leaveUrl("get_leave_summary")).then((r) => r.data.message),
    staleTime: 1000 * 60,
  })
}

export function useApproveLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { leave_id: string; admin_remarks?: string }) =>
      api
        .post(leaveUrl("approve_leave"), payload)
        .then((r) => r.data.message as { success: boolean; error?: string }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_leaves"] })
      qc.invalidateQueries({ queryKey: ["leave_summary"] })
      qc.invalidateQueries({ queryKey: ["employee_leave_history"] })
    },
  })
}

export function useRejectLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { leave_id: string; admin_remarks: string }) =>
      api
        .post(leaveUrl("reject_leave"), payload)
        .then((r) => r.data.message as { success: boolean; error?: string }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_leaves"] })
      qc.invalidateQueries({ queryKey: ["leave_summary"] })
      qc.invalidateQueries({ queryKey: ["employee_leave_history"] })
    },
  })
}

export function useLeaveDocuments(leaveId: string) {
  return useQuery<{ success: boolean; files: LeaveDocument[] }>({
    queryKey: ["leave_documents", leaveId],
    queryFn: () =>
      api
        .get(leaveUrl("get_leave_documents"), { params: { leave_id: leaveId } })
        .then((r) => r.data.message),
    staleTime: 1000 * 30,
    enabled: !!leaveId,
  })
}

export function useUploadLeaveDocument(leaveId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const csrfToken =
        document.cookie
          .split("; ")
          .find((row) => row.startsWith("csrf_token="))
          ?.split("=")[1] ?? "fetch"

      const formData = new FormData()
      formData.append("file", file)
      formData.append("is_private", "0")
      formData.append("doctype", "Vera Leave Application")
      formData.append("docname", leaveId)

      const res = await fetch("/api/method/upload_file", {
        method: "POST",
        credentials: "include",
        headers: { "X-Frappe-CSRF-Token": csrfToken },
        body: formData,
      })
      const json = await res.json()
      if (!json.message?.file_url) throw new Error("Upload failed")
      return json.message as { file_url: string; file_name: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave_documents", leaveId] })
      toast.success("Document uploaded successfully")
    },
    onError: () => toast.error("Document upload failed"),
  })
}
