// Quotation Studio · Measurement Sheet editor (Phase 2 spec §4.2). The full
// operational screen for one sheet: stage bar, header, the three registers, and
// the workflow (submit → approve, or create a revision once locked).
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { measurementGet, measurementPost, measurementTemplateGet, measurementTemplatePost } from "../peoplework/client"
import { uploadChatFile } from "../../api/chat"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
import { DocumentLinkBar } from "./components/DocumentLinkBar"
import { RegisterGrid, type GridCol, type GridRow } from "./components/RegisterGrid"

interface Measurement {
  name: string
  measurement_title: string
  opportunity: string | null
  company_name: string | null
  measurement_type: string
  measurement_date: string | null
  drawing_reference: string | null
  stage: string
  status: string
  revision: number
  measured_by: string | null
  approved_by: string | null
  approved_on: string | null
  supersedes: string | null
  notes: string | null
  editable: boolean
  rows: GridRow[]
  obstructions: GridRow[]
  services: GridRow[]
  photos: PhotoRow[]
}

interface PhotoRow { image: string; area?: string | null; caption?: string | null }

const ROW_COLS: GridCol[] = [
  { key: "area", label: "Area", width: 90 },
  { key: "reference_code", label: "Ref", width: 70 },
  { key: "product", label: "Product", width: 130 },
  { key: "template", label: "Template", width: 100 },
  { key: "description", label: "Description", width: 150 },
  { key: "width", label: "W (mm)", type: "number", width: 70 },
  { key: "height", label: "H (mm)", type: "number", width: 70 },
  { key: "depth", label: "D (mm)", type: "number", width: 70 },
  { key: "quantity", label: "Qty", type: "number", width: 55 },
  { key: "uom", label: "UOM", width: 60 },
  { key: "site_condition", label: "Site Condition", width: 110 },
  { key: "note", label: "Note", width: 120 },
]
const OBSTRUCTION_COLS: GridCol[] = [
  { key: "obstruction_type", label: "Type", type: "select", options: ["Column", "Window", "Beam", "Switchboard", "Duct"], width: 110 },
  { key: "wall", label: "Wall", width: 60 },
  { key: "width", label: "W (mm)", type: "number", width: 70 },
  { key: "height", label: "H (mm)", type: "number", width: 70 },
  { key: "distance_from_left", label: "From Left (mm)", type: "number", width: 100 },
  { key: "distance_from_floor", label: "From Floor (mm)", type: "number", width: 105 },
  { key: "handling_note", label: "Handling Note", width: 150 },
]
const SERVICE_COLS: GridCol[] = [
  { key: "service_type", label: "Type", type: "select", options: ["Plumbing", "Electrical", "Data", "Gas"], width: 100 },
  { key: "sub_description", label: "Sub-description", width: 140 },
  { key: "wall", label: "Wall", width: 60 },
  { key: "x_coord", label: "X (mm)", type: "number", width: 70 },
  { key: "y_coord", label: "Y (mm)", type: "number", width: 70 },
  { key: "readiness_status", label: "Readiness", type: "select", options: ["Pending", "Ready", "Not Applicable"], width: 110 },
]

export function MeasurementEditor() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [tpl, setTpl] = useState("")

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_measurement", name],
    queryFn: () => measurementGet<{ measurement: Measurement }>("get_measurement", { name }),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const m = data?.measurement

  const { data: templates } = useQuery({
    queryKey: ["measurement_templates"],
    queryFn: () => measurementTemplateGet<{ templates: { name: string; label: string }[] }>("list_templates"),
    staleTime: 5 * 60 * 1000,
  })
  async function applyTemplate() {
    if (!tpl) { toast.error("Pick a template"); return }
    setBusy("tpl")
    try {
      await measurementTemplatePost("apply_template", { measurement: name, template: tpl, mode: "append" })
      toast.success("Template rows added"); setTpl(""); refresh()
    } catch (e) { toast.error((e as Error)?.message ?? "Could not apply") } finally { setBusy(null) }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["q_measurement", name] })
  }
  async function saveRegister(register: string, rows: GridRow[]) {
    await measurementPost("save_register", { name, register, rows })
    refresh()
  }
  async function savePhotos(rows: PhotoRow[]) {
    await measurementPost("save_register", { name, register: "photos", rows })
    refresh()
  }
  function updatePhotoField(i: number, field: "area" | "caption", value: string) {
    if (!m || (m.photos[i]?.[field] ?? "") === value) return
    savePhotos(m.photos.map((p, j) => (j === i ? { ...p, [field]: value } : p)))
  }
  async function onUploadPhotos(files: FileList | null) {
    if (!files?.length || !m) return
    setBusy("photo")
    try {
      const next = [...m.photos]
      for (const f of Array.from(files)) {
        const r = await uploadChatFile(f)
        next.push({ image: r.file_url, area: "", caption: "" })
      }
      await savePhotos(next)
      toast.success("Photos added")
    } catch (e) { toast.error((e as Error)?.message ?? "Upload failed") } finally { setBusy(null) }
  }
  async function action(endpoint: string, label: string, then?: (res: { name?: string }) => void) {
    setBusy(endpoint)
    try {
      const res = await measurementPost<{ name?: string }>(endpoint, { name })
      toast.success(label)
      if (then) then(res)
      else refresh()
    } catch (e) {
      toast.error((e as Error)?.message ?? "Action failed")
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !m)
    return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const locked = !m.editable

  const HeaderCell = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm" style={{ color: "var(--text-primary)" }}>{value || "—"}</div>
    </div>
  )

  return (
    <div className="p-6">
      <button
        onClick={() => navigate("/quotation/measurements")}
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} /> Measurement Sheets
      </button>

      <StageBar current="Measurement" />
      <DocumentLinkBar doctype="Vera Measurement Sheet" name={name} />

      {/* Header card */}
      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff" }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold" style={{ color: "var(--brand-primary)" }}>
              {m.measurement_title}
            </h1>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {m.name} · Rev {String(m.revision).padStart(2, "0")}
              {m.supersedes && ` · supersedes ${m.supersedes}`}
            </div>
          </div>
          <StatusPill value={m.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HeaderCell label="Client" value={m.company_name} />
          <HeaderCell label="Type" value={m.measurement_type} />
          <HeaderCell label="Date" value={m.measurement_date} />
          <HeaderCell label="Drawing Ref" value={m.drawing_reference} />
          <HeaderCell label="Measured By" value={m.measured_by} />
          {m.opportunity && <HeaderCell label="Opportunity" value={m.opportunity} />}
          {m.approved_by && <HeaderCell label="Approved By" value={m.approved_by} />}
          {m.approved_on && <HeaderCell label="Approved On" value={String(m.approved_on).slice(0, 16)} />}
        </div>

        {/* Workflow */}
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border, #E3E3E3)" }}>
          {m.status === "Draft" && (
            <button onClick={() => action("submit_measurement", "Submitted for review")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Submit for Review
            </button>
          )}
          {m.status === "Submitted" && (
            <button onClick={() => action("reopen_measurement", "Reopened")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--border, #E3E3E3)", color: "var(--brand-primary)" }}>
              Reopen
            </button>
          )}
          {(m.status === "Draft" || m.status === "Submitted") && (
            <button onClick={() => action("approve_measurement", "Approved — BOQ can now be built on this")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #171717)" }}>
              Approve
            </button>
          )}
          {(m.status === "Approved" || m.status === "Superseded") && (
            <button
              onClick={() => action("create_revision", "Revision created", (res) => { if (res.name) navigate(`/quotation/measurements/${res.name}`) })}
              disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Create Revision
            </button>
          )}
          {locked && (
            <span className="self-center text-xs" style={{ color: "var(--text-muted)" }}>
              {m.status === "Approved" ? "Locked — approved. Create a revision to change." :
               m.status === "Superseded" ? "Superseded by a newer revision." :
               "Locked for review. Reopen to edit."}
            </span>
          )}
        </div>
      </div>

      {/* Registers */}
      {!locked && (templates?.templates.length ?? 0) > 0 && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Start from a template:</span>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="rounded px-2 py-1 text-xs" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff", color: "var(--text-primary)" }}>
            <option value="">Choose product type…</option>
            {templates!.templates.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
          </select>
          <button onClick={applyTemplate} disabled={busy === "tpl" || !tpl} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>Apply</button>
        </div>
      )}
      <RegisterGrid title="Measurement Rows" columns={ROW_COLS} rows={m.rows} editable={!locked}
        onSave={(rows) => saveRegister("rows", rows)} emptyLabel="No measurement rows yet." />
      <RegisterGrid title="Obstruction Register" columns={OBSTRUCTION_COLS} rows={m.obstructions} editable={!locked}
        onSave={(rows) => saveRegister("obstructions", rows)} emptyLabel="No obstructions recorded." />
      <RegisterGrid title="Services Register" columns={SERVICE_COLS} rows={m.services} editable={!locked}
        onSave={(rows) => saveRegister("services", rows)} emptyLabel="No services recorded." />

      {/* Site photos (§11) — capture the site per area alongside the dimensions. */}
      <div className="mt-4 rounded-xl p-4 shadow-sm" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff" }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Site Photos {m.photos.length > 0 && `(${m.photos.length})`}
          </div>
          {!locked && (
            <label className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
              {busy === "photo" ? "Uploading…" : "+ Add photos"}
              <input type="file" accept="image/*" multiple className="hidden" disabled={busy === "photo"}
                onChange={(e) => { onUploadPhotos(e.target.files); e.target.value = "" }} />
            </label>
          )}
        </div>
        {m.photos.length === 0 ? (
          <div className="py-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>No site photos yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {m.photos.map((p, i) => (
              <div key={i} className="overflow-hidden rounded-lg" style={{ border: "0.5px solid var(--border, #E3E3E3)" }}>
                <a href={p.image} target="_blank" rel="noreferrer">
                  <img src={p.image} alt={p.caption || `Site photo ${i + 1}`} className="h-32 w-full object-cover" />
                </a>
                <div className="space-y-1 p-1.5">
                  {locked ? (
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{[p.area, p.caption].filter(Boolean).join(" · ") || "—"}</div>
                  ) : (
                    <>
                      <input defaultValue={p.area ?? ""} placeholder="Area" onBlur={(e) => updatePhotoField(i, "area", e.target.value)}
                        className="w-full rounded px-1.5 py-0.5 text-[11px]" style={{ border: "0.5px solid var(--border, #E3E3E3)" }} />
                      <div className="flex items-center gap-1">
                        <input defaultValue={p.caption ?? ""} placeholder="Caption" onBlur={(e) => updatePhotoField(i, "caption", e.target.value)}
                          className="w-full rounded px-1.5 py-0.5 text-[11px]" style={{ border: "0.5px solid var(--border, #E3E3E3)" }} />
                        <button title="Remove" onClick={() => savePhotos(m.photos.filter((_, j) => j !== i))}
                          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: "#dc2626", border: "0.5px solid #fecaca" }}>✕</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
