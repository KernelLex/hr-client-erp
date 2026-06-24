import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  TrendingUp, RefreshCw, AlertTriangle, Bot, Sparkles, ExternalLink,
  Search, X, Home, ChevronRight, Settings, Folder, FileText, Activity,
} from "lucide-react"
import { useTallySummary, formatDate as tallyFmtDate } from "@/api/tally"
import { useNavigate } from "react-router-dom"
import {
  getStructuredData, processSingleFile, autoLinkDocuments,
  startBackgroundExtraction, retryFailedExtractions, getExtractionStatus, getExtractableFiles,
  updateDocStatus,
  type SalesInvoice, type Quotation, type CreditNote,
  type PurchaseInvoice, type PurchaseOrder, type DebitNote,
  type FinancialReport, type SalaryRecord, type StructuredData,
} from "@/api/business"
import { getDashboardInsights, getAccuracyStats } from "@/api/ai"
import { useAuth } from "@/context/AuthContext"
import { useFolderCounts, type FolderCounts } from "@/pages/drive/useDrive"

// ── Utility components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending: "bg-yellow-100 text-yellow-800",
    Paid: "bg-green-100 text-green-800",
    Overdue: "bg-red-100 text-red-800",
    Partial: "bg-blue-100 text-blue-800",
    Open: "bg-yellow-100 text-yellow-800",
    Received: "bg-green-100 text-green-800",
    Cancelled: "bg-gray-100 text-gray-600",
    Sent: "bg-blue-100 text-blue-800",
    Won: "bg-green-100 text-green-800",
    Lost: "bg-red-100 text-red-600",
    Expired: "bg-gray-100 text-gray-600",
    Draft: "bg-gray-100 text-gray-700",
    Made: "bg-red-100 text-red-700",
    Received2: "bg-green-100 text-green-700",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  )
}

function formatINR(amount: number): string {
  if (!amount || amount === 0) return "₹0"
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`
  return `₹${Math.round(amount).toLocaleString("en-IN")}`
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 border-l-4 ${accent}`}>
      <div className="text-xs text-gray-500 font-medium mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  )
}

function DriveLink({ href }: { href?: string }) {
  if (!href) return <span className="text-gray-300 text-xs">—</span>
  return (
    <a href={href} target="_blank" rel="noreferrer"
       className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 whitespace-nowrap">
      <ExternalLink className="w-3 h-3" /> Open
    </a>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <div className="text-4xl mb-3">🤖</div>
      <p className="text-gray-500 text-sm font-medium">No {label} extracted yet</p>
      <p className="text-gray-400 text-xs mt-1">Start background extraction below to populate this section</p>
    </div>
  )
}

// ── Folder navigation structure ────────────────────────────────────────────────

const MODULE_STRUCTURE = {
  Sales: {
    label: "Sales",
    color: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
    docTypes: [
      { label: "Sale Invoices", value: "SalesInvoice", driveKey: "SalesInvoice" },
      { label: "Sale Orders", value: "SalesOrder", driveKey: "SalesOrder" },
      { label: "Performa Invoices", value: "Quotation", driveKey: "Quotation" },
      { label: "Credit Notes", value: "CreditNote", driveKey: "CreditNote" },
    ],
  },
  Purchase: {
    label: "Purchase",
    color: { bg: "#fff1f2", text: "#be123c", border: "#fecdd3" },
    docTypes: [
      { label: "Purchase Invoices", value: "PurchaseInvoice", driveKey: "PurchaseInvoice" },
      { label: "Purchase Orders", value: "PurchaseOrder", driveKey: "PurchaseOrder" },
      { label: "Debit Notes", value: "DebitNote", driveKey: "DebitNote" },
    ],
  },
  Accounts: {
    label: "Accounts",
    color: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
    docTypes: [
      { label: "Payment Vouchers", value: "Payment", driveKey: "Payment" },
      { label: "Receipt Vouchers", value: "Receipt", driveKey: "Receipt" },
      { label: "Financial Reports", value: "FinancialReport", driveKey: "" },
    ],
  },
  HR: {
    label: "HR & Payroll",
    color: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
    docTypes: [
      { label: "Salary Records", value: "SalaryRecord", driveKey: "" },
    ],
  },
} as const

type ModuleKey = keyof typeof MODULE_STRUCTURE

function getRecords(data: StructuredData | undefined, docType: string): any[] {
  if (!data) return []
  switch (docType) {
    case "SalesInvoice": return (data.sales_invoices ?? []).filter((i) => i.doc_type === "SalesInvoice")
    case "SalesOrder":   return (data.sales_invoices ?? []).filter((i) => i.doc_type === "SalesOrder")
    case "Quotation":    return data.quotations ?? []
    case "CreditNote":   return data.credit_notes ?? []
    case "PurchaseInvoice": return data.purchase_invoices ?? []
    case "PurchaseOrder":   return data.purchase_orders ?? []
    case "DebitNote":       return data.debit_notes ?? []
    case "Payment":         return data.payment_records ?? []
    case "Receipt":         return data.receipt_records ?? []
    case "FinancialReport": return data.financial_reports ?? []
    case "SalaryRecord":    return data.salary_records ?? []
    default: return []
  }
}

function getModuleRecordCount(data: StructuredData | undefined, mod: ModuleKey): number {
  return MODULE_STRUCTURE[mod].docTypes.reduce((sum, dt) => sum + getRecords(data, dt.value).length, 0)
}

// ── Folder cards ───────────────────────────────────────────────────────────────

function ModuleFolderCard({
  modKey, data, folderCounts, onClick,
}: {
  modKey: ModuleKey
  data: StructuredData | undefined
  folderCounts: FolderCounts
  onClick: () => void
}) {
  const m = MODULE_STRUCTURE[modKey]
  const extracted = getModuleRecordCount(data, modKey)
  const driveModKey = modKey === "HR" ? "HR_Payroll" : modKey
  const totalFiles = folderCounts[driveModKey]?.total ?? 0
  const pct = totalFiles > 0 ? Math.round((extracted / totalFiles) * 100) : 0
  const subCount = m.docTypes.length

  return (
    <button onClick={onClick}
      className="group relative bg-white rounded-2xl border border-gray-100 p-5 text-left transition-all hover:shadow-lg hover:border-gray-200 hover:-translate-y-1 active:translate-y-0 w-full overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ backgroundColor: m.color.text }} />
      <div className="flex items-start justify-between mb-4 mt-1">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: m.color.bg }}>
          <Folder size={22} style={{ color: m.color.text }} strokeWidth={1.5} />
        </div>
        {extracted > 0 && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: m.color.bg, color: m.color.text }}>
            {extracted} records
          </span>
        )}
      </div>
      <p className="font-bold text-[15px] text-gray-800 group-hover:text-indigo-600 transition-colors">{m.label}</p>
      <p className="text-[12px] text-gray-400 mt-0.5">{subCount} categories · {totalFiles.toLocaleString()} Drive files</p>
      {totalFiles > 0 && (
        <div className="mt-3.5">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400">{extracted} extracted</span>
            <span className="font-semibold" style={{ color: m.color.text }}>{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: m.color.text }} />
          </div>
        </div>
      )}
      <ChevronRight size={15} className="absolute right-4 bottom-4 text-gray-200 group-hover:text-indigo-400 transition-all group-hover:translate-x-0.5" />
    </button>
  )
}

function DocTypeFolderCard({
  label, value, driveKey, module: mod, data, folderCounts, onClick,
}: {
  label: string; value: string; driveKey: string; module: ModuleKey
  data: StructuredData | undefined; folderCounts: FolderCounts; onClick: () => void
}) {
  const m = MODULE_STRUCTURE[mod]
  const extracted = getRecords(data, value).length
  const driveModKey = mod === "HR" ? "HR_Payroll" : mod
  const totalFiles = driveKey ? (folderCounts[driveModKey]?.[driveKey] ?? 0) : 0
  const pct = totalFiles > 0 ? Math.round((extracted / totalFiles) * 100) : 0

  return (
    <button onClick={onClick}
      className="group bg-white rounded-xl border border-gray-100 p-4 text-left transition-all hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 active:translate-y-0 w-full flex items-center gap-3.5"
      style={{ borderLeftWidth: 3, borderLeftColor: m.color.text }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: m.color.bg }}>
        <FileText size={17} style={{ color: m.color.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[13px] text-gray-800 group-hover:text-indigo-600 transition-colors truncate">{label}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {extracted > 0
            ? <><span className="font-semibold" style={{ color: m.color.text }}>{extracted}</span> extracted · {totalFiles.toLocaleString()} files</>
            : `${totalFiles.toLocaleString()} files`}
        </p>
        {totalFiles > 0 && extracted > 0 && (
          <div className="mt-1.5 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: m.color.text }} />
          </div>
        )}
      </div>
      <ChevronRight size={14} className="text-gray-200 group-hover:text-indigo-400 transition-all group-hover:translate-x-0.5 shrink-0" />
    </button>
  )
}

// ── Data tables ────────────────────────────────────────────────────────────────

function SalesInvoiceTable({ records }: { records: SalesInvoice[] }) {
  if (records.length === 0) return <EmptyState label="sales invoices" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Invoice #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Client</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Amount</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Status</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[160px]">{r.invoice_number || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.client_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.invoice_date || "—"}</td>
            <td className="px-4 py-2.5 text-gray-700 font-medium">{r.total_amount ? formatINR(r.total_amount) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.payment_status || "Pending"} /></td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function QuotationTable({ records }: { records: Quotation[] }) {
  const qc = useQueryClient()
  if (records.length === 0) return <EmptyState label="quotations" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Quote #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Client</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Value</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Status</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Action</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((q) => (
          <tr key={q.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[160px]">{q.quote_number || q.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{q.client_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{q.quote_date || "—"}</td>
            <td className="px-4 py-2.5 text-gray-700 font-medium">{q.total_value ? formatINR(q.total_value) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={q.status || "Draft"} /></td>
            <td className="px-4 py-2.5 space-x-1">
              {q.status === "Sent" && (
                <>
                  <button onClick={() => { updateDocStatus("VE Quotation", q.name, "Won"); qc.invalidateQueries({ queryKey: ["structured-data"] }) }}
                    className="text-[11px] bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700">Won</button>
                  <button onClick={() => { updateDocStatus("VE Quotation", q.name, "Lost"); qc.invalidateQueries({ queryKey: ["structured-data"] }) }}
                    className="text-[11px] bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600">Lost</button>
                </>
              )}
            </td>
            <td className="px-4 py-2.5"><DriveLink href={q.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CreditNoteTable({ records }: { records: CreditNote[] }) {
  if (records.length === 0) return <EmptyState label="credit notes" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">CN #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Client</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Amount</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Status</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono">{r.cn_number || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.client_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.cn_date || "—"}</td>
            <td className="px-4 py-2.5 font-medium">{r.total_amount ? formatINR(r.total_amount) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.status || "Pending"} /></td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PurchaseInvoiceTable({ records }: { records: PurchaseInvoice[] }) {
  if (records.length === 0) return <EmptyState label="purchase invoices" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Invoice #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Vendor</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Amount</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Status</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[160px]">{r.invoice_number || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.vendor_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.invoice_date || "—"}</td>
            <td className="px-4 py-2.5 font-medium">{r.total_amount ? formatINR(r.total_amount) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.payment_status || "Pending"} /></td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PurchaseOrderTable({ records }: { records: PurchaseOrder[] }) {
  if (records.length === 0) return <EmptyState label="purchase orders" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">PO #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Vendor</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Value</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Status</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono">{r.po_number || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.vendor_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.po_date || "—"}</td>
            <td className="px-4 py-2.5 font-medium">{r.total_value ? formatINR(r.total_value) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.status || "Open"} /></td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DebitNoteTable({ records }: { records: DebitNote[] }) {
  if (records.length === 0) return <EmptyState label="debit notes" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">DN #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Vendor</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Amount</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Status</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono">{r.dn_number || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.vendor_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.dn_date || "—"}</td>
            <td className="px-4 py-2.5 font-medium">{r.total_amount ? formatINR(r.total_amount) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.status || "Pending"} /></td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PaymentTable({ records }: { records: any[] }) {
  if (records.length === 0) return <EmptyState label="payment vouchers" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Voucher #</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Party</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Amount</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Type</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono">{r.payment_number || r.file_name || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.party_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.payment_date || "—"}</td>
            <td className="px-4 py-2.5 font-medium">{r.amount ? formatINR(r.amount) : "—"}</td>
            <td className="px-4 py-2.5"><StatusBadge status={r.payment_type || "—"} /></td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReceiptTable({ records }: { records: any[] }) {
  if (records.length === 0) return <EmptyState label="receipt vouchers" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">File Name</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Party</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[300px]">{r.file_name || r.name}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.party_name || "—"}</td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FinancialReportTable({ records }: { records: FinancialReport[] }) {
  if (records.length === 0) return <EmptyState label="financial reports" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">File Name</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Type</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[300px]">{r.file_name || r.name}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.report_type || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.from_date || "—"}</td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SalaryTable({ records }: { records: SalaryRecord[] }) {
  if (records.length === 0) return <EmptyState label="salary records" />
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr className="text-left">
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">File Name</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Employee</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Period</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Net Salary</th>
          <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r) => (
          <tr key={r.name} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[200px]">{r.file_name || r.name}</td>
            <td className="px-4 py-2.5 text-gray-700">{r.employee_name || "—"}</td>
            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.month_year || "—"}</td>
            <td className="px-4 py-2.5 font-medium">{r.net_salary ? formatINR(r.net_salary) : "—"}</td>
            <td className="px-4 py-2.5"><DriveLink href={r.web_view_link} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DocTypeTable({
  docType, data,
}: { docType: string; data: StructuredData | undefined }) {
  const records = getRecords(data, docType)
  switch (docType) {
    case "SalesInvoice":
    case "SalesOrder":
      return <SalesInvoiceTable records={records as SalesInvoice[]} />
    case "Quotation":    return <QuotationTable records={records as Quotation[]} />
    case "CreditNote":   return <CreditNoteTable records={records as CreditNote[]} />
    case "PurchaseInvoice": return <PurchaseInvoiceTable records={records as PurchaseInvoice[]} />
    case "PurchaseOrder":   return <PurchaseOrderTable records={records as PurchaseOrder[]} />
    case "DebitNote":       return <DebitNoteTable records={records as DebitNote[]} />
    case "Payment":         return <PaymentTable records={records} />
    case "Receipt":         return <ReceiptTable records={records} />
    case "FinancialReport": return <FinancialReportTable records={records as FinancialReport[]} />
    case "SalaryRecord":    return <SalaryTable records={records as SalaryRecord[]} />
    default: return <EmptyState label="records" />
  }
}

// ── Search results (universal flat list) ───────────────────────────────────────

interface FlatRecord { id: string; type: string; label: string; party: string; date: string; link?: string }

function flattenAll(data: StructuredData | undefined): FlatRecord[] {
  if (!data) return []
  const out: FlatRecord[] = []
  ;(data.sales_invoices ?? []).forEach((r) => out.push({ id: r.name, type: r.doc_type === "SalesOrder" ? "Sale Order" : "Sale Invoice", label: r.invoice_number || r.name, party: r.client_name || "—", date: r.invoice_date || "", link: r.web_view_link }))
  ;(data.quotations ?? []).forEach((r) => out.push({ id: r.name, type: "Performa Invoice", label: r.quote_number || r.name, party: r.client_name || "—", date: r.quote_date || "", link: r.web_view_link }))
  ;(data.credit_notes ?? []).forEach((r) => out.push({ id: r.name, type: "Credit Note", label: r.cn_number || r.name, party: r.client_name || "—", date: r.cn_date || "", link: r.web_view_link }))
  ;(data.purchase_invoices ?? []).forEach((r) => out.push({ id: r.name, type: "Purchase Invoice", label: r.invoice_number || r.name, party: r.vendor_name || "—", date: r.invoice_date || "", link: r.web_view_link }))
  ;(data.purchase_orders ?? []).forEach((r) => out.push({ id: r.name, type: "Purchase Order", label: r.po_number || r.name, party: r.vendor_name || "—", date: r.po_date || "", link: r.web_view_link }))
  ;(data.debit_notes ?? []).forEach((r) => out.push({ id: r.name, type: "Debit Note", label: r.dn_number || r.name, party: r.vendor_name || "—", date: r.dn_date || "", link: r.web_view_link }))
  ;(data.payment_records ?? []).forEach((r: any) => out.push({ id: r.name, type: "Payment Voucher", label: r.payment_number || r.file_name || r.name, party: r.party_name || "—", date: r.payment_date || "", link: r.web_view_link }))
  ;(data.receipt_records ?? []).forEach((r: any) => out.push({ id: r.name, type: "Receipt Voucher", label: r.file_name || r.name, party: r.party_name || "—", date: "", link: r.web_view_link }))
  ;(data.financial_reports ?? []).forEach((r) => out.push({ id: r.name, type: "Financial Report", label: r.file_name || r.name, party: r.report_type || "—", date: r.from_date || "", link: r.web_view_link }))
  ;(data.salary_records ?? []).forEach((r) => out.push({ id: r.name, type: "Salary Record", label: r.file_name || r.name, party: r.employee_name || "—", date: r.month_year || "", link: r.web_view_link }))
  return out
}

// ── AI Health Panel ────────────────────────────────────────────────────────────

function AIHealthPanel({ onNavigate }: { onNavigate: () => void }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const scoreColor = !data?.health_score ? "text-gray-400" : data.health_score >= 75 ? "text-green-600" : data.health_score >= 50 ? "text-yellow-600" : "text-red-600"
  const bgColor = !data?.health_score ? "border-gray-200" : data.health_score >= 75 ? "border-green-300 bg-green-50" : data.health_score >= 50 ? "border-yellow-300 bg-yellow-50" : "border-red-300 bg-red-50"

  return (
    <div className={`rounded-xl border-2 p-4 ${bgColor} transition-all`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center">
            <Bot className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">AI Business Health</span>
              {data?.health_label && (
                <span className="text-xs bg-white border rounded-full px-2 py-0.5 text-gray-600">{data.health_label}</span>
              )}
            </div>
            <p className="text-xs text-gray-500">Vera AI analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.health_score !== undefined && <div className={`text-3xl font-bold ${scoreColor}`}>{data.health_score}</div>}
          <div className="flex flex-col gap-1">
            <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-gray-400 hover:text-gray-600">
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onNavigate} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 whitespace-nowrap">
              Insights <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      {!isLoading && !isFetching && data?.success && (
        <div className="mt-3 grid md:grid-cols-2 gap-2">
          {data.insights && data.insights.length > 0 && (
            <ul className="space-y-1">
              {data.insights.slice(0, 2).map((ins, i) => (
                <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                  <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
                  {typeof ins === "string" ? ins : JSON.stringify(ins)}
                </li>
              ))}
            </ul>
          )}
          {data.alerts && data.alerts.length > 0 && (
            <ul className="space-y-1">
              {data.alerts.slice(0, 2).map((alert, i) => (
                <li key={i} className="text-xs text-red-600 flex gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {typeof alert === "string" ? alert : JSON.stringify(alert)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!data?.success && !isLoading && (
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          {data?.reason === "Ollama not running" ? "Start Ollama to enable AI insights" : "Click refresh to generate AI insights"}
        </p>
      )}
    </div>
  )
}

// ── Extraction Panel ───────────────────────────────────────────────────────────

function ProcessFilesPanel() {
  const qc = useQueryClient()
  const [log, setLog] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentFile, setCurrentFile] = useState("")

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["extraction-status"],
    queryFn: getExtractionStatus,
    refetchInterval: (d) => (d as any)?.job_active ? 30_000 : 60_000,
    staleTime: 0,
  })

  const { data: extractable, refetch: refetchPending } = useQuery({
    queryKey: ["extractable-files"],
    queryFn: () => getExtractableFiles(200),
    staleTime: 30_000,
  })

  const [retrying, setRetrying] = useState(false)
  const totalPending = status?.pending ?? extractable?.total_pending ?? 0
  const jobActive = status?.job_active ?? false
  const pendingFiles = extractable?.files ?? []
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  async function handleStartBackground() {
    const result = await startBackgroundExtraction()
    if (result.status === "already_running") {
      setLog("⟳ Background extraction already running — check back in a few minutes")
    } else if (result.status === "enqueued") {
      setLog("🚀 Background extraction started! Processing ~50 files per batch. You can navigate freely.")
    } else {
      setLog(`⚠ ${result.message}`)
    }
    await refetchStatus()
  }

  async function handleRetryFailed() {
    setRetrying(true)
    setLog(null)
    const result = await retryFailedExtractions()
    if (result.queued === 0) {
      setLog("✅ No failed files found — all documents are already extracted")
    } else if (result.already_running) {
      setLog(`⟳ Extraction already running — ${result.queued} failed file(s) will be picked up in the next batch`)
    } else {
      setLog(`🔄 Retrying ${result.queued} failed file(s) in background — check back in a few minutes`)
    }
    await refetchStatus()
    setRetrying(false)
  }

  async function handleExtractBatch() {
    setExtracting(true)
    setLog(null)
    let batch = pendingFiles
    try { const fresh = await getExtractableFiles(200); batch = fresh.files } catch { /* use cached */ }
    if (batch.length === 0) { setLog("✅ All files already extracted"); setExtracting(false); return }
    setProgress({ current: 0, total: batch.length })
    let ok = 0, skip = 0, fail = 0
    for (let i = 0; i < batch.length; i++) {
      const f = batch[i]
      setCurrentFile(f.file_name)
      setProgress({ current: i + 1, total: batch.length })
      try {
        const r = await processSingleFile(f.name, false) as any
        if (r?.skipped) skip++; else if (r?.success !== false) ok++; else fail++
      } catch { fail++ }
      await new Promise((res) => setTimeout(res, 400))
    }
    try { await autoLinkDocuments() } catch { /* non-fatal */ }
    setCurrentFile("")
    const remaining = totalPending - batch.length
    setLog(`✅ ${[ok && `${ok} extracted`, skip && `${skip} skipped`, fail && `${fail} failed`].filter(Boolean).join(", ")}${remaining > 0 ? ` · ${remaining} more remaining` : " · done!"}`)
    setExtracting(false)
    await refetchPending(); await refetchStatus()
    qc.invalidateQueries({ queryKey: ["structured-data"] })
  }

  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-gray-500" />
        <span className="font-semibold text-gray-800">AI Data Extraction</span>
        <span className="ml-auto text-sm">
          {totalPending > 0
            ? <span className="text-amber-600 font-medium">{totalPending.toLocaleString()} files pending</span>
            : totalPending === 0 && extractable
              ? <span className="text-green-600 font-medium">✓ All extracted</span>
              : <span className="text-gray-400">Loading…</span>}
        </span>
      </div>

      {/* Background job status */}
      {jobActive && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-indigo-800">Background extraction running on server</p>
            <p className="text-xs text-indigo-600">{totalPending.toLocaleString()} files remaining · ~50 files per batch · auto-updates every 30s</p>
          </div>
          <button onClick={() => { refetchStatus(); refetchPending() }} className="text-xs text-indigo-600 hover:text-indigo-800 underline shrink-0">
            Refresh
          </button>
        </div>
      )}

      {/* Start background extraction CTA */}
      {!jobActive && totalPending > 0 && (
        <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
          <p className="text-sm font-semibold text-green-900 mb-1">First-run extraction</p>
          <p className="text-xs text-green-700 mb-3">
            Runs on the server — <strong>navigate freely, close the browser</strong>, or come back later. Each batch of 50 files is processed and re-queued automatically.
          </p>
          <button
            onClick={handleStartBackground}
            className="flex items-center gap-2 bg-green-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors font-medium"
          >
            🚀 Start Background Extraction ({totalPending.toLocaleString()} files)
          </button>
        </div>
      )}

      {/* Browser-based extraction (secondary) */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleExtractBatch}
          disabled={extracting || totalPending === 0}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {extracting
            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Extracting {progress.current}/{progress.total}…</>
            : <>⚡ Extract Next 200 (browser)</>}
        </button>
        <button
          onClick={handleRetryFailed}
          disabled={retrying || extracting}
          className="flex items-center gap-1.5 bg-orange-500 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {retrying
            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Queuing…</>
            : <>🔄 Retry Failed Files</>}
        </button>
        <span className="text-xs text-gray-400">Requires this page to stay open (browser) · failed files run on server</span>
      </div>

      {extracting && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="truncate max-w-xs text-gray-600">{currentFile}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {log && (
        <div className="mt-3 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">{log}</div>
      )}

      {totalPending === 0 && extractable && (
        <div className="text-center py-3 text-sm text-green-600">
          ✅ All Drive files have been extracted into the Business Dashboard.
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BusinessDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeModule, setActiveModule] = useState<ModuleKey | "All">("All")
  const [activeDocType, setActiveDocType] = useState("All")
  const [search, setSearch] = useState("")

  const { data, isLoading, error } = useQuery<StructuredData>({
    queryKey: ["structured-data"],
    queryFn: () => getStructuredData(),
    staleTime: 60_000,
  })

  const { data: folderCounts = {} as FolderCounts } = useFolderCounts()

  const { data: tallySnap } = useTallySummary()

  const { data: accStats } = useQuery({
    queryKey: ["accuracy-stats"],
    queryFn: getAccuracyStats,
    staleTime: 120_000,
  })

  const { data: extractionStatus } = useQuery({
    queryKey: ["extraction-status"],
    queryFn: getExtractionStatus,
    refetchInterval: (d) => (d as any)?.job_active ? 30_000 : false,
    staleTime: 0,
  })

  const isAdmin = user?.name === "owais@veraenterprises.in" || user?.name === "Administrator"
  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-400">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p>Business Dashboard is admin-only.</p>
      </div>
    )
  }

  const totals = data?.totals
  const verificationNudge = accStats?.summary ? (accStats.summary.needs_review > 0 ? accStats.summary.needs_review : accStats.summary.unverified) : 0

  // Search
  const searchLower = search.toLowerCase().trim()
  const searchResults = searchLower ? flattenAll(data).filter((r) =>
    r.label.toLowerCase().includes(searchLower) ||
    r.party.toLowerCase().includes(searchLower) ||
    r.type.toLowerCase().includes(searchLower)
  ) : []

  const isAtHome = activeModule === "All"
  const isAtModule = activeModule !== "All" && activeDocType === "All"
  const isAtDocType = activeModule !== "All" && activeDocType !== "All"
  const currentModuleStructure = activeModule !== "All" ? MODULE_STRUCTURE[activeModule] : null

  function navigateTo(mod: ModuleKey | "All", dt = "All") {
    setActiveModule(mod)
    setActiveDocType(dt)
    setSearch("")
  }

  // Records count for active view
  const activeRecords = isAtDocType ? getRecords(data, activeDocType) : []
  const activeLabel = isAtDocType
    ? currentModuleStructure?.docTypes.find((d) => d.value === activeDocType)?.label ?? activeDocType
    : isAtModule ? currentModuleStructure?.label ?? "" : ""

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Business Dashboard</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">AI-extracted data from Google Drive documents</p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["structured-data"] })}
          className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Background extraction running banner */}
      {extractionStatus?.job_active && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm">
          <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
          <span className="text-indigo-700">
            Background extraction running · <strong>{extractionStatus.pending.toLocaleString()}</strong> files remaining
          </span>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["structured-data"] })} className="ml-auto text-xs text-indigo-600 hover:underline">
            Refresh data
          </button>
        </div>
      )}

      {/* Verification nudge */}
      {verificationNudge > 0 && (
        <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
            <span className="text-sm text-yellow-800 font-medium">{verificationNudge} record{verificationNudge !== 1 ? "s" : ""} need verification</span>
          </div>
          <button onClick={() => navigate("/verify")} className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-700">
            Review Now →
          </button>
        </div>
      )}

      {/* Tally Financial Strip */}
      {tallySnap && isAtHome && !search && (
        <div className="bg-[#0B2545] rounded-xl px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-[#C9A96E]" />
            <span className="text-xs font-semibold uppercase tracking-widest text-[#C9A96E]">
              Tally Ground Truth · as of {tallyFmtDate(tallySnap.as_of)}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Cash + Bank",   value: tallySnap.cash_bank,    color: "text-white" },
              { label: "Receivables",   value: tallySnap.receivables,  color: "text-green-300" },
              { label: "Payables",      value: tallySnap.payables,     color: "text-red-300" },
              { label: "FY Sales",      value: tallySnap.fy_sales,     color: "text-blue-200" },
              { label: "FY Purchases",  value: tallySnap.fy_purchases, color: "text-orange-200" },
              { label: "Net GST",       value: tallySnap.net_gst,      color: "text-yellow-200" },
            ].map((k) => (
              <div key={k.label} className="bg-white/5 rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-[#94A3B8] font-semibold uppercase tracking-widest mb-1">{k.label}</p>
                <p className={`font-mono text-base font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards — only at home level */}
      {isAtHome && !search && !isLoading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total Sales" value={formatINR(totals?.total_sales ?? 0)} sub={`${data?.sales_invoices?.length ?? 0} docs`} accent="border-l-green-500" />
          <MetricCard label="Invoiced" value={formatINR(totals?.total_invoiced ?? 0)} sub={`${(data?.sales_invoices ?? []).filter((i) => i.doc_type === "SalesInvoice").length} invoices`} accent="border-l-emerald-500" />
          <MetricCard label="Order Book" value={formatINR(totals?.total_order_book ?? 0)} sub={`${(data?.sales_invoices ?? []).filter((i) => i.doc_type === "SalesOrder").length} orders`} accent="border-l-teal-500" />
          <MetricCard label="Purchases" value={formatINR(totals?.total_purchases ?? 0)} sub={`${data?.purchase_invoices?.length ?? 0} inv · ${totals?.pending_pos ?? 0} POs open`} accent="border-l-red-400" />
          <MetricCard label="Quoted" value={formatINR(totals?.total_quoted ?? 0)} sub={`${totals?.open_quotations ?? 0} open · ${data?.quotations?.length ?? 0} total`} accent="border-l-yellow-400" />
          <MetricCard label="Payroll" value={totals?.total_payroll ? formatINR(totals.total_payroll) : `${data?.salary_records?.length ?? 0} docs`} sub="net salary" accent="border-l-purple-400" />
        </div>
      )}

      {/* AI Health — only at home level */}
      {isAtHome && !search && <AIHealthPanel onNavigate={() => navigate("/ai-insights")} />}

      {/* ── Search bar ── */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search extracted records by name, party, or document type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-[13px] shadow-sm bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Breadcrumb ── */}
      {(!isAtHome || search) && (
        <nav className="flex items-center gap-1.5 text-[13px]">
          <button onClick={() => navigateTo("All")} className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors">
            <Home size={13} /><span>Dashboard</span>
          </button>
          {!isAtHome && (
            <>
              <ChevronRight size={13} className="text-gray-300" />
              <button
                onClick={() => navigateTo(activeModule as ModuleKey)}
                className={`transition-colors ${isAtModule && !search ? "text-gray-800 font-semibold" : "text-indigo-600 hover:text-indigo-800"}`}
              >
                {currentModuleStructure?.label}
              </button>
            </>
          )}
          {isAtDocType && (
            <>
              <ChevronRight size={13} className="text-gray-300" />
              <span className="text-gray-800 font-semibold">{activeLabel}</span>
            </>
          )}
          {search && (
            <>
              <ChevronRight size={13} className="text-gray-300" />
              <span className="text-gray-500 italic">Search results ({searchResults.length})</span>
            </>
          )}
        </nav>
      )}

      {/* ── Search results ── */}
      {search && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-[12px] text-gray-500">
              <strong className="text-gray-700">{searchResults.length}</strong> result{searchResults.length !== 1 ? "s" : ""} for "<em>{search}</em>"
            </span>
            <button onClick={() => setSearch("")} className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1">
              <X size={11} /> Clear
            </button>
          </div>
          {searchResults.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No matching records found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Type</th>
                  <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Label</th>
                  <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Party</th>
                  <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Date</th>
                  <th className="px-4 py-2.5 text-gray-600 font-medium text-xs">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {searchResults.slice(0, 200).map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium">{r.type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs font-mono truncate max-w-[200px]">{r.label}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.party}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.date || "—"}</td>
                    <td className="px-4 py-2.5"><DriveLink href={r.link} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Folder navigation (hidden during search) ── */}
      {!search && (
        <>
          {/* Home level — module folder cards */}
          {isAtHome && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Modules</p>
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(Object.keys(MODULE_STRUCTURE) as ModuleKey[]).map((mod) => (
                    <ModuleFolderCard key={mod} modKey={mod} data={data} folderCounts={folderCounts} onClick={() => navigateTo(mod)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Module level — doc type sub-folder cards */}
          {isAtModule && currentModuleStructure && (
            <section>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Categories in {currentModuleStructure.label}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {currentModuleStructure.docTypes.map((dt) => (
                  <DocTypeFolderCard
                    key={dt.value}
                    label={dt.label}
                    value={dt.value}
                    driveKey={dt.driveKey}
                    module={activeModule as ModuleKey}
                    data={data}
                    folderCounts={folderCounts}
                    onClick={() => navigateTo(activeModule as ModuleKey, dt.value)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Doc type level — data table */}
          {isAtDocType && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
                <span className="text-[12px] text-gray-500">
                  <strong className="text-gray-700">{activeRecords.length}</strong> {activeLabel} extracted
                </span>
                {activeRecords.length > 0 && (
                  <span className="text-[11px] text-gray-400">
                    {activeRecords.length} records
                  </span>
                )}
              </div>
              <DocTypeTable docType={activeDocType} data={data} />
            </div>
          )}

          {/* Module level — combined data table */}
          {isAtModule && currentModuleStructure && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50">
                <span className="text-[12px] text-gray-500">
                  All <strong className="text-gray-700">{currentModuleStructure.label}</strong> records — click a category above to drill in
                </span>
              </div>
              <div className="divide-y">
                {currentModuleStructure.docTypes.map((dt) => {
                  const recs = getRecords(data, dt.value)
                  if (recs.length === 0) return null
                  return (
                    <div key={dt.value}>
                      <div className="px-4 py-2 bg-gray-50/60 border-b flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-600">{dt.label}</span>
                        <span className="text-[11px] text-gray-400">{recs.length} records</span>
                      </div>
                      <DocTypeTable docType={dt.value} data={data} />
                    </div>
                  )
                })}
                {currentModuleStructure.docTypes.every((dt) => getRecords(data, dt.value).length === 0) && (
                  <div className="py-12 text-center">
                    <div className="text-4xl mb-3">🤖</div>
                    <p className="text-gray-500 text-sm">No {currentModuleStructure.label} records extracted yet</p>
                    <p className="text-gray-400 text-xs mt-1">Start background extraction below</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Extraction Panel ── */}
      <ProcessFilesPanel />
    </div>
  )
}
