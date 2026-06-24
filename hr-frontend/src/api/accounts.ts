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

// UI pill label → API module name
const CATEGORY_TO_MODULE: Record<string, string> = {
  All:       "All",
  Sales:     "Sales",
  Purchase:  "Purchase",
  Accounts:  "Accounts",
  HR:        "HR_Payroll",
  Logistics: "Logistics",
}

function syncStatusToOld(s: string): "New" | "Reviewed" | "Flagged" {
  if (s === "Synced") return "Reviewed"
  if (s === "Error") return "Flagged"
  return "New"
}

function extFromName(name: string): string {
  const parts = (name ?? "").split(".")
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
}

export async function getDriveStats(): Promise<DriveStats> {
  const res = await api.get(apiUrl("hr_client.drive_sync.api.get_drive_stats"))
  const m = res.data.message
  return { total: m.total, pending: m.pending, flagged: m.error, last_sync: m.last_sync }
}

export async function syncDrive(): Promise<{ status: string }> {
  const res = await api.post(apiUrl("hr_client.drive_sync.api.trigger_sync"))
  return { status: res.data.message?.status ?? "ok" }
}

export async function getDriveFiles(
  category = "All",
  _status?: string,
  search?: string
): Promise<DriveFile[]> {
  const module = CATEGORY_TO_MODULE[category] ?? category
  const params: Record<string, string | number> = { module, page_length: 500 }
  if (search?.trim()) params.search = search.trim()
  const res = await api.get(apiUrl("hr_client.drive_sync.api.get_files"), { params })
  const files: any[] = res.data.message ?? []
  return files.map((f) => ({
    name: f.name,
    file_name: f.file_name ?? "",
    doc_type: f.doc_type ?? "",
    // Map HR_Payroll back to "HR" for display
    category: f.module === "HR_Payroll" ? "HR" : (f.module ?? "Unknown"),
    party_name: f.party_name ?? "",
    file_date: f.doc_date ?? "",
    status: syncStatusToOld(f.sync_status),
    drive_view_link: f.web_view_link ?? "",
    drive_file_id: f.drive_file_id ?? "",
    drive_folder_path: f.folder_path ?? "",
    file_extension: extFromName(f.file_name),
    synced_on: f.last_synced ?? "",
    admin_notes: "",
    uploaded_by_name: f.uploaded_by_name ?? "",
    uploaded_by_email: f.uploaded_by_email ?? "",
    last_modified_by_name: f.last_modified_by_name ?? "",
    last_modified_by_email: f.last_modified_by_email ?? "",
    upload_detected_method: f.upload_detected_method ?? "",
  }))
}

export async function markReviewed(_docname: string): Promise<void> {}
export async function flagFile(_docname: string, _notes: string): Promise<void> {}

export async function analyseFile(
  _drive_file_id: string,
  _file_extension: string
): Promise<AnalysisResult> {
  return { type: "unknown" }
}

// Build a nested folder tree from the flat VE Drive File list
function buildTree(files: any[]): DriveTreeFolder {
  const root: DriveTreeFolder = {
    id: "root",
    name: "Vera Enterprises — Documents",
    path: "/",
    type: "folder",
    folders: [],
    files: [],
    file_count: 0,
    total_count: 0,
  }

  for (const f of files) {
    const treeFile: DriveTreeFile = {
      id: f.drive_file_id ?? f.name,
      name: f.file_name ?? "",
      mimeType: f.mime_type ?? "",
      webViewLink: f.web_view_link ?? "",
      modifiedTime: f.drive_modified_time ?? f.last_synced ?? "",
      size: 0,
      extension: extFromName(f.file_name),
    }

    // folder_path: "Vera Enterprises — Documents/01_Sales/Invoices"
    const rawPath = (f.folder_path ?? "")
      .replace(/^Vera Enterprises — Documents\/?/, "")
    const segments = rawPath ? rawPath.split("/").filter(Boolean) : []

    let node = root
    let currentPath = "/"
    for (const seg of segments) {
      currentPath = `${currentPath}${seg}/`
      let child = node.folders.find((fd) => fd.name === seg)
      if (!child) {
        child = {
          id: currentPath,
          name: seg,
          path: currentPath,
          type: "folder",
          folders: [],
          files: [],
          file_count: 0,
          total_count: 0,
        }
        node.folders.push(child)
      }
      node = child
    }
    node.files.push(treeFile)
    node.file_count++
  }

  function computeTotals(folder: DriveTreeFolder): number {
    let total = folder.files.length
    for (const sub of folder.folders) total += computeTotals(sub)
    folder.total_count = total
    return total
  }
  computeTotals(root)

  return root
}

export async function getFolderTree(): Promise<DriveTreeFolder> {
  const res = await api.get(apiUrl("hr_client.drive_sync.api.get_files"), {
    params: { module: "All", page_length: 500 },
  })
  return buildTree(res.data.message ?? [])
}

export async function getFolderContents(
  _folder_id: string
): Promise<{
  folders: Omit<DriveTreeFolder, "folders" | "files" | "file_count" | "total_count">[]
  files: DriveTreeFile[]
}> {
  return { folders: [], files: [] }
}
