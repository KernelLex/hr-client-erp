import { cn } from "@/lib/utils"

/**
 * PageShell — the single page skeleton shared by every screen in the
 * monochrome overhaul:
 *
 *   breadcrumb → title / subtitle + actions → [filter chips] → [KPI row] → content
 *
 * Migrating a page = wrapping its body in <PageShell …>. Nothing about a
 * page's behaviour changes — only its frame becomes consistent.
 */

export interface Kpi {
  label: string
  value: React.ReactNode
  delta?: React.ReactNode
}

export interface Crumb {
  label: string
  /** optional — rendered bold/leading when it is the area root */
  strong?: boolean
}

export function KpiRow({ items, className }: { items: Kpi[]; className?: string }) {
  if (!items.length) return null
  return (
    <div className={cn("grid gap-4", className)} style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0,1fr))` }}>
      {items.map((k, i) => (
        <div key={i} className="ui-kpi">
          <div className="lab">{k.label}</div>
          <div className="val">{k.value}</div>
          {k.delta != null && <div className="delta">{k.delta}</div>}
        </div>
      ))}
    </div>
  )
}

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: string[]
  value?: string
  onChange?: (v: string) => void
}) {
  const active = value ?? options[0]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="ui-chip"
          aria-pressed={o === active}
          onClick={() => onChange?.(o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function PageShell({
  crumbs,
  title,
  subtitle,
  actions,
  filters,
  kpis,
  children,
  className,
}: {
  crumbs?: Crumb[]
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  filters?: React.ReactNode
  kpis?: Kpi[]
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-7 py-6", className)} style={{ color: "var(--text-primary)" }}>
      {crumbs && crumbs.length > 0 && (
        <div className="mb-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1">/</span>}
              <span style={{ color: c.strong ? "var(--text-secondary)" : undefined, fontWeight: c.strong ? 500 : undefined }}>
                {c.label}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: "-.015em" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {filters && <div className="mt-4 flex items-center gap-2 flex-wrap">{filters}</div>}

      {kpis && kpis.length > 0 && <KpiRow items={kpis} className="mt-4" />}

      <div className="mt-4">{children}</div>
    </div>
  )
}
