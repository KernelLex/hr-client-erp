// Kanban board for task-style screens (Personal Tasks, Team Tasks, Onboarding,
// Training, Exit). Groups rows into lanes by a status key and renders compact
// cards. Matches the reference mockup's kanban archetype.
import type { Column, Row } from "../types"
import { PriorityPill, StatusPill } from "./Pills"

const LANE_ACCENT: Record<string, string> = {
  good: "#16a34a",
  warn: "#c8a45c",
  bad: "#dc2626",
  info: "#1e3a2f",
}

function laneAccent(lane: string): string {
  const v = lane.toLowerCase()
  if (/(done|completed|complete|approved|closed|joined|cleared)/.test(v)) return LANE_ACCENT.good
  if (/(progress|review|pending|scheduled|todo|to do|open|not started)/.test(v)) return LANE_ACCENT.warn
  if (/(overdue|rejected|blocked|cancelled|failed)/.test(v)) return LANE_ACCENT.bad
  return LANE_ACCENT.info
}

export function KanbanBoard({
  columns,
  rows,
  statusKey,
  lanes,
  onCardClick,
}: {
  columns: Column[]
  rows: Row[]
  statusKey: string
  lanes?: string[]
  onCardClick?: (row: Row) => void
}) {
  // Derive lanes from data when not supplied.
  const laneNames =
    lanes && lanes.length
      ? lanes
      : Array.from(new Set(rows.map((r) => String(r[statusKey] ?? "Other"))))

  // Pick the first text-ish column as the card title, and a few others as meta.
  const titleCol = columns.find((c) => c.kind !== "status" && c.kind !== "priority") ?? columns[0]
  const priorityCol = columns.find((c) => c.kind === "priority")
  const metaCols = columns.filter(
    (c) => c.key !== titleCol?.key && c.key !== statusKey && c.kind !== "priority"
  )

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {laneNames.map((lane) => {
        const laneRows = rows.filter((r) => String(r[statusKey] ?? "Other") === lane)
        return (
          <div
            key={lane}
            className="flex-shrink-0 w-[260px] rounded-xl p-2.5"
            style={{ background: "var(--cream)", border: "var(--border-card)" }}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: laneAccent(lane) }} />
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--brand-primary)" }}>
                  {lane}
                </span>
              </div>
              <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                {laneRows.length}
              </span>
            </div>
            <div className="space-y-2">
              {laneRows.map((row, i) => (
                <div
                  key={i}
                  onClick={onCardClick ? () => onCardClick(row) : undefined}
                  className={`rounded-lg bg-white p-2.5 ${onCardClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
                  style={{ border: "var(--border-card)" }}
                >
                  <div className="text-[13px] font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                    {String(row[titleCol?.key ?? ""] ?? "—")}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {metaCols.slice(0, 3).map((c) => {
                      const val = row[c.key]
                      if (val === null || val === undefined || val === "") return null
                      return (
                        <span key={c.key}>
                          <span className="opacity-70">{c.header}: </span>
                          {String(val)}
                        </span>
                      )
                    })}
                  </div>
                  {priorityCol && row[priorityCol.key] ? (
                    <div className="mt-2">
                      <PriorityPill value={String(row[priorityCol.key])} />
                    </div>
                  ) : null}
                </div>
              ))}
              {laneRows.length === 0 && (
                <div className="px-1 py-3 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Nothing here
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Re-export so ArchetypePage can render status pills for card status if needed.
export { StatusPill }
