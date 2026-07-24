import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { AgingPill, AgingPillMonths } from "@/components/dashboard"
import { exportCsv } from "@/lib/csv"
import { dashboardGet } from "./api"

interface AgingBuckets { "0_30": number; "31_60": number; "61_90": number; "90_plus": number }
interface Summary {
  debtors: { total_outstanding: number; advance_received: number; net: number; aging: AgingBuckets }
  creditors: { total_outstanding: number; advance_paid: number; net: number; aging: AgingBuckets }
}

interface OutstandingRow {
  name: string
  client_name?: string
  vendor_name?: string
  due_amount: number
  invoice_date: string
  status: string
  aging_days: number
  aging_category: string
}
interface OutstandingResult { data: OutstandingRow[]; total: number; page: number; page_size: number }

interface AdvanceRow {
  name: string
  client_name?: string
  vendor_name?: string
  advance_amount: number
  advance_date: string
  aging_months: number
}
interface AdvanceResult { data: AdvanceRow[]; total: number; page: number; page_size: number }

const PAGE_SIZE = 50

function fmtINR(n: number): string {
  return `₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const AGING_LABELS: Record<string, string> = { "0_30": "0–30 days", "31_60": "31–60 days", "61_90": "61–90 days", "90_plus": "90+ days" }

interface Config {
  kind: "receivable" | "payable"
  partyField: "client_name" | "vendor_name"
  partyLabel: string
  reportEndpoint: string
  advanceEndpoint: string
  noun: string
}

const CONFIGS: Record<"receivable" | "payable", Config> = {
  receivable: {
    kind: "receivable", partyField: "client_name", partyLabel: "Customer",
    reportEndpoint: "get_debtors_report", advanceEndpoint: "get_debtors_advance_report",
    noun: "Debtors",
  },
  payable: {
    kind: "payable", partyField: "vendor_name", partyLabel: "Vendor",
    reportEndpoint: "get_creditors_report", advanceEndpoint: "get_creditors_advance_report",
    noun: "Creditors",
  },
}

/** Accounts Receivable / Accounts Payable — thin wrapper around the existing
 * accounts_dashboard.py aging + report endpoints (already reconciled against
 * VE Tally Ledger). Aging is always "as of today"; there's no period filter
 * because the backend's own `period` param is unused for these reports. */
export function ReceivablePayableTab({ kind }: { kind: "receivable" | "payable" }) {
  const cfg = CONFIGS[kind]
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [agingFilter, setAgingFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [showAdvances, setShowAdvances] = useState(false)

  const { data: summary } = useQuery<Summary>({
    queryKey: ["receivables-payables-summary"],
    queryFn: () => dashboardGet("get_receivables_payables_summary"),
    staleTime: 60_000,
  })
  const s = kind === "receivable" ? summary?.debtors : summary?.creditors

  const { data: report, isLoading, isError } = useQuery<OutstandingResult>({
    queryKey: [cfg.reportEndpoint, search, agingFilter, page],
    queryFn: () => dashboardGet(cfg.reportEndpoint, {
      search, aging_filter: agingFilter ?? "", page: String(page), page_size: String(PAGE_SIZE),
    }),
    staleTime: 30_000,
  })

  const { data: advances } = useQuery<AdvanceResult>({
    queryKey: [cfg.advanceEndpoint],
    queryFn: () => dashboardGet(cfg.advanceEndpoint, { page: "1", page_size: "100" }),
    enabled: showAdvances,
    staleTime: 30_000,
  })

  const columns: DataTableColumn<OutstandingRow>[] = [
    { key: cfg.partyField, header: cfg.partyLabel, render: r => (r as unknown as Record<string, string>)[cfg.partyField] },
    { key: "invoice_date", header: "Invoice Date" },
    { key: "aging_days", header: "Aging", render: r => <AgingPill days={r.aging_days} /> },
    { key: "status", header: "Status" },
    { key: "due_amount", header: "Due Amount", align: "right", render: r => <span className="font-mono font-semibold">{fmtINR(r.due_amount)}</span> },
  ]

  const advColumns: DataTableColumn<AdvanceRow>[] = [
    { key: cfg.partyField, header: cfg.partyLabel, render: r => (r as unknown as Record<string, string>)[cfg.partyField] },
    { key: "advance_date", header: "Date" },
    { key: "aging_months", header: "Aging", render: r => <AgingPillMonths months={r.aging_months} /> },
    { key: "advance_amount", header: "Amount", align: "right", render: r => <span className="font-mono font-semibold">{fmtINR(r.advance_amount)}</span> },
  ]

  const rows = report?.data ?? []
  const total = report?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Outstanding</p>
          <p className="text-lg font-bold text-[#2c2c2a]">{fmtINR(s?.total_outstanding ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{kind === "receivable" ? "Advance Received" : "Advance Paid"}</p>
          <p className="text-lg font-bold text-[#2c2c2a]">{fmtINR((kind === "receivable" ? summary?.debtors.advance_received : summary?.creditors.advance_paid) ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Net</p>
          <p className="text-lg font-bold text-[#2c2c2a]">{fmtINR(s?.net ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Open {cfg.noun}</p>
          <p className="text-lg font-bold text-[#2c2c2a]">{total.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Aging buckets — clickable filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setAgingFilter(null); setPage(1) }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${!agingFilter ? "bg-[#1e3a2f] text-white border-[#1e3a2f]" : "bg-white text-gray-600 border-gray-200"}`}
        >
          All
        </button>
        {s && Object.entries(s.aging).map(([bucket, amt]) => (
          <button
            key={bucket}
            onClick={() => { setAgingFilter(bucket); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${agingFilter === bucket ? "bg-[#1e3a2f] text-white border-[#1e3a2f]" : "bg-white text-gray-600 border-gray-200"}`}
          >
            {AGING_LABELS[bucket]} · {fmtINR(amt)}
          </button>
        ))}
      </div>

      <form onSubmit={e => { e.preventDefault(); setPage(1); setSearch(searchInput) }} className="max-w-xs">
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder={`Search ${cfg.partyLabel.toLowerCase()}…`}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#c8a45c]"
        />
      </form>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="text-[#1e3a2f] animate-spin" />
        </div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Failed to load {cfg.noun.toLowerCase()}.</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={r => r.name}
            searchable={false}
            onExport={() => exportCsv(
              cfg.noun,
              [cfg.partyLabel, "Invoice Date", "Aging (days)", "Status", "Due Amount"],
              rows.map(r => [(r as unknown as Record<string, string>)[cfg.partyField], r.invoice_date, r.aging_days, r.status, r.due_amount]),
            )}
            emptyMessage={`No outstanding ${cfg.noun.toLowerCase()}.`}
          />
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-30 hover:border-gray-400">
                  <ChevronLeft size={14} />
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-30 hover:border-gray-400">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Advances */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowAdvances(v => !v)}
          className="text-xs font-semibold text-[#1e3a2f] hover:underline"
        >
          {showAdvances ? "Hide" : "Show"} {kind === "receivable" ? "advances received" : "advances paid"}
        </button>
        {showAdvances && (
          <div className="mt-3">
            <DataTable
              columns={advColumns}
              rows={advances?.data ?? []}
              rowKey={r => r.name}
              searchable={false}
              emptyMessage="No advances recorded."
            />
          </div>
        )}
      </div>
    </div>
  )
}
