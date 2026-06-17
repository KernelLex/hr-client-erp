import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { TrendingUp, RefreshCw, Settings, AlertTriangle, Clock, Link2, Bot, Sparkles, ExternalLink } from "lucide-react"
import { useNavigate } from "react-router-dom"
import {
  getStructuredData, processSingleFile, autoLinkDocuments,
  updateDocStatus,
  getDocumentConnections,
  type SalesInvoice, type PurchaseInvoice, type PurchaseOrder,
  type Quotation, type FinancialReport, type SalaryRecord,
} from "@/api/business"
import { getDriveFiles } from "@/api/accounts"
import { getDashboardInsights, getAccuracyStats } from "@/api/ai"
import { useAuth } from "@/context/AuthContext"

type ActiveTab = "sales" | "purchase" | "accounts" | "hr" | "links"

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
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  )
}

function DirectionBadge({ direction }: { direction?: string }) {
  const map: Record<string, string> = {
    Outgoing: "bg-blue-100 text-blue-700",
    Incoming: "bg-purple-100 text-purple-700",
    Internal: "bg-gray-100 text-gray-600",
  }
  if (!direction || direction === "Unknown") return null
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[direction] ?? "bg-gray-100 text-gray-600"}`}>
      {direction}
    </span>
  )
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

function SalesTab({ data }: { data: { sales_invoices?: SalesInvoice[]; quotations?: Quotation[] } }) {
  const qc = useQueryClient()

  const invoices = data.sales_invoices ?? []
  const quotations = data.quotations ?? []

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Sales Invoices & Receipts ({invoices.length})</h3>
        <div className="bg-white rounded-xl border overflow-hidden">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No sales invoices found. Process Drive files to populate.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 text-gray-600 font-medium">File Name</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Client / Party</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Date</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Direction</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate text-xs font-mono">{inv.invoice_number || inv.name}</td>
                    <td className="px-4 py-3 text-gray-700">{inv.client_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{inv.invoice_date || "—"}</td>
                    <td className="px-4 py-3"><DirectionBadge direction={inv.direction} /></td>
                    <td className="px-4 py-3"><DriveLink href={inv.web_view_link} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Quotations ({quotations.length})</h3>
        <div className="bg-white rounded-xl border overflow-hidden">
          {quotations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No quotations found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 text-gray-600 font-medium">File Name</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Client</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Date</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Action</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotations.map((q) => (
                  <tr key={q.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate text-xs font-mono">{q.quote_number || q.name}</td>
                    <td className="px-4 py-3 text-gray-700">{q.client_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{q.quote_date || "—"}</td>
                    <td className="px-4 py-3 space-x-1">
                      {q.status === "Sent" && (
                        <>
                          <button
                            onClick={() => { updateDocStatus("VE Quotation", q.name, "Won"); qc.invalidateQueries({ queryKey: ["structured-data"] }) }}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                          >Won</button>
                          <button
                            onClick={() => { updateDocStatus("VE Quotation", q.name, "Lost"); qc.invalidateQueries({ queryKey: ["structured-data"] }) }}
                            className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                          >Lost</button>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3"><DriveLink href={q.web_view_link} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function PurchaseTab({
  data,
}: {
  data: { purchase_invoices?: PurchaseInvoice[]; purchase_orders?: PurchaseOrder[] }
}) {
  const invoices = data.purchase_invoices ?? []
  const orders = data.purchase_orders ?? []

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Purchase Invoices ({invoices.length})</h3>
        <div className="bg-white rounded-xl border overflow-hidden">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No purchase invoices found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 text-gray-600 font-medium">File Name</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Vendor / Party</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Date</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Direction</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate text-xs font-mono">{inv.invoice_number || inv.name}</td>
                    <td className="px-4 py-3 text-gray-700">{inv.vendor_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{inv.invoice_date || "—"}</td>
                    <td className="px-4 py-3"><DirectionBadge direction={inv.direction} /></td>
                    <td className="px-4 py-3"><DriveLink href={inv.web_view_link} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Purchase Orders ({orders.length})</h3>
        <div className="bg-white rounded-xl border overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No purchase orders found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 text-gray-600 font-medium">File Name</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Vendor</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Date</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((po) => (
                  <tr key={po.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate text-xs font-mono">{po.po_number || po.name}</td>
                    <td className="px-4 py-3 text-gray-700">{po.vendor_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{po.po_date || "—"}</td>
                    <td className="px-4 py-3"><DriveLink href={po.web_view_link} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function AccountsTab({ data }: { data: { financial_reports?: FinancialReport[] } }) {
  const reports = data.financial_reports ?? []

  const byType = reports.reduce<Record<string, FinancialReport[]>>((acc, r) => {
    const t = r.report_type || "Other"
    ;(acc[t] = acc[t] ?? []).push(r)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          No financial documents found. Upload P&amp;L, Balance Sheet, Trial Balance, Ledger, or Bank Reconciliation files to Drive.
        </div>
      ) : (
        Object.entries(byType).map(([type, items]) => (
          <div key={type}>
            <h3 className="font-semibold text-gray-800 mb-3">{type} ({items.length})</h3>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-gray-600 font-medium">File Name</th>
                    <th className="px-4 py-3 text-gray-600 font-medium">Date</th>
                    <th className="px-4 py-3 text-gray-600 font-medium">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((r) => (
                    <tr key={r.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 max-w-sm truncate text-xs font-mono">{r.file_name || r.name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.from_date || "—"}</td>
                      <td className="px-4 py-3"><DriveLink href={r.web_view_link} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function HRTab({ data }: { data: { salary_records?: SalaryRecord[] } }) {
  const salaries = data.salary_records ?? []

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">HR & Payroll Documents ({salaries.length})</h3>
        <div className="bg-white rounded-xl border overflow-hidden">
          {salaries.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No HR/payroll files found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 text-gray-600 font-medium">File Name</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Employee / Party</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Period</th>
                  <th className="px-4 py-3 text-gray-600 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {salaries.map((s) => (
                  <tr key={s.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate text-xs font-mono">{s.file_name || s.name}</td>
                    <td className="px-4 py-3 text-gray-700">{s.employee_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{s.month_year || "—"}</td>
                    <td className="px-4 py-3"><DriveLink href={s.web_view_link} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function LinksTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["document-connections"],
    queryFn: getDocumentConnections,
    staleTime: 60_000,
  })
  const qc = useQueryClient()
  const linkMutation = useMutation({
    mutationFn: autoLinkDocuments,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document-connections"] }),
  })

  if (isLoading) {
    return <div className="animate-pulse bg-gray-100 rounded-xl h-40" />
  }

  const chains = data?.connections ?? []
  const sales = chains.filter((c) => c.type === "sales_chain")
  const purchase = chains.filter((c) => c.type === "purchase_chain")

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{chains.length} document chains found</p>
        <button
          onClick={() => linkMutation.mutate()}
          disabled={linkMutation.isPending}
          className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <Link2 className="w-4 h-4" />
          {linkMutation.isPending ? "Linking..." : "Auto-Link Documents"}
        </button>
      </div>

      {linkMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          {(linkMutation.data as { links_created: number }).links_created} links created
        </div>
      )}

      <div className="bg-white rounded-xl border p-5 space-y-4 font-mono text-sm">
        {chains.length === 0 ? (
          <div className="text-center text-gray-400 py-8 font-sans">
            No document chains yet. Process Drive files first, then click Auto-Link Documents.
          </div>
        ) : (
          <>
            {sales.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-sans font-semibold">Sales Chains</div>
                {sales.map((chain, i) => (
                  <div key={i} className="mb-4 pl-2 border-l-2 border-indigo-200">
                    {chain.quotation && (
                      <div className="text-gray-700">
                        Quote {chain.quotation.quote_number || chain.quotation.name}
                        <span className="text-gray-400"> ({chain.client})</span>
                        <StatusBadge status={chain.quotation.status} />
                      </div>
                    )}
                    {chain.invoice && (
                      <div className="pl-4 text-gray-700 before:content-[\'└→_\'] before:text-gray-400">
                        Invoice {chain.invoice.number || chain.invoice.name}
                        <StatusBadge status={chain.invoice.status} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {purchase.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-sans font-semibold">Purchase Chains</div>
                {purchase.map((chain, i) => (
                  <div key={i} className="mb-4 pl-2 border-l-2 border-orange-200">
                    {chain.po && (
                      <div className="text-gray-700">
                        PO {chain.po.number || chain.po.name}
                        <span className="text-gray-400"> ({chain.vendor})</span>
                        <StatusBadge status={chain.po.status} />
                      </div>
                    )}
                    {chain.invoice ? (
                      <div className="pl-4 text-gray-700">
                        Invoice {chain.invoice.name}
                        <StatusBadge status={chain.invoice.status} />
                      </div>
                    ) : (
                      <div className="pl-4 text-yellow-600 text-xs">└→ Invoice: not received yet ⚠</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProcessFilesPanel() {
  const qc = useQueryClient()
  const [log, setLog] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentFile, setCurrentFile] = useState("")

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: ["drive-files-pending"],
    queryFn: () => getDriveFiles("All"),
    staleTime: 30_000,
  })

  const allFiles = files ?? []
  const pending = allFiles.filter((f) => f.status !== "Reviewed")

  const handleExtractAll = async () => {
    if (pending.length === 0) return
    setExtracting(true)
    setLog(null)

    let freshPending = pending
    try {
      const fresh = await getDriveFiles("All")
      freshPending = (fresh ?? []).filter(
        (f) => f.status !== "Reviewed"
      )
    } catch { /* fall back to cached pending */ }

    if (freshPending.length === 0) {
      setLog("✅ All files already processed")
      setExtracting(false)
      return
    }

    setProgress({ current: 0, total: freshPending.length })

    let successCount = 0, skipCount = 0, failCount = 0
    const failedFiles: { name: string; reason: string }[] = []

    for (let i = 0; i < freshPending.length; i++) {
      const file = freshPending[i]
      setCurrentFile(file.file_name)
      setProgress({ current: i + 1, total: freshPending.length })
      try {
        const result = await processSingleFile(file.name, false) as { success?: boolean; skipped?: boolean; reason?: string } | null
        if (result?.skipped) {
          skipCount++
        } else if (result?.success !== false) {
          successCount++
        } else {
          failCount++
          failedFiles.push({ name: file.file_name, reason: result?.reason ?? "Unknown error" })
        }
      } catch (err) {
        failCount++
        failedFiles.push({ name: file.file_name, reason: (err as Error).message })
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    try { await autoLinkDocuments() } catch { /* non-fatal */ }

    setCurrentFile("")
    const parts = []
    if (successCount > 0) parts.push(`${successCount} processed`)
    if (skipCount > 0) parts.push(`${skipCount} skipped`)
    if (failCount > 0) parts.push(`${failCount} failed`)
    setLog(`✅ Done — ${parts.join(", ")}`)

    setExtracting(false)
    await refetchFiles()
    qc.invalidateQueries({ queryKey: ["structured-data"] })
    qc.invalidateQueries({ queryKey: ["dashboard-insights"] })
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-800">Extract Data from Drive Files</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {allFiles.length} files total
            {pending.length > 0 ? ` · ${pending.length} pending` : " · all synced"}
          </span>
          <button
            onClick={handleExtractAll}
            disabled={extracting || pending.length === 0}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {extracting ? (
              <><RefreshCw className="w-3 h-3 animate-spin" /> Extracting {progress.current}/{progress.total}...</>
            ) : (
              <>⚡ Extract All Pending</>
            )}
          </button>
        </div>
      </div>

      {extracting && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="truncate max-w-xs">{currentFile}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {log && (
        <div className="mb-3 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">{log}</div>
      )}

      {allFiles.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                <th className="px-3 py-2 text-gray-600 font-medium">File</th>
                <th className="px-3 py-2 text-gray-600 font-medium">Type</th>
                <th className="px-3 py-2 text-gray-600 font-medium">Status</th>
                <th className="px-3 py-2 text-gray-600 font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allFiles.slice(0, 15).map((f) => (
                <tr key={f.name} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 truncate max-w-xs text-xs">{f.file_name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{f.doc_type || "—"}</td>
                  <td className="px-3 py-2">
                    {f.status === "Reviewed" ? (
                      <span className="flex items-center gap-1 text-green-700 text-xs">✓ Synced</span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-700 text-xs">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <DriveLink href={f.drive_view_link} />
                  </td>
                </tr>
              ))}
              {allFiles.length > 15 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-center text-gray-400 text-xs">
                    + {allFiles.length - 15} more files
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AIHealthPanel({ onNavigate }: { onNavigate: () => void }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const scoreColor =
    !data?.health_score ? "text-gray-400" :
    data.health_score >= 75 ? "text-green-600" :
    data.health_score >= 50 ? "text-yellow-600" :
    "text-red-600"

  const bgColor =
    !data?.health_score ? "border-gray-200" :
    data.health_score >= 75 ? "border-green-300 bg-green-50" :
    data.health_score >= 50 ? "border-yellow-300 bg-yellow-50" :
    "border-red-300 bg-red-50"

  return (
    <div className={`rounded-xl border-2 p-5 ${bgColor} transition-all`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center">
            <Bot className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">AI Business Health</span>
              {data?.health_label && (
                <span className="text-xs bg-white border rounded-full px-2 py-0.5 text-gray-600">
                  {data.health_label}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Vera AI analysis of current data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.health_score !== undefined && (
            <div className={`text-4xl font-bold ${scoreColor}`}>{data.health_score}</div>
          )}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onNavigate}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 whitespace-nowrap"
            >
              Full Insights <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {isLoading || isFetching ? (
        <div className="mt-3 space-y-2">
          {[1, 2].map(i => <div key={i} className="h-3 bg-white/60 rounded animate-pulse" />)}
        </div>
      ) : !data?.success ? (
        <p className="mt-3 text-xs text-gray-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          {data?.reason === "Ollama not running"
            ? "Start Ollama to enable AI insights: ollama serve"
            : "Click refresh to generate AI insights"}
        </p>
      ) : (
        <div className="mt-3 grid md:grid-cols-2 gap-3">
          {data.insights && data.insights.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5">Key Insights</p>
              <ul className="space-y-1">
                {data.insights.slice(0, 3).map((ins, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-indigo-500 mt-0.5 flex-shrink-0">•</span>
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.alerts && data.alerts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-700 mb-1.5">Action Required</p>
              <ul className="space-y-1">
                {data.alerts.slice(0, 3).map((alert, i) => (
                  <li key={i} className="text-xs text-red-600 flex gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {alert}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TABS: { id: ActiveTab; label: string; icon: string }[] = [
  { id: "sales", label: "Sales", icon: "💼" },
  { id: "purchase", label: "Purchase", icon: "🛒" },
  { id: "accounts", label: "Accounts", icon: "💰" },
  { id: "hr", label: "HR", icon: "👥" },
  { id: "links", label: "Links", icon: "🔗" },
]

export default function BusinessDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActiveTab>("sales")
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ["structured-data"],
    queryFn: () => getStructuredData(),
    staleTime: 60_000,
  })

  const { data: accStats } = useQuery({
    queryKey: ["accuracy-stats"],
    queryFn: getAccuracyStats,
    staleTime: 120_000,
  })

  const totals = data?.totals
  const needsReviewCount = accStats?.summary ? accStats.summary.needs_review : 0
  const unverifiedCount = accStats?.summary ? accStats.summary.unverified : 0
  const verificationNudge = needsReviewCount > 0 ? needsReviewCount : unverifiedCount

  const isAdmin =
    user?.name === "owais@veraenterprises.in" || user?.name === "Administrator"

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-gray-400">
        <TrendingUp className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p>Business Dashboard is admin-only.</p>
      </div>
    )
  }

  const salesDocCount = (data?.sales_invoices?.length ?? 0) + (data?.quotations?.length ?? 0)
  const purchaseDocCount = (data?.purchase_invoices?.length ?? 0) + (data?.purchase_orders?.length ?? 0) + (data?.grns?.length ?? 0)
  const accountsDocCount = (data?.financial_reports?.length ?? 0) + (data?.payment_records?.length ?? 0)
  const hrDocCount = (data?.salary_records?.length ?? 0) + (data?.attendance_records?.length ?? 0)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Business Dashboard</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Documents synced from Google Drive</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["structured-data"] })}
            className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Verification nudge */}
      {verificationNudge > 0 && (
        <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
            <span className="text-sm text-yellow-800 font-medium">
              {verificationNudge} record{verificationNudge !== 1 ? "s" : ""} need quick verification
            </span>
            <span className="text-sm text-yellow-600">
              · Takes ~{Math.max(1, Math.ceil(verificationNudge * 0.5))} min
            </span>
          </div>
          <button
            onClick={() => navigate("/verify")}
            className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-700 shrink-0"
          >
            Review Now →
          </button>
        </div>
      )}

      {/* AI Health Panel */}
      <AIHealthPanel onNavigate={() => navigate("/ai-insights")} />

      {/* KPI Cards — document counts by category */}
      {isLoading ? (
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4" /> Failed to load data
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Sales Docs"
            value={String(salesDocCount)}
            sub={`${data?.sales_invoices?.length ?? 0} inv · ${data?.quotations?.length ?? 0} quotes`}
            accent="border-l-green-500"
          />
          <MetricCard
            label="Purchase Docs"
            value={String(purchaseDocCount)}
            sub={`${data?.purchase_invoices?.length ?? 0} inv · ${data?.purchase_orders?.length ?? 0} POs`}
            accent="border-l-red-400"
          />
          <MetricCard
            label="Accounts Files"
            value={String(accountsDocCount)}
            sub={`${data?.financial_reports?.length ?? 0} reports`}
            accent="border-l-indigo-500"
          />
          <MetricCard
            label="HR Files"
            value={String(hrDocCount)}
            sub={`${data?.salary_records?.length ?? 0} salary · ${data?.attendance_records?.length ?? 0} attendance`}
            accent="border-l-purple-400"
          />
          <MetricCard
            label="Open Quotations"
            value={String(totals?.open_quotations ?? 0)}
            sub="pending response"
            accent="border-l-yellow-400"
          />
          <MetricCard
            label="Pending POs"
            value={String(totals?.pending_pos ?? 0)}
            sub="awaiting receipt"
            accent="border-l-orange-400"
          />
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-indigo-600 text-indigo-700"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === "sales" && <SalesTab data={data ?? { totals: {} as never }} />}
            {activeTab === "purchase" && <PurchaseTab data={data ?? { totals: {} as never }} />}
            {activeTab === "accounts" && <AccountsTab data={data ?? { totals: {} as never }} />}
            {activeTab === "hr" && <HRTab data={data ?? { totals: {} as never }} />}
            {activeTab === "links" && <LinksTab />}
          </>
        )}
      </div>

      {/* Process Files */}
      <ProcessFilesPanel />
    </div>
  )
}
