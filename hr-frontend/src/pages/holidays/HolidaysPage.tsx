import { useState, useMemo } from "react"
import { COMPANY_NAME } from "@/lib/constants"
import { useNavigate } from "react-router-dom"
import { CalendarDays, Gift, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { useHolidays, useLeavePolicy, useMyLeaves } from "@/pages/leave/useLeave"
import type { Holiday, LeaveTypePolicy } from "@/pages/leave/types"

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function groupByMonth(holidays: Holiday[]): Record<string, Holiday[]> {
  const groups: Record<string, Holiday[]> = {}
  for (const h of holidays) {
    if (!groups[h.month]) groups[h.month] = []
    groups[h.month].push(h)
  }
  return groups
}

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// ─── Status badge ─────────────────────────────────────────────────────────────

function HolidayBadge({ holiday, isNext }: { holiday: Holiday; isNext: boolean }) {
  if (holiday.is_today) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full animate-pulse"
        style={{ backgroundColor: "#F5F5F5", color: "#171717" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--bg-subtle)]0 inline-block" />
        Today! ✓
      </span>
    )
  }
  if (isNext) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
        style={{ backgroundColor: "#F5F5F5", color: "#646464" }}>
        Next Holiday
      </span>
    )
  }
  if (holiday.is_past) {
    return (
      <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full"
        style={{ backgroundColor: "#f5f5f5", color: "#a6a6a6" }}>
        Done ✓
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full"
      style={{ backgroundColor: "#F5F5F5", color: "#171717" }}>
      Upcoming
    </span>
  )
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white rounded-xl p-4 text-center" style={{ border: "1px solid #f5f5f5", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderTop: `3px solid ${accent}` }}>
      <div className="text-2xl font-bold mb-0.5" style={{ color: accent }}>{value}</div>
      <div className="text-[12px] text-gray-500 leading-tight">{label}</div>
    </div>
  )
}

// ─── SECTION 1: Holiday Calendar ──────────────────────────────────────────────

function CalendarSection() {
  const navigate = useNavigate()
  const { data: holidays, isLoading } = useHolidays()
  const { data: myLeavesData } = useMyLeaves()

  const currentYear = new Date().getFullYear()
  const myLeaves = myLeavesData?.data ?? []

  // Compute approved days by type this year
  const approvedByType = useMemo(() => {
    const map: Record<string, number> = {}
    for (const l of myLeaves) {
      if (l.status === "Approved" && l.from_date?.startsWith(String(currentYear))) {
        map[l.leave_type] = (map[l.leave_type] ?? 0) + (l.total_days ?? 0)
      }
    }
    return map
  }, [myLeaves, currentYear])

  const stats = useMemo(() => {
    if (!holidays) return { total: 0, past: 0, remaining: 0, next: null as Holiday | null }
    const past = holidays.filter((h) => h.is_past).length
    const upcoming = holidays.filter((h) => h.is_upcoming)
    return {
      total: holidays.length,
      past,
      remaining: upcoming.length + (holidays.some((h) => h.is_today) ? 1 : 0),
      next: upcoming[0] ?? null,
    }
  }, [holidays])

  const grouped = useMemo(() => {
    if (!holidays) return {}
    return groupByMonth(holidays)
  }, [holidays])

  const nextHoliday = stats.next

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-100" />)}
        </div>
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!holidays) return null

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Holidays" value={stats.total} accent="#6B6B6B" />
        <StatCard label="Past Holidays" value={stats.past} accent="#a6a6a6" />
        <StatCard label="Remaining" value={stats.remaining} accent="#171717" />
        <StatCard
          label="Next Holiday"
          value={nextHoliday ? formatDisplayDate(nextHoliday.date) : "—"}
          accent="#171717"
        />
      </div>

      {/* Next holiday banner */}
      {nextHoliday && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ backgroundColor: "#F5F5F5", border: "1px solid #F5F5F5" }}>
          <CalendarDays size={18} style={{ color: "#171717" }} />
          <p className="text-sm font-semibold" style={{ color: "#171717" }}>
            {nextHoliday.name} — {
              nextHoliday.days_until === 0 ? "Today!" :
              nextHoliday.days_until === 1 ? "Tomorrow!" :
              `in ${nextHoliday.days_until} days`
            }
            <span className="ml-2 font-normal text-[var(--text-primary)]">
              ({nextHoliday.day}, {formatDisplayDate(nextHoliday.date)})
            </span>
          </p>
        </div>
      )}

      {/* Leave balance card */}
      {Object.keys(approvedByType).length > 0 && (
        <div className="bg-white rounded-xl p-5" style={{ border: "1px solid #f5f5f5", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <p className="text-sm font-semibold text-gray-700 mb-3">Your Leave Balance — {currentYear}</p>
          <div className="space-y-2">
            {Object.entries(approvedByType).map(([type, days]) => (
              <div key={type} className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-gray-600 min-w-[140px]">{type}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min((days / 12) * 100, 100)}%`, backgroundColor: "#6B6B6B" }} />
                </div>
                <span className="text-[13px] font-semibold text-[var(--text-primary)] min-w-[40px] text-right">{days}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holiday list grouped by month */}
      <div className="space-y-4">
        {MONTH_ORDER.filter((m) => grouped[m]).map((month) => {
          const monthHolidays = grouped[month]
          const pastCount = monthHolidays.filter((h) => h.is_past).length
          const allPast = pastCount === monthHolidays.length
          return (
            <div key={month} className="bg-white rounded-xl overflow-hidden"
              style={{ border: "1px solid #f5f5f5", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              {/* Month header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50"
                style={{ backgroundColor: allPast ? "#fafafa" : "#F5F5F5" }}>
                <h3 className="text-sm font-semibold" style={{ color: allPast ? "#a6a6a6" : "#171717" }}>
                  {month} {currentYear}
                </h3>
                <span className="text-[11px] text-gray-400">
                  {monthHolidays.length} holiday{monthHolidays.length !== 1 ? "s" : ""}
                  {pastCount > 0 && pastCount < monthHolidays.length && ` · ${pastCount} done`}
                </span>
              </div>
              {/* Holiday rows */}
              <div>
                {monthHolidays.map((h, idx) => {
                  const isNext = h === nextHoliday
                  return (
                    <div key={h.date}
                      className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0"
                      style={{
                        backgroundColor: isNext ? "#F5F5F5" : h.is_today ? "#F5F5F5" : "white",
                        opacity: h.is_past ? 0.65 : 1,
                      }}>
                      {/* Index */}
                      <span className="text-[11px] text-gray-400 w-4 shrink-0">{idx + 1}</span>
                      {/* Date */}
                      <span className="text-sm font-semibold w-14 shrink-0" style={{ color: h.is_past ? "#a6a6a6" : "#2c2c2c" }}>
                        {formatDisplayDate(h.date)}
                      </span>
                      {/* Name */}
                      <span className="flex-1 text-sm font-medium" style={{ color: h.is_past ? "#a6a6a6" : "#444444" }}>
                        {h.name}
                      </span>
                      {/* Day */}
                      <span className="text-[12px] text-gray-400 hidden sm:block w-20">{h.day}</span>
                      {/* Status badge */}
                      <div className="shrink-0">
                        <HolidayBadge holiday={h} isNext={isNext} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Happy Holiday card */}
      <div className="rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: "linear-gradient(135deg, #F5F5F5 0%, #F5F5F5 100%)", border: "1px solid #F5F5F5" }}>
        <div className="text-4xl">✓</div>
        <div className="flex-1">
          <p className="font-semibold text-[var(--text-primary)] mb-0.5">Happy Holiday</p>
          <p className="text-sm text-[var(--text-primary)]">
            You have 1 extra holiday to use for any personal occasion — birthday, anniversary,
            or a festival not on the official calendar.
          </p>
        </div>
        <button
          onClick={() => navigate("/leave?type=Happy+Holiday")}
          className="shrink-0 text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:opacity-90"
          style={{ backgroundColor: "#171717", color: "white" }}>
          Apply Happy Holiday
        </button>
      </div>
    </div>
  )
}

// ─── SECTION 2: Leave Policy ──────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  green:  { bg: "#F5F5F5", text: "#171717", border: "#E3E3E3" },
  blue:   { bg: "#F5F5F5", text: "#171717", border: "#c8c8c8" },
  purple: { bg: "#F5F5F5", text: "#171717", border: "#E3E3E3" },
  pink:   { bg: "#f8f8f8", text: "#171717", border: "#171717" },
  teal:   { bg: "#F5F5F5", text: "#171717", border: "#a4a4a4" },
  grey:   { bg: "#fafafa", text: "#585858", border: "#d6d6d6" },
  orange: { bg: "#F5F5F5", text: "#171717", border: "#E3E3E3" },
  red:    { bg: "#FEF2F2", text: "#991B1B", border: "#FCA5A5" },
}

function LeavePolicyCard({ policy }: { policy: LeaveTypePolicy }) {
  const [open, setOpen] = useState(false)
  const colors = COLOR_MAP[policy.color] ?? COLOR_MAP.grey

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1px solid ${colors.border}`, backgroundColor: "white" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:opacity-90 transition-opacity">
        <span className="text-2xl shrink-0">{policy.icon}</span>
        <span className="flex-1 font-semibold text-sm" style={{ color: "#2c2c2c" }}>{policy.type}</span>
        <span className="text-sm font-bold px-3 py-1 rounded-full shrink-0"
          style={{ backgroundColor: colors.bg, color: colors.text }}>
          {policy.days_label}
        </span>
        <span style={{ color: "#a6a6a6" }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0 border-t" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
          <ul className="space-y-2 mt-3">
            {policy.rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.text }}>
                <span className="mt-0.5 shrink-0">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PolicySection() {
  const { data: policy, isLoading } = useLeavePolicy()

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100" />)}
      </div>
    )
  }

  if (!policy) return null

  return (
    <div className="space-y-5">
      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "#F5F5F5", color: "#171717" }}>
          ◆ {policy.summary.public_holidays} Public Holidays
        </div>
        <div className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "#F5F5F5", color: "#171717" }}>
          ◆ {policy.summary.earned_leave} Earned Leave days
        </div>
        <div className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "#F5F5F5", color: "#171717" }}>
          ◆ {policy.summary.sick_leave} Sick Leave days
        </div>
        <div className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "#F5F5F5", color: "#545454" }}>
          ✓ +{policy.summary.happy_holiday} Happy Holiday
        </div>
        <div className="px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: "#F5F5F5", color: "#171717" }}>
          ↩ Max {policy.summary.max_carry_forward} days carry forward
        </div>
      </div>

      {/* Leave type cards */}
      <div className="space-y-3">
        {policy.leave_types.map((lt) => (
          <LeavePolicyCard key={lt.type} policy={lt} />
        ))}
      </div>
    </div>
  )
}

// ─── SECTION 3: Important Rules ───────────────────────────────────────────────

function RulesSection() {
  const { data: policy, isLoading } = useLeavePolicy()

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
  }

  if (!policy) return null

  return (
    <div className="rounded-xl p-6" style={{ backgroundColor: "#F5F5F5", border: "1px solid #F5F5F5" }}>
      <div className="flex items-center gap-2 mb-5">
        <AlertTriangle size={18} style={{ color: "#171717" }} />
        <h3 className="font-semibold text-base" style={{ color: "#171717" }}>Important Leave Rules for {new Date().getFullYear()}</h3>
      </div>
      <ul className="space-y-3">
        {policy.important_rules.map((rule, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-base shrink-0">◆</span>
            <span className="text-sm leading-relaxed" style={{ color: "#444444" }}>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── HolidaysContent (reusable — used in page and profile tab) ─────────────────

type HolidayTab = "calendar" | "policy" | "rules"

export function HolidaysContent() {
  const [activeSection, setActiveSection] = useState<HolidayTab>("calendar")

  const SECTIONS: { id: HolidayTab; label: string; icon: string }[] = [
    { id: "calendar", label: `${new Date().getFullYear()} Holidays`, icon: "◰" },
    { id: "policy",   label: "Leave Policy",  icon: "▤" },
    { id: "rules",    label: "Important Rules", icon: "△" },
  ]

  return (
    <div className="space-y-5">
      {/* Section tab nav */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: "#f5f5f5" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={activeSection === s.id
              ? { backgroundColor: "white", color: "#2c2c2c", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
              : { color: "#787878" }}>
            <span>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      {activeSection === "calendar" && <CalendarSection />}
      {activeSection === "policy"   && <PolicySection />}
      {activeSection === "rules"    && <RulesSection />}
    </div>
  )
}

// ─── HolidaysPage (standalone route) ─────────────────────────────────────────

export function HolidaysPage() {
  return (
    <div className="p-6" style={{ backgroundColor: "var(--bg-app)", minHeight: "100%" }}>
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #6B6B6B 0%, #171717 100%)" }}>
            <Gift size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Holidays & Leave Policy
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">{`${COMPANY_NAME} — ${new Date().getFullYear()}`}</p>
          </div>
        </div>

        <HolidaysContent />
      </div>
    </div>
  )
}
