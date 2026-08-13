// ArchetypePage — the generic renderer that powers every People & Work screen.
// Give it a fetcher that returns a ModulePayload envelope; it renders the module
// header, KPI strip, and either a sortable table or a kanban board. This mirrors
// the archetype system in the SL_ERP_UI_v2 reference mockup: one renderer, many
// screens.
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { ModuleHeader } from "./components/ModuleHeader"
import { KpiStrip } from "./components/KpiStrip"
import { KanbanBoard } from "./components/KanbanBoard"
import { StatusPill, PriorityPill } from "./components/Pills"
import type { Column, ModulePayload, Row } from "./types"

function renderCell(col: Column, row: Row): ReactNode {
  const raw = row[col.key]
  const val = raw === null || raw === undefined ? "" : String(raw)
  switch (col.kind) {
    case "status":
      return <StatusPill value={val} />
    case "priority":
      return <PriorityPill value={val} />
    case "amount":
      return val || "—"
    case "number":
      return val === "" ? "—" : val
    default:
      return val || <span style={{ color: "var(--text-muted)" }}>—</span>
  }
}

function toDataTableColumns(columns: Column[]): DataTableColumn<Row>[] {
  return columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align === "right" ? "right" : "left",
    sortable: true,
    className: c.align === "center" ? "text-center" : undefined,
    sortValue: (r: Row) => {
      const v = r[c.key]
      if (c.kind === "number" && typeof v === "number") return v
      return v === null || v === undefined ? "" : String(v)
    },
    render: (r: Row) => renderCell(c, r),
  }))
}

export interface ArchetypePageProps {
  /** React Query cache key — unique per screen. */
  queryKey: string
  /** Fetcher returning the archetype envelope. */
  fetcher: () => Promise<ModulePayload>
  title: string
  workspaceLabel?: string
  /** Falls back to the note supplied by the backend payload. */
  note?: string
  actions?: ReactNode
  onRowClick?: (row: Row) => void
  searchPlaceholder?: string
}

export function ArchetypePage({
  queryKey,
  fetcher,
  title,
  workspaceLabel,
  note,
  actions,
  onRowClick,
  searchPlaceholder = "Search records...",
}: ArchetypePageProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [queryKey],
    queryFn: fetcher,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  })

  const columns = data?.columns ?? []
  const rows = data?.rows ?? []
  const searchText = (r: Row) => columns.map((c) => String(r[c.key] ?? "")).join(" ")

  return (
    <div className="p-6">
      <ModuleHeader workspaceLabel={workspaceLabel} title={title} note={note ?? data?.note} actions={actions} />

      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl" style={{ background: "var(--cream-dark, #ebe3d3)" }} />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl" style={{ background: "var(--cream-dark, #ebe3d3)" }} />
        </div>
      )}

      {isError && (
        <div className="rounded-xl px-4 py-6 text-sm" style={{ background: "#fdeaea", color: "#dc2626", border: "0.5px solid #f3c2c2" }}>
          Could not load this screen: {(error as Error)?.message ?? "unknown error"}
        </div>
      )}

      {data && !isLoading && !isError && (
        <>
          <KpiStrip kpis={data.kpis} />
          {data.kanban && data.kanban_status_key ? (
            <KanbanBoard
              columns={columns}
              rows={rows}
              statusKey={data.kanban_status_key}
              lanes={data.kanban_lanes}
              onCardClick={onRowClick}
            />
          ) : (
            <DataTable<Row>
              columns={toDataTableColumns(columns)}
              rows={rows}
              rowKey={(r) => String(r[columns[0]?.key ?? ""] ?? Math.random())}
              searchText={searchText}
              searchPlaceholder={searchPlaceholder}
              onRowClick={onRowClick}
              stickyHeader
              emptyMessage="No records yet."
            />
          )}
        </>
      )}
    </div>
  )
}
