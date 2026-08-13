import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { exportCsv } from "@/lib/csv"
import { accountingGet } from "./api"
import { VoucherDetailDrawer } from "./VoucherDetailDrawer"
import { TransactionSummaryBand, MonthDivider, type RegisterSummary } from "./TransactionSummaryBand"
import { usePeriod, periodParams } from "./PeriodFilter"

interface RegisterRow {
  name: string
  tally_guid: string
  [key: string]: string | number
}

interface RegisterListResult {
  data: RegisterRow[]
  total: number
  page: number
  page_size: number
}

const PAGE_SIZE = 50

function fmtINR(n: number): string {
  return `₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface RegisterListTabProps {
  endpoint: "get_sales_invoices" | "get_purchase_bills"
  noun: string
  numberField: string
  numberLabel: string
  dateField: string
  partyField: string
  partyLabel: string
  gstField: string
  gstLabel: string
}

/** Shared list view for Sales Invoices / Purchase Bills — reads the derived
 * register (clean excl-GST / GST / total split). Summary band shows the full-set
 * totals, GST breakdown, trend and top parties; table is month-grouped. */
export function RegisterListTab(props: RegisterListTabProps) {
  const { endpoint, noun, numberField, numberLabel, dateField, partyField, partyLabel, gstField, gstLabel } = props
  const kind = endpoint === "get_purchase_bills" ? "purchase" : "sales"
  const { year, month } = usePeriod()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState("date_desc")
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null)

  useEffect(() => { setPage(1) }, [year, month])

  const period = periodParams({ year, month })

  const { data, isLoading, isError } = useQuery<RegisterListResult>({
    queryKey: ["register-list", endpoint, year, month, search, page, sort],
    queryFn: () => accountingGet(endpoint, {
      ...period, search, page: String(page), page_size: String(PAGE_SIZE), sort,
    }),
    staleTime: 30_000,
  })

  const { data: summary, isLoading: sumLoading } = useQuery<RegisterSummary>({
    queryKey: ["register-summary", kind, year, month, search],
    queryFn: () => accountingGet("get_register_summary", { kind, ...period, search }),
    staleTime: 30_000,
  })

  function pickParty(party: string) {
    setSearchInput(party)
    setSearch(party)
    setPage(1)
  }

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const dateGrouped = sort === "date_desc" || sort === "date_asc"

  const columns: DataTableColumn<RegisterRow>[] = [
    { key: dateField, header: "Date", render: r => <span className="text-gray-500 whitespace-nowrap">{r[dateField] as string}</span> },
    { key: numberField, header: numberLabel, render: r => <span className="font-mono text-xs text-gray-500">{(r[numberField] as string) || "—"}</span> },
    { key: partyField, header: partyLabel, render: r => <span className="font-medium text-gray-800">{(r[partyField] as string) || "—"}</span> },
    {
      key: "amount_excl_gst", header: "Excl. GST", align: "right",
      render: r => <span className="font-mono text-gray-500">{fmtINR(r.amount_excl_gst as number)}</span>,
    },
    {
      key: gstField, header: gstLabel, align: "right",
      render: r => <span className="font-mono text-gray-500">{fmtINR(r[gstField] as number)}</span>,
    },
    {
      key: "total", header: "Total", align: "right",
      render: r => <span className="font-mono font-semibold text-[#2c2c2a]">{fmtINR(r.total as number)}</span>,
    },
  ]

  return (
    <div className="space-y-3">
      {/* Summary band with GST breakdown */}
      <TransactionSummaryBand
        summary={summary}
        noun={noun}
        activeParty={search}
        onPickParty={pickParty}
        loading={sumLoading}
        gst={summary ? { excl: summary.excl_gst, gst: summary.gst, total: summary.total, label: summary.gst_label } : undefined}
      />

      {/* Period is controlled by the shared Year → Month filter in the page header. */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={e => { e.preventDefault(); setPage(1); setSearch(searchInput) }}
          className="flex-1 min-w-[200px]"
        >
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={`Search ${noun.toLowerCase()} — ${partyLabel.toLowerCase()}, ${numberLabel.toLowerCase()}…`}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#c8a45c]"
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
            stickyHeader
            defaultCollapsed
            groupKey={dateGrouped ? (r => String(r[dateField] ?? "").slice(0, 7)) : undefined}
            renderGroupHeader={key => <MonthDivider monthKey={key} monthly={summary?.monthly ?? []} noun={noun} />}
            onExport={() => exportCsv(
              noun.replace(/\s+/g, "_"),
              ["Date", numberLabel, partyLabel, "Excl. GST", gstLabel, "Total"],
              rows.map(r => [r[dateField] as string, r[numberField] as string, r[partyField] as string, r.amount_excl_gst as number, r[gstField] as number, r.total as number]),
            )}
            onRowClick={r => setSelectedGuid(r.tally_guid)}
            emptyMessage={`No ${noun.toLowerCase()} found.`}
          />

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
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

      {selectedGuid && <VoucherDetailDrawer guid={selectedGuid} onClose={() => setSelectedGuid(null)} />}
    </div>
  )
}
