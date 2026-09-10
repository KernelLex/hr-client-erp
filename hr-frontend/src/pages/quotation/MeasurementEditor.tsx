// Quotation Studio · Measurement Sheet editor (Phase 2 spec §4.2). The full
// operational screen for one sheet: stage bar, header, the three registers, and
// the workflow (submit → approve, or create a revision once locked).
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { measurementGet, measurementPost } from "../peoplework/client"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
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
}

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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_measurement", name],
    queryFn: () => measurementGet<{ measurement: Measurement }>("get_measurement", { name }),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const m = data?.measurement

  function refresh() {
    qc.invalidateQueries({ queryKey: ["q_measurement", name] })
  }
  async function saveRegister(register: string, rows: GridRow[]) {
    await measurementPost("save_register", { name, register, rows })
    refresh()
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

      {/* Header card */}
      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
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
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          {m.status === "Draft" && (
            <button onClick={() => action("submit_measurement", "Submitted for review")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Submit for Review
            </button>
          )}
          {m.status === "Submitted" && (
            <button onClick={() => action("reopen_measurement", "Reopened")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--border, #e0d9cb)", color: "var(--brand-primary)" }}>
              Reopen
            </button>
          )}
          {(m.status === "Draft" || m.status === "Submitted") && (
            <button onClick={() => action("approve_measurement", "Approved — BOQ can now be built on this")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>
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
      <RegisterGrid title="Measurement Rows" columns={ROW_COLS} rows={m.rows} editable={!locked}
        onSave={(rows) => saveRegister("rows", rows)} emptyLabel="No measurement rows yet." />
      <RegisterGrid title="Obstruction Register" columns={OBSTRUCTION_COLS} rows={m.obstructions} editable={!locked}
        onSave={(rows) => saveRegister("obstructions", rows)} emptyLabel="No obstructions recorded." />
      <RegisterGrid title="Services Register" columns={SERVICE_COLS} rows={m.services} editable={!locked}
        onSave={(rows) => saveRegister("services", rows)} emptyLabel="No services recorded." />
    </div>
  )
}
