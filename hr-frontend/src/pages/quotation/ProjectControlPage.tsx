// Quotation Studio · Project Control Screen — detail (UI spec §5). One screen
// that ties a customer project together: the opportunity header + a rollup of
// the latest revision, status and value of each document in the six-stage chain,
// with a jump into whichever stage exists. Read-only aggregation (no schema).
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, Plus, Lock } from "lucide-react"
import { toast } from "sonner"
import { projectGet, measurementPost, boqPost, costSheetPost, quotationPost } from "../peoplework/client"

interface Stage {
  name: string; status?: string | null; revision?: number | null
  count?: number; value?: number | null
  required_authority?: string | null; sales_order?: string | null
  projected_gp_percent?: number | null
}
interface Overview {
  opportunity: {
    name: string; title: string; customer?: string | null; contact_person?: string | null
    phone?: string | null; email?: string | null; stage?: string | null
    estimated_value: number; assigned_to?: string | null
  }
  stages: {
    measurement: Stage | null; boq: Stage | null; cost_sheet: Stage | null
    quotation: Stage | null; sales_order: Stage | null
  }
  quoted_value?: number | null
  confirmed_value?: number | null
  next_action?: NextAction
}
interface NextAction {
  stage: "measurement" | "boq" | "cost_sheet" | "quotation" | "sales_order" | "done"
  ready: boolean; label: string; reason?: string
  parent?: string; open?: keyof Overview["stages"]; open_name?: string
}

const inr = (n?: number | null) => (n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n))

const STAGE_DEFS: { key: keyof Overview["stages"]; label: string; route: string }[] = [
  { key: "measurement", label: "Measurement", route: "measurements" },
  { key: "boq", label: "BOQ", route: "boqs" },
  { key: "cost_sheet", label: "Cost Sheet", route: "cost-sheets" },
  { key: "quotation", label: "Quotation", route: "quotations" },
  { key: "sales_order", label: "Sales Order", route: "sales-orders" },
]

const STAGE_ROUTE: Record<string, string> = {
  measurement: "measurements", boq: "boqs", cost_sheet: "cost-sheets",
  quotation: "quotations", sales_order: "sales-orders",
}

export function ProjectControlPage() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const { data: d, isLoading, isError, error } = useQuery({
    queryKey: ["project_overview", name],
    queryFn: () => projectGet<Overview>("get_project_overview", { opportunity: name }),
    staleTime: 0, refetchOnMount: "always",
  })

  // §5 action buttons — create the next stage from here, then open it. Each create
  // endpoint enforces its own approval gate; a thrown message surfaces as a toast.
  async function startNext(na: NextAction, title: string) {
    setBusy(true)
    try {
      let res: { name: string }
      if (na.stage === "measurement") res = await measurementPost("create_measurement", { payload: { measurement_title: `${title} — Measurement`, opportunity: name } })
      else if (na.stage === "boq") res = await boqPost("create_boq", { payload: { boq_title: `${title} — BOQ`, measurement_sheet: na.parent } })
      else if (na.stage === "cost_sheet") res = await costSheetPost("create_cost_sheet", { payload: { cost_title: `${title} — Cost Sheet`, boq: na.parent } })
      else if (na.stage === "quotation") res = await quotationPost("create_quotation", { payload: { quotation_title: `${title} — Quotation`, cost_sheet: na.parent } })
      else return
      toast.success(`${na.label.replace("Start ", "")} created`)
      navigate(`/quotation/${STAGE_ROUTE[na.stage]}/${res.name}`)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not create")
    } finally { setBusy(false) }
  }

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !d) return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const o = d.opportunity
  const na = d.next_action
  return (
    <div className="p-6">
      <button onClick={() => navigate("/quotation/projects")} className="mb-4 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> All projects
      </button>

      {/* Header */}
      <div className="mb-5 rounded-xl bg-white p-5 shadow-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Project · {o.name}</div>
            <h1 className="font-heading text-2xl font-semibold" style={{ color: "var(--brand-primary)" }}>{o.title}</h1>
            <div className="mt-0.5 text-sm" style={{ color: "var(--text-primary)" }}>{o.customer || "—"}</div>
            {(o.contact_person || o.phone) && (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {[o.contact_person, o.phone, o.email].filter(Boolean).join("  ·  ")}
              </div>
            )}
          </div>
          {o.stage && <span className="rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: "var(--bg-app, #f5f1e8)", color: "var(--brand-primary)" }}>{o.stage}</span>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label="Estimated Value" value={inr(o.estimated_value)} />
          <Metric label="Quoted Value" value={inr(d.quoted_value)} />
          <Metric label="Confirmed Value" value={inr(d.confirmed_value)} tone={d.confirmed_value ? "good" : undefined} />
        </div>
      </div>

      {/* Stage rollup cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STAGE_DEFS.map(({ key, label, route }) => {
          const s = d.stages[key]
          const started = !!s
          return (
            <div key={key} className="rounded-xl bg-white p-4 shadow-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
              {started ? (
                <>
                  <div className="mt-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s!.status || "—"}</div>
                  {s!.revision != null && <div className="text-xs" style={{ color: "var(--text-muted)" }}>Rev {String(s!.revision).padStart(2, "0")}{(s!.count ?? 1) > 1 ? ` · ${s!.count} revs` : ""}</div>}
                  {s!.value != null && <div className="mt-1 text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>{inr(s!.value)}</div>}
                  {key === "cost_sheet" && s!.projected_gp_percent != null && <div className="text-xs" style={{ color: "var(--text-muted)" }}>GP {s!.projected_gp_percent.toFixed(1)}%</div>}
                  {key === "quotation" && s!.required_authority && <div className="text-xs" style={{ color: "var(--text-muted)" }}>Approval: {s!.required_authority}</div>}
                  <button onClick={() => navigate(`/quotation/${route}/${s!.name}`)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--brand-primary)" }}>
                    Open <ArrowRight size={13} />
                  </button>
                </>
              ) : (
                <div className="mt-2 text-xs italic" style={{ color: "var(--text-muted)" }}>Not started</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Next action (§5) — the single step that moves the project forward. */}
      {na && na.stage !== "done" && (
        <div className="mt-5 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Next step</div>
            <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{na.label}</div>
            {!na.ready && na.reason && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{na.reason}</div>}
          </div>
          {na.ready ? (
            <button onClick={() => startNext(na, o.title)} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--brand-primary)" }}>
              <Plus size={16} /> {na.label}
            </button>
          ) : na.open && na.open_name ? (
            <button onClick={() => navigate(`/quotation/${STAGE_ROUTE[na.open!]}/${na.open_name}`)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ border: "1px solid var(--border, #e0d9cb)", color: "var(--brand-primary)" }}>
              <Lock size={14} /> Open {na.open.replace("_", " ")}
            </button>
          ) : null}
        </div>
      )}
      {na && na.stage === "done" && (
        <div className="mt-5 rounded-xl p-4 text-sm font-medium" style={{ background: "#ecfdf5", color: "#15803d" }}>
          ✓ {na.label}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-app, #f5f1e8)" }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: tone === "good" ? "#15803d" : "var(--text-primary)" }}>{value}</div>
    </div>
  )
}
