import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { exportCsv } from "@/lib/csv"
import { accountingGet, operationsGet } from "./api"

interface LedgerOption {
  ledger_name: string
  parent_group: string
  root_group: string
  closing_balance: number
  is_bank: 0 | 1
  is_cash: 0 | 1
}

interface Txn {
  date: string
  voucher_type: string
  voucher_number: string
  narration: string
  party_name: string
  counterparty: string
  amount: number
  credit: number
  debit: number
  direction: "credit" | "debit"
}

interface LedgerStatement {
  ledger_name: string
  closing_balance: number
  total: number
  page: number
  page_size: number
  total_inflow: number
  total_outflow: number
  net: number
  transactions: Txn[]
}

const PAGE_SIZE = 50

function fmtINR(n: number): string {
  return `₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Ledger picker + statement, shared by General Ledger and Bank & Cash Book.
 * `scope` narrows the picker: undefined = all ledgers, "bank_cash" = bank/cash only. */
export function LedgerStatementView({ scope, placeholder }: { scope?: "bank_cash" | "fixed_assets"; placeholder?: string }) {
  const [pickerQuery, setPickerQuery] = useState("")
  const [selected, setSelected] = useState<LedgerOption | null>(null)
  const [page, setPage] = useState(1)
  const [txnSearch, setTxnSearch] = useState("")

  // Always fetch top ledgers (empty query = show all up to limit).
  // This means the dropdown opens immediately on focus, not only after typing.
  const { data: options = [] } = useQuery<LedgerOption[]>({
    queryKey: ["ledger-search", pickerQuery, scope],
    queryFn: () => accountingGet("search_ledgers", { search: pickerQuery, scope: scope ?? "", limit: "30" }),
    staleTime: 30_000,
  })

  const { data: stmt, isLoading, isError } = useQuery<LedgerStatement>({
    queryKey: ["ledger-statement", selected?.ledger_name, page, txnSearch],
    queryFn: () => operationsGet("get_ledger_statement", {
      ledger_name: selected!.ledger_name, page: String(page), page_size: String(PAGE_SIZE), search: txnSearch,
    }),
    enabled: !!selected,
    staleTime: 15_000,
  })

  const columns: DataTableColumn<Txn>[] = [
    { key: "date", header: "Date" },
    { key: "voucher_type", header: "Type" },
    { key: "voucher_number", header: "Voucher #" },
    { key: "counterparty", header: "Counterparty", render: r => r.counterparty || r.party_name || "—" },
    { key: "narration", header: "Narration", render: r => r.narration || "—" },
    { key: "debit", header: "Debit", align: "right", render: r => r.debit ? <span className="font-mono text-red-600">{fmtINR(r.debit)}</span> : <span className="text-gray-300">—</span> },
    { key: "credit", header: "Credit", align: "right", render: r => r.credit ? <span className="font-mono text-emerald-700">{fmtINR(r.credit)}</span> : <span className="text-gray-300">—</span> },
  ]

  const totalPages = Math.max(1, Math.ceil((stmt?.total ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* Ledger picker */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={selected ? selected.ledger_name : pickerQuery}
          onChange={e => { setSelected(null); setPickerQuery(e.target.value); setPage(1) }}
          placeholder={placeholder ?? "Search for a ledger…"}
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#c8a45c] bg-white"
        />
        {selected && (
          <button
            onClick={() => { setSelected(null); setPickerQuery("") }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={13} />
          </button>
        )}
        {!selected && options.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {options.map(o => (
              <button
                key={o.ledger_name}
                onClick={() => { setSelected(o); setPickerQuery(""); setPage(1) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#f5efe4] flex items-center justify-between gap-2"
              >
                <span>
                  <span className="text-[#2c2c2a]">{o.ledger_name}</span>
                  <span className="text-gray-400 text-xs ml-2">{o.parent_group}</span>
                </span>
                <span className="font-mono text-xs text-gray-500 shrink-0">{fmtINR(o.closing_balance)}</span>
              </button>
            ))}
          </div>
        )}
        {!selected && pickerQuery && options.length === 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400">
            No matching ledgers found.
          </div>
        )}
      </div>

      {!selected && (
        <p className="py-16 text-center text-sm text-gray-400 italic">
          Click the search box above and pick a ledger to view its full transaction history.
        </p>
      )}

      {selected && (
        <>
          {/* Summary strip */}
          <div className="flex flex-wrap gap-4 rounded-xl border border-gray-100 px-4 py-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Closing Balance</p>
              <p className="text-sm font-bold text-[#2c2c2a]">{fmtINR(selected.closing_balance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total In</p>
              <p className="text-sm font-semibold text-emerald-700">{fmtINR(stmt?.total_inflow ?? 0)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Out</p>
              <p className="text-sm font-semibold text-red-600">{fmtINR(stmt?.total_outflow ?? 0)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Net</p>
              <p className="text-sm font-semibold text-[#2c2c2a]">{fmtINR(stmt?.net ?? 0)}</p>
            </div>
            <div className="ml-auto">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Transactions</p>
              <p className="text-sm font-semibold text-[#2c2c2a]">{(stmt?.total ?? 0).toLocaleString("en-IN")}</p>
            </div>
          </div>

          <input
            value={txnSearch}
            onChange={e => { setTxnSearch(e.target.value); setPage(1) }}
            placeholder="Search narration, party, voucher #…"
            className="w-full max-w-xs text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#c8a45c]"
          />

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={22} className="text-[#1e3a2f] animate-spin" />
            </div>
          ) : isError ? (
            <p className="py-12 text-center text-sm text-red-500">Failed to load ledger statement.</p>
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={stmt?.transactions ?? []}
                rowKey={r => `${r.voucher_number}-${r.date}-${r.amount}-${r.direction}`}
                searchable={false}
                onExport={() => exportCsv(
                  selected.ledger_name.replace(/\s+/g, "_"),
                  ["Date", "Type", "Voucher #", "Counterparty", "Narration", "Debit", "Credit"],
                  (stmt?.transactions ?? []).map(r => [r.date, r.voucher_type, r.voucher_number, r.counterparty, r.narration, r.debit, r.credit]),
                )}
                emptyMessage="No transactions found for this ledger."
              />
              {(stmt?.total ?? 0) > PAGE_SIZE && (
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
        </>
      )}
    </div>
  )
}
