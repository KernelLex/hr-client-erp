import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  FileSpreadsheet,
  File,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  BarChart2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getFolderTree,
  syncDrive,
  analyseFile,
  type DriveTreeFolder,
  type DriveTreeFile,
  type AnalysisResult,
} from "@/api/accounts"

const METHOD_CONFIG: Record<string, { dot: string; label: string }> = {
  drive_api:         { dot: "#16a34a", label: "Confirmed by Google Drive" },
  last_modifier:     { dot: "#2563eb", label: "Detected from last edit" },
  folder_path:       { dot: "#94a3b8", label: "Estimated from folder location" },
  drive_api_unknown: { dot: "#f97316", label: "Not a Vera Enterprises account" },
}

// Folder color coding by name prefix
const FOLDER_COLOR: Record<string, { bg: string; icon: string; label: string }> = {
  "01_Sales":      { bg: "#dcfce7", icon: "#16a34a", label: "Sales" },
  "02_Purchase":   { bg: "#fee2e2", icon: "#dc2626", label: "Purchase" },
  "03_Accounts":   { bg: "#ede9fe", icon: "#7c3aed", label: "Accounts" },
  "04_HR_Payroll": { bg: "#fef3c7", icon: "#d97706", label: "HR & Payroll" },
  "05_Logistics":  { bg: "#dbeafe", icon: "#2563eb", label: "Logistics" },
}

function getFolderStyle(name: string) {
  const key = Object.keys(FOLDER_COLOR).find((k) => name.startsWith(k))
  return key ? FOLDER_COLOR[key] : { bg: "#f3f4f6", icon: "#6b7280", label: name }
}

function FileIcon({ ext }: { ext: string }) {
  if (ext === "pdf") return <FileText size={14} className="shrink-0" style={{ color: "#dc2626" }} />
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={14} className="shrink-0" style={{ color: "#16a34a" }} />
  if (["doc", "docx"].includes(ext)) return <FileText size={14} className="shrink-0" style={{ color: "#2563eb" }} />
  return <File size={14} className="shrink-0" style={{ color: "#94a3b8" }} />
}

function formatBytes(bytes: number) {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

// Collect all files from tree (for search)
function collectAllFiles(folder: DriveTreeFolder): { file: DriveTreeFile; folderPath: string }[] {
  const results: { file: DriveTreeFile; folderPath: string }[] = []
  folder.files.forEach((f) => results.push({ file: f, folderPath: folder.path }))
  folder.folders.forEach((sub) => results.push(...collectAllFiles(sub)))
  return results
}

interface FolderNodeProps {
  folder: DriveTreeFolder
  depth: number
  onFileClick: (file: DriveTreeFile) => void
  selectedFileId: string | null
  searchQuery: string
}

function FolderNode({ folder, depth, onFileClick, selectedFileId, searchQuery }: FolderNodeProps) {
  const [open, setOpen] = useState(depth === 0)
  const style = getFolderStyle(folder.name)
  const isRoot = depth === 0

  // Filter files if searching
  const visibleFiles = searchQuery
    ? folder.files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : folder.files
  const visibleFolders = searchQuery
    ? folder.folders.filter((sub) => sub.total_count > 0 || sub.files.some((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase())))
    : folder.folders

  const hasContent = visibleFiles.length > 0 || visibleFolders.length > 0
  const forceOpen = searchQuery.length > 0 && hasContent

  const isExpanded = forceOpen || open

  return (
    <div>
      {/* Folder header */}
      <div
        className="flex items-center gap-1.5 rounded-lg cursor-pointer select-none py-1.5 px-2 group transition-colors"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          backgroundColor: isRoot ? style.bg : undefined,
        }}
        onMouseEnter={(e) => { if (!isRoot) e.currentTarget.style.backgroundColor = "#f8fafc" }}
        onMouseLeave={(e) => { if (!isRoot) e.currentTarget.style.backgroundColor = "transparent" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: "#94a3b8" }}>
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <Folder size={14} className="shrink-0" style={{ color: style.icon }} />
        <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>
          {folder.name}
        </span>
        <span className="text-[10px] rounded px-1.5 py-0.5 ml-1" style={{ backgroundColor: "#e2e8f0", color: "#64748b" }}>
          {folder.total_count}
        </span>
      </div>

      {/* Children */}
      {isExpanded && (
        <div>
          {visibleFolders.map((sub) => (
            <FolderNode
              key={sub.id}
              folder={sub}
              depth={depth + 1}
              onFileClick={onFileClick}
              selectedFileId={selectedFileId}
              searchQuery={searchQuery}
            />
          ))}
          {visibleFiles.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              depth={depth + 1}
              onClick={() => onFileClick(file)}
              selected={file.id === selectedFileId}
            />
          ))}
          {visibleFiles.length === 0 && visibleFolders.length === 0 && searchQuery && (
            <div className="text-xs text-gray-400 py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface FileRowProps {
  file: DriveTreeFile
  depth: number
  onClick: () => void
  selected: boolean
}

function FileRow({ file, depth, onClick, selected }: FileRowProps) {
  return (
    <div
      className="flex items-center gap-2 py-1.5 rounded-lg cursor-pointer transition-colors group"
      style={{
        paddingLeft: `${depth * 16 + 8}px`,
        paddingRight: "8px",
        backgroundColor: selected ? "#eff6ff" : undefined,
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = "#f8fafc" }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = "transparent" }}
      onClick={onClick}
    >
      <span className="w-3.5 shrink-0" />
      <FileIcon ext={file.extension} />
      <span className="text-sm truncate flex-1" style={{ color: selected ? "#1d4ed8" : "var(--text-primary)" }}>
        {file.name}
      </span>
      <span className="text-[10px] text-gray-400 shrink-0 hidden group-hover:inline">
        {file.extension.toUpperCase()}
      </span>
    </div>
  )
}

interface RightPanelProps {
  file: DriveTreeFile
  onClose: () => void
}

function RightPanel({ file, onClose }: RightPanelProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analysing, setAnalysing] = useState(false)

  // Find the VE Drive File docname by drive_file_id — we call mark/flag via docname
  // For folder-view we use the drive file id directly in analyse, but mark/flag need docname
  // We'll pass drive_file_id to the backend's mark_reviewed/flag_file using drive_file_id lookup
  // Actually the backend endpoints use docname (VE Drive File name). We'll need to look it up.
  // For simplicity, show "Open in Drive" + Analyse here; mark/flag note as "use Drive Documents tab"

  async function handleAnalyse() {
    setAnalysing(true)
    try {
      const result = await analyseFile(file.id, file.extension)
      setAnalysis(result)
    } catch {
      toast.error("Analysis failed")
    } finally {
      setAnalysing(false)
    }
  }

  return (
    <div
      className="flex flex-col h-full border-l overflow-y-auto"
      style={{ borderColor: "#e2e8f0", backgroundColor: "#fff", minWidth: 0 }}
    >
      {/* Header */}
      <div className="flex items-start gap-2 p-4 border-b" style={{ borderColor: "#e2e8f0" }}>
        <FileIcon ext={file.extension} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight break-all" style={{ color: "var(--text-primary)" }}>
            {file.name}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5 uppercase">{file.extension}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      {/* Meta */}
      <div className="p-4 space-y-2.5 border-b" style={{ borderColor: "#e2e8f0" }}>
        <MetaRow label="Size" value={formatBytes(file.size)} />
        <MetaRow label="Type" value={file.mimeType.split("/").pop() ?? file.mimeType} />
      </div>

      {/* Uploader section */}
      <div className="p-4 border-b space-y-3" style={{ borderColor: "#e2e8f0" }}>
        {/* Uploaded By */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Uploaded By</p>
          {file.uploaded_by_name ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ backgroundColor: "#4f46e5" }}
                >
                  {file.uploaded_by_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {file.uploaded_by_name}
                </span>
                {file.upload_detected_method && METHOD_CONFIG[file.upload_detected_method] && (
                  <span
                    className="ml-auto text-[10px] font-bold"
                    style={{ color: METHOD_CONFIG[file.upload_detected_method].dot }}
                  >
                    ●
                  </span>
                )}
              </div>
              {file.uploaded_by_email && (
                <p className="text-[10px] text-gray-400 pl-8">{file.uploaded_by_email}</p>
              )}
              {file.upload_detected_method && METHOD_CONFIG[file.upload_detected_method] && (
                <p className="text-[10px] pl-8" style={{ color: METHOD_CONFIG[file.upload_detected_method].dot }}>
                  {METHOD_CONFIG[file.upload_detected_method].label}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-red-400">⚠ Could not detect uploader</p>
          )}
        </div>

        {/* Last Modified By */}
        {file.last_modified_by_name && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Last Modified By</p>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: "#64748b" }}
              >
                {file.last_modified_by_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                  {file.last_modified_by_name}
                </span>
                <p className="text-[10px] text-gray-400">{formatDate(file.modifiedTime)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 flex flex-col gap-2">
        <a
          href={file.webViewLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg py-2 px-3 transition-colors"
          style={{ backgroundColor: "#1d4ed8", color: "#fff" }}
        >
          <ExternalLink size={12} />
          Open in Drive
        </a>

        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs h-8"
          onClick={handleAnalyse}
          disabled={analysing || !["pdf", "xlsx", "xls"].includes(file.extension)}
        >
          {analysing ? (
            <RefreshCw size={11} className="animate-spin mr-1" />
          ) : (
            <BarChart2 size={11} className="mr-1" />
          )}
          {analysing ? "Analysing…" : "Analyse File"}
        </Button>

        {!["pdf", "xlsx", "xls"].includes(file.extension) && (
          <p className="text-[10px] text-center text-gray-400">Analysis available for PDF and Excel files</p>
        )}
      </div>

      {/* Analysis result */}
      {analysis && (
        <div className="px-4 pb-4">
          <div className="rounded-lg border p-3" style={{ borderColor: "#e2e8f0", backgroundColor: "#f8fafc" }}>
            {analysis.type === "pdf" && (
              <>
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">PDF Preview (first 3 pages)</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{analysis.text}</p>
              </>
            )}
            {analysis.type === "spreadsheet" && (
              <>
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">
                  Spreadsheet Preview ({analysis.total_rows} rows total)
                </p>
                <div className="overflow-x-auto">
                  <table className="text-[10px] border-collapse w-full">
                    <tbody>
                      {(analysis.rows ?? []).map((row, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f1f5f9" }}>
                          {row.map((cell, j) => (
                            <td key={j} className="border px-1.5 py-0.5 whitespace-nowrap" style={{ borderColor: "#e2e8f0" }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {analysis.type === "unknown" && (
              <p className="text-xs text-gray-400">Preview not available for this file type.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[11px] text-gray-400">{label}</span>
      <span className="text-[11px] font-medium text-right truncate" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  )
}

// Stats header — count per top-level folder
function StatsHeader({ tree }: { tree: DriveTreeFolder }) {
  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {tree.folders.map((folder) => {
        const style = getFolderStyle(folder.name)
        return (
          <div
            key={folder.id}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 border"
            style={{ backgroundColor: style.bg, borderColor: "transparent" }}
          >
            <Folder size={14} style={{ color: style.icon }} />
            <span className="text-xs font-semibold" style={{ color: style.icon }}>
              {style.label}
            </span>
            <span
              className="text-xs font-bold rounded-full px-2 py-0.5"
              style={{ backgroundColor: style.icon, color: "#fff" }}
            >
              {folder.total_count}
            </span>
          </div>
        )
      })}
      <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 border" style={{ backgroundColor: "#f1f5f9", borderColor: "transparent" }}>
        <Folder size={14} style={{ color: "#64748b" }} />
        <span className="text-xs font-semibold text-gray-500">Total</span>
        <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: "#64748b", color: "#fff" }}>
          {tree.total_count}
        </span>
      </div>
    </div>
  )
}

export function FolderViewTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [selectedFile, setSelectedFile] = useState<DriveTreeFile | null>(null)

  const { data: tree, isLoading, isError } = useQuery({
    queryKey: ["folder-tree"],
    queryFn: getFolderTree,
    staleTime: 1000 * 60 * 5,
  })

  const syncMutation = useMutation({
    mutationFn: syncDrive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-tree"] })
      toast.success("Drive synced — refreshing folder tree…")
    },
    onError: () => toast.error("Sync failed"),
  })

  // Search results flat list
  const searchResults = useMemo(() => {
    if (!tree || !search) return []
    return collectAllFiles(tree).filter(({ file }) =>
      file.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [tree, search])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 rounded-lg animate-pulse" style={{ backgroundColor: "#e2e8f0", width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    )
  }

  if (isError || !tree) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        Failed to load folder tree.{" "}
        <button className="underline text-blue-500" onClick={() => qc.invalidateQueries({ queryKey: ["folder-tree"] })}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0" style={{ minHeight: 0 }}>
      {/* Stats header */}
      <StatsHeader tree={tree} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg outline-none focus:ring-1"
            style={{
              borderColor: "#e2e8f0",
              backgroundColor: "#fff",
              color: "var(--text-primary)",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {search && (
          <span className="text-xs text-gray-400">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 text-xs gap-1.5"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw size={12} className={syncMutation.isPending ? "animate-spin" : ""} />
          {syncMutation.isPending ? "Syncing…" : "Refresh"}
        </Button>
      </div>

      {/* Main content */}
      <div className="flex gap-4" style={{ minHeight: 0 }}>
        {/* Tree panel */}
        <div
          className="flex-1 rounded-xl border overflow-y-auto"
          style={{
            borderColor: "#e2e8f0",
            backgroundColor: "#fff",
            padding: "12px",
            maxHeight: "calc(100vh - 340px)",
            minHeight: "400px",
          }}
        >
          {search ? (
            // Flat search results
            <div>
              {searchResults.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No files match "{search}"</div>
              ) : (
                searchResults.map(({ file, folderPath }) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: selectedFile?.id === file.id ? "#eff6ff" : undefined }}
                    onMouseEnter={(e) => { if (selectedFile?.id !== file.id) e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={(e) => { if (selectedFile?.id !== file.id) e.currentTarget.style.backgroundColor = "transparent" }}
                    onClick={() => setSelectedFile(file)}
                  >
                    <FileIcon ext={file.extension} />
                    <span className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>{file.name}</span>
                    <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{folderPath}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <FolderNode
              folder={tree}
              depth={0}
              onFileClick={setSelectedFile}
              selectedFileId={selectedFile?.id ?? null}
              searchQuery=""
            />
          )}
        </div>

        {/* Right panel */}
        {selectedFile && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#e2e8f0", width: "320px", minWidth: "280px", maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}
          >
            <RightPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
