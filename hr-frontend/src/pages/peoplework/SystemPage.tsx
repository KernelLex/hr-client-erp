// SystemPage — the operational wrapper around ArchetypePage. Adds a "+ New"
// create drawer and a per-row detail drawer with workflow actions (approve,
// complete, etc.), and refreshes the list after any mutation. Every People &
// Work system (tasks, notes, shifts, leave, payroll, ...) is built on this so
// the admin can actually operate the module, not just view it.
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "./ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "./components/RecordDrawer"
import { StatusPill, PriorityPill } from "./components/Pills"
import type { Column, ModulePayload, Row } from "./types"

export interface CreateSpec {
  label?: string
  drawerTitle: string
  subtitle?: string
  submitLabel?: string
  fields: FieldSpec[]
  submit: (values: DrawerValues) => Promise<unknown>
  successMessage?: string
}

export interface RowAction {
  label: string
  /** primary = filled brand button, danger = red, default = outline */
  variant?: "primary" | "danger" | "default"
  /** When set, prompt for a reason string and pass it to run(). */
  reasonLabel?: string
  run: (row: Row, reason?: string) => Promise<unknown>
  successMessage?: string
  /** Optionally hide the action for a given row. */
  hidden?: (row: Row) => boolean
}

export interface DetailSpec {
  title?: (row: Row) => string
  actions?: RowAction[]
}

export function SystemPage({
  queryKey,
  title,
  fetcher,
  note,
  searchPlaceholder,
  create,
  detail,
}: {
  queryKey: string
  title: string
  fetcher: () => Promise<ModulePayload>
  note?: string
  searchPlaceholder?: string
  create?: CreateSpec
  detail?: DetailSpec
}) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activeRow, setActiveRow] = useState<Row | null>(null)
  const [reason, setReason] = useState("")
  const [busyAction, setBusyAction] = useState<string | null>(null)

  function refresh() {
    qc.invalidateQueries({ queryKey: [queryKey] })
  }

  async function handleCreate(values: DrawerValues) {
    if (!create) return
    setSubmitting(true)
    try {
      await create.submit(values)
      toast.success(create.successMessage ?? "Created")
      setCreateOpen(false)
      refresh()
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not save")
    } finally {
      setSubmitting(false)
    }
  }

  async function runAction(a: RowAction) {
    if (!activeRow) return
    if (a.reasonLabel && !reason.trim()) {
      toast.error(`${a.reasonLabel} is required`)
      return
    }
    setBusyAction(a.label)
    try {
      await a.run(activeRow, reason.trim() || undefined)
      toast.success(a.successMessage ?? "Done")
      setActiveRow(null)
      setReason("")
      refresh()
    } catch (e) {
      toast.error((e as Error)?.message ?? "Action failed")
    } finally {
      setBusyAction(null)
    }
  }

  const actions = create ? (
    <button
      onClick={() => setCreateOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
      style={{ background: "var(--brand-primary)" }}
    >
      <Plus size={15} /> {create.label ?? "New"}
    </button>
  ) : undefined

  return (
    <>
      <ArchetypePage
        queryKey={queryKey}
        title={title}
        fetcher={fetcher}
        note={note}
        searchPlaceholder={searchPlaceholder}
        actions={actions}
        onRowClick={detail ? (row) => { setActiveRow(row); setReason("") } : undefined}
      />

      {create && (
        <RecordDrawer
          open={createOpen}
          title={create.drawerTitle}
          subtitle={create.subtitle}
          fields={create.fields}
          submitLabel={create.submitLabel}
          submitting={submitting}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      {detail && activeRow && (
        <RowDetail
          row={activeRow}
          spec={detail}
          reason={reason}
          setReason={setReason}
          busyAction={busyAction}
          onRun={runAction}
          onClose={() => { setActiveRow(null); setReason("") }}
        />
      )}
    </>
  )
}

// ── Row detail drawer ────────────────────────────────────────────────────────
function RowDetail({
  row,
  spec,
  reason,
  setReason,
  busyAction,
  onRun,
  onClose,
}: {
  row: Row
  spec: DetailSpec
  reason: string
  setReason: (v: string) => void
  busyAction: string | null
  onRun: (a: RowAction) => void
  onClose: () => void
}) {
  const actions = (spec.actions ?? []).filter((a) => !a.hidden?.(row))
  const needsReason = actions.some((a) => a.reasonLabel)
  const reasonLabel = actions.find((a) => a.reasonLabel)?.reasonLabel
  const entries = Object.entries(row).filter(([k]) => !k.startsWith("_"))

  return (
    <div className="fixed inset-0 z-[500] flex justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(30,58,47,0.45)" }} onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--brand-primary)" }}>
            {spec.title ? spec.title(row) : "Details"}
          </h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 border-b pb-2 text-sm" style={{ borderColor: "var(--border, #efeadf)" }}>
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{k}</span>
                <span className="text-right" style={{ color: "var(--text-primary)" }}>{renderVal(k, v)}</span>
              </div>
            ))}
          </div>

          {needsReason && (
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary, #6a6a5c)" }}>
                {reasonLabel}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{ border: "var(--border-card)", background: "#fff", color: "var(--text-primary)" }}
              />
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={() => onRun(a)}
                disabled={!!busyAction}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                style={
                  a.variant === "danger"
                    ? { background: "#fdeaea", color: "#dc2626" }
                    : a.variant === "primary"
                      ? { background: "var(--brand-primary)", color: "#fff" }
                      : { border: "var(--border-card)", color: "var(--text-primary)", background: "#fff" }
                }
              >
                {busyAction === a.label ? "..." : a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function renderVal(key: string, v: Row[string]): React.ReactNode {
  const s = v === null || v === undefined ? "" : String(v)
  if (!s) return <span style={{ color: "var(--text-muted)" }}>—</span>
  if (/status/i.test(key)) return <StatusPill value={s} />
  if (/priority/i.test(key)) return <PriorityPill value={s} />
  return s
}

// Re-export so screens can build column-aware create fields if needed.
export type { Column }
