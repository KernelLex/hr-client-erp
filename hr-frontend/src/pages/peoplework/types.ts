// Shared archetype types for the People & Work workspace. The backend returns
// a uniform "envelope" for every screen so one generic page can render them all,
// exactly like the archetype renderers in the SL_ERP_UI_v2 reference mockup.

export type Tone = "" | "good" | "warn" | "bad"

/** Semantics for a column's cells — drives how the frontend renders each value. */
export type ColumnKind =
  | "text"
  | "number"
  | "amount" // pre-formatted currency string from backend
  | "status" // rendered as a status pill
  | "priority" // rendered as a priority pill
  | "date"

export interface Kpi {
  label: string
  value: string
  tone?: Tone
}

export interface Column {
  key: string
  header: string
  align?: "left" | "right" | "center"
  kind?: ColumnKind
}

export type Row = Record<string, string | number | null | undefined>

export interface ModulePayload {
  kpis: Kpi[]
  columns: Column[]
  rows: Row[]
  note: string
  /** When true, the page renders a kanban board instead of a table. */
  kanban?: boolean
  /** Row key that holds the status/lane value for kanban grouping. */
  kanban_status_key?: string
  /** Ordered lane names for the kanban board. */
  kanban_lanes?: string[]
}
