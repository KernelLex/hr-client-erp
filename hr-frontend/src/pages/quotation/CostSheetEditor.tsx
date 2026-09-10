// Quotation Studio · Cost Sheet editor (Phase 2 spec §4.4). One cost sheet:
// stage bar, the costing figures (base → overhead → total, projected GP with a
// red/amber/green tone), the editable GP targets that drive the §4.6 approval
// engine, the snapshotted cost lines, and the workflow.
import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Save } from "lucide-react"
import { toast } from "sonner"
import { costSheetGet, costSheetPost } from "../peoplework/client"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
import { RegisterGrid, type GridCol, type GridRow } from "./components/RegisterGrid"

interface CostSheet {
  name: string
  cost_title: string
  opportunity: string | null
  boq: string | null
  company_name: string | null
  stage: string
  status: string
  revision: number
  prepared_by: string | null
  approved_by: string | null
  approved_on: string | null
  supersedes: string | null
  base_cost: number
  overhead_percent: number
  total_cost: number
  selling_total: number
  projected_gp: number
  projected_gp_percent: number
  target_gp_percent: number
  min_gp_percent: number
  gp_tone: "red" | "amber" | "green"
  notes: string | null
  editable: boolean
  lines: GridRow[]
}

const LINE_COLS: GridCol[] = [
  { key: "area", label: "Area", width: 90 },
  { key: "unit_name", label: "Unit", width: 160 },
  { key: "item_code", label: "Item Code", width: 110 },
  { key: "calc_qty", label: "Calc Qty", width: 90 },
  { key: "cost_rate", label: "Cost Rate", width: 100 },
  { key: "cost_amount", label: "Cost Amount", width: 110 },
]

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0)
const TONE = { red: "#dc2626", amber: "#d97706", green: "#15803d" }

export function CostSheetEditor() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ overhead_percent: "", target_gp_percent: "", min_gp_percent: "" })
  const [dirty, setDirty] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_cost_sheet", name],
    queryFn: () => costSheetGet<{ cost_sheet: CostSheet }>("get_cost_sheet", { name }),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const c = data?.cost_sheet

  useEffect(() => {
    if (c) setForm({
      overhead_percent: String(c.overhead_percent ?? ""),
      target_gp_percent: String(c.target_gp_percent ?? ""),
      min_gp_percent: String(c.min_gp_percent ?? ""),
    })
  }, [c?.name, c?.overhead_percent, c?.target_gp_percent, c?.min_gp_percent])

  function refresh() { qc.invalidateQueries({ queryKey: ["q_cost_sheet", name] }) }
  function setField(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); setDirty(true) }

  async function saveTargets() {
    setBusy("save")
    try {
      await costSheetPost("update_cost_sheet", { name, payload: form })
      toast.success("Cost sheet updated")
      setDirty(false)
      refresh()
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not save")
    } finally {
      setBusy(null)
    }
  }
  async function action(endpoint: string, label: string, then?: (res: { name?: string }) => void) {
    setBusy(endpoint)
    try {
      const res = await costSheetPost<{ success: boolean; name?: string; error?: string }>(endpoint, { name })
      if (res.success === false) { toast.error(res.error ?? "Action failed"); refresh() }
      else { toast.success(label); if (then) then(res); else refresh() }
    } catch (e) {
      toast.error((e as Error)?.message ?? "Action failed")
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !c)
    return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const locked = !c.editable

  const Cell = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: tone ?? "var(--text-primary)" }}>{value ?? "—"}</div>
    </div>
  )
  const numInput = (k: keyof typeof form, label: string) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <input
        type="number" value={form[k]} disabled={locked}
        onChange={(e) => setField(k, e.target.value)}
        className="mt-0.5 w-full rounded px-2 py-1 text-sm disabled:opacity-60"
        style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff", color: "var(--text-primary)" }}
      />
    </div>
  )

  return (
    <div className="p-6">
      <button onClick={() => navigate("/quotation/cost-sheets")} className="mb-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Cost Sheets
      </button>

      <StageBar current="Costing" />

      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold" style={{ color: "var(--brand-primary)" }}>{c.cost_title}</h1>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {c.name} · Rev {String(c.revision).padStart(2, "0")}
              {c.boq && ` · from ${c.boq}`}
              {c.supersedes && ` · supersedes ${c.supersedes}`}
            </div>
          </div>
          <StatusPill value={c.status} />
        </div>

        {/* Costing figures */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cell label="Base Cost" value={inr(c.base_cost)} />
          <Cell label="Total Cost" value={<strong>{inr(c.total_cost)}</strong>} />
          <Cell label="Selling Total (BOQ)" value={inr(c.selling_total)} />
          <Cell label="Projected GP" value={`${inr(c.projected_gp)} · ${c.projected_gp_percent?.toFixed(1)}%`} tone={TONE[c.gp_tone]} />
        </div>

        {/* Editable overhead + GP targets */}
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
            {numInput("overhead_percent", "Overhead %")}
            {numInput("target_gp_percent", "Target GP %")}
            {numInput("min_gp_percent", "Minimum GP %")}
            {!locked && (
              <button onClick={saveTargets} disabled={!dirty || busy === "save"}
                className="inline-flex h-[34px] items-center justify-center gap-1 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
                <Save size={14} /> {busy === "save" ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Target and minimum GP % drive the quotation approval engine (§4.6).
          </p>
        </div>

        {/* Workflow */}
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          {c.status === "Draft" && (
            <button onClick={() => action("submit_cost_sheet", "Submitted for review")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Submit for Review
            </button>
          )}
          {c.status === "Submitted" && (
            <button onClick={() => action("reopen_cost_sheet", "Reopened")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--border, #e0d9cb)", color: "var(--brand-primary)" }}>
              Reopen
            </button>
          )}
          {(c.status === "Draft" || c.status === "Submitted") && (
            <button onClick={() => action("approve_cost_sheet", "Approved — stamped for the quotation & sales order")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>
              Approve
            </button>
          )}
          {(c.status === "Approved" || c.status === "Superseded") && (
            <button onClick={() => action("create_revision", "Revision created", (res) => { if (res.name) navigate(`/quotation/cost-sheets/${res.name}`) })} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Create Revision
            </button>
          )}
          {locked && (
            <span className="self-center text-xs" style={{ color: "var(--text-muted)" }}>
              {c.status === "Approved" ? "Locked — approved. Create a revision to change." :
               c.status === "Superseded" ? "Superseded by a newer revision." :
               "Locked for review. Reopen to edit."}
            </span>
          )}
        </div>
      </div>

      <RegisterGrid title="Cost Lines (from BOQ)" columns={LINE_COLS} rows={c.lines} editable={false}
        onSave={async () => {}} emptyLabel="No cost lines." />
    </div>
  )
}
