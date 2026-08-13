import { Loader2 } from "lucide-react"

export interface MonthPoint { month: string; count: number; total: number }
export interface PartyPoint { party: string; count: number; total: number }

export interface VoucherSummary {
  count: number
  total: number
  min_date: string
  max_date: string
  monthly: MonthPoint[]
  top_parties: PartyPoint[]
}

export interface RegisterSummary extends VoucherSummary {
  excl_gst: number
  gst: number
  gst_label: string
}

function fmtCompact(n: number): string {
  // Pinpoint value — exact rupees + paise, Indian grouping. No Cr/L/K rounding.
  const sign = (n ?? 0) < 0 ? "−" : ""
  return `${sign}₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-06" → "Jun '26" */
export function fmtMonthKey(key: string): string {
  const [y, m] = key.split("-")
  const mi = parseInt(m, 10) - 1
  return `${MONTHS[mi] ?? m} '${y.slice(2)}`
}

/** "2026-06-29" → "Jun 2026" */
function fmtLongMonth(d: string): string {
  if (!d) return "—"
  const [y, m] = d.split("-")
  return `${MONTHS[parseInt(m, 10) - 1] ?? m} ${y}`
}

/**
 * Context band shown above the transaction table. All figures are computed
 * server-side over the FULL filtered set (not just the visible page), so the
 * totals/trend/top-parties stay accurate no matter which page you're on.
 * Clicking a party chip narrows the table via onPickParty.
 */
export function TransactionSummaryBand({
  summary, noun, gst, activeParty, onPickParty, loading,
}: {
  summary?: VoucherSummary
  noun: string
  gst?: { excl: number; gst: number; total: number; label: string }
  activeParty?: string
  onPickParty?: (party: string) => void
  loading?: boolean
}) {
  if (loading && !summary) {
    return (
      <div className="rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-center h-[74px]">
        <Loader2 size={16} className="text-gray-300 animate-spin" />
      </div>
    )
  }
  if (!summary || summary.count === 0) return null

  const months = summary.monthly
  const maxMonth = Math.max(1, ...months.map(m => m.total))

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-wrap items-stretch">
        {/* Totals + date range */}
        <div className="px-4 py-3 border-r border-gray-100 min-w-[190px]">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total {noun}</p>
          <p className="text-lg font-bold text-[#2c2c2a] leading-tight">
            {fmtCompact(summary.total)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {summary.count.toLocaleString("en-IN")} {noun.toLowerCase()} · {fmtLongMonth(summary.min_date)} – {fmtLongMonth(summary.max_date)}
          </p>
        </div>

        {/* Monthly sparkline */}
        {months.length > 0 && (
          <div className="px-4 py-3 border-r border-gray-100 flex-1 min-w-[220px]">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Monthly Trend</p>
            <div className="flex items-end gap-[2px] h-[34px]">
              {months.map(m => (
                <div
                  key={m.month}
                  title={`${fmtMonthKey(m.month)} · ${fmtCompact(m.total)} · ${m.count} ${noun.toLowerCase()}`}
                  className="flex-1 min-w-[3px] rounded-sm bg-[#1e3a2f]/70 hover:bg-[#c8a45c] transition-colors"
                  style={{ height: `${Math.max(6, (m.total / maxMonth) * 100)}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
              <span>{fmtMonthKey(months[0].month)}</span>
              <span>{fmtMonthKey(months[months.length - 1].month)}</span>
            </div>
          </div>
        )}

        {/* Top parties */}
        {summary.top_parties.length > 0 && (
          <div className="px-4 py-3 flex-1 min-w-[220px]">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Top by value</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.top_parties.map(t => {
                const isActive = activeParty && activeParty === t.party
                return (
                  <button
                    key={t.party}
                    onClick={() => onPickParty?.(isActive ? "" : t.party)}
                    title={`${t.party} · ${t.count} · ${fmtCompact(t.total)}`}
                    className={`max-w-[160px] truncate text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      isActive
                        ? "bg-[#1e3a2f] text-white border-[#1e3a2f]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#c8a45c]"
                    }`}
                  >
                    <span className="font-medium">{t.party}</span>
                    <span className={isActive ? "text-[#d4c8a8] ml-1" : "text-gray-400 ml-1"}>{fmtCompact(t.total)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* GST / tax subtotal row (Sales / Purchase only) */}
      {gst && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2 bg-[#faf6ed] border-t border-gray-100 text-xs">
          <span className="text-gray-500">Taxable (excl. {gst.label}): <strong className="text-[#2c2c2a] font-semibold">{fmtCompact(gst.excl)}</strong></span>
          <span className="text-gray-500">{gst.label}: <strong className="text-[#2c2c2a] font-semibold">{fmtCompact(gst.gst)}</strong></span>
          <span className="text-gray-500">Grand total: <strong className="text-[#1e3a2f] font-semibold">{fmtCompact(gst.total)}</strong></span>
        </div>
      )}
    </div>
  )
}

/** Month divider row content for the grouped DataTable. Looks up the month's
 * full-set subtotal from the summary's monthly series (so it's the true month
 * total, not just the rows visible on the current page). */
export function MonthDivider({ monthKey, monthly, noun }: {
  monthKey: string
  monthly: MonthPoint[]
  noun: string
}) {
  const m = monthly.find(x => x.month === monthKey)
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#1e3a2f]">
        {monthKey ? fmtLongMonth(monthKey + "-01") : "Undated"}
      </span>
      {m && (
        <span className="text-[11px] text-gray-500">
          {m.count.toLocaleString("en-IN")} {noun.toLowerCase()} · <span className="font-semibold text-[#2c2c2a]">{fmtCompact(m.total)}</span>
        </span>
      )}
    </div>
  )
}
