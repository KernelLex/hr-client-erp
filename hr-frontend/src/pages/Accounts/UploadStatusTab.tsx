import { useQuery } from "@tanstack/react-query"
import { getDriveFiles, type DriveFile } from "@/api/accounts"

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

const METHOD_DOT: Record<string, string> = {
  drive_api: "#16a34a",
  last_modifier: "#2563eb",
  folder_path: "#94a3b8",
  drive_api_unknown: "#f97316",
}

function UploaderLine({ file, expectedEmail, expectedName }: {
  file: DriveFile
  expectedEmail: string
  expectedName: string
}) {
  const uploadedEmail = file.uploaded_by_email?.toLowerCase() ?? ""
  const isWrongUploader =
    uploadedEmail && file.upload_detected_method !== "folder_path" &&
    uploadedEmail !== expectedEmail.toLowerCase()

  const dotColor = file.upload_detected_method
    ? METHOD_DOT[file.upload_detected_method] ?? "#94a3b8"
    : "#94a3b8"

  return (
    <div className="mt-1">
      {file.uploaded_by_name && file.uploaded_by_name !== "Unknown" ? (
        <span className="flex items-center gap-1 text-[10px]" style={{ color: "#6b7280" }}>
          <span style={{ color: dotColor }}>●</span>
          {file.uploaded_by_name}
          {file.upload_detected_method === "drive_api" && (
            <span className="text-green-600">(Drive confirmed)</span>
          )}
          {file.upload_detected_method === "folder_path" && (
            <span style={{ color: "#94a3b8" }}>(estimated)</span>
          )}
        </span>
      ) : null}
      {isWrongUploader && (
        <span className="flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
          ⚠ Uploaded by {file.uploaded_by_name} — expected {expectedName}
        </span>
      )}
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function ProgressBar({ pct }: { pct: number }) {
  const barColor =
    pct === 100 ? "#1D9E75" : pct >= 50 ? "#F59E0B" : "#EF4444"
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
    </div>
  )
}

function EmployeeCard({
  employee,
  files,
}: {
  employee: Employee
  files: DriveFile[]
}) {
  const relevantFiles = files.filter((f) =>
    employee.categories.includes(f.category)
  )

  const presentTypes = new Set(relevantFiles.map((f) => f.doc_type).filter(Boolean))

  const uploaded = employee.required.filter((t) => presentTypes.has(t)).length
  const total = employee.required.length
  const pct = total === 0 ? 0 : Math.round((uploaded / total) * 100)

  return (
    <div
      className="rounded-2xl p-5 border flex flex-col gap-4"
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
        <div className="min-w-0">
          <p className="font-semibold text-[15px] leading-tight" style={{ color: "var(--text-primary)" }}>
            {employee.name}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{employee.department}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-lg font-bold" style={{ color: employee.color }}>
            {uploaded}/{total}
          </p>
          <p className="text-[10px] text-gray-400">uploaded</p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500">{uploaded} of {total} docs uploaded this month</span>
          <span
            className="font-semibold"
            style={{
              color:
                pct === 100 ? "#1D9E75" : pct >= 50 ? "#F59E0B" : "#EF4444",
            }}
          >
            {pct}%
          </span>
        </div>
        <ProgressBar pct={pct} />
      </div>

      {/* Doc type checklist */}
      <div className="space-y-2">
        {employee.required.map((docType) => {
          const matchingFiles = relevantFiles.filter((f) => f.doc_type === docType)
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
                  </span>
                  {matchingFiles.map((f) => (
                    <div key={f.name} className="mt-0.5 pl-0">
                      <p className="text-[10px] font-mono truncate text-gray-500" title={f.file_name}>
                        {f.file_name.length > 32 ? f.file_name.slice(0, 32) + "…" : f.file_name}
                      </p>
                      {f.file_date && (
                        <p className="text-[10px] text-gray-400">{f.file_date}</p>
                      )}
                      <UploaderLine
                        file={f}
                        expectedEmail={employee.expectedEmail}
                        expectedName={employee.name}
                      />
                    </div>
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
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["drive_files", "All"],
    queryFn: () => getDriveFiles("All"),
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Showing upload status for current month based on synced Drive files
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {EMPLOYEES.map((emp) => (
          <EmployeeCard key={emp.name} employee={emp} files={files} />
        ))}
      </div>
    </div>
  )
}
