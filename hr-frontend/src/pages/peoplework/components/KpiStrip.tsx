// KPI strip — the 4-up card row at the top of every module screen, matching
// the reference mockup's kpi-grid.
import type { Kpi } from "../types"

const TONE_COLOR: Record<string, string> = {
  good: "#16a34a",
  warn: "#b8860b",
  bad: "#dc2626",
  "": "var(--brand-primary)",
}

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  if (!kpis?.length) return null
  return (
    <div
      className="grid gap-3 mb-5"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
    >
      {kpis.map((k, i) => (
        <div
          key={`${k.label}-${i}`}
          className="rounded-xl px-4 py-3.5"
          style={{ background: "#fff", border: "var(--border-card)" }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            {k.label}
          </div>
          <div
            className="font-heading mt-2 text-[21px] font-semibold leading-none"
            style={{ color: TONE_COLOR[k.tone ?? ""] ?? TONE_COLOR[""] }}
          >
            {k.value}
          </div>
        </div>
      ))}
    </div>
  )
}
