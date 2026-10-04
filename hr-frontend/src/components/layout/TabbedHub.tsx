import { useSearchParams } from "react-router-dom"
import { cn } from "@/lib/utils"

/**
 * TabbedHub — bundles several existing pages under one monochrome tab bar so the
 * sidebar can carry a single entry instead of many. It renders ONLY the active
 * tab (so just that page's queries run), and syncs the active tab to `?tab=` so
 * refreshes and deep-links work. No feature is removed — each tab is the exact
 * existing page component; the original routes also remain for direct links.
 */
export interface HubTab {
  key: string
  label: string
  element: React.ReactNode
}

export function TabbedHub({
  title,
  subtitle,
  tabs,
  crumb,
}: {
  title: string
  subtitle?: string
  tabs: HubTab[]
  crumb?: string
}) {
  const [params, setParams] = useSearchParams()
  const activeKey = params.get("tab") && tabs.some((t) => t.key === params.get("tab"))
    ? (params.get("tab") as string)
    : tabs[0].key
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <div className="px-6 md:px-7 pt-6 pb-2">
        {crumb && <div className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{crumb}</div>}
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-.015em" }}>{title}</h1>
        {subtitle && <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>}

        <div className="ui-seg mt-4 flex-wrap" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === active.key}
              onClick={() => setParams((prev) => { const p = new URLSearchParams(prev); p.set("tab", t.key); return p }, { replace: true })}
              className={cn("whitespace-nowrap")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Only the active page mounts — keeps data fetching scoped to one tab. */}
      <div>{active.element}</div>
    </div>
  )
}
