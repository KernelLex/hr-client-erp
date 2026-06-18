import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getDriveFiles, syncDrive, type DriveFile } from "@/api/accounts"
import { RefreshCw, ExternalLink, AlertTriangle, Calendar, CheckCircle2 } from "lucide-react"

interface Employee {
  name: string
  expectedEmail: string
  department: string
  categories: string[]
  required: string[]
  color: string
  bg: string
  border: string
}

const EMPLOYEES: Employee[] = [
  {
    name: "Maaz",
    expectedEmail: "maazdgr8.mma@gmail.com",
    department: "Sales",
    categories: ["Sales"],
    required: ["Quotation", "Sales Order", "Sales Invoice", "Receipt"],
    color: "#1D9E75",
    bg: "#f0fdf9",
    border: "#bbf7d0",
  },
  {
    name: "Lookman",
    expectedEmail: "lookman.vera@outlook.com",
    department: "Purchase + Logistics",
    categories: ["Purchase", "Logistics"],
    required: ["Purchase Order", "Purchase Invoice", "GRN", "Transport Doc"],
    color: "#F97316",
    bg: "#fff7ed",
    border: "#fed7aa",
  },
  {
    name: "Manjunath",
    expectedEmail: "manju.veraaccnts@outlook.com",
    department: "Accounts",
    categories: ["Accounts"],
    required: ["Trial Balance", "Profit & Loss", "Balance Sheet", "Ledger"],
    color: "#8B5CF6",
    bg: "#f5f3ff",
    border: "#ddd6fe",
  },
  {
    name: "Bhagya",
    expectedEmail: "bhagyashree.veraenterprises@outlook.com",
    department: "HR + Payroll",
    categories: ["HR"],
    required: ["Attendance", "Payroll Summary", "Bank Reconciliation"],
    color: "#F59E0B",
    bg: "#fffbeb",
    border: "#fde68a",
  },
]

const MONTH_OPTIONS: { value: string; label: string }[] = (() => {
  const opts = [{ value: "all", label: "All Time" }]
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleString("default", { month: "long", year: "numeric" })
    opts.push({ value, label })
  }
  return opts
})()

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? "#1D9E75" : pct >= 50 ? "#F59E0B" : "#EF4444"
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

function formatDocDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return dateStr
  }
}

function FileItem({
  file,
  expectedEmail,
  expectedName,
}: {
  file: DriveFile
  expectedEmail: string
  expectedName: string
}) {
  const uploadedEmail = (file.uploaded_by_email ?? "").toLowerCase()
  const isWrongUploader = !!uploadedEmail && uploadedEmail !== expectedEmail.toLowerCase()
  const dateLabel = formatDocDate(file.file_date)

  return (
    <div className="pl-6 mt-1.5 space-y-0.5">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-mono text-gray-500 truncate flex-1 min-w-0" title={file.file_name}>
          {file.file_name.length > 30 ? file.file_name.slice(0, 30) + "…" : file.file_name}
        </p>
        {file.drive_view_link && (
          <a
            href={file.drive_view_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-600 shrink-0 ml-1"
            title="Open in Drive"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      {dateLabel && <p className="text-[10px] text-gray-400">{dateLabel}</p>}
      {file.uploaded_by_name && (
        <p className="text-[10px] text-gray-500">
          ↑ {file.uploaded_by_name}
          {isWrongUploader && (
            <span className="ml-1 text-amber-600 font-medium">⚠ expected {expectedName}</span>
          )}
        </p>
      )}
    </div>
  )
}

function EmployeeCard({
  employee,
  files,
  selectedMonth,
}: {
  employee: Employee
  files: DriveFile[]
  selectedMonth: string
}) {
  const relevantFiles = files.filter(f => employee.categories.includes(f.category))
  const presentTypes = new Set(relevantFiles.map(f => f.doc_type).filter(Boolean))
  const uploaded = employee.required.filter(t => presentTypes.has(t)).length
  const total = employee.required.length
  const pct = total === 0 ? 0 : Math.round((uploaded / total) * 100)

  const wrongUploaderCount = relevantFiles.filter(f => {
    const email = (f.uploaded_by_email ?? "").toLowerCase()
    return email && email !== employee.expectedEmail.toLowerCase()
  }).length

  const noFiles = relevantFiles.length === 0 && selectedMonth !== "all"

  return (
    <div
      className="rounded-2xl p-5 border flex flex-col gap-3"
      style={{
        backgroundColor: employee.bg,
        borderColor: employee.border,
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: employee.color }}
        >
          {getInitials(employee.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15px] leading-tight text-gray-800">{employee.name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{employee.department}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-lg font-bold" style={{ color: employee.color }}>{uploaded}/{total}</p>
          <p className="text-[10px] text-gray-400">docs</p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500">{uploaded} of {total} uploaded</span>
          <span
            className="font-semibold"
            style={{ color: pct === 100 ? "#1D9E75" : pct >= 50 ? "#F59E0B" : "#EF4444" }}
          >
            {pct}%
          </span>
        </div>
        <ProgressBar pct={pct} />
      </div>

      {/* Wrong uploader warning */}
      {wrongUploaderCount > 0 && (
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            {wrongUploaderCount} file{wrongUploaderCount > 1 ? "s" : ""} uploaded by wrong account
          </p>
        </div>
      )}

      {/* No files notice for month-specific views */}
      {noFiles && (
        <p className="text-[11px] text-gray-400 text-center py-1">
          No files synced for this period
        </p>
      )}

      {/* Doc type checklist */}
      <div className="space-y-2.5">
        {employee.required.map(docType => {
          const matchingFiles = relevantFiles
            .filter(f => f.doc_type === docType)
            .sort((a, b) => (b.file_date ?? "").localeCompare(a.file_date ?? ""))
          const present = matchingFiles.length > 0
          return (
            <div key={docType}>
              <div className="flex items-start gap-2 text-[12px]">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
                  style={{
                    backgroundColor: present ? "#dcfce7" : "#fee2e2",
                    color: present ? "#166534" : "#991b1b",
                  }}
                >
                  {present ? "✓" : "✗"}
                </span>
                <div className="flex-1 min-w-0">
                  <span style={{ color: present ? "#374151" : "#9ca3af" }}>
                    {docType}
                    {!present && (
                      <span className="ml-1 text-[10px] text-red-400 font-medium">(missing)</span>
                    )}
                    {matchingFiles.length > 1 && (
                      <span className="ml-1 text-[10px] text-gray-400">
                        ({matchingFiles.length} files)
                      </span>
                    )}
                  </span>
                  {matchingFiles.map(f => (
                    <FileItem
                      key={f.name}
                      file={f}
                      expectedEmail={employee.expectedEmail}
                      expectedName={employee.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-32" />
        </div>
      </div>
      <div className="h-2 bg-gray-200 rounded-full" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-100 rounded w-3/4" />
        ))}
      </div>
    </div>
  )
}

export function UploadStatusTab() {
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[1]?.value ?? "all")
  const [syncing, setSyncing] = useState(false)
  const qc = useQueryClient()

  const { data: allFiles = [], isLoading } = useQuery({
    queryKey: ["drive_files", "All"],
    queryFn: () => getDriveFiles("All"),
    staleTime: 0,
    refetchOnMount: "always",
  })

  // Filter files by selected month (undated files only appear in "All Time")
  const files = useMemo(() => {
    if (selectedMonth === "all") return allFiles
    return allFiles.filter(f => (f.file_date ?? "").startsWith(selectedMonth))
  }, [allFiles, selectedMonth])

  // Aggregate stats across all employees
  const summary = useMemo(() => {
    let totalRequired = 0
    let totalUploaded = 0
    const missing: { employee: Employee; docType: string }[] = []
    let wrongUploaderCount = 0

    for (const emp of EMPLOYEES) {
      const empFiles = files.filter(f => emp.categories.includes(f.category))
      const presentTypes = new Set(empFiles.map(f => f.doc_type).filter(Boolean))

      for (const docType of emp.required) {
        totalRequired++
        if (presentTypes.has(docType)) {
          totalUploaded++
        } else {
          missing.push({ employee: emp, docType })
        }
      }

      for (const f of empFiles) {
        const email = (f.uploaded_by_email ?? "").toLowerCase()
        if (email && email !== emp.expectedEmail.toLowerCase()) wrongUploaderCount++
      }
    }

    const pct = totalRequired === 0 ? 0 : Math.round((totalUploaded / totalRequired) * 100)
    return { totalRequired, totalUploaded, missing, wrongUploaderCount, pct }
  }, [files])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncDrive()
      await qc.invalidateQueries({ queryKey: ["drive_files"] })
    } finally {
      setSyncing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  const summaryPctColor =
    summary.pct === 100 ? "#1D9E75" : summary.pct >= 50 ? "#F59E0B" : "#EF4444"

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
          >
            {MONTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {selectedMonth !== "all" && (
            <span className="text-[11px] text-gray-400">
              {files.length} file{files.length !== 1 ? "s" : ""} in period
            </span>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Drive"}
        </button>
      </div>

      {/* Summary strip */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-5 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: summaryPctColor }}
          >
            {summary.pct}%
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-700">Overall Progress</p>
            <p className="text-[11px] text-gray-400">
              {summary.totalUploaded} of {summary.totalRequired} documents uploaded
            </p>
          </div>
        </div>

        <div className="hidden sm:block h-10 w-px bg-gray-100" />

        <div className="flex gap-5 flex-wrap">
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">{summary.totalUploaded}</p>
            <p className="text-[10px] text-gray-400">uploaded</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-500">{summary.missing.length}</p>
            <p className="text-[10px] text-gray-400">missing</p>
          </div>
          {summary.wrongUploaderCount > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-amber-500">{summary.wrongUploaderCount}</p>
              <p className="text-[10px] text-gray-400">wrong uploader</p>
            </div>
          )}
          {summary.pct === 100 && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-[13px] font-medium">All complete!</span>
            </div>
          )}
        </div>

        <div className="hidden sm:block flex-1 max-w-xs ml-auto">
          <ProgressBar pct={summary.pct} />
        </div>
      </div>

      {/* Employee cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {EMPLOYEES.map(emp => (
          <EmployeeCard
            key={emp.name}
            employee={emp}
            files={files}
            selectedMonth={selectedMonth}
          />
        ))}
      </div>

      {/* Missing docs panel */}
      {summary.missing.length > 0 && (
        <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-[13px] font-semibold text-gray-700">
              Missing Documents
              <span className="ml-2 text-[11px] font-normal text-gray-400">
                {summary.missing.length} item{summary.missing.length !== 1 ? "s" : ""} pending
              </span>
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {EMPLOYEES.map(emp => {
              const empMissing = summary.missing.filter(m => m.employee.name === emp.name)
              if (empMissing.length === 0) return null
              return (
                <div
                  key={emp.name}
                  className="rounded-xl p-3 border"
                  style={{ borderColor: emp.border, backgroundColor: emp.bg }}
                >
                  <p
                    className="text-[11px] font-semibold mb-2"
                    style={{ color: emp.color }}
                  >
                    {emp.name}
                  </p>
                  <ul className="space-y-1">
                    {empMissing.map(m => (
                      <li key={m.docType} className="text-[10px] text-gray-500 flex items-center gap-1">
                        <span className="text-red-400 shrink-0">✗</span>
                        <span>{m.docType}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {summary.missing.length === 0 && !isLoading && (
        <p className="text-center text-[12px] text-gray-400 py-2">
          {selectedMonth !== "all"
            ? "All required documents are uploaded for this period."
            : "All required documents are present across all time."}
        </p>
      )}
    </div>
  )
}
