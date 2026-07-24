import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { exportCsv } from "@/lib/csv"
import { operationsGet } from "./api"
import { VoucherDetailDrawer } from "./VoucherDetailDrawer"

interface VoucherRow {
  name: string
  voucher_type: string
  voucher_number: string
  voucher_date: string
  party_name: string
  amount: number
  narration: string
  debit_ledger: string
  credit_ledger: string
}

interface VoucherListResult {
  data: VoucherRow[]
  total: number
  page: number
  page_size: number
}

const PAGE_SIZE = 50

function fmtINR(n: number): string {
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fyOptions(): { value: string; label: string }[] {
  const now = new Date()
  const curStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1 // Indian FY starts April
  const opts = [{ value: "all", label: "All Years" }]
  for (let y = curStart + 1; y >= curStart - 6; y--) {
    opts.push({ value: `${y}-${y + 1}`, label: `FY ${y}–${String(y + 1).slice(2)}` })
  }
  return opts
}

/**
 * Generic voucher-type list — powers Journal Entries, Payment Entries, Receipts,
 * Credit Notes and Debit Notes. Backed entirely by the existing
 * operations.get_voucher_list / get_voucher_detail endpoints (no new backend).
 */
export function VoucherListTab({ voucherType, noun }: { voucherType: string; noun: string }) {
  const [fy, setFy] = useState("all")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState("date_desc")
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<VoucherListResult>({
    queryKey: ["voucher-list", voucherType, fy, search, page, sort],
    queryFn: () =>
      operationsGet("get_voucher_list", {
        voucher_type: voucherType,
        fy,
        search,
        page: String(page),
        page_size: String(PAGE_SIZE),
        sort,
      }),
    staleTime: 30_000,
  })

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  function changeFy(v: string) {
    setFy(v)
    setPage(1)
  }

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: DataTableColumn<VoucherRow>[] = [
    { key: "voucher_date", header: "Date" },
    { key: "voucher_number", header: "Voucher #" },
    { key: "party_name", header: "Party" },
    { key: "narration", header: "Narration", render: r => r.narration || "—" },
    {
      key: "amount", header: "Amount", align: "right",
      render: r => <span className="font-mono">{fmtINR(r.amount)}</span>,
    },
  ]

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={fy}
          onChange={e => changeFy(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700"
        >
          {fyOptions().map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <form onSubmit={submitSearch} className="flex-1 min-w-[200px] flex items-center gap-1.5">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={`Search ${noun.toLowerCase()} — party, narration, voucher #…`}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#c8a45c]"
          />
        </form>
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1) }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700"
        >
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="amount_desc">Amount: high → low</option>
          <option value="amount_asc">Amount: low → high</option>
        </select>
        <span className="text-xs text-gray-400 whitespace-nowrap">{total.toLocaleString("en-IN")} {noun.toLowerCase()}</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="text-[#1e3a2f] animate-spin" />
        </div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Failed to load {noun.toLowerCase()}.</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={r => r.name}
            searchable={false}
            onExport={() => exportCsv(
              noun.replace(/\s+/g, "_"),
              ["Date", "Voucher #", "Party", "Narration", "Amount"],
              rows.map(r => [r.voucher_date, r.voucher_number, r.party_name, r.narration, r.amount]),
            )}
            onRowClick={r => setSelected(r.name)}
            emptyMessage={`No ${noun.toLowerCase()} found.`}
          />

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-30 hover:border-gray-400"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-30 hover:border-gray-400"
                >
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
