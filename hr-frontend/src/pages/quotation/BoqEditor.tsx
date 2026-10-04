// Quotation Studio · BOQ editor (Phase 2 spec §4.3). One BOQ: stage bar, header
// with live totals, the line grid (quantities + amounts computed server-side on
// save), a validation panel, and the workflow (submit → approve, gated on
// validation; or create a revision once locked).
import { useMemo, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { boqGet, boqPost, reclaimedGet, reclaimedPost } from "../peoplework/client"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
import { DocumentLinkBar } from "./components/DocumentLinkBar"
import { RegisterGrid, type GridCol, type GridRow } from "./components/RegisterGrid"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"

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

interface ReuseHit {
  name: string; material_title: string; spec: string; dimensions: string
  location: string; fits_unit: string; score: number; why: string; salvage_value: number
}

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0)

export function BoqEditor() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returning, setReturning] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_boq", name],
    queryFn: () => boqGet<{ boq: BOQ }>("get_boq", { name }),
    staleTime: 0,
    refetchOnMount: "always",
  })
  const b = data?.boq

  // Spec dropdowns sourced from the studio masters (§4.7) — a line's material/
  // finish/hardware then always resolves against what the validator checks.
  const { data: options } = useQuery({
    queryKey: ["q_boq_options"],
    queryFn: () => boqGet<Record<string, string[]>>("get_boq_options"),
    staleTime: 5 * 60 * 1000,
  })

  // Reclaimed stock that could be reused on this BOQ's lines (waste reduction).
  const { data: reuse } = useQuery({
    queryKey: ["boq_reclaimed", name],
    queryFn: () => reclaimedGet<{ suggestions: ReuseHit[] }>("suggest_for_boq", { boq: name }),
    staleTime: 60 * 1000,
  })
  const reuseHits = reuse?.suggestions ?? []

  // Turn the mapped free-text columns into selects; each option list is the
  // masters ∪ any value already on a line, so existing data is never dropped.
  const cols = useMemo<GridCol[]>(() => {
    if (!options) return LINE_COLS
    return LINE_COLS.map((c) => {
      const master = options[c.key]
      if (!master) return c
      const existing = (b?.lines ?? []).map((r) => String(r[c.key] ?? "").trim()).filter(Boolean)
      const opts = Array.from(new Set([...master, ...existing]))
      return { ...c, type: "select", options: opts } as GridCol
    })
  }, [options, b?.lines])

  function refresh() { qc.invalidateQueries({ queryKey: ["q_boq", name] }) }
  async function saveLines(rows: GridRow[]) {
    await boqPost("save_lines", { name, lines: rows })
    refresh()
  }
  async function reservePiece(pieceName: string) {
    setBusy("reserve:" + pieceName)
    try {
      await reclaimedPost("reserve_reclaimed", { name: pieceName, opportunity: b?.opportunity ?? undefined })
      toast.success("Reserved for this project")
      qc.invalidateQueries({ queryKey: ["boq_reclaimed", name] })
    } catch (e) { toast.error((e as Error)?.message ?? "Could not reserve") } finally { setBusy(null) }
  }
  async function returnToInventory(values: DrawerValues) {
    setReturning(true)
    try {
      const res = await reclaimedPost<{ name: string }>("create_from_boq_line", { boq: name, line: values.line, quantity: values.quantity, reason: values.reason })
      toast.success("Logged to reclaimed inventory")
      setReturnOpen(false)
      navigate(`/quotation/reclaimed/${res.name}`)
    } catch (e) { toast.error((e as Error)?.message ?? "Could not log return") } finally { setReturning(false) }
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
      <DocumentLinkBar doctype="Vera BOQ" name={name} />

      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #E3E3E3)", background: "#fff" }}>
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

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border, #E3E3E3)" }}>
          {b.status === "Draft" && (
            <button onClick={() => action("submit_boq", "Submitted for review")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Submit for Review
            </button>
          )}
          {b.status === "Submitted" && (
            <button onClick={() => action("reopen_boq", "Reopened")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--border, #E3E3E3)", color: "var(--brand-primary)" }}>
              Reopen
            </button>
          )}
          {(b.status === "Draft" || b.status === "Submitted") && (
            <button onClick={() => action("approve_boq", "Approved — cost sheet & quotation unlocked")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #171717)" }}>
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
        border: "0.5px solid " + (b.issues.length ? "#f3c2c2" : "#F5F5F5"),
        background: b.issues.length ? "#fdeaea" : "#F5F5F5",
      }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: b.issues.length ? "#dc2626" : "#171717" }}>
          {b.issues.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          {b.issues.length ? `${b.issues.length} validation issue(s) — must resolve before approval` : "Validation passed — ready to approve"}
        </div>
        {b.issues.length > 0 && (
          <ul className="mt-1.5 list-disc pl-6" style={{ color: "#b91c1c" }}>
            {b.issues.map((iss, i) => <li key={i}>{iss}</li>)}
          </ul>
        )}
      </div>

      {reuseHits.length > 0 && (
        <div className="mb-4 rounded-xl p-4 shadow-sm" style={{ border: "0.5px solid #F5F5F5", background: "#F5F5F5" }}>
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#171717" }}>
            ↻ Reclaimed stock you can reuse ({reuseHits.length})
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {reuseHits.map((h) => (
              <div key={h.name} className="rounded-lg bg-white p-2.5" style={{ border: "0.5px solid #F5F5F5" }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => navigate(`/quotation/reclaimed/${h.name}`)} className="text-left text-sm font-medium hover:underline" style={{ color: "var(--text-primary)" }}>{h.material_title}</button>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: h.score >= 70 ? "#F5F5F5" : "#F5F5F5", color: h.score >= 70 ? "#171717" : "#171717" }}>{h.score}%</span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{h.spec} · {h.dimensions}mm · fits {h.fits_unit}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>◉ {h.location} · {h.why}</div>
                  <button onClick={() => reservePiece(h.name)} disabled={busy === "reserve:" + h.name}
                    className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60" style={{ background: "#171717" }}>
                    {busy === "reserve:" + h.name ? "…" : "Reserve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 flex justify-end">
        <button onClick={() => setReturnOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid #F5F5F5", color: "#171717", background: "#F5F5F5" }}>
          ↻ Return material to inventory
        </button>
      </div>
      <RecordDrawer
        open={returnOpen}
        title="Return material to inventory"
        subtitle="Log a returned / rejected piece from a line — its spec and size are pulled from the line."
        fields={[
          { name: "line", label: "Which line came back?", type: "select", required: true,
            options: (b.lines ?? []).map((l) => ({ value: String(l.name), label: `${l.unit_name || l.area || "Line"}${l.carcass_material ? " · " + l.carcass_material : ""}${l.width ? ` · ${l.width}×${l.height}` : ""}` })) },
          { name: "quantity", label: "Quantity returned", type: "text", placeholder: "leave blank for the full line qty" },
          { name: "reason", label: "Reason", type: "select", options: ["Rejected", "Surplus / Leftover", "Project Cancelled", "Damaged (usable)", "Offcut", "Other"].map((v) => ({ value: v, label: v })) },
        ] as FieldSpec[]}
        submitLabel="Log & Open"
        submitting={returning}
        onClose={() => setReturnOpen(false)}
        onSubmit={returnToInventory}
      />
      <RegisterGrid title="BOQ Lines" columns={cols} rows={b.lines} editable={!locked}
        onSave={saveLines} emptyLabel="No lines yet. Add a line or build this BOQ on a measurement." />
    </div>
  )
}
