import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw, Loader2, Zap, PlugZap, Clock3, CircleCheck, CircleAlert } from "lucide-react"

// ── CSRF + API helpers (same contract as the rest of the Tally page) ─────────────
function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}
async function apiFetch(method: string) {
  const res = await fetch(`/api/method/${method}`, { credentials: "include" })
  if (!res.ok) throw new Error(`Failed: ${method}`)
  return (await res.json()).message
}
async function apiPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": getCsrf() },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Request failed")
  return json.message
}

interface SyncSettings {
  enabled: boolean
  company: string
  interval_minutes: string
  only_when_changed: boolean
  sync_now: boolean
  last_status: string | null
  last_message: string | null
  last_alterid: string | null
  last_sync_start: string | null
  last_sync_end: string | null
  agent_last_seen: string | null
}
interface ImportStatus { status: string; progress: number; message: string; error?: string }
interface SyncStatusResp {
  settings: SyncSettings
  import_status: ImportStatus
  agent_configured: boolean
  allowed_intervals: string[]
}

const INTERVAL_LABELS: Record<string, string> = {
  "15": "Every 15 minutes", "30": "Every 30 minutes", "60": "Every hour",
  "180": "Every 3 hours", "360": "Every 6 hours", "720": "Every 12 hours", "1440": "Once a day",
}

function ago(iso: string | null): string {
  if (!iso) return "never"
  const t = new Date(iso.replace(" ", "T")).getTime()
  if (Number.isNaN(t)) return iso
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function ContinuousSyncPanel() {
  const q = useQuery<SyncStatusResp>({
    queryKey: ["tally-sync-status"],
    queryFn: () => apiFetch("hr_client.api.tally_sync.get_tally_sync_status"),
    refetchInterval: 15000,
    staleTime: 0,
  })

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Local mirror so toggles/select feel instant; re-synced whenever the query returns.
  const [draft, setDraft] = useState<Pick<SyncSettings, "enabled" | "interval_minutes" | "only_when_changed"> | null>(null)
  useEffect(() => {
    if (q.data?.settings) {
      setDraft({
        enabled: q.data.settings.enabled,
        interval_minutes: q.data.settings.interval_minutes,
        only_when_changed: q.data.settings.only_when_changed,
      })
    }
  }, [q.data?.settings.enabled, q.data?.settings.interval_minutes, q.data?.settings.only_when_changed])

  async function save(patch: Record<string, unknown>) {
    setBusy(true); setErr(null)
    try {
      await apiPost("hr_client.api.tally_sync.update_tally_sync_settings", patch)
      await q.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed") }
    finally { setBusy(false) }
  }
  async function syncNow() {
    setBusy(true); setErr(null)
    try {
      await apiPost("hr_client.api.tally_sync.trigger_sync_now", {})
      await q.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed") }
    finally { setBusy(false) }
  }

  const s = q.data?.settings
  const imp = q.data?.import_status
  const importing = imp?.status === "running"

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlugZap className="w-4 h-4 text-[var(--text-secondary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Continuous Sync (optional)</h3>
        </div>
        <button onClick={() => q.refetch()} className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
        Keeps Tally data fresh automatically using a small optional agent on the Tally PC —
        no manual uploads. Manual upload above still works and is unaffected.
      </p>

      {q.isLoading || !s || !draft ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {!q.data?.agent_configured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>The server agent token isn’t set yet, so the agent can’t connect. Set
                <code className="font-mono"> tally_agent_token</code> in the site config, then install the
                agent on the Tally PC. You can still configure the schedule here in the meantime.</span>
            </div>
          )}

          {/* Enabled toggle */}
          <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
            <span className="text-sm text-[var(--text-primary)]">Enabled</span>
            <input type="checkbox" checked={draft.enabled} disabled={busy}
              onChange={(e) => { setDraft({ ...draft, enabled: e.target.checked }); save({ enabled: e.target.checked ? 1 : 0 }) }}
              className="h-4 w-4 accent-[var(--text-primary)]" />
          </label>

          {/* Interval */}
          <label className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm text-[var(--text-primary)] inline-flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Sync every
            </span>
            <select value={draft.interval_minutes} disabled={busy}
              onChange={(e) => { setDraft({ ...draft, interval_minutes: e.target.value }); save({ interval_minutes: e.target.value }) }}
              className="bg-white text-gray-900 text-sm rounded-lg border border-[var(--border-subtle)] px-3 py-1.5">
              {(q.data?.allowed_intervals ?? Object.keys(INTERVAL_LABELS)).map((iv) => (
                <option key={iv} value={iv}>{INTERVAL_LABELS[iv] ?? `${iv} min`}</option>
              ))}
            </select>
          </label>

          {/* Only when changed */}
          <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
            <span className="text-sm text-[var(--text-primary)]">Only sync when Tally data changed</span>
            <input type="checkbox" checked={draft.only_when_changed} disabled={busy}
              onChange={(e) => { setDraft({ ...draft, only_when_changed: e.target.checked }); save({ only_when_changed: e.target.checked ? 1 : 0 }) }}
              className="h-4 w-4 accent-[var(--text-primary)]" />
          </label>

          {/* Sync Now */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-[var(--text-secondary)]">
              {s.sync_now ? "A manual sync is queued for the next agent check." : "Force a sync on the next agent check."}
            </span>
            <button onClick={syncNow} disabled={busy || s.sync_now}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-40 bg-[var(--text-primary)]">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Sync Now
            </button>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          {/* Status strip */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-primary)] grid grid-cols-2 gap-y-1.5 gap-x-4">
            <div className="flex items-center gap-1.5">
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5 text-emerald-600" />}
              <span className="text-[var(--text-secondary)]">Import:</span>
              <span className="font-medium">{importing ? `${imp?.progress}% ${imp?.message}` : (imp?.status ?? "idle")}</span>
            </div>
            <div><span className="text-[var(--text-secondary)]">Agent seen:</span> <span className="font-medium">{ago(s.agent_last_seen)}</span></div>
            <div><span className="text-[var(--text-secondary)]">Last status:</span> <span className="font-medium">{s.last_status ?? "—"}</span></div>
            <div><span className="text-[var(--text-secondary)]">Last sync:</span> <span className="font-medium">{ago(s.last_sync_end)}</span></div>
            {s.last_message && <div className="col-span-2 text-[var(--text-secondary)] truncate" title={s.last_message}>“{s.last_message}”</div>}
          </div>
        </>
      )}
    </div>
  )
}
