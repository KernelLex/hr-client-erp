import { useState } from "react"
import { toast } from "sonner"
import { RefreshCw, ExternalLink, FolderOpen, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useDashboardStats,
  useDriveFiles,
  useSyncNow,
  useNamingIssues,
} from "./useDrive"

const MODULES = ["All", "Sales", "Purchase", "Accounts", "HR_Payroll", "Logistics"] as const

const MODULE_COLORS: Record<string, { bg: string; text: string }> = {
  Sales:      { bg: "#dcfce7", text: "#166534" },
  Purchase:   { bg: "#fee2e2", text: "#991b1b" },
  Accounts:   { bg: "#ede9fe", text: "#5b21b6" },
  HR_Payroll: { bg: "#fef3c7", text: "#92400e" },
  Logistics:  { bg: "#dbeafe", text: "#1e40af" },
  Unknown:    { bg: "#f3f4f6", text: "#374151" },
}

const DIRECTION_COLORS: Record<string, { bg: string; text: string }> = {
  Outgoing: { bg: "#dcfce7", text: "#166534" },
  Incoming: { bg: "#dbeafe", text: "#1e40af" },
  Internal: { bg: "#ede9fe", text: "#5b21b6" },
  Unknown:  { bg: "#f3f4f6", text: "#6b7280" },
}

const SYNC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Synced:  { bg: "#dcfce7", text: "#166534" },
  Pending: { bg: "#fef3c7", text: "#92400e" },
  Error:   { bg: "#fee2e2", text: "#991b1b" },
}

function Pill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}

function formatModuleLabel(m: string) {
  return m === "HR_Payroll" ? "HR / Payroll" : m
}

export function VeDrivePage() {
  const [module, setModule] = useState("All")
  const [showNamingIssues, setShowNamingIssues] = useState(false)

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: files = [], isLoading: filesLoading } = useDriveFiles(module)
  const { data: namingIssues = [] } = useNamingIssues()
  const syncNow = useSyncNow()

  function handleSync() {
    syncNow.mutate(undefined, {
      onSuccess: (msg) =>
        toast.success(`Sync enqueued (${msg?.type === "full_sync" ? "full" : "delta"})`),
      onError: () => toast.error("Sync failed — check error log"),
    })
  }

  function formatLastSync(dt: string) {
    if (!dt || dt === "Never") return "Never"
    try {
      const d = new Date(dt.replace(" ", "T"))
      const diff = Math.floor((Date.now() - d.getTime()) / 60000)
      if (diff < 1) return "Just now"
      if (diff < 60) return `${diff}m ago`
      if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
      return `${Math.floor(diff / 1440)}d ago`
    } catch {
      return dt
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#1D9E75" }}
          >
            <FolderOpen size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Drive Index
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Vera Enterprises — Google Drive &nbsp;·&nbsp; Last sync:{" "}
              {statsLoading ? "…" : formatLastSync(stats?.last_sync ?? "Never")}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncNow.isPending}
          className="text-white border-0 flex items-center gap-2"
          style={{ backgroundColor: "#1D9E75" }}
        >
          <RefreshCw size={14} className={syncNow.isPending ? "animate-spin" : ""} />
          {syncNow.isPending ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {/* Naming issues banner */}
      {namingIssues.length > 0 && (
        <div
          className="flex items-center gap-3 mb-5 px-4 py-3 rounded-lg border text-sm"
          style={{ backgroundColor: "#fffbeb", borderColor: "#fbbf24", color: "#92400e" }}
        >
          <AlertTriangle size={16} />
          <span>
            <strong>{namingIssues.length} file(s)</strong> don't match the naming convention.{" "}
            <button
              className="underline font-medium"
              onClick={() => setShowNamingIssues((v) => !v)}
            >
              {showNamingIssues ? "Hide" : "Show"} files
            </button>
          </span>
        </div>
      )}
      {showNamingIssues && namingIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-yellow-100 shadow-sm overflow-hidden mb-6">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">File</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Module</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase">Folder</th>
              </tr>
            </thead>
            <tbody>
              {namingIssues.map((f: any) => (
                <tr key={f.name} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2 font-mono text-[11px] text-gray-700 max-w-[240px] truncate">
                    <a href={f.web_view_link} target="_blank" rel="noreferrer" className="hover:underline">
                      {f.file_name}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{f.module || "—"}</td>
                  <td className="px-4 py-2 text-gray-400 text-[11px] truncate max-w-[180px]">{f.folder_path || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Files", value: stats?.total ?? "—", accent: "#1D9E75" },
          { label: "Pending Sync", value: stats?.pending ?? "—", accent: "#F59E0B" },
          { label: "Sync Errors", value: stats?.error ?? "—", accent: "#EF4444" },
          { label: "Last Sync", value: statsLoading ? "…" : formatLastSync(stats?.last_sync ?? "Never"), accent: "#6366F1" },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm"
            style={{ borderLeft: `3px solid ${c.accent}` }}
          >
            <p className="text-2xl font-bold" style={{ color: c.accent }}>{c.value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Module pills */}
      <div className="flex gap-2 flex-wrap mb-5">
        {MODULES.map((m) => (
          <button
            key={m}
            onClick={() => setModule(m)}
            className="px-4 py-1.5 rounded-full text-[13px] font-medium border-2 transition-all"
            style={{
              borderColor: module === m ? "#1D9E75" : "#e5e7eb",
              backgroundColor: module === m ? "#1D9E75" : "#fff",
              color: module === m ? "#fff" : "#555",
            }}
          >
            {formatModuleLabel(m)}
          </button>
        ))}
      </div>

      {/* File Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filesLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No files found{module !== "All" ? ` in ${formatModuleLabel(module)}` : ""}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-2 border-gray-100 bg-gray-50">
                  {["File Name", "Module", "Doc Type", "Party", "Date", "Direction", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const modC = MODULE_COLORS[f.module] ?? MODULE_COLORS.Unknown
                  const dirC = DIRECTION_COLORS[f.direction] ?? DIRECTION_COLORS.Unknown
                  const syncC = SYNC_STATUS_COLORS[f.sync_status] ?? SYNC_STATUS_COLORS.Synced
                  return (
                    <tr
                      key={f.name}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[11px] max-w-[220px]">
                        <span title={f.file_name} className="block truncate text-gray-700">
                          {f.file_name.length > 38 ? f.file_name.slice(0, 38) + "…" : f.file_name}
                        </span>
                        <span className="block text-[10px] text-gray-400 truncate mt-0.5" title={f.folder_path}>
                          {f.folder_path}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Pill label={formatModuleLabel(f.module || "Unknown")} {...modC} />
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {f.doc_type || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {f.party_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {f.doc_date || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Pill label={f.direction} {...dirC} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Pill label={f.sync_status} {...syncC} />
                      </td>
                      <td className="px-4 py-3">
                        {f.web_view_link && (
                          <a
                            href={f.web_view_link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md text-white font-medium transition-opacity hover:opacity-90 w-fit"
                            style={{ backgroundColor: "#1D9E75" }}
                          >
                            <ExternalLink size={11} /> View
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
