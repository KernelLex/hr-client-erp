import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ChevronDown, ChevronRight } from "lucide-react"
import { usePeriod, periodDashParams } from "./PeriodFilter"
import { dashboardGet } from "./api"

interface CFItem { line_item: string; inflow: number; outflow: number; net: number }
interface CFSection { items: CFItem[]; total_inflow: number; total_outflow: number; net: number }
interface CashFlowResult {
  period: { start: string; end: string }
  sections: Record<string, CFSection>
  grand_total: { inflow: number; outflow: number; net: number }
  monthly_series: { period: string; inflow: number; outflow: number }[]
}

function fmtINR(n: number): string {
  // Pinpoint value — exact rupees + paise, Indian grouping. No Cr/L rounding.
  const sign = (n ?? 0) < 0 ? "−" : ""
  return `${sign}₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const SECTION_ORDER = ["Operating", "Investing", "Financing"]

function SectionCard({ title, section }: { title: string; section: CFSection }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-gray-100">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-[#2c2c2a]">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title} Activities
        </span>
        <span className={`text-sm font-mono font-semibold ${section.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>
          {fmtINR(section.net)}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {section.items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400 italic">No entries this period.</p>
          ) : section.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-gray-600 truncate pr-3">{it.line_item}</span>
              <span className="font-mono text-xs shrink-0">
                {it.inflow > 0 && <span className="text-emerald-700">+{fmtINR(it.inflow)}</span>}
                {it.outflow > 0 && <span className="text-red-600 ml-2">−{fmtINR(it.outflow)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CashFlowTab() {
  const { year, month } = usePeriod()

  const { data, isLoading, isError } = useQuery<CashFlowResult>({
    queryKey: ["cash-flow-statement", year, month],
    queryFn: () => dashboardGet("get_cash_flow_statement", periodDashParams({ year, month })),
    staleTime: 30_000,
  })

  const maxMonthly = Math.max(1, ...(data?.monthly_series ?? []).map(m => Math.max(m.inflow, m.outflow)))

  return (
    <div className="space-y-4">
      {/* Period comes from the shared Year → Month filter in the page header. */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="text-[#1e3a2f] animate-spin" />
        </div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Failed to load cash flow statement.</p>
      ) : data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Inflow</p>
              <p className="text-lg font-bold text-emerald-700">{fmtINR(data.grand_total.inflow)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Outflow</p>
              <p className="text-lg font-bold text-red-600">{fmtINR(data.grand_total.outflow)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Net Cash Flow</p>
              <p className={`text-lg font-bold ${data.grand_total.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtINR(data.grand_total.net)}</p>
            </div>
          </div>

          {/* Monthly trend — simple bars, no chart lib dependency */}
          {data.monthly_series.length > 0 && (
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Monthly Trend</p>
              <div className="space-y-1.5">
                {data.monthly_series.map(m => (
                  <div key={m.period} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-gray-500">{m.period}</span>
                    <div className="flex-1 flex gap-0.5 h-3">
                      <div className="bg-emerald-500/70 rounded-sm" style={{ width: `${(m.inflow / maxMonthly) * 50}%` }} />
                      <div className="bg-red-500/70 rounded-sm" style={{ width: `${(m.outflow / maxMonthly) * 50}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-gray-500">{fmtINR(m.inflow - m.outflow)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {SECTION_ORDER.filter(s => data.sections[s]).map(s => (
              <SectionCard key={s} title={s} section={data.sections[s]} />
            ))}
            {Object.keys(data.sections).filter(s => !SECTION_ORDER.includes(s)).map(s => (
              <SectionCard key={s} title={s} section={data.sections[s]} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
