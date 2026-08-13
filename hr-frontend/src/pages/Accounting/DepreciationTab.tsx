import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Loader2 } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { accountingGet } from "./api"
import { VoucherDetailDrawer } from "./VoucherDetailDrawer"
import { MonthDivider } from "./TransactionSummaryBand"

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

// Pull the whole set in one request; the table collapses it by month.
const PAGE_SIZE = 100000

function fmtINR(n: number): string {
  return `₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Best-effort: journal entries whose debit/credit ledger mentions "depreciation" —
 * not a computed depreciation schedule (no per-asset useful-life data exists). */
export function DepreciationTab() {
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<DepResult>({
    queryKey: ["depreciation-entries"],
    queryFn: () => accountingGet("get_depreciation_entries", { page: "1", page_size: String(PAGE_SIZE) }),
    staleTime: 30_000,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0

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
            stickyHeader
            defaultCollapsed
            groupKey={r => r.voucher_date?.slice(0, 7) ?? ""}
            renderGroupHeader={key => <MonthDivider monthKey={key} monthly={[]} noun="entries" />}
            onRowClick={r => setSelected(r.name)}
            emptyMessage="No depreciation-related journal entries found."
          />
        </>
      )}

      {selected && <VoucherDetailDrawer name={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
