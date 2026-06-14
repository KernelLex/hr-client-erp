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
  drive_file_id: string
  drive_folder_path: string
  file_extension: string
  synced_on: string
  admin_notes: string
  uploaded_by_name: string
  uploaded_by_email: string
  last_modified_by_name: string
  last_modified_by_email: string
  upload_detected_method: string
}

export interface DriveStats {
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

export async function getDriveStats(): Promise<DriveStats> {
  const res = await api.get(apiUrl("vera_drive.api.get_dashboard_stats"))
  return res.data.message
}

export async function syncDrive(): Promise<{ status: string }> {
  const res = await api.post(apiUrl("vera_drive.api.sync_now"))
  return res.data.message
}

export async function getDriveFiles(
  category = "All",
  status?: string
): Promise<DriveFile[]> {
  const res = await api.get(apiUrl("vera_drive.api.get_all_files"), {
    params: { category, ...(status ? { status } : {}) },
  })
  return res.data.message
}

export async function markReviewed(docname: string): Promise<void> {
  await api.post(apiUrl("vera_drive.api.mark_reviewed"), { docname })
}

export async function flagFile(docname: string, notes: string): Promise<void> {
  await api.post(apiUrl("vera_drive.api.flag_file"), { docname, notes })
}

export async function analyseFile(
  drive_file_id: string,
  file_extension: string
): Promise<AnalysisResult> {
  const res = await api.get(apiUrl("vera_drive.api.analyse_file"), {
    params: { drive_file_id, file_extension },
  })
  return res.data.message
}

export interface DriveTreeFile {
  id: string
  name: string
  mimeType: string
  webViewLink: string
  modifiedTime: string
  size: number
  extension: string
  uploaded_by_name?: string
  uploaded_by_email?: string
  upload_detected_method?: string
  last_modified_by_name?: string
  last_modified_by_email?: string
}

export interface DriveTreeFolder {
  id: string
  name: string
  path: string
  type: "folder"
  folders: DriveTreeFolder[]
  files: DriveTreeFile[]
  file_count: number
  total_count: number
}

export async function getFolderTree(): Promise<DriveTreeFolder> {
  const res = await api.get(apiUrl("vera_drive.api.get_folder_tree"))
  return res.data.message
}

export async function getFolderContents(
  folder_id: string
): Promise<{ folders: Omit<DriveTreeFolder, "folders" | "files" | "file_count" | "total_count">[]; files: DriveTreeFile[] }> {
  const res = await api.get(apiUrl("vera_drive.api.get_folder_contents"), {
    params: { folder_id },
  })
  return res.data.message
}
