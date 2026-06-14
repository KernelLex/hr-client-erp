import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import {
  mockAllEmployees,
  mockActiveEmployees,
  mockOnboardingEmployees,
  mockExitingEmployees,
  mockEmployeeDetails,
  mockExitRecords,
} from "../mockData"
import type { DocumentsChecklist, ITSetupChecklist } from "../types"

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false"

interface EmployeeFilters {
  status?: string
  onboarding_stage?: string
  search?: string
  department?: string
  tab?: "directory" | "onboarding" | "exiting"
}

export function useEmployees(filters: EmployeeFilters = {}) {
  return useQuery({
    queryKey: ["employees", filters],
    queryFn: async () => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300))
        if (filters.tab === "directory") return { employees: mockActiveEmployees, total: mockActiveEmployees.length }
        if (filters.tab === "onboarding") return { employees: mockOnboardingEmployees, total: mockOnboardingEmployees.length }
        if (filters.tab === "exiting") return { employees: mockExitingEmployees, total: mockExitingEmployees.length }
        return { employees: mockAllEmployees, total: mockAllEmployees.length }
      }
      const res = await api.get(apiUrl("hr_client.api.employee_lifecycle.get_employees"), { params: filters })
      return res.data.message
    },
  })
}

export function useEmployeeDetail(employeeId: string | null) {
  return useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300))
        return mockEmployeeDetails[employeeId] ?? null
      }
      const res = await api.get(apiUrl("hr_client.api.employee_lifecycle.get_employee_detail"), { params: { employee_id: employeeId } })
      return res.data.message
    },
    enabled: !!employeeId,
  })
}

export function useOnboardingChecklist(employeeId: string | null) {
  return useQuery({
    queryKey: ["onboarding_checklist", employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      if (USE_MOCK) {
        const detail = mockEmployeeDetails[employeeId]
        if (!detail) return null
        const mandatoryKeys = ["offer_letter_signed", "aadhaar", "pan_card"] as (keyof DocumentsChecklist)[]
        const docs = detail.employee.documents_checklist
        const mandatoryComplete = mandatoryKeys.every((k) => docs[k] === "received" || docs[k] === "waived")
        return {
          employee_id: employeeId,
          onboarding_stage: detail.employee.custom_onboarding_stage,
          documents_checklist: docs,
          it_setup_checklist: detail.employee.it_setup_checklist,
          mandatory_docs_complete: mandatoryComplete,
        }
      }
      const res = await api.get(apiUrl("hr_client.api.employee_lifecycle.get_onboarding_checklist"), { params: { employee_id: employeeId } })
      return res.data.message
    },
    enabled: !!employeeId,
  })
}

export function useExitDetails(employeeId: string | null) {
  return useQuery({
    queryKey: ["exit_details", employeeId],
    queryFn: async () => {
      if (!employeeId) return { exit: null }
      if (USE_MOCK) {
        return { exit: mockExitRecords[employeeId] ?? null }
      }
      const res = await api.get(apiUrl("hr_client.api.employee_lifecycle.get_exit_details"), { params: { employee_id: employeeId } })
      return res.data.message
    },
    enabled: !!employeeId,
  })
}

export function useUpdateOnboardingStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      employee_id: string
      stage: string
      checklist_data?: Partial<DocumentsChecklist> | Partial<ITSetupChecklist>
    }) => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 400))
        return { success: true, employee: { name: data.employee_id, custom_onboarding_stage: data.stage }, welcome_email_sent: data.stage === "First Day" }
      }
      const res = await api.post(apiUrl("hr_client.api.employee_lifecycle.update_onboarding_stage"), data)
      return res.data.message
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["employee", vars.employee_id] })
      qc.invalidateQueries({ queryKey: ["onboarding_checklist", vars.employee_id] })
      qc.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}

export function useSubmitResignation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      employee_id: string
      resignation_date: string
      last_working_day?: string
      resignation_letter_url?: string
    }) => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 500))
        return { success: true, exit_record: `HR-EXIT-2026-${Date.now()}` }
      }
      const res = await api.post(apiUrl("hr_client.api.employee_lifecycle.submit_resignation"), data)
      return res.data.message
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["employee", vars.employee_id] })
      qc.invalidateQueries({ queryKey: ["exit_details", vars.employee_id] })
      qc.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}

export function useSubmitExitInterview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      employee_id: string
      exit_reason: string
      would_recommend: string
      enjoyed_most: string
      improvement_suggestions: string
      management_feedback: string
    }) => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 500))
        return { success: true, employee_status_updated: true }
      }
      const res = await api.post(apiUrl("hr_client.api.employee_lifecycle.submit_exit_interview"), data)
      return res.data.message
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["employee", vars.employee_id] })
      qc.invalidateQueries({ queryKey: ["exit_details", vars.employee_id] })
    },
  })
}

export function useSendWelcomeEmail() {
  return useMutation({
    mutationFn: async (employeeId: string) => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300))
        return { success: true, sent_to: "employee@clienterp.com" }
      }
      const res = await api.post(apiUrl("hr_client.api.employee_lifecycle.send_welcome_email"), { employee_id: employeeId })
      return res.data.message
    },
  })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      first_name: string
      last_name: string
      date_of_joining: string
      designation: string
      department: string
      company: string
      personal_email?: string
      cell_number?: string
      job_applicant?: string
    }) => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 500))
        return { success: true, employee: { name: `HR-EMP-MOCK-${Date.now()}`, employee_name: `${data.first_name} ${data.last_name}`, custom_onboarding_stage: "Offer Accepted" } }
      }
      const res = await api.post(apiUrl("hr_client.api.employee_lifecycle.create_employee"), data)
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  })
}
