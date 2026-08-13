// RecordDrawer — a generic right-side slide-over form used by every operational
// system to create/edit records. Renders fields from a FieldSpec[] and submits
// the collected values. Kept dependency-light (theme-styled native inputs) so it
// works consistently across all People & Work systems.
import { useEffect, useState } from "react"
import { X } from "lucide-react"

export type FieldType = "text" | "textarea" | "number" | "date" | "datetime" | "select" | "checkbox"

export interface FieldSpec {
  name: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  /** For select fields. */
  options?: { value: string; label: string }[]
  default?: string | number | boolean
  /** Optional half-width layout for compact side-by-side fields. */
  half?: boolean
  help?: string
}

export type DrawerValues = Record<string, string | number | boolean>

function initialValues(fields: FieldSpec[]): DrawerValues {
  const v: DrawerValues = {}
  for (const f of fields) {
    if (f.default !== undefined) v[f.name] = f.default
    else if (f.type === "checkbox") v[f.name] = false
    else v[f.name] = ""
  }
  return v
}

export function RecordDrawer({
  open,
  title,
  subtitle,
  fields,
  submitLabel = "Save",
  submitting = false,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  subtitle?: string
  fields: FieldSpec[]
  submitLabel?: string
  submitting?: boolean
  onClose: () => void
  onSubmit: (values: DrawerValues) => void
}) {
  const [values, setValues] = useState<DrawerValues>(() => initialValues(fields))
  const [error, setError] = useState<string | null>(null)

  // Reset the form each time the drawer opens.
  useEffect(() => {
    if (open) {
      setValues(initialValues(fields))
      setError(null)
    }
  }, [open, fields])

  if (!open) return null

  function set(name: string, val: string | number | boolean) {
    setValues((prev) => ({ ...prev, [name]: val }))
  }

  function handleSubmit() {
    for (const f of fields) {
      if (f.required && (values[f.name] === "" || values[f.name] === undefined || values[f.name] === null)) {
        setError(`${f.label} is required`)
        return
      }
    }
    setError(null)
    onSubmit(values)
  }

  const inputStyle: React.CSSProperties = {
    border: "var(--border-card)",
    background: "#fff",
    color: "var(--text-primary)",
  }

  return (
    <div className="fixed inset-0 z-[500] flex justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(30,58,47,0.45)" }} onClick={submitting ? undefined : onClose} />
      <div className="relative flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          <div>
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--brand-primary)" }}>
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-gray-100" style={{ color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-x-3 gap-y-4">
            {fields.map((f) => (
              <div key={f.name} className={f.half ? "w-[calc(50%-6px)]" : "w-full"}>
                {f.type !== "checkbox" && (
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary, #6a6a5c)" }}>
                    {f.label}
                    {f.required && <span style={{ color: "#dc2626" }}> *</span>}
                  </label>
                )}
                {f.type === "textarea" ? (
                  <textarea
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    rows={4}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                ) : f.type === "select" ? (
                  <select
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={{ ...inputStyle, background: "#fff", color: "#111827" }}
                  >
                    <option value="">{f.placeholder ?? "Select..."}</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(values[f.name])}
                      onChange={(e) => set(f.name, e.target.checked)}
                      className="h-4 w-4"
                    />
                    {f.label}
                  </label>
                ) : (
                  <input
                    type={f.type === "datetime" ? "datetime-local" : f.type}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full rounded-md px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                )}
                {f.help && <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{f.help}</p>}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-md px-3 py-2 text-xs" style={{ background: "#fdeaea", color: "#dc2626" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ border: "var(--border-card)", color: "var(--text-primary)", background: "#fff" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-primary)" }}
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
