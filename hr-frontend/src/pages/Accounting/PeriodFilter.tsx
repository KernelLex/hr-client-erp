import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarRange } from "lucide-react"
import { operationsGet } from "./api"

// ── Shared period state (Year → Month) for the whole Accounting page ──────────
// Defined ONCE here and provided at the page level so every tab reads the same
// selection — no more each tab carrying its own year dropdown, and no month being
// re-picked separately on each page.

interface PeriodOptions {
  years: { year: number; months: { month: number; count: number }[] }[]
}

interface PeriodState {
  year: string   // "all" | "2026" | …
  month: string  // "all" | "1".."12"
  setYear: (y: string) => void
  setMonth: (m: string) => void
  options?: PeriodOptions
  isLoading: boolean
  label: string  // human summary e.g. "March 2026", "2025", "All time"
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const PeriodContext = createContext<PeriodState | null>(null)

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [year, setYearRaw] = useState("all")
  const [month, setMonth] = useState("all")

  const { data: options, isLoading } = useQuery<PeriodOptions>({
    queryKey: ["period-options"],
    queryFn: () => operationsGet("get_period_options"),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  // Changing the year resets the month — months available differ per year, and a
  // stale month would silently filter to an empty period.
  function setYear(y: string) {
    setYearRaw(y)
    setMonth("all")
  }

  const label =
    year === "all"
      ? "All time"
      : month === "all"
        ? year
        : `${MONTHS[Number(month) - 1]} ${year}`

  const value = useMemo<PeriodState>(
    () => ({ year, month, setYear, setMonth, options, isLoading, label }),
    [year, month, options, isLoading, label],
  )

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

export function usePeriod(): PeriodState {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error("usePeriod must be used within a PeriodProvider")
  return ctx
}

/** Query params for voucher/register endpoints — omits "all" so it means all-time. */
export function periodParams(p: { year: string; month: string }): Record<string, string> {
  const out: Record<string, string> = {}
  if (p.year && p.year !== "all") out.year = p.year
  if (p.month && p.month !== "all") out.month = p.month
  return out
}

/** Calendar (from, to) date range for endpoints that take from_date/to_date
 * (e.g. Profit & Loss). "All years" → everything up to today. */
export function periodDateRange(p: { year: string; month: string }): { from: string; to: string } {
  if (!p.year || p.year === "all") {
    return { from: "2000-01-01", to: new Date().toISOString().slice(0, 10) }
  }
  const y = Number(p.year)
  if (!p.month || p.month === "all") return { from: `${y}-01-01`, to: `${y}-12-31` }
  const m = Number(p.month)
  const mm = String(m).padStart(2, "0")
  const last = new Date(y, m, 0).getDate() // day 0 of next month = last day of this one
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` }
}

/** Params for the dashboard-style endpoints that take period + custom_start/end
 * (e.g. Cash Flow). "All years" → the backend's cumulative "all" period. */
export function periodDashParams(p: { year: string; month: string }): Record<string, string> {
  if (!p.year || p.year === "all") return { period: "all" }
  const { from, to } = periodDateRange(p)
  return { period: "custom", custom_start: from, custom_end: to }
}

// ── The cascading dropdown UI, rendered once in the page header ───────────────
export function PeriodFilter() {
  const { year, month, setYear, setMonth, options, isLoading, label } = usePeriod()

  const years = options?.years ?? []
  const monthsForYear =
    year === "all"
      ? []
      : years.find(y => String(y.year) === year)?.months ?? []

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <CalendarRange size={15} className="text-[#6a6a5c] shrink-0" />

      {/* Year */}
      <select
        value={year}
        onChange={e => setYear(e.target.value)}
        disabled={isLoading}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 disabled:opacity-50"
        title="Financial data year"
      >
        <option value="all">All Years</option>
        {years.map(y => (
          <option key={y.year} value={String(y.year)}>{y.year}</option>
        ))}
      </select>

      {/* Month — cascades from the chosen year; only months with data are shown */}
      <select
        value={month}
        onChange={e => setMonth(e.target.value)}
        disabled={year === "all" || monthsForYear.length === 0}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        title={year === "all" ? "Pick a year first" : "Month within the chosen year"}
      >
        <option value="all">{year === "all" ? "All Months" : "Whole Year"}</option>
        {monthsForYear.map(m => (
          <option key={m.month} value={String(m.month)}>
            {MONTHS[m.month - 1]} ({m.count})
          </option>
        ))}
      </select>

      <span className="text-xs text-gray-400 whitespace-nowrap">
        Showing <span className="font-medium text-gray-600">{label}</span>
      </span>
    </div>
  )
}
