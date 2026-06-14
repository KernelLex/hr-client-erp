import { useState, useMemo } from "react"
import { Navigate } from "react-router-dom"
import { LeaveAdminPanel } from "./LeaveAdminPanel"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Users, Clock, AlertTriangle, UserX, TrendingUp,
  Wifi, WifiOff, Download, RefreshCw, CheckCircle2, Calendar,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import {
  useWhosIn, useJibblePeople, useAttendanceRange,
  useWeeklySummary, useMonthlySummary,
  useLateToday, useAbsentToday, useOvertime, useProjects,
  useJibbleTestConnection, useJibbleBustCache,
  type JibblePerson, type WeeklySummaryItem, type MonthlySummaryItem,
  type AttendanceEntry,
} from "./useJibble"

const ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])
const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"]

// ── Date helpers ─────────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function todayDate() {
  return new Date()
}

type Preset = "today" | "yesterday" | "last3" | "last7" | "custom"

function presetRange(p: Preset): { from: string; to: string } {
  const today = todayDate()
  switch (p) {
    case "today":     return { from: isoDate(today), to: isoDate(today) }
    case "yesterday": return { from: isoDate(addDays(today, -1)), to: isoDate(addDays(today, -1)) }
    case "last3":     return { from: isoDate(addDays(today, -2)), to: isoDate(today) }
    case "last7":     return { from: isoDate(addDays(today, -6)), to: isoDate(today) }
    default:          return { from: isoDate(today), to: isoDate(today) }
  }
}

function formatSynced(iso?: string) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })
  } catch {
    return null
  }
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function initials(name?: string) {
  if (!name) return "?"
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-full" /></td>
      ))}
    </tr>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    on_time: { label: "On Time",  cls: "bg-green-100 text-green-700" },
    late:    { label: "Late",     cls: "bg-orange-100 text-orange-700" },
    working: { label: "Working",  cls: "bg-blue-100 text-blue-700" },
    absent:  { label: "Absent",   cls: "bg-red-100 text-red-700" },
  }
  const s = map[status ?? ""] ?? { label: status ?? "—", cls: "bg-gray-100 text-gray-600" }
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
}

// ── Date Range Picker ─────────────────────────────────────────────────────────

interface DateRangePickerProps {
  preset: Preset
  dateFrom: string
  dateTo: string
  onPreset: (p: Preset) => void
  onCustomChange: (from: string, to: string) => void
  lastSynced?: string | null
  onRefresh: () => void
  isRefreshing: boolean
}

function DateRangePicker({
  preset, dateFrom, dateTo, onPreset, onCustomChange, lastSynced, onRefresh, isRefreshing,
}: DateRangePickerProps) {
  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today",     label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "last3",     label: "Last 3 Days" },
    { key: "last7",     label: "Last 7 Days" },
    { key: "custom",    label: "Custom" },
  ]

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-600">Date Range:</span>
          </div>

          <div className="flex gap-1 flex-wrap">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onPreset(key)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  preset === key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => {
                  const newFrom = e.target.value
                  // Enforce max 30-day range
                  const maxTo = isoDate(addDays(new Date(newFrom), 29))
                  onCustomChange(newFrom, dateTo > maxTo ? maxTo : dateTo)
                }}
                className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={isoDate(addDays(new Date(dateFrom), 29))}
                onChange={(e) => onCustomChange(dateFrom, e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {lastSynced && (
              <span className="text-[11px] text-gray-400">Last synced {lastSynced} IST</span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Widget 1 + 2: Live Status Bar & Who's In ──────────────────────────────────

function LiveStatusSection() {
  const peopleQ = useJibblePeople()
  const whosInQ = useWhosIn()

  const allPeople: JibblePerson[] =
    peopleQ.data?.success ? (peopleQ.data.data as { value: JibblePerson[] }).value ?? [] : []
  const clockedIn: JibblePerson[] =
    whosInQ.data?.success ? (whosInQ.data.data as { value: JibblePerson[] }).value ?? [] : []
  const clockedInIds = new Set(clockedIn.map((p) => p.id))
  const total = allPeople.length || 5

  return (
    <div className="space-y-3">
      <Card className="bg-white shadow-sm border-0">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-gray-800">Live Status</span>
            </div>
            <span className="text-xs text-gray-400">Auto-refreshes every 60s</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {peopleQ.isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="size-3 rounded-full bg-gray-200 animate-pulse" />
                ))
              : allPeople.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <div className={`size-2.5 rounded-full ${clockedInIds.has(p.id) ? "bg-green-500" : "bg-gray-300"}`} />
                    <span className="text-xs text-gray-600">
                      {(p.fullName || p.name)?.split(" ")[0]}
                    </span>
                  </div>
                ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            <span className="font-semibold text-gray-900">{clockedIn.length}</span> of{" "}
            <span className="font-semibold text-gray-900">{total}</span> clocked in right now
          </p>
        </CardContent>
      </Card>

      {clockedIn.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {clockedIn.map((person) => {
            const clockedAtStr = person.time
              ? (() => {
                  try {
                    return new Date(person.time as string).toLocaleTimeString("en-IN", {
                      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
                    })
                  } catch { return "—" }
                })()
              : "—"
            const name = (person.fullName || person.name) as string | undefined
            return (
              <Card key={person.id} className="bg-white shadow-sm border-0">
                <CardContent className="pt-3 pb-3 text-center">
                  <div className="size-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                    <span className="text-sm font-bold text-green-700">{initials(name)}</span>
                  </div>
                  <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">In since {clockedAtStr}</p>
                  <div className="size-1.5 rounded-full bg-green-500 mx-auto mt-1.5" />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Widget 3: Attendance Table with Date Groups ───────────────────────────────

interface AttendanceTableProps {
  dateFrom: string
  dateTo: string
  lastSynced?: string | null
}

function AttendanceTable({ dateFrom, dateTo }: AttendanceTableProps) {
  const { data, isLoading } = useAttendanceRange(dateFrom, dateTo)
  const groups = data?.success ? data.data : []

  const exportCSV = () => {
    if (!groups.length) return
    const rows: string[][] = [["Date", "Employee", "Clock In", "Clock Out", "Hours", "Break (min)", "Status"]]
    for (const g of groups) {
      for (const e of g.entries) {
        rows.push([
          g.date_label, e.person_name,
          e.clock_in ?? "—", e.clock_out ?? "—",
          String(e.hours), String(e.break_minutes), e.status,
        ])
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `attendance_${dateFrom}_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Clock size={15} className="text-blue-500" />
            Attendance
          </CardTitle>
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={exportCSV}
            disabled={!groups.length}
          >
            <Download size={12} /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        {isLoading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Employee", "Clock In", "Clock Out", "Hours", "Break", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}</tbody>
          </table>
        ) : !data?.success ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            {(data as { error?: string } | undefined)?.error ?? "Failed to load attendance data"}
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No attendance data for this period</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Employee", "Clock In", "Clock Out", "Hours", "Break", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <>
                  {/* Date section header */}
                  <tr key={`header-${g.date}`} className="bg-gray-50">
                    <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-gray-600 border-t border-gray-200">
                      {g.date_label}
                    </td>
                  </tr>
                  {g.entries.map((e: AttendanceEntry, i: number) => (
                    <tr key={`${g.date}-${i}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{e.person_name}</td>
                      <td className="px-4 py-3 text-gray-600">{e.clock_in ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{e.clock_out ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{e.hours > 0 ? `${e.hours}h` : "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{e.break_minutes > 0 ? `${e.break_minutes}m` : "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget 4 & 5: Late + Absent (today only) ─────────────────────────────────

function LateAbsentRow() {
  const lateQ = useLateToday()
  const absentQ = useAbsentToday()
  const late = lateQ.data?.success ? lateQ.data.data : []
  const absent = absentQ.data?.success ? absentQ.data.data : []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="bg-white shadow-sm border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={15} className="text-orange-500" />
            Late Arrivals Today
            {!lateQ.isLoading && late.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{late.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {lateQ.isLoading ? (
            <div className="space-y-2 animate-pulse">{[1,2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}</div>
          ) : late.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">Everyone on time today 🎉</p>
          ) : (
            <div className="space-y-2">
              {late.map((emp, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-orange-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-orange-700">{initials(emp.person_name)}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{emp.person_name}</p>
                      <p className="text-[11px] text-gray-400">Clocked in at {emp.clock_in}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-orange-600">+{emp.minutes_late}m late</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <UserX size={15} className="text-red-500" />
            Absent Today
            {!absentQ.isLoading && absent.length > 0 && (
              <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{absent.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {absentQ.isLoading ? (
            <div className="space-y-2 animate-pulse">{[1,2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}</div>
          ) : absent.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">Full attendance ✅</p>
          ) : (
            <div className="space-y-2">
              {absent.map((emp, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="size-7 rounded-full bg-red-100 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-red-700">{initials(emp.person_name)}</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-800">{emp.person_name}</p>
                    <p className="text-[11px] text-gray-400">Not clocked in yet</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Widget 6: Weekly Hours Bar Chart ─────────────────────────────────────────

function WeeklyHoursChart() {
  const { data, isLoading } = useWeeklySummary()
  const entries: WeeklySummaryItem[] = data?.success ? data.data : []
  const chartData = entries.map((e) => ({
    name: e.person_name?.split(" ")[0] ?? "?",
    hours: e.total_hours,
  }))

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <TrendingUp size={15} className="text-violet-500" />
          Weekly Hours
          {data?.success && "week_start" in data && (
            <span className="text-[11px] text-gray-400 font-normal">
              {(data as { week_start?: string }).week_start} →{" "}
              {(data as { week_end?: string }).week_end}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="h-48 bg-gray-50 rounded animate-pulse" />
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No data for this week yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val) => [`${val}h`, "Hours"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={45} stroke="#ef4444" strokeDasharray="4 4"
                label={{ value: "45h target", fontSize: 10, fill: "#ef4444" }} />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index}
                    fill={entry.hours >= 36 ? "#10b981" : entry.hours >= 20 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget 7: Monthly Summary Table ──────────────────────────────────────────

function MonthlySummaryTable() {
  const { data, isLoading } = useMonthlySummary()
  const entries: MonthlySummaryItem[] = data?.success ? data.data : []

  const exportCSV = () => {
    if (!entries.length) return
    const headers = ["Employee", "Total Hours", "Working Days", "Avg Hours/Day", "Overtime Days"]
    const rows = entries.map((e) => [e.person_name, e.total_hours, e.working_days, e.avg_hours_per_day, e.overtime_days])
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `monthly_summary_${new Date().toISOString().slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Users size={15} className="text-emerald-500" />
            Monthly Summary
            {data?.success && "month_start" in data && (
              <span className="text-[11px] text-gray-400 font-normal">
                {(data as { month_start?: string }).month_start}
              </span>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            onClick={exportCSV} disabled={entries.length === 0}>
            <Download size={12} /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["Employee", "Total Hours", "Working Days", "Avg Hours/Day", "Overtime Days"].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No monthly data yet</td></tr>
            ) : (
              entries.map((e, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{e.person_name}</td>
                  <td className="px-4 py-3 text-gray-700 font-semibold">{e.total_hours}h</td>
                  <td className="px-4 py-3 text-gray-600">{e.working_days}</td>
                  <td className="px-4 py-3 text-gray-600">{e.avg_hours_per_day}h</td>
                  <td className="px-4 py-3">
                    {e.overtime_days > 0
                      ? <span className="text-orange-600 font-medium">{e.overtime_days} days</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ── Widget 8: Overtime Alerts ─────────────────────────────────────────────────

function OvertimeAlerts() {
  const { data, isLoading } = useOvertime()
  const entries = data?.success ? data.data : []

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-500" />
          Overtime This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">{[1,2,3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No overtime recorded this month</p>
        ) : (
          <div className="space-y-3">
            {entries.map((emp, i) => (
              <div key={i} className="border border-amber-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-800">{emp.person_name}</span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    {emp.total_overtime_hours}h total OT
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {emp.overtime_days.slice(0, 5).map((d, j) => (
                    <span key={j} className="text-[11px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                      {d.date} · +{d.overtime_hours}h
                    </span>
                  ))}
                  {emp.overtime_days.length > 5 && (
                    <span className="text-[11px] text-gray-400">+{emp.overtime_days.length - 5} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget 9: Projects Pie Chart ──────────────────────────────────────────────

function ProjectsWidget() {
  const { data, isLoading } = useProjects()
  const rawProjects = data?.success ? (data.data as { value?: unknown[] }).value ?? [] : []
  const projects = rawProjects as Array<{ id?: string; name?: string; totalDuration?: number }>
  const pieData = projects
    .filter((p) => p.name && (p.totalDuration ?? 0) > 0)
    .map((p) => ({ name: p.name ?? "Unknown", value: Math.round((p.totalDuration ?? 0) / 3600) }))
    .slice(0, 6)

  if (isLoading || pieData.length === 0) return null

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800">Projects & Activities</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                {pieData.map((_, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(val) => [`${val}h`, "Hours"]} contentStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {pieData.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-700 truncate max-w-[120px]">{p.name}</span>
                </div>
                <span className="font-medium text-gray-800">{p.value}h</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function JibbleSettingsPanel() {
  const [result, setResult] = useState<{ connected?: boolean; organization?: string; error?: string } | null>(null)
  const mutation = useJibbleTestConnection()

  return (
    <Card className="bg-white shadow-sm border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          {result?.connected === false ? <WifiOff size={15} className="text-red-500" /> : <Wifi size={15} className="text-green-500" />}
          Jibble Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${result == null ? "bg-gray-300" : result.connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-xs text-gray-600">
              {result == null ? "Status unknown"
                : result.connected ? `Connected${result.organization ? ` — org: ${result.organization.slice(0, 8)}…` : ""}`
                : `Failed: ${result.error ?? "unknown error"}`}
            </span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            onClick={() => mutation.mutate(undefined, { onSuccess: setResult, onError: () => setResult({ connected: false, error: "Network error" }) })}
            disabled={mutation.isPending}>
            <RefreshCw size={12} className={mutation.isPending ? "animate-spin" : ""} />
            Test Connection
          </Button>
        </div>
        {result?.connected && (
          <div className="flex items-center gap-2 text-xs text-green-600">
            <CheckCircle2 size={12} />
            Last verified: {new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
          </div>
        )}
        <p className="text-[11px] text-gray-400">Credentials stored securely in site config. Admin only.</p>
      </CardContent>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AttendancePage() {
  const { user } = useAuth()
  const isAdmin = user && ADMIN_USERS.has(user.name)

  const [mainTab, setMainTab] = useState<"attendance" | "leave">("attendance")
  const [preset, setPreset] = useState<Preset>("last3")
  const [customFrom, setCustomFrom] = useState(isoDate(addDays(todayDate(), -2)))
  const [customTo, setCustomTo] = useState(isoDate(todayDate()))

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === "custom") return { dateFrom: customFrom, dateTo: customTo }
    const r = presetRange(preset)
    return { dateFrom: r.from, dateTo: r.to }
  }, [preset, customFrom, customTo])

  const rangeQuery = useAttendanceRange(dateFrom, dateTo)
  const lastSynced = rangeQuery.data?.success
    ? formatSynced((rangeQuery.data as { last_synced?: string }).last_synced)
    : null

  const bustCache = useJibbleBustCache()
  const handleRefresh = () => {
    bustCache.mutate({ dateFrom, dateTo })
  }

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="p-6 max-w-6xl space-y-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Attendance & Leave</h1>
          <p className="text-sm text-gray-500 mt-0.5">Powered by Jibble · Admin only</p>
        </div>
        {mainTab === "attendance" && <JibbleSettingsPanel />}
      </div>

      {/* Main tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["attendance", "leave"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className={`text-sm font-medium px-5 py-2 rounded-lg transition-colors ${
              mainTab === tab ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "attendance" ? "Attendance" : "Leave Requests"}
          </button>
        ))}
      </div>

      {mainTab === "attendance" && (
        <>
          {/* Live Status */}
          <LiveStatusSection />

          {/* Date Range Picker + Attendance Table */}
          <DateRangePicker
            preset={preset}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onPreset={(p) => setPreset(p)}
            onCustomChange={(f, t) => { setPreset("custom"); setCustomFrom(f); setCustomTo(t) }}
            lastSynced={lastSynced}
            onRefresh={handleRefresh}
            isRefreshing={bustCache.isPending || rangeQuery.isFetching}
          />
          <AttendanceTable dateFrom={dateFrom} dateTo={dateTo} />

          {/* Today's Late + Absent */}
          <LateAbsentRow />

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeeklyHoursChart />
            <OvertimeAlerts />
          </div>

          <MonthlySummaryTable />
          <ProjectsWidget />
        </>
      )}

      {mainTab === "leave" && <LeaveAdminPanel />}
    </div>
  )
}
