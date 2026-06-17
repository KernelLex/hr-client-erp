import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"

// Shape returned by VE Drive File (hr_client.drive_sync.api.get_files)
export interface DriveFile {
  name: string
  drive_file_id: string
  file_name: string
  folder_path: string
  // module maps to the old "category" concept in VeDrivePage
  module: string
  doc_type: string
  party_name: string
  doc_date: string
  direction: "Outgoing" | "Incoming" | "Internal" | "Unknown"
  mime_type: string
  web_view_link: string
  thumbnail_link: string
  sync_status: "Synced" | "Pending" | "Error"
  last_synced: string
  naming_valid: number
}

export interface DashboardStats {
  total: number
  pending: number
  error: number
  last_sync: string
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["ve_drive_stats"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.drive_sync.api.get_drive_stats"))
      return res.data.message
    },
    staleTime: 1000 * 60,
  })
}

export function useDriveFiles(module: string) {
  return useQuery<DriveFile[]>({
    queryKey: ["ve_drive_files", module],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.drive_sync.api.get_files"), {
        params: { module },
      })
      return res.data.message ?? []
    },
    staleTime: 1000 * 30,
  })
}

export function useSyncNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(apiUrl("hr_client.drive_sync.api.trigger_sync"))
      const msg = res.data.message
      if (!msg || msg.status === "error") throw new Error(msg?.error || "Sync failed")
      return msg
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ve_drive_files"] })
      qc.invalidateQueries({ queryKey: ["ve_drive_stats"] })
    },
  })
}

export function useNamingIssues() {
  return useQuery({
    queryKey: ["ve_drive_naming_issues"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.drive_sync.api.get_naming_issues"))
      return res.data.message ?? []
    },
    staleTime: 1000 * 60 * 5,
  })
}
