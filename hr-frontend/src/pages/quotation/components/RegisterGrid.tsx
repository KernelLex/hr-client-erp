// RegisterGrid — a lightweight editable grid for a measurement register
// (measurement rows / obstructions / services). Dependency-light theme-styled
// inputs, matching RecordDrawer. Holds its own draft rows; the parent supplies
// the initial rows and a save handler. Read-only when `editable` is false.
import { useEffect, useState } from "react"
import { Plus, Trash2, Save } from "lucide-react"
import { toast } from "sonner"

export interface GridCol {
  key: string
  label: string
  type?: "text" | "number" | "select"
  options?: string[]
  width?: number
  /** Server-computed column — always rendered as read-only text. */
  readOnly?: boolean
}

export type GridRow = Record<string, string | number | null>

export function RegisterGrid({
  title,
  columns,
  rows,
  editable,
  onSave,
  emptyLabel = "No entries yet.",
}: {
  title: string
  columns: GridCol[]
  rows: GridRow[]
  editable: boolean
  onSave: (rows: GridRow[]) => Promise<unknown>
  emptyLabel?: string
}) {
  const [draft, setDraft] = useState<GridRow[]>(rows)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(rows)
    setDirty(false)
  }, [rows])

  function update(i: number, key: string, val: string) {
    setDraft((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)))
    setDirty(true)
  }
  function addRow() {
    setDraft((prev) => [...prev, Object.fromEntries(columns.map((c) => [c.key, ""])) as GridRow])
    setDirty(true)
  }
  function removeRow(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }
  async function save() {
    setSaving(true)
    try {
      // strip fully-empty rows
      const clean = draft.filter((r) => columns.some((c) => String(r[c.key] ?? "").trim() !== ""))
      await onSave(clean)
      toast.success(`${title} saved`)
      setDirty(false)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    border: "0.5px solid var(--border, #e0d9cb)",
    background: "#fff",
    color: "var(--text-primary)",
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>
          {title} <span style={{ color: "var(--text-muted)" }}>({draft.length})</span>
        </h3>
        {editable && (
          <div className="flex items-center gap-2">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ border: "0.5px solid var(--border, #e0d9cb)", color: "var(--brand-primary)" }}
            >
              <Plus size={13} /> Add row
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--brand-primary)" }}
            >
              <Save size={13} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--cream-dark, #ebe3d3)" }}>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5 text-left font-semibold" style={{ color: "var(--text-primary)", minWidth: c.width }}>
                  {c.label}
                </th>
              ))}
              {editable && <th className="w-8 px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {draft.length === 0 && (
              <tr>
                <td colSpan={columns.length + (editable ? 1 : 0)} className="px-3 py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  {emptyLabel}
                </td>
              </tr>
            )}
            {draft.map((r, i) => (
              <tr key={i} style={{ borderTop: "0.5px solid var(--border, #e0d9cb)" }}>
                {columns.map((c) => (
                  <td key={c.key} className="px-1.5 py-1">
                    {!editable || c.readOnly ? (
                      <span style={{ color: c.readOnly ? "var(--text-muted)" : "var(--text-primary)" }}>{String(r[c.key] ?? "") || "—"}</span>
                    ) : c.type === "select" ? (
                      <select
                        value={String(r[c.key] ?? "")}
                        onChange={(e) => update(i, c.key, e.target.value)}
                        className="w-full rounded px-1.5 py-1 text-xs"
                        style={{ ...inputStyle, background: "#fff" }}
                      >
                        <option value="">—</option>
                        {(c.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={c.type === "number" ? "number" : "text"}
                        value={String(r[c.key] ?? "")}
                        onChange={(e) => update(i, c.key, e.target.value)}
                        className="w-full rounded px-1.5 py-1 text-xs"
                        style={inputStyle}
                      />
                    )}
                  </td>
                ))}
                {editable && (
                  <td className="px-1.5 py-1 text-center">
                    <button onClick={() => removeRow(i)} className="rounded p-1 hover:bg-red-50" style={{ color: "#dc2626" }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
