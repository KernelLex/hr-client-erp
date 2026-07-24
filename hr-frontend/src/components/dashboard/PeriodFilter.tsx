export type PeriodKey = "today" | "mtd" | "ytd" | "last_year" | "custom"

export interface PeriodValue {
  period: PeriodKey
  custom_start?: string
  custom_end?: string
}

const OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "mtd", label: "This Month" },
  { key: "ytd", label: "This FY" },
  { key: "last_year", label: "Last FY" },
  { key: "custom", label: "Custom" },
]

/** Shared Today/MTD/YTD/Last FY/Custom period picker — matches the `period` param
 * accepted by accounts_dashboard.py's `_period_bounds()`. */
export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPTIONS.map(o => (
        <button
          key={o.key}
          onClick={() => onChange({ ...value, period: o.key })}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            value.period === o.key
              ? "bg-[#1e3a2f] text-white border-[#1e3a2f]"
              : "bg-white text-gray-600 border-gray-200 hover:border-[#1e3a2f]"
          }`}
        >
          {o.label}
        </button>
      ))}
      {value.period === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.custom_start ?? ""}
            onChange={e => onChange({ ...value, custom_start: e.target.value })}
            className="text-xs border border-gray-200 rounded-md px-2 py-1"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={value.custom_end ?? ""}
            onChange={e => onChange({ ...value, custom_end: e.target.value })}
            className="text-xs border border-gray-200 rounded-md px-2 py-1"
          />
        </div>
      )}
    </div>
  )
}

/** Query params to pass straight through to accounts_dashboard.py endpoints. */
export function periodParams(v: PeriodValue): Record<string, string> {
  if (v.period === "custom") {
    return { period: "custom", custom_start: v.custom_start ?? "", custom_end: v.custom_end ?? "" }
  }
  return { period: v.period }
}
