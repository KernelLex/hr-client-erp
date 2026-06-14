import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import { mockJobOpenings, mockPipeline, mockCandidateDetail, mockInterviewRounds, mockGenerateJD } from "../mockData"
import type { JDGenerateInput, JDGenerateResult } from "../types"

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false"

export function useJobOpenings(status = "Open") {
  return useQuery({
    queryKey: ["job_openings", status],
    queryFn: async () => {
      if (USE_MOCK) return { job_openings: mockJobOpenings }
      const res = await api.get(apiUrl("hr_client.api.recruitment.get_job_openings"), { params: { status } })
      return res.data.message
    },
  })
}

export function usePipeline(jobOpening: string | null) {
  return useQuery({
    queryKey: ["pipeline", jobOpening],
    queryFn: async () => {
      if (!jobOpening) return null
      if (USE_MOCK) return mockPipeline
      const res = await api.get(apiUrl("hr_client.api.recruitment.get_pipeline"), { params: { job_opening: jobOpening } })
      return res.data.message
    },
    enabled: !!jobOpening,
  })
}

export function useCandidate(name: string | null) {
  return useQuery({
    queryKey: ["candidate", name],
    queryFn: async () => {
      if (!name) return null
      if (USE_MOCK) return mockCandidateDetail
      const res = await api.get(apiUrl("hr_client.api.recruitment.get_candidate"), { params: { name } })
      return res.data.message
    },
    enabled: !!name,
  })
}

export function useInterviewRounds() {
  return useQuery({
    queryKey: ["interview_rounds"],
    queryFn: async () => {
      if (USE_MOCK) return { rounds: mockInterviewRounds }
      const res = await api.get(apiUrl("hr_client.api.recruitment.get_interview_rounds"))
      return res.data.message
    },
  })
}

export function useDesignations() {
  return useQuery({
    queryKey: ["designations"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.recruitment.get_designations"))
      return (res.data.message.designations as string[])
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.recruitment.get_departments"))
      return (res.data.message.departments as Array<{ name: string; label: string }>)
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useMoveCandidateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicant, stage }: { applicant: string; stage: string }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.move_candidate"), { applicant, stage })
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  })
}

export function useRejectCandidateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicant, rejection_reason }: { applicant: string; rejection_reason: string }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.reject_candidate"), { applicant, rejection_reason })
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  })
}

export function useAddCandidateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      job_opening: string
      applicant_name: string
      email_id: string
      phone_number?: string
      source?: string
      cover_letter?: string
      resume_link?: string
      applicant_rating?: number
    }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.add_candidate"), data)
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  })
}

export function useCreateJobOpeningMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      job_title: string
      designation: string
      department?: string
      description?: string
      employment_type?: string
      location?: string
      lower_range?: number
      upper_range?: number
      interview_rounds?: Array<{ sequence: number; interview_round: string; is_required: number }>
    }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.create_job_opening"), data)
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_openings"] }),
  })
}

export function useCloseJobOpening() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (job_id: string) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.close_job_opening"), { job_id })
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_openings"] }),
  })
}

export function useDeleteJobOpening() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (job_id: string) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.delete_job_opening"), { job_id })
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_openings"] }),
  })
}

export function useScheduleInterviewMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      job_applicant: string
      interview_round: string
      scheduled_on: string
      from_time: string
      to_time: string
    }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.schedule_interview"), data)
      return res.data.message
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["candidate", vars.job_applicant] })
      qc.invalidateQueries({ queryKey: ["pipeline"] })
    },
  })
}

export function useSendOfferMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      job_applicant: string
      offer_date: string
      designation: string
      company: string
    }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.send_offer"), data)
      return res.data.message
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["candidate", vars.job_applicant] })
      qc.invalidateQueries({ queryKey: ["pipeline"] })
    },
  })
}

export function useUpdateCandidateNotesMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ applicant, notes }: { applicant: string; notes: string }) => {
      const res = await api.post(apiUrl("hr_client.api.recruitment.update_candidate_notes"), { applicant, notes })
      return res.data.message
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["candidate", vars.applicant] })
    },
  })
}

// AI Job Description hooks
export function useGenerateJD() {
  return useMutation({
    mutationFn: async (input: JDGenerateInput): Promise<JDGenerateResult> => {
      if (USE_MOCK) return mockGenerateJD(input)
      const res = await api.post(apiUrl("hr_client.api.recruitment.generate_job_description"), input)
      return res.data.message
    },
  })
}

export function useSaveJD() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      job_title: string
      designation: string
      department?: string
      description?: string
      employment_type?: string
      location?: string
      lower_range?: number
      upper_range?: number
      interview_rounds?: Array<{ sequence: number; interview_round: string; is_required: number }>
    }) => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 500))
        return { job_opening: { name: `HR-OPN-MOCK-${Date.now()}` } }
      }
      const res = await api.post(apiUrl("hr_client.api.recruitment.create_job_opening"), data)
      return res.data.message
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_openings"] }),
  })
}

export function useExportJDPdf() {
  return useMutation({
    mutationFn: async ({ elementId, filename }: { elementId: string; filename: string }) => {
      const { default: jsPDF } = await import("jspdf")
      const { default: html2canvas } = await import("html2canvas")
      const el = document.getElementById(elementId)
      if (!el) throw new Error("Element not found")
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW - 20
      const imgH = (canvas.height * imgW) / canvas.width
      let y = 10
      let remaining = imgH
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 10, y, imgW, imgH)
        remaining -= pageH - 20
        if (remaining > 0) { pdf.addPage(); y = 10 - (imgH - remaining) }
      }
      pdf.save(filename)
    },
  })
}
