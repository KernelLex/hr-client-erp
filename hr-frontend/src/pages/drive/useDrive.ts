import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"

export interface DriveFile {
  name: string
  file_name: string
  doc_type: string
  category: string
  party_name: string
  file_date: string
  status: "New" | "Reviewed" | "Flagged"
  drive_view_link: string
  file_extension: string
  synced_on: string
  admin_notes: string
  drive_file_id?: string
}

export interface DashboardStats {
  total: number
  pending: number
  flagged: number
  last_sync: string
}

export interface AnalysisResult {
  type: "spreadsheet" | "pdf" | "unknown"
  rows?: string[][]
  total_rows?: number
  text?: string
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["drive_stats"],
    queryFn: async () => {
      const res = await api.get(apiUrl("vera_drive.api.get_dashboard_stats"))
      return res.data.message
    },
    staleTime: 1000 * 60,
  })
}

export function useDriveFiles(category: string, status?: string) {
  return useQuery<DriveFile[]>({
    queryKey: ["drive_files", category, status],
    queryFn: async () => {
      const res = await api.get(apiUrl("vera_drive.api.get_all_files"), {
        params: { category, status },
      })
      return res.data.message
    },
  })
}

export function useSyncNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(apiUrl("vera_drive.api.sync_now"))
      const msg = res.data.message
      if (msg?.status === "error") throw new Error(msg.error || "Sync failed")
      return msg
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive_files"] })
      qc.invalidateQueries({ queryKey: ["drive_stats"] })
    },
  })
}

export function useMarkReviewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docname: string) => {
      const res = await api.post(apiUrl("vera_drive.api.mark_reviewed"), { docname })
      return res.data.message
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive_files"] })
      qc.invalidateQueries({ queryKey: ["drive_stats"] })
    },
  })
}

export function useFlagFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ docname, notes }: { docname: string; notes: string }) => {
      const res = await api.post(apiUrl("vera_drive.api.flag_file"), { docname, notes })
      return res.data.message
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive_files"] })
      qc.invalidateQueries({ queryKey: ["drive_stats"] })
    },
  })
}

export function useAnalyseFile() {
  return useMutation({
    mutationFn: async ({
      drive_file_id,
      file_extension,
    }: {
      drive_file_id: string
      file_extension: string
    }): Promise<AnalysisResult> => {
      const res = await api.get(apiUrl("vera_drive.api.analyse_file"), {
        params: { drive_file_id, file_extension },
      })
      return res.data.message
    },
  })
}
