// Module header — workspace label, title, descriptive note and optional action
// buttons. Matches the reference mockup's module-head block.
import type { ReactNode } from "react"

export function ModuleHeader({
  workspaceLabel = "PEOPLE & WORK",
  title,
  note,
  actions,
}: {
  workspaceLabel?: string
  title: string
  note?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        <div
          className="text-[10px] font-semibold uppercase tracking-[1.8px]"
          style={{ color: "var(--text-secondary, #6a6a5c)" }}
        >
          {workspaceLabel}
        </div>
        <h1
          className="font-heading mt-1.5 text-[26px] font-semibold leading-tight"
          style={{ color: "var(--brand-primary)" }}
        >
          {title}
        </h1>
        {note && (
          <p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-secondary, #6a6a5c)" }}>
            {note}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
