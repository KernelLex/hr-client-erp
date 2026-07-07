import { useState } from "react"
import { toast } from "sonner"
import {
  RefreshCw, ExternalLink, FolderOpen, ChevronRight, AlertTriangle,
  Search, X, Home, Folder, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDashboardStats, useDriveFiles, useSyncNow, useNamingIssues, useFolderCounts } from "./useDrive"

// ── Constants ──────────────────────────────────────────────────────────────────

const MODULE_ORDER = ["Sales", "Purchase", "Accounts", "HR_Payroll", "Logistics"] as const

const MODULE_DOC_TYPES: Record<string, { label: string; value: string }[]> = {
  Sales:      [{ label: "Sale Invoices", value: "SalesInvoice" }, { label: "Sale Orders", value: "SalesOrder" }, { label: "Performa Invoices", value: "Quotation" }, { label: "Credit Notes", value: "CreditNote" }],
  Purchase:   [{ label: "Purchase Invoices", value: "PurchaseInvoice" }, { label: "Purchase Orders", value: "PurchaseOrder" }, { label: "Debit Notes", value: "DebitNote" }],
  Accounts:   [{ label: "Receipt Vouchers", value: "Receipt" }, { label: "Payment Vouchers", value: "Payment" }],
  HR_Payroll: [{ label: "Salary Slips", value: "SalarySlip" }, { label: "Payroll Summary", value: "PayrollSummary" }, { label: "Attendance", value: "Attendance" }],
  Logistics:  [{ label: "Delivery Notes", value: "DeliveryNote" }, { label: "GRN", value: "GRN" }],
}

const MODULE_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  Sales:      { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", accent: "#22c55e" },
  Purchase:   { bg: "#fff1f2", text: "#be123c", border: "#fecdd3", accent: "#f43f5e" },
  Accounts:   { bg: "#fdf8ef", text: "#b8934c", border: "#ddd6fe", accent: "#8b5cf6" },
  HR_Payroll: { bg: "#fffbeb", text: "#92400e", border: "#fde68a", accent: "#f59e0b" },
  Logistics:  { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", accent: "#3b82f6" },
  Unknown:    { bg: "#f9fafb", text: "#374151", border: "#e5e7eb", accent: "#9ca3af" },
}

const MODULE_LABELS: Record<string, string> = {
  Sales: "Sales", Purchase: "Purchase", Accounts: "Accounts",
  HR_Payroll: "HR / Payroll", Logistics: "Logistics",
}

const DOC_TYPE_LABELS: Record<string, string> = {
  SalesInvoice: "Sale Invoice", SalesOrder: "Sale Order", Quotation: "Performa Invoice",
  CreditNote: "Credit Note", PurchaseInvoice: "Purchase Invoice", PurchaseOrder: "Purchase Order",
  DebitNote: "Debit Note", Receipt: "Receipt Voucher", Payment: "Payment Voucher",
  DeliveryNote: "Delivery Note", GRN: "GRN", SalarySlip: "Salary Slip",
  PayrollSummary: "Payroll Summary", Attendance: "Attendance",
}

const DIR_COLORS: Record<string, string> = {
  Outgoing: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Incoming: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  Internal: "bg-gold-50 text-gold-700 ring-1 ring-gold-200",
  Unknown:  "bg-gray-100 text-gray-500",
}

function formatLastSync(dt: string) {
  if (!dt || dt === "Never") return "Never synced"
  try {
    const d = new Date(dt.replace(" ", "T"))
    const diff = Math.floor((Date.now() - d.getTime()) / 60000)
    if (diff < 1) return "Just now"
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return `${Math.floor(diff / 1440)}d ago`
  } catch { return dt }
}

function fileExt(name: string) {
  return name?.split(".").pop()?.toUpperCase() || "FILE"
}

// ── File extension badge ────────────────────────────────────────────────────────

function ExtBadge({ filename }: { filename: string }) {
  const ext = fileExt(filename)
  const cls =
    ext === "PDF" ? "text-red-600 bg-red-50 ring-1 ring-red-200"
    : ["XLS","XLSX","CSV"].includes(ext) ? "text-green-700 bg-green-50 ring-1 ring-green-200"
    : ["DOC","DOCX"].includes(ext) ? "text-blue-700 bg-blue-50 ring-1 ring-blue-200"
    : "text-gray-500 bg-gray-50 ring-1 ring-gray-200"
  return (
    <span className={`inline-block shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${cls}`}>{ext}</span>
  )
}

// ── Folder cards ────────────────────────────────────────────────────────────────

function ModuleFolderCard({ moduleKey, count, onClick }: { moduleKey: string; count: number; onClick: () => void }) {
  const c = MODULE_COLORS[moduleKey] ?? MODULE_COLORS.Unknown
  const label = MODULE_LABELS[moduleKey] ?? moduleKey
  const subCount = MODULE_DOC_TYPES[moduleKey]?.length ?? 0

  return (
    <button
      onClick={onClick}
      className="group relative bg-white rounded-2xl border border-gray-100 p-5 text-left transition-all hover:shadow-lg hover:border-gray-200 hover:-translate-y-1 active:translate-y-0 w-full overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ backgroundColor: c.accent }} />
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mt-1" style={{ backgroundColor: c.bg }}>
        <Folder size={26} style={{ color: c.accent }} fill={c.bg} strokeWidth={1.5} />
      </div>
      <p className="font-bold text-[15px] text-gray-800 group-hover:text-forest-600 transition-colors mb-0.5">{label}</p>
      <p className="text-[12px] text-gray-400">{subCount} categories</p>
      <p className="text-[13px] font-semibold mt-2" style={{ color: c.text }}>{count.toLocaleString()} files</p>
      <ChevronRight size={15} className="absolute right-4 bottom-4 text-gray-200 group-hover:text-forest-400 transition-all group-hover:translate-x-0.5" />
    </button>
  )
}

function DocTypeFolderCard({ label, moduleKey, count, onClick }: {
  label: string; value?: string; moduleKey: string; count: number; onClick: () => void
}) {
  const c = MODULE_COLORS[moduleKey] ?? MODULE_COLORS.Unknown
  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-xl border border-gray-100 p-4 text-left transition-all hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 active:translate-y-0 w-full flex items-center gap-3.5"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}>
        <FileText size={18} style={{ color: c.accent }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[13px] text-gray-800 group-hover:text-forest-600 transition-colors truncate">{label}</p>
        <p className="text-[11px] mt-0.5 font-medium" style={{ color: c.text }}>{count.toLocaleString()} files</p>
      </div>
      <ChevronRight size={14} className="text-gray-200 group-hover:text-forest-400 transition-all group-hover:translate-x-0.5 shrink-0" />
    </button>
  )
}

// ── File table ─────────────────────────────────────────────────────────────────

function FileTable({ files, isLoading, module: mod }: { files: any[]; isLoading: boolean; module: string }) {
  const c = MODULE_COLORS[mod] ?? MODULE_COLORS.Unknown

  if (isLoading) {
    return (
      <div className="p-5 space-y-2">
        {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />)}
      </div>
    )
  }
  if (files.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <FolderOpen size={28} className="text-gray-200" />
        </div>
        <p className="text-sm text-gray-400 font-medium">No files in this folder</p>
        <p className="text-[12px] text-gray-300 mt-1">Files will appear here after syncing from Drive</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">File Name</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Party</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Direction</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sync</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const dirCls = DIR_COLORS[f.direction] ?? DIR_COLORS.Unknown
            const isSynced = f.sync_status === "Synced"
            return (
              <tr key={f.name} className="border-b border-gray-50 hover:bg-slate-50/60 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ExtBadge filename={f.file_name} />
                    <div className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-gray-800 group-hover:text-forest-700 transition-colors max-w-[220px]" title={f.file_name}>
                        {f.file_name}
                      </span>
                      {f.folder_path && (
                        <span className="block truncate text-[10px] text-gray-300 mt-0.5 max-w-[220px]" title={f.folder_path}>
                          {f.folder_path}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: c.bg, color: c.text }}>
                    {DOC_TYPE_LABELS[f.doc_type] ?? f.doc_type ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[12px] text-gray-600 max-w-[140px] truncate whitespace-nowrap">{f.party_name || "—"}</td>
                <td className="px-4 py-3 text-[12px] text-gray-400 whitespace-nowrap">{f.doc_date || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {f.direction && f.direction !== "Unknown"
                    ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${dirCls}`}>{f.direction}</span>
                    : <span className="text-gray-300 text-[11px]">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`text-[11px] font-medium ${isSynced ? "text-green-600" : "text-amber-500"}`}>
                    {isSynced ? "Synced" : f.sync_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {f.web_view_link && (
                    <a href={f.web_view_link} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[11px] text-forest-600 hover:text-forest-800 hover:bg-forest-50 px-2 py-1 rounded-lg font-medium transition-colors">
                      <ExternalLink size={10} /> Open
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Search results ─────────────────────────────────────────────────────────────

function SearchResults({ files, search, isLoading, onClear }: {
  files: any[]; search: string; isLoading: boolean; onClear: () => void
}) {
  // Results come pre-filtered from the server — no client-side filter needed
  const results = files

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/60">
        <span className="text-[12px] text-gray-500">
          {isLoading ? "Searching…" : <><strong className="text-gray-800">{results.length}</strong> result{results.length !== 1 ? "s" : ""} for <em className="text-gray-700">"{search}"</em></>}
        </span>
        <button onClick={onClear} className="text-[11px] text-forest-600 hover:underline flex items-center gap-1">
          <X size={11} /> Clear search
        </button>
      </div>
      {isLoading ? (
        <div className="p-5 space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-9 bg-gray-50 rounded-lg animate-pulse" />)}
        </div>
      ) : results.length === 0 ? (
        <div className="py-14 text-center">
          <Search size={32} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400 font-medium">No files found</p>
          <p className="text-[12px] text-gray-300 mt-1">Try a different search term</p>
        </div>
      ) : (
        <FileTable files={results.slice(0, 500)} isLoading={false} module="Unknown" />
      )}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 flex items-center gap-3 shadow-sm" style={{ borderLeftWidth: 3, borderLeftColor: color }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function VeDrivePage() {
  const [module, setModule] = useState("All")
  const [docType, setDocType] = useState("All")
  const [search, setSearch] = useState("")
  const [showNamingIssues, setShowNamingIssues] = useState(false)

  const isAtHome    = module === "All"
  const isAtModule  = module !== "All" && docType === "All"
  const isAtDocType = module !== "All" && docType !== "All"
  const isSearching = !!search.trim()

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: folderCounts = {} } = useFolderCounts()
  const { data: namingIssues = [] } = useNamingIssues()
  const syncNow = useSyncNow()

  // When searching: pass search term to backend (searches all 7000+ files server-side).
  // When browsing: load only the current doc-type level.
  const { data: files = [], isLoading: filesLoading } = useDriveFiles(
    isSearching ? "All" : module,
    isSearching ? undefined : (docType === "All" ? undefined : docType),
    { enabled: isAtDocType || isSearching, search: isSearching ? search : undefined }
  )

  function navigateTo(m: string, dt = "All") {
    setModule(m); setDocType(dt); setSearch("")
  }

  function handleSync() {
    syncNow.mutate(undefined, {
      onSuccess: (msg) => toast.success(`Sync started — ${msg?.type === "full_sync" ? "full sync" : "delta sync"}`),
      onError: () => toast.error("Sync failed — check server logs"),
    })
  }

  const subFolders = isAtModule ? (MODULE_DOC_TYPES[module] ?? []) : []
  const breadcrumbModule = MODULE_LABELS[module] ?? module
  const breadcrumbDocType = DOC_TYPE_LABELS[docType] ?? docType

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search all files by name, party, folder, or document type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-10 py-3 border border-gray-200 rounded-xl text-[13px] bg-white shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-forest-300 transition"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Header: breadcrumb + sync */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex items-center gap-1 text-[13px]">
          <button onClick={() => navigateTo("All")} className="flex items-center gap-1.5 text-gray-500 hover:text-forest-600 transition-colors font-medium">
            <Home size={13} /> Drive
          </button>
          {!isAtHome && (
            <>
              <ChevronRight size={13} className="text-gray-300 shrink-0" />
              <button
                onClick={() => navigateTo(module)}
                className={`transition-colors font-medium ${isAtModule && !isSearching ? "text-gray-800" : "text-forest-600 hover:text-forest-800"}`}
              >
                {breadcrumbModule}
              </button>
            </>
          )}
          {isAtDocType && (
            <>
              <ChevronRight size={13} className="text-gray-300 shrink-0" />
              <span className="text-gray-800 font-semibold">{breadcrumbDocType}</span>
            </>
          )}
          {isSearching && (
            <>
              <ChevronRight size={13} className="text-gray-300 shrink-0" />
              <span className="text-gray-500 italic">Search results</span>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">
            {statsLoading ? "Checking sync…" : `Last sync: ${formatLastSync(stats?.last_sync ?? "Never")}`}
          </span>
          <Button
            onClick={handleSync}
            disabled={syncNow.isPending}
            size="sm"
            className="text-white border-0 gap-1.5 h-8 text-[12px]"
            style={{ backgroundColor: "#1D9E75" }}
          >
            <RefreshCw size={13} className={syncNow.isPending ? "animate-spin" : ""} />
            {syncNow.isPending ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Naming issues banner */}
      {namingIssues.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-[12px]">
            <strong>{namingIssues.length} file{namingIssues.length !== 1 ? "s" : ""}</strong> don't match the naming convention.{" "}
            <button className="underline font-medium" onClick={() => setShowNamingIssues((v) => !v)}>
              {showNamingIssues ? "Hide" : "Review"}
            </button>
          </div>
        </div>
      )}

      {showNamingIssues && namingIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b bg-amber-50/60">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">File</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Module</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Folder</th>
              </tr>
            </thead>
            <tbody>
              {(namingIssues as any[]).map((f) => (
                <tr key={f.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-gray-700 max-w-[280px] truncate">
                    <a href={f.web_view_link} target="_blank" rel="noreferrer" className="hover:text-forest-600 hover:underline">{f.file_name}</a>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{f.module || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-[11px] truncate max-w-[200px]">{f.folder_path || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Search results ── */}
      {isSearching && (
        <SearchResults files={files} search={search} isLoading={filesLoading} onClear={() => setSearch("")} />
      )}

      {/* ── Folder navigation (hidden during search) ── */}
      {!isSearching && (
        <>
          {/* Home level: stats + module grid */}
          {isAtHome && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total Files" value={stats?.total ?? "—"} color="#1D9E75" />
                <StatCard label="Pending Sync" value={stats?.pending ?? "—"} color="#F59E0B" />
                <StatCard label="Sync Errors" value={stats?.error ?? "—"} color="#EF4444" />
              </div>

              <section>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Folders</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {MODULE_ORDER.map((mod) => {
                    const cnt = (folderCounts as any)[mod]?.total ?? 0
                    return <ModuleFolderCard key={mod} moduleKey={mod} count={cnt} onClick={() => navigateTo(mod)} />
                  })}
                </div>
              </section>
            </>
          )}

          {/* Module level: doc type sub-folders */}
          {isAtModule && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Categories in {breadcrumbModule}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {subFolders.map((sf) => {
                  const cnt = (folderCounts as any)[module]?.[sf.value] ?? 0
                  return (
                    <DocTypeFolderCard
                      key={sf.value}
                      label={sf.label}
                      value={sf.value}
                      moduleKey={module}
                      count={cnt}
                      onClick={() => navigateTo(module, sf.value)}
                    />
                  )
                })}
              </div>
            </section>
          )}

          {/* DocType level: file table */}
          {isAtDocType && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50">
                <span className="text-[12px] text-gray-500">
                  {filesLoading ? "Loading…" : <><strong className="text-gray-800">{files.length.toLocaleString()}</strong> files in <span className="font-medium">{breadcrumbDocType}</span></>}
                </span>
              </div>
              <FileTable files={files} isLoading={filesLoading} module={module} />
              {files.length === 500 && (
                <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-700 text-center">
                  Showing first 500 files. Use search to find specific files.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
