import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Clock, RefreshCw, CalendarDays, AlertCircle } from "lucide-react"
import { getMyAttendance, type MyAttendanceRow } from "@/api/employee"

// ── Date helpers ──────────────────────────────────────────────────────────────
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

type Preset = "week" | "last7" | "month" | "last30"

function rangeFor(p: Preset): { from: string; to: string } {
  const today = new Date()
  switch (p) {
    case "week": {
      // Monday-based week start
      const dow = (today.getDay() + 6) % 7
      return { from: iso(addDays(today, -dow)), to: iso(today) }
    }
    case "last7":  return { from: iso(addDays(today, -6)), to: iso(today) }
    case "month":  return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) }
    case "last30": return { from: iso(addDays(today, -29)), to: iso(today) }
  }
}

function StatusBadge({ status }: { status?: MyAttendanceRow["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    on_time: { label: "On time", cls: "bg-[var(--bg-subtle)] text-[var(--text-primary)]" },
    late:    { label: "Late",    cls: "bg-amber-100 text-amber-800" },
    working: { label: "Working", cls: "bg-[var(--bg-subtle)] text-[var(--text-primary)]" },
    absent:  { label: "Absent",  cls: "bg-red-100 text-red-700" },
  }
  const s = map[status ?? ""] ?? { label: "—", cls: "bg-gray-100 text-gray-500" }
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border-subtle)" }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-2xl font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  )
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "week",   label: "This Week" },
  { key: "last7",  label: "Last 7 Days" },
  { key: "month",  label: "This Month" },
  { key: "last30", label: "Last 30 Days" },
]

export function MyAttendanceContent() {
  const [preset, setPreset] = useState<Preset>("week")
  const { from, to } = useMemo(() => rangeFor(preset), [preset])

  const { data, isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ["my-attendance", from, to],
    queryFn: () => getMyAttendance(from, to),
    staleTime: 60_000,
    retry: 1,
  })

  const summary = data?.summary

  return (
    <div className="p-6 space-y-5 min-h-full">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-xl">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className="text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors"
              style={preset === p.key
                ? { background: "var(--bg-card, #fff)", color: "var(--text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }
                : { color: "var(--text-tertiary)" }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border hover:bg-[var(--overlay-hover)]"
          style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Not linked / error states */}
      {data && data.linked === false && (
        <div className="flex items-start gap-3 rounded-xl border p-4 bg-amber-50" style={{ borderColor: "#fde68a" }}>
          <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-900">Attendance not linked yet</p>
            <p className="text-sm text-amber-800 mt-0.5">{data.message || "Your time-tracking profile isn't linked. Please contact your admin."}</p>
          </div>
        </div>
      )}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl border p-4 bg-red-50" style={{ borderColor: "#fecaca" }}>
          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">Couldn't load your attendance right now. Try Refresh in a moment.</p>
        </div>
      )}

      {/* Summary */}
      {summary && data?.linked && (
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          <StatCard label="Present Days" value={String(summary.present_days)} />
          <StatCard label="Total Hours" value={summary.total_hours.toFixed(1)} />
          <StatCard label="Late Days" value={String(summary.late_days)} />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)", borderTopColor: "transparent" }} />
        </div>
      ) : data?.linked ? (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>
                {["Date", "Clock In", "Clock Out", "Hours", "Break", "Status"].map((h) => (
                  <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.data || []).map((d) => {
                const e = d.entry
                return (
                  <tr key={d.date} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{d.date_label}</td>
                    <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{e?.clock_in ?? "—"}</td>
                    <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{e?.clock_out ?? "—"}</td>
                    <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-primary)" }}>{e && e.hours ? e.hours.toFixed(2) : "—"}</td>
                    <td className="py-2.5 px-3" style={{ color: "var(--text-tertiary)" }}>{e && e.break_minutes ? `${e.break_minutes}m` : "—"}</td>
                    <td className="py-2.5 px-3"><StatusBadge status={e?.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {data?.last_synced && (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Powered by Jibble · synced {new Date(data.last_synced).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  )
}

// Full standalone page (for the /attendance route used by non-admins)
export function MyAttendancePage() {
  return (
    <div className="min-h-full">
      <div className="px-6 pt-6 flex items-center gap-2.5">
        <Clock size={20} style={{ color: "var(--text-secondary)" }} />
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>My Attendance</h1>
          <p className="text-sm flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
            <CalendarDays size={12} /> Your clock-in / clock-out history
          </p>
        </div>
      </div>
      <MyAttendanceContent />
    </div>
  )
}

export default MyAttendancePage
