import { useQuery } from "@tanstack/react-query"
import { X, Loader2 } from "lucide-react"
import { accountingGet, operationsGet } from "./api"

interface LedgerEntry {
  ledger: string
  amount: number
  is_dr: boolean
  is_party: boolean
}

interface InventoryEntry {
  name: string
  hsn: string
  rate: number
  amount: number
  qty: number
  qty_unit: string
}

interface VoucherDetail {
  name: string
  voucher_type: string
  voucher_number: string
  voucher_date: string
  party_name: string
  amount: number
  amount_fmt: string
  narration: string
  debit_ledger: string
  credit_ledger: string
  all_ledger_entries: LedgerEntry[]
  inventory_entries: InventoryEntry[]
  party_mailing_name: string
  party_gstin: string
  party_address: string
  party_state: string
  party_phone: string
  party_gst_type: string
}

function fmtINR(n: number): string {
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Side-panel showing full detail for one VE Tally Voucher — reused by every
 * voucher-backed tab (Journal/Payment/Receipts/Credit/Debit Notes, Sales/Purchase).
 * Pass `name` for a direct VE Tally Voucher name, or `guid` for a Sales/Purchase
 * Register row's prefixed tally_guid (resolved server-side to the source voucher). */
export function VoucherDetailDrawer({ name, guid, onClose }: { name?: string; guid?: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<VoucherDetail>({
    queryKey: ["voucher-detail", name ?? guid],
    queryFn: () => name
      ? operationsGet("get_voucher_detail", { name })
      : accountingGet("resolve_voucher_by_guid", { guid: guid! }),
    staleTime: 60_000,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(30,58,47,0.4)" }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-[#2c2c2a]">Voucher Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading && (
            <div className="flex justify-center py-16">
              <Loader2 size={22} className="text-[#1e3a2f] animate-spin" />
            </div>
          )}
          {isError && (
            <p className="text-sm text-red-500 text-center py-8">Failed to load voucher.</p>
          )}
          {data && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-400">{data.voucher_type}</p>
                  <p className="text-base font-semibold text-[#2c2c2a]">{data.voucher_number || data.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{data.voucher_date}</p>
                </div>
                <p className="text-lg font-bold text-[#1e3a2f]">{data.amount_fmt || fmtINR(data.amount)}</p>
              </div>

              {data.party_name && (
                <div className="rounded-lg border border-gray-100 p-3 space-y-1">
                  <p className="text-sm font-semibold text-[#2c2c2a]">{data.party_mailing_name || data.party_name}</p>
                  {data.party_gstin && <p className="text-xs text-gray-500">GSTIN: {data.party_gstin}</p>}
                  {data.party_address && <p className="text-xs text-gray-500">{data.party_address}</p>}
                  {(data.party_state || data.party_phone) && (
                    <p className="text-xs text-gray-500">{[data.party_state, data.party_phone].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              )}

              {data.narration && (
                <p className="text-sm text-gray-600 italic">{data.narration}</p>
              )}

              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Ledger Entries</p>
                <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                  {(data.all_ledger_entries ?? []).map((e, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-700">{e.ledger}</span>
                      <span className={`font-mono text-xs font-semibold ${e.is_dr ? "text-red-600" : "text-emerald-700"}`}>
                        {e.is_dr ? "Dr" : "Cr"} {fmtINR(e.amount)}
                      </span>
                    </div>
                  ))}
                  {(!data.all_ledger_entries || data.all_ledger_entries.length === 0) && (
                    <p className="px-3 py-3 text-xs text-gray-400 italic">No ledger entries recorded.</p>
                  )}
                </div>
              </div>

              {data.inventory_entries && data.inventory_entries.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Items</p>
                  <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                    {data.inventory_entries.map((it, i) => (
                      <div key={i} className="px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700">{it.name}</span>
                          <span className="font-mono text-xs font-semibold text-[#2c2c2a]">{fmtINR(it.amount)}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {it.qty} {it.qty_unit} × {fmtINR(it.rate)}{it.hsn ? ` · HSN ${it.hsn}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
