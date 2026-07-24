import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { accountingGet } from "./api"
import { VoucherDetailDrawer } from "./VoucherDetailDrawer"

interface DepRow {
  name: string
  voucher_number: string
  voucher_date: string
  party_name: string
  amount: number
  narration: string
  debit_ledger: string
  credit_ledger: string
}
interface DepResult { data: DepRow[]; total: number; page: number; page_size: number }

const PAGE_SIZE = 50

function fmtINR(n: number): string {
  return `₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Best-effort: journal entries whose debit/credit ledger mentions "depreciation" —
 * not a computed depreciation schedule (no per-asset useful-life data exists). */
export function DepreciationTab() {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<DepResult>({
    queryKey: ["depreciation-entries", page],
    queryFn: () => accountingGet("get_depreciation_entries", { page: String(page), page_size: String(PAGE_SIZE) }),
    staleTime: 30_000,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: DataTableColumn<DepRow>[] = [
    { key: "voucher_date", header: "Date" },
    { key: "voucher_number", header: "Voucher #" },
    { key: "debit_ledger", header: "Debit Ledger" },
    { key: "credit_ledger", header: "Credit Ledger" },
    { key: "amount", header: "Amount", align: "right", render: r => <span className="font-mono">{fmtINR(r.amount)}</span> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm bg-amber-50 border border-amber-200">
        <AlertCircle size={14} className="text-amber-600 shrink-0" />
        <span className="text-amber-800">
          Recorded journal entries mentioning "depreciation" — not a computed depreciation schedule.
          No per-asset acquisition date or useful life data exists to project future depreciation.
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="text-[#1e3a2f] animate-spin" /></div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Failed to load depreciation entries.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400">{total.toLocaleString("en-IN")} matching journal entries</p>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={r => r.name}
            searchable={false}
            onRowClick={r => setSelected(r.name)}
            emptyMessage="No depreciation-related journal entries found."
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

      {selected && <VoucherDetailDrawer name={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
