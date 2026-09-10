// Quotation Studio · BOQ editor (Phase 2 spec §4.3). One BOQ: stage bar, header
// with live totals, the line grid (quantities + amounts computed server-side on
// save), a validation panel, and the workflow (submit → approve, gated on
// validation; or create a revision once locked).
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { boqGet, boqPost } from "../peoplework/client"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
import { RegisterGrid, type GridCol, type GridRow } from "./components/RegisterGrid"

interface BOQ {
  name: string
  boq_title: string
  opportunity: string | null
  measurement_sheet: string | null
  company_name: string | null
  stage: string
  status: string
  revision: number
  prepared_by: string | null
  approved_by: string | null
  approved_on: string | null
  supersedes: string | null
  notes: string | null
  total_selling: number
  total_cost: number
  editable: boolean
  lines: GridRow[]
  issues: string[]
}

const LINE_COLS: GridCol[] = [
  { key: "area", label: "Area", width: 80 },
  { key: "category", label: "Category", width: 90 },
  { key: "unit_name", label: "Unit", width: 120 },
  { key: "item_code", label: "Item Code", width: 90 },
  { key: "width", label: "W", type: "number", width: 60 },
  { key: "height", label: "H", type: "number", width: 60 },
  { key: "depth", label: "D", type: "number", width: 60 },
  { key: "quantity", label: "Qty", type: "number", width: 50 },
  { key: "pricing_method", label: "Method", type: "select", options: ["RFT", "SFT", "SQM", "UNIT", "LS"], width: 80 },
  { key: "uom", label: "UOM", width: 55 },
  { key: "calc_qty", label: "Calc Qty", readOnly: true, width: 70 },
  { key: "carcass_material", label: "Carcass Mat.", width: 110 },
  { key: "carcass_thickness", label: "Carcass Thk", width: 90 },
  { key: "internal_finish", label: "Int. Finish", width: 110 },
  { key: "shutter_material", label: "Shutter Mat.", width: 110 },
  { key: "shutter_thickness", label: "Shutter Thk", width: 90 },
  { key: "external_finish", label: "Ext. Finish", width: 110 },
  { key: "edge_banding", label: "Edge", width: 90 },
  { key: "hardware_package", label: "Hardware", width: 110 },
  { key: "selling_rate", label: "Sell Rate", type: "number", width: 80 },
  { key: "cost_rate", label: "Cost Rate", type: "number", width: 80 },
  { key: "selling_amount", label: "Sell Amt", readOnly: true, width: 90 },
  { key: "cost_amount", label: "Cost Amt", readOnly: true, width: 90 },
  { key: "line_status", label: "Status", type: "select", options: ["Draft", "Complete"], width: 90 },
]

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0)

export function BoqEditor() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_boq", name],
    queryFn: () => boqGet<{ boq: BOQ }>("get_boq", { name }),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const b = data?.boq

  function refresh() { qc.invalidateQueries({ queryKey: ["q_boq", name] }) }
  async function saveLines(rows: GridRow[]) {
    await boqPost("save_lines", { name, lines: rows })
    refresh()
  }
  async function action(endpoint: string, label: string, then?: (res: { name?: string }) => void) {
    setBusy(endpoint)
    try {
      const res = await boqPost<{ success: boolean; name?: string; issues?: string[]; error?: string }>(endpoint, { name })
      if (res.success === false) {
        toast.error(res.error ?? "Action failed")
        refresh()
      } else {
        toast.success(label)
        if (then) then(res); else refresh()
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? "Action failed")
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !b)
    return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const locked = !b.editable
  const gp = (b.total_selling || 0) - (b.total_cost || 0)
  const gpPct = b.total_selling ? (gp / b.total_selling) * 100 : 0

  const HeaderCell = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm" style={{ color: "var(--text-primary)" }}>{value || "—"}</div>
    </div>
  )

  return (
    <div className="p-6">
      <button onClick={() => navigate("/quotation/boqs")} className="mb-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> BOQ / Configuration
      </button>

      <StageBar current="BOQ" />

      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold" style={{ color: "var(--brand-primary)" }}>{b.boq_title}</h1>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {b.name} · Rev {String(b.revision).padStart(2, "0")}
              {b.measurement_sheet && ` · from ${b.measurement_sheet}`}
              {b.supersedes && ` · supersedes ${b.supersedes}`}
            </div>
          </div>
          <StatusPill value={b.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HeaderCell label="Client" value={b.company_name} />
          <HeaderCell label="Prepared By" value={b.prepared_by} />
          <HeaderCell label="Total Selling" value={<strong>{inr(b.total_selling)}</strong>} />
          <HeaderCell label="Total Cost" value={inr(b.total_cost)} />
          <HeaderCell label="Gross Profit" value={`${inr(gp)} · ${gpPct.toFixed(1)}%`} />
          {b.approved_by && <HeaderCell label="Approved By" value={b.approved_by} />}
          {b.approved_on && <HeaderCell label="Approved On" value={String(b.approved_on).slice(0, 16)} />}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          {b.status === "Draft" && (
            <button onClick={() => action("submit_boq", "Submitted for review")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Submit for Review
            </button>
          )}
          {b.status === "Submitted" && (
            <button onClick={() => action("reopen_boq", "Reopened")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--border, #e0d9cb)", color: "var(--brand-primary)" }}>
              Reopen
            </button>
          )}
          {(b.status === "Draft" || b.status === "Submitted") && (
            <button onClick={() => action("approve_boq", "Approved — cost sheet & quotation unlocked")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>
              Approve
            </button>
          )}
          {(b.status === "Approved" || b.status === "Superseded") && (
            <button onClick={() => action("create_revision", "Revision created", (res) => { if (res.name) navigate(`/quotation/boqs/${res.name}`) })} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Create Revision
            </button>
          )}
          {locked && (
            <span className="self-center text-xs" style={{ color: "var(--text-muted)" }}>
              {b.status === "Approved" ? "Locked — approved. Create a revision to change." :
               b.status === "Superseded" ? "Superseded by a newer revision." :
               "Locked for review. Reopen to edit."}
            </span>
          )}
        </div>
      </div>

      {/* Validation panel */}
      <div className="mb-5 rounded-xl p-3 text-sm" style={{
        border: "0.5px solid " + (b.issues.length ? "#f3c2c2" : "#bfe3c9"),
        background: b.issues.length ? "#fdeaea" : "#eef8f0",
      }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: b.issues.length ? "#dc2626" : "#15803d" }}>
          {b.issues.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          {b.issues.length ? `${b.issues.length} validation issue(s) — must resolve before approval` : "Validation passed — ready to approve"}
        </div>
        {b.issues.length > 0 && (
          <ul className="mt-1.5 list-disc pl-6" style={{ color: "#b91c1c" }}>
            {b.issues.map((iss, i) => <li key={i}>{iss}</li>)}
          </ul>
        )}
      </div>

      <RegisterGrid title="BOQ Lines" columns={LINE_COLS} rows={b.lines} editable={!locked}
        onSave={saveLines} emptyLabel="No lines yet. Add a line or build this BOQ on a measurement." />
    </div>
  )
}
