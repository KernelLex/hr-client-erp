import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users, Briefcase, UserCheck, CalendarClock,
  Plus, UserPlus, Shield, Activity,
  CheckCircle2, XCircle, Circle, FileText, Calendar,
  Bot, ChevronDown, ChevronUp, RefreshCw, Loader2, ExternalLink,
  AlertTriangle,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { api, apiUrl } from "@/lib/api"
import { getAIHealth, type AIHealth } from "@/api/ai"

function useDefaultPasswordCheck() {
  return useQuery({
    queryKey: ["check_default_password"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.employee.check_default_password"))
      return res.data.message as { is_default: boolean }
    },
    staleTime: Infinity,
    retry: false,
  })
}

const ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard_stats"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.dashboard.get_dashboard_stats"))
      return res.data.message as {
        stats: {
          total_employees: number
          open_positions: number
          candidates_this_month: number
          interviews_today: number
        }
        recent_activity: Array<{
          action: string
          detail: string
          time: string
          dot: string
        }>
      }
    },
    staleTime: 1000 * 60,
  })
}

function StatSkeleton() {
  return (
    <div
      className="rounded-xl p-5 animate-pulse"
      style={{
        background: "#FFFFFF",
        border: "var(--border-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-8 bg-gray-300 rounded w-12" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
        <div className="h-10 w-10 bg-gray-100 rounded-full" />
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatTodayDate() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  blue: UserCheck,
  violet: Briefcase,
  emerald: CheckCircle2,
  red: XCircle,
  orange: CalendarClock,
  gray: Circle,
}

const ACTIVITY_ICON_COLORS: Record<string, string> = {
  blue: "#3B82F6",
  violet: "#7C3AED",
  emerald: "#10B981",
  red: "#EF4444",
  orange: "#F59E0B",
  gray: "#94A3B8",
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function StatusDot({ status }: { status: "green" | "yellow" | "red" | "gray" }) {
  const colors = { green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500", gray: "bg-gray-400" }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`} />
}

function AIHealthWidget({ onNavigate, onSync, onProcess }: {
  onNavigate: () => void
  onSync: () => void
  onProcess: () => void
}) {
  const [open, setOpen] = useState(false)
  const { data: health, isLoading, refetch, isFetching } = useQuery<AIHealth>({
    queryKey: ["ai-health"],
    queryFn: getAIHealth,
    staleTime: 60_000,
    refetchInterval: open ? 60_000 : false,
    enabled: open,
  })

  const scoreColor = !health ? "#94A3B8"
    : health.overall_score >= 85 ? "#16a34a"
    : health.overall_score >= 70 ? "#2563eb"
    : health.overall_score >= 50 ? "#ca8a04" : "#dc2626"

  const rtStatus = (ms: number | null): "green" | "yellow" | "red" | "gray" =>
    ms === null ? "gray" : ms < 2000 ? "green" : ms < 5000 ? "yellow" : "red"

  const syncDotColor = (h: string): "green" | "yellow" | "red" | "gray" =>
    h === "good" ? "green" : h === "ok" ? "yellow" : h === "stale" ? "red" : "gray"

  const extractionDotColor = (rate: number): "green" | "yellow" | "red" =>
    rate >= 80 ? "green" : rate >= 50 ? "yellow" : "red"

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">AI & System Health</p>
            <p className="text-xs text-gray-400">
              {health ? `${health.overall_score}/100 · ${health.overall_label}` : "Click to load"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <span className="text-xl font-bold" style={{ color: scoreColor }}>{health.overall_score}</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-50">
          <div className="flex justify-between items-center py-3">
            <p className="text-xs text-gray-400">Auto-refreshes every 60s</p>
            <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          )}

          {health && !isLoading && (
            <div className="space-y-3">
              {/* Overall bar */}
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">Overall Score</span>
                  <span className="text-sm font-bold" style={{ color: scoreColor }}>{health.overall_score}/100 — {health.overall_label}</span>
                </div>
                <ProgressBar value={health.overall_score} color={scoreColor} />
              </div>

              {/* 4-column grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Vera AI */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusDot status={health.ollama.status === "healthy" ? "green" : health.ollama.status === "offline" ? "red" : "yellow"} />
                    <span className="text-xs font-semibold text-gray-700">Vera AI</span>
                  </div>
                  <p className="text-xs text-gray-500">{health.ollama.status === "healthy" ? "Online" : health.ollama.status === "offline" ? "Offline" : health.ollama.status}</p>
                  {health.ollama.model && <p className="text-xs text-gray-400">{health.ollama.model}</p>}
                  {health.ollama.response_time_ms !== null && (
                    <div className="flex items-center gap-1 mt-1">
                      <StatusDot status={rtStatus(health.ollama.response_time_ms)} />
                      <span className="text-xs text-gray-500">{health.ollama.response_time_ms}ms</span>
                    </div>
                  )}
                  <button onClick={() => { }} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700">Test AI</button>
                </div>

                {/* Extraction */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusDot status={extractionDotColor(health.extraction.success_rate)} />
                    <span className="text-xs font-semibold text-gray-700">Extraction</span>
                  </div>
                  <p className="text-xs text-gray-500">{health.extraction.success_rate}% success</p>
                  <p className="text-xs text-gray-400">{health.extraction.processed} done · {health.extraction.pending} pending</p>
                  <ProgressBar value={health.extraction.success_rate} color="#6366f1" />
                  {health.extraction.pending > 0 && (
                    <button onClick={onProcess} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700">⚡ Process Pending</button>
                  )}
                </div>

                {/* Drive Sync */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusDot status={syncDotColor(health.drive_sync.sync_health)} />
                    <span className="text-xs font-semibold text-gray-700">Drive Sync</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {health.drive_sync.hours_ago !== null
                      ? health.drive_sync.hours_ago < 1
                        ? `${Math.round(health.drive_sync.hours_ago * 60)}m ago`
                        : `${health.drive_sync.hours_ago}h ago`
                      : "Never synced"}
                  </p>
                  <p className="text-xs text-gray-400">{health.drive_sync.files_found} files · {health.drive_sync.last_sync_status || "—"}</p>
                  <button onClick={onSync} className="mt-2 text-xs text-indigo-500 hover:text-indigo-700">🔄 Sync Now</button>
                </div>

                {/* Data Quality */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusDot status={extractionDotColor(health.data_quality.quality_score)} />
                    <span className="text-xs font-semibold text-gray-700">Data Quality</span>
                  </div>
                  <p className="text-xs text-gray-500">{health.data_quality.quality_score}% quality</p>
                  <p className="text-xs text-gray-400">{health.data_quality.total_structured} records · {health.data_quality.with_amounts} with amounts</p>
                  <ProgressBar value={health.data_quality.quality_score} color="#16a34a" />
                </div>
              </div>

              <button
                onClick={onNavigate}
                className="w-full text-sm text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1.5 py-2 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors"
              >
                View Full AI Insights <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user && ADMIN_USERS.has(user.name)
  const { data, isLoading } = useDashboardStats()
  const { data: pwCheck } = useDefaultPasswordCheck()
  const showPasswordBanner = pwCheck?.is_default === true

  const stats = data?.stats
  const activity = data?.recent_activity ?? []

  const STAT_CARDS = [
    {
      label: "Total Employees",
      value: stats?.total_employees ?? "—",
      sub: "Active employees",
      icon: Users,
      iconBg: "#EEF2FF",
      iconColor: "#4F46E5",
    },
    {
      label: "Open Positions",
      value: stats?.open_positions ?? "—",
      sub: "Job openings",
      icon: Briefcase,
      iconBg: "#F5F3FF",
      iconColor: "#7C3AED",
    },
    {
      label: "Candidates",
      value: stats?.candidates_this_month ?? "—",
      sub: "This month",
      icon: UserCheck,
      iconBg: "#ECFDF5",
      iconColor: "#10B981",
    },
    {
      label: "Interviews Today",
      value: stats?.interviews_today ?? "—",
      sub: "Scheduled today",
      icon: CalendarClock,
      iconBg: "#FFFBEB",
      iconColor: "#F59E0B",
    },
  ]

  const QUICK_ACTIONS = [
    {
      label: "Post New Job",
      icon: Plus,
      bg: "#4F46E5",
      hover: "#3730A3",
      onClick: () => navigate("/recruitment"),
    },
    {
      label: "Add Candidate",
      icon: UserPlus,
      bg: "#7C3AED",
      hover: "#6D28D9",
      onClick: () => navigate("/recruitment"),
    },
    {
      label: "Schedule Interview",
      icon: Calendar,
      bg: "#059669",
      hover: "#047857",
      onClick: () => navigate("/recruitment"),
    },
  ]

  return (
    <div className="p-6 max-w-5xl space-y-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-bold" style={{ fontSize: "26px", color: "var(--text-primary)" }}>
            {getGreeting()}{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Here's what's happening today.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {formatTodayDate()}
          </p>
        </div>
      </div>

      {/* Default password warning banner */}
      {showPasswordBanner && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            You are still using the default password. Please change it before going live.
          </p>
          <button
            onClick={() => navigate("/my-profile")}
            className="text-sm font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 flex-shrink-0"
          >
            Change password
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : STAT_CARDS.map(({ label, value, sub, icon: Icon, iconBg, iconColor }) => (
              <div
                key={label}
                className="rounded-xl p-5 cursor-default transition-all duration-200"
                style={{
                  background: "#FFFFFF",
                  border: "var(--border-card)",
                  boxShadow: "var(--shadow-card)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"
                  e.currentTarget.style.transform = "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "var(--shadow-card)"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
                    <p
                      className="font-extrabold mt-1 leading-none"
                      style={{ fontSize: "32px", color: "var(--text-primary)" }}
                    >
                      {value}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>
                  </div>
                  <div
                    className="rounded-full p-2.5 shrink-0"
                    style={{ backgroundColor: iconBg }}
                  >
                    <Icon size={18} style={{ color: iconColor }} />
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <Card
          className="lg:col-span-2 border-0"
          style={{
            background: "#FFFFFF",
            border: "var(--border-card)",
            boxShadow: "var(--shadow-card)",
            borderRadius: "var(--radius-card)",
          }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="font-semibold" style={{ fontSize: "15px", color: "var(--text-primary)" }}>
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pt-0">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-3 animate-pulse">
                  <div className="w-6 h-6 bg-gray-100 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                  <div className="h-3 bg-gray-100 rounded w-12" />
                </div>
              ))
            ) : activity.length === 0 ? (
              <div className="text-center py-10">
                <FileText size={32} className="mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No activity yet — add job openings and candidates to get started.
                </p>
              </div>
            ) : (
              activity.map(({ action, detail, time, dot }, i) => {
                const IconComp = ACTIVITY_ICONS[dot] ?? Circle
                const iconColor = ACTIVITY_ICON_COLORS[dot] ?? "#94A3B8"
                const isLast = i === activity.length - 1
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-3 transition-colors"
                    style={{
                      borderBottom: isLast ? "none" : "1px solid #F1F5F9",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F8FAFC")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${iconColor}18` }}
                    >
                      <IconComp size={13} style={{ color: iconColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{action}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{detail}</p>
                    </div>
                    <span className="text-[11px] shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }}>{time}</span>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card
          className="border-0"
          style={{
            background: "#FFFFFF",
            border: "var(--border-card)",
            boxShadow: "var(--shadow-card)",
            borderRadius: "var(--radius-card)",
          }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="font-semibold" style={{ fontSize: "15px", color: "var(--text-primary)" }}>
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {QUICK_ACTIONS.map(({ label, icon: Icon, bg, hover, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="w-full flex items-center gap-2.5 text-sm font-semibold text-white transition-all duration-150"
                style={{
                  backgroundColor: bg,
                  borderRadius: "var(--radius-button)",
                  padding: "10px 16px",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = hover
                  e.currentTarget.style.boxShadow = `0 4px 12px ${bg}4D`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = bg
                  e.currentTarget.style.boxShadow = "none"
                }}
              >
                <Icon size={15} className="text-white opacity-90" />
                {label}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/attendance")}
                className="w-full flex items-center gap-2.5 text-sm font-semibold transition-all duration-150"
                style={{
                  backgroundColor: "#ECFDF5",
                  color: "#065F46",
                  borderRadius: "var(--radius-button)",
                  padding: "10px 16px",
                  border: "1px solid #6EE7B7",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#D1FAE5"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ECFDF5"
                }}
              >
                <Activity size={15} style={{ color: "#059669" }} />
                Live Attendance
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/permissions")}
                className="w-full flex items-center gap-2.5 text-sm font-semibold transition-all duration-150"
                style={{
                  backgroundColor: "#F5F3FF",
                  color: "#4C1D95",
                  borderRadius: "var(--radius-button)",
                  padding: "10px 16px",
                  border: "1px solid #DDD6FE",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#EDE9FE"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#F5F3FF"
                }}
              >
                <Shield size={15} style={{ color: "#7C3AED" }} />
                Role Control
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI & System Health — admin only */}
      {isAdmin && (
        <AIHealthWidget
          onNavigate={() => navigate("/ai-insights")}
          onSync={async () => {
            try {
              await api.post(apiUrl("vera_drive.api.sync_now"), {})
            } catch { /* ignore */ }
          }}
          onProcess={() => navigate("/business")}
        />
      )}
    </div>
  )
}
