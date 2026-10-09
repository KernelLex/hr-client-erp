import { ADMIN_USERS } from "@/lib/constants"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Briefcase, UserCheck, CalendarClock,
  Plus, UserPlus, Shield, Activity,
  CheckCircle2, XCircle, Circle, FileText, Calendar,
  Bot, ChevronDown, ChevronUp, RefreshCw, Loader2, ExternalLink,
  AlertTriangle, TrendingUp, TrendingDown, Wallet,
} from "lucide-react"
import { useTallySummary, formatDate as tallyFmtDate } from "@/api/tally"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { useCompany, ALL_COMPANIES } from "@/context/CompanyContext"
import { GroupConsole } from "@/pages/GroupConsole"
import { api, apiUrl } from "@/lib/api"
import { getAIHealth, type AIHealth } from "@/api/ai"
import { getDeliveryDashboard, isLogisticsHandler } from "@/api/logistics"
import { Truck } from "lucide-react"
import { PageHeader } from "@/components/dashboard"

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

// Monochrome activity icons — differentiated by glyph, not hue. "red" keeps the
// one sanctioned safety colour for genuine error events.
const ACTIVITY_ICON_COLORS: Record<string, string> = {
  blue: "var(--text-secondary)",
  violet: "var(--text-primary)",
  emerald: "var(--text-primary)",
  red: "var(--color-danger)",
  orange: "var(--text-secondary)",
  gray: "var(--text-tertiary)",
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function StatusDot({ status }: { status: "green" | "yellow" | "red" | "gray" }) {
  // Monochrome: good = ink, ok = mid-grey, bad = safety red, unknown = light.
  const colors: Record<string, string> = {
    green: "var(--text-primary)",
    yellow: "var(--text-tertiary)",
    red: "var(--color-danger)",
    gray: "var(--border-default)",
  }
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[status] }} />
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

  // Monochrome: higher score = darker ink; only a failing score uses safety red.
  const scoreColor = !health ? "var(--text-tertiary)"
    : health.overall_score >= 85 ? "var(--text-primary)"
    : health.overall_score >= 70 ? "var(--text-secondary)"
    : health.overall_score >= 50 ? "var(--text-tertiary)" : "var(--color-danger)"

  const rtStatus = (ms: number | null): "green" | "yellow" | "red" | "gray" =>
    ms === null ? "gray" : ms < 2000 ? "green" : ms < 5000 ? "yellow" : "red"

  const syncDotColor = (h: string): "green" | "yellow" | "red" | "gray" =>
    h === "good" ? "green" : h === "ok" ? "yellow" : h === "stale" ? "red" : "gray"

  const extractionDotColor = (rate: number): "green" | "yellow" | "red" =>
    rate >= 80 ? "green" : rate >= 50 ? "yellow" : "red"

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-card)" }}>
      <button
        className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--overlay-hover)]"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--bg-inverse)" }}>
            <Bot className="w-4 h-4" style={{ color: "var(--text-inverse)" }} />
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
            <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
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
                  <button onClick={() => { }} className="mt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Test AI</button>
                </div>

                {/* Extraction */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusDot status={extractionDotColor(health.extraction.success_rate)} />
                    <span className="text-xs font-semibold text-gray-700">Extraction</span>
                  </div>
                  <p className="text-xs text-gray-500">{health.extraction.success_rate}% success</p>
                  <p className="text-xs text-gray-400">{health.extraction.processed} done · {health.extraction.pending} pending</p>
                  <ProgressBar value={health.extraction.success_rate} color="var(--text-primary)" />
                  {health.extraction.pending > 0 && (
                    <button onClick={onProcess} className="mt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">▸ Process Pending</button>
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
                  <button onClick={onSync} className="mt-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">↻ Sync Now</button>
                </div>

                {/* Data Quality */}
                <div className="border rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <StatusDot status={extractionDotColor(health.data_quality.quality_score)} />
                    <span className="text-xs font-semibold text-gray-700">Data Quality</span>
                  </div>
                  <p className="text-xs text-gray-500">{health.data_quality.quality_score}% quality</p>
                  <p className="text-xs text-gray-400">{health.data_quality.total_structured} records · {health.data_quality.with_amounts} with amounts</p>
                  <ProgressBar value={health.data_quality.quality_score} color="var(--text-primary)" />
                </div>
              </div>

              <button
                onClick={onNavigate}
                className="w-full text-sm flex items-center justify-center gap-1.5 py-2 border rounded-xl transition-colors text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--overlay-hover)]"
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

const DELIVERY_TONE: Record<string, { bg: string; fg: string }> = {
  "Pending": { bg: "var(--bg-subtle)", fg: "var(--text-secondary)" },
  "Ready for Dispatch": { bg: "#eff6ff", fg: "#1e40af" },
  "Dispatched": { bg: "#eef2ff", fg: "#3730a3" },
  "In Transit": { bg: "#fffbeb", fg: "#92400e" },
  "Delivered": { bg: "#ecfdf5", fg: "#065f46" },
  "Cancelled": { bg: "#fef2f2", fg: "#991b1b" },
}

// Visible to the LOGISTICS department and ADMINS only. Always rendered for them
// (even with zero deliveries). The quick-add is shown ONLY to the person who
// handles logistics (see is_logistics_handler on the backend) — not to admins.
function DeliveriesWidget({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = !!user && ADMIN_USERS.has(user.name)
  const { data: isHandler } = useQuery({
    queryKey: ["is-logistics-handler"],
    queryFn: isLogisticsHandler,
    staleTime: 5 * 60_000,
  })
  const canSee = isAdmin || !!isHandler
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-dashboard"],
    queryFn: getDeliveryDashboard,
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: canSee,
  })
  if (!canSee) return null
  if (isLoading) return null
  if (!data) return null
  const isEmpty = data.total === 0

  return (
    <Card className="border-0" style={{ background: "#FFFFFF", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="font-semibold flex items-center gap-2" style={{ fontSize: "15px", color: "var(--text-primary)" }}>
          <Truck size={16} /> Deliveries
        </CardTitle>
        <div className="flex items-center gap-3">
          {(isHandler || isAdmin) && (
            <button
              onClick={() => navigate("/logistics?new=1")}
              className="text-xs flex items-center gap-1 font-medium px-2.5 py-1 rounded-md text-white"
              style={{ background: "var(--bg-inverse)" }}
            >
              <Plus size={13} /> New delivery
            </button>
          )}
          <button onClick={onNavigate} className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
            View all <ExternalLink size={12} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* status counts */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="In progress" value={data.in_progress} tone="var(--text-primary)" />
          <Stat label="Delivered" value={data.counts["Delivered"] ?? 0} tone="#065f46" />
          <Stat label="Total" value={data.total} tone="var(--text-secondary)" />
        </div>
        {isEmpty ? (
          <div className="py-6 text-center" style={{ color: "var(--text-tertiary)" }}>
            <Truck size={26} className="mx-auto mb-1.5 opacity-30" />
            <p className="text-[12px]">
              No deliveries yet.
              {(isHandler || isAdmin) ? " Add one to start tracking dispatch & proof of delivery." : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.recent.slice(0, 6).map((d) => (
              <div key={d.name} className="flex items-start justify-between gap-3 py-1.5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{d.customer_name || d.delivery_title}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    {d.goods && d.goods.length ? d.goods.join(", ") : `${d.item_count} item(s)`}
                  </p>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: DELIVERY_TONE[d.status]?.bg, color: DELIVERY_TONE[d.status]?.fg }}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-subtle)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-xl font-semibold" style={{ color: tone }}>{value}</p>
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeCompany } = useCompany()
  const isAdmin = user && ADMIN_USERS.has(user.name)
  const { data, isLoading } = useDashboardStats()
  const { data: pwCheck } = useDefaultPasswordCheck()
  const { data: tallySnap } = useTallySummary()
  const showPasswordBanner = pwCheck?.is_default === true

  const activity = data?.recent_activity ?? []

  const QUICK_ACTIONS = [
    { label: "Post New Job", icon: Plus, onClick: () => navigate("/recruitment") },
    { label: "Add Candidate", icon: UserPlus, onClick: () => navigate("/recruitment") },
    { label: "Schedule Interview", icon: Calendar, onClick: () => navigate("/recruitment") },
  ]

  // Group console — Owais viewing "All companies". Placed after all hooks to
  // respect the Rules of Hooks.
  if (activeCompany === ALL_COMPANIES) {
    return (
      <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
        <div className="px-6 md:px-7 py-6">
          <GroupConsole />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <PageHeader
        workspaceLabel="Vera Enterprises Workspace"
        title={`${getGreeting()}${user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}`}
        right={
          <div className="text-xs px-3.5 py-1.5 rounded-full" style={{ background: "#fff", border: "var(--border-card)", color: "var(--text-secondary)" }}>
            {formatTodayDate()}
          </div>
        }
      />
      <div className="px-6 md:px-7 pb-8 space-y-6">

      {/* Default password warning banner */}
      {showPasswordBanner && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: "1px solid var(--border-strong)", background: "var(--bg-subtle)" }}>
          <AlertTriangle size={18} className="flex-shrink-0" style={{ color: "var(--text-primary)" }} />
          <p className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>
            You are still using the default password. Please change it before going live.
          </p>
          <button
            onClick={() => navigate("/my-profile")}
            className="text-sm font-medium underline underline-offset-2 flex-shrink-0"
            style={{ color: "var(--text-primary)" }}
          >
            Change password
          </button>
        </div>
      )}

      {/* Tally Financial Snapshot — admin only, top of the dashboard */}
      {isAdmin && tallySnap && (
        <Card
          className="border-0"
          style={{ background: "#FFFFFF", border: "var(--border-card)", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius-card)" }}
        >
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="font-semibold flex items-center gap-2" style={{ fontSize: "15px", color: "var(--text-primary)" }}>
              <Activity size={16} /> Tally Financial Snapshot
              <span className="text-[11px] font-normal" style={{ color: "var(--text-tertiary)" }}>as of {tallyFmtDate(tallySnap.as_of)}</span>
            </CardTitle>
            <button onClick={() => navigate("/accounting")} className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              Full view <ExternalLink size={12} />
            </button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Cash + Bank",   value: tallySnap.cash_bank,    icon: Wallet,       tone: "var(--text-primary)" },
                { label: "Receivables",   value: tallySnap.receivables,  icon: TrendingUp,   tone: "#065f46" },
                { label: "Payables",      value: tallySnap.payables,     icon: TrendingDown, tone: "#991b1b" },
                { label: "FY Sales",      value: tallySnap.fy_sales,     icon: TrendingUp,   tone: "var(--text-primary)" },
                { label: "FY Purchases",  value: tallySnap.fy_purchases, icon: TrendingDown, tone: "var(--text-primary)" },
                { label: "Net GST Due",   value: tallySnap.net_gst,      icon: FileText,     tone: "var(--text-primary)" },
              ].map(({ label, value, icon: Icon, tone }) => (
                <div key={label} className="rounded-xl px-4 py-3 border" style={{ background: "var(--bg-subtle)", borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon size={12} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>{label}</span>
                  </div>
                  <p className="font-mono text-xl font-bold leading-tight" style={{ color: tone }}>{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deliveries — company-wide status + goods, visible to everyone */}
      <DeliveriesWidget onNavigate={() => navigate("/logistics")} />

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
                const iconColor = ACTIVITY_ICON_COLORS[dot] ?? "#a6a6a6"
                const isLast = i === activity.length - 1
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-3 transition-colors"
                    style={{
                      borderBottom: isLast ? "none" : "1px solid #f5f5f5",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fafafa")}
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
            {/* Primary quick actions — solid ink (monochrome) */}
            {QUICK_ACTIONS.map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="w-full flex items-center gap-2.5 text-sm font-semibold transition-colors duration-150"
                style={{
                  backgroundColor: "var(--bg-inverse)",
                  color: "var(--text-inverse)",
                  borderRadius: "var(--radius-button)",
                  padding: "10px 16px",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88" }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
              >
                <Icon size={15} style={{ color: "var(--text-inverse)", opacity: 0.9 }} />
                {label}
              </button>
            ))}
            {/* Admin actions — secondary (outlined) so they read as distinct */}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/attendance")}
                className="w-full flex items-center gap-2.5 text-sm font-semibold transition-colors duration-150 hover:bg-[var(--overlay-hover)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  borderRadius: "var(--radius-button)",
                  padding: "10px 16px",
                  border: "1px solid var(--border-control)",
                  cursor: "pointer",
                }}
              >
                <Activity size={15} style={{ color: "var(--text-secondary)" }} />
                Live Attendance
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/permissions")}
                className="w-full flex items-center gap-2.5 text-sm font-semibold transition-colors duration-150 hover:bg-[var(--overlay-hover)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  borderRadius: "var(--radius-button)",
                  padding: "10px 16px",
                  border: "1px solid var(--border-control)",
                  cursor: "pointer",
                }}
              >
                <Shield size={15} style={{ color: "var(--text-secondary)" }} />
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
    </div>
  )
}
