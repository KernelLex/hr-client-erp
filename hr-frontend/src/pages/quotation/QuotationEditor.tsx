// Quotation Studio · Customer Quotation editor (Phase 2 spec §4.5/§4.6/§4.11).
// The operational heart of stage 4: commercials with the totals cascade, live
// GP vs the cost sheet, the exception-engine routing, the approval workflow, the
// gated Sales Order conversion, terms, and the four print formats.
import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Save, Printer, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { quotationGet, quotationPost, termsGet } from "../peoplework/client"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
import { DocumentLinkBar } from "./components/DocumentLinkBar"
import { RegisterGrid, type GridCol, type GridRow } from "./components/RegisterGrid"

interface Rule { rule: string; routes_to: string; rank: number }
interface Check { label: string; ok: boolean }
interface Quotation {
  name: string; quotation_title: string; boq: string | null; cost_sheet: string | null
  company_name: string | null; status: string; revision: number; supersedes: string | null
  sales_order: string | null
  gross_total: number; discount_percent: number; discount_amount: number; adjustment: number
  net_before_gst: number; gst_percent: number; gst_amount: number; grand_total: number
  credit_terms_standard: number; credit_terms: string | null
  cost_basis: number; gross_profit: number; gp_percent: number
  target_gp_percent: number; min_gp_percent: number; gp_tone: "red" | "amber" | "green"
  required_authority: string; triggered_rules_list: Rule[]
  approved_by: string | null; approved_on: string | null
  approved_with_conditions: number; conditions: string | null
  customer_acceptance: number; advance_received: number
  foc_value: number; installation_waiver: number; transport_waiver: number; price_override_percent: number
  validity_days: number | null; delivery_period: string | null; installation_period: string | null; warranty_terms: string | null; assumptions: string | null
  inclusions: GridRow[]; exclusions: GridRow[]
  payment_schedule: GridRow[]
  terms_template: string | null; terms_and_conditions: string | null
  editable: boolean; lines: GridRow[]; approval_log: GridRow[]; conversion_gate: Check[]
}
interface ActiveTemplate { name: string; template_name: string; category: string; version: number }
interface RevComparison {
  revisions: { name: string; revision: number; status: string; grand_total: number; sections: Record<string, number> }[]
  section_order: string[]
}

const LINE_COLS: GridCol[] = [
  { key: "line_type", label: "Type", type: "select", options: ["Project / Modular", "Trading", "Services"], width: 130 },
  { key: "section", label: "Section", width: 90 },
  { key: "specification", label: "Specification", width: 200 },
  { key: "measurement", label: "Measurement", width: 100 },
  { key: "stock_or_lead", label: "Stock / Lead", width: 100 },
  { key: "quantity", label: "Qty", type: "number", width: 55 },
  { key: "uom", label: "UOM", width: 55 },
  { key: "rate", label: "Rate", type: "number", width: 90 },
  { key: "gross_amount", label: "Gross", readOnly: true, width: 100 },
]
const LOG_COLS: GridCol[] = [
  { key: "action", label: "Action", width: 150 },
  { key: "authority", label: "Authority", width: 120 },
  { key: "acted_by", label: "By", width: 150 },
  { key: "acted_on", label: "On", width: 140 },
  { key: "comment", label: "Comment", width: 200 },
]

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0)
const TONE = { red: "#dc2626", amber: "#d97706", green: "#15803d" }

export function QuotationEditor() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ discount_percent: "", adjustment: "", gst_percent: "", credit_terms_standard: true, credit_terms: "", foc_value: "", installation_waiver: "", transport_waiver: "", price_override_percent: "", validity_days: "", delivery_period: "", installation_period: "", warranty_terms: "", assumptions: "" })
  const [dirty, setDirty] = useState(false)
  const [negotiated, setNegotiated] = useState("")

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_quotation", name],
    queryFn: () => quotationGet<{ quotation: Quotation }>("get_quotation", { name }),
    staleTime: 0, refetchOnMount: "always",
  })
  const q = data?.quotation

  const { data: templates } = useQuery({
    queryKey: ["q_active_terms"],
    queryFn: () => termsGet<ActiveTemplate[]>("get_active_templates"),
  })

  const { data: comparison } = useQuery({
    queryKey: ["q_rev_compare", name],
    queryFn: () => quotationGet<RevComparison>("get_revision_comparison", { name }),
    staleTime: 30_000,
    enabled: !!q && ((q.revision ?? 1) > 1 || !!q.supersedes),
  })

  useEffect(() => {
    if (q) setForm({
      discount_percent: String(q.discount_percent ?? ""),
      adjustment: String(q.adjustment ?? ""),
      gst_percent: String(q.gst_percent ?? ""),
      credit_terms_standard: !!q.credit_terms_standard,
      credit_terms: q.credit_terms ?? "",
      foc_value: String(q.foc_value ?? ""),
      installation_waiver: String(q.installation_waiver ?? ""),
      transport_waiver: String(q.transport_waiver ?? ""),
      price_override_percent: String(q.price_override_percent ?? ""),
      validity_days: String(q.validity_days ?? ""),
      delivery_period: q.delivery_period ?? "",
      installation_period: q.installation_period ?? "",
      warranty_terms: q.warranty_terms ?? "",
      assumptions: q.assumptions ?? "",
    })
  }, [q?.name, q?.discount_percent, q?.adjustment, q?.gst_percent, q?.credit_terms_standard, q?.credit_terms, q?.foc_value, q?.installation_waiver, q?.transport_waiver, q?.price_override_percent, q?.validity_days, q?.delivery_period, q?.installation_period, q?.warranty_terms, q?.assumptions])

  function refresh() { qc.invalidateQueries({ queryKey: ["q_quotation", name] }) }
  function setField(k: string, v: string | boolean) { setForm((p) => ({ ...p, [k]: v })); setDirty(true) }

  async function saveCommercials() {
    setBusy("save")
    try {
      await quotationPost("update_quotation", { name, payload: {
        discount_percent: form.discount_percent, adjustment: form.adjustment, gst_percent: form.gst_percent,
        credit_terms_standard: form.credit_terms_standard ? 1 : 0, credit_terms: form.credit_terms,
        foc_value: form.foc_value || 0, installation_waiver: form.installation_waiver || 0,
        transport_waiver: form.transport_waiver || 0, price_override_percent: form.price_override_percent || 0,
        validity_days: form.validity_days || 0, delivery_period: form.delivery_period,
        installation_period: form.installation_period, warranty_terms: form.warranty_terms,
        assumptions: form.assumptions,
      } })
      toast.success("Commercials updated"); setDirty(false); refresh()
    } catch (e) { toast.error((e as Error)?.message ?? "Could not save") } finally { setBusy(null) }
  }

  async function applyNegotiated() {
    const v = parseFloat(negotiated)
    if (!v || v <= 0) { toast.error("Enter a negotiated grand total"); return }
    setBusy("negotiate")
    try {
      const res = await quotationPost<{ success: boolean; error?: string; adjustment?: number }>("set_negotiated_total", { name, final_total: v })
      if (res.success === false) toast.error(res.error ?? "Could not apply")
      else { toast.success("Negotiated total applied"); setNegotiated(""); refresh() }
    } catch (e) { toast.error((e as Error)?.message ?? "Could not apply") } finally { setBusy(null) }
  }
  async function saveLines(rows: GridRow[]) { await quotationPost("save_lines", { name, lines: rows }); refresh() }
  async function saveInclusions(rows: GridRow[]) { await quotationPost("save_scope", { name, inclusions: rows }); refresh() }
  async function saveExclusions(rows: GridRow[]) { await quotationPost("save_scope", { name, exclusions: rows }); refresh() }
  async function savePaymentSchedule(rows: GridRow[]) { await quotationPost("save_payment_schedule", { name, stages: rows }); refresh() }

  async function post(endpoint: string, body: Record<string, unknown>, ok: string, then?: (r: { name?: string; sales_order?: string }) => void) {
    setBusy(endpoint)
    try {
      const res = await quotationPost<{ success: boolean; error?: string; name?: string; sales_order?: string }>(endpoint, { name, ...body })
      if (res.success === false) { toast.error(res.error ?? "Action failed"); refresh() }
      else { toast.success(ok); if (then) then(res); else refresh() }
    } catch (e) { toast.error((e as Error)?.message ?? "Action failed") } finally { setBusy(null) }
  }

  async function applyTerms(tmpl: string) {
    if (!tmpl) return
    setBusy("terms")
    try {
      const asm = await termsGet<{ text: string }>("assemble_terms", { name: tmpl })
      await quotationPost("update_quotation", { name, payload: { terms_template: tmpl, terms_and_conditions: asm.text } })
      toast.success("Terms applied"); refresh()
    } catch (e) { toast.error((e as Error)?.message ?? "Could not apply") } finally { setBusy(null) }
  }

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !q) return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const locked = !q.editable
  const pending = q.status === "Pending Approval"
  const gateOk = q.conversion_gate.every((c) => c.ok)

  const Cell = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: tone ?? "var(--text-primary)" }}>{value ?? "—"}</div>
    </div>
  )
  const num = (k: keyof typeof form, label: string) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <input type="number" value={form[k] as string} disabled={locked} onChange={(e) => setField(k, e.target.value)}
        className="mt-0.5 w-full rounded px-2 py-1 text-sm disabled:opacity-60"
        style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff", color: "var(--text-primary)" }} />
    </div>
  )
  const txt = (k: keyof typeof form, label: string) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <input type="text" value={form[k] as string} disabled={locked} onChange={(e) => setField(k, e.target.value)}
        className="mt-0.5 w-full rounded px-2 py-1 text-sm disabled:opacity-60"
        style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff", color: "var(--text-primary)" }} />
    </div>
  )

  return (
    <div className="p-6">
      <button onClick={() => navigate("/quotation/quotations")} className="mb-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Customer Quotations
      </button>

      <StageBar current="Quotation" />
      <DocumentLinkBar doctype="Vera Sales Quotation" name={name} />

      {/* Header */}
      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold" style={{ color: "var(--brand-primary)" }}>{q.quotation_title}</h1>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {q.name} · Rev {String(q.revision).padStart(2, "0")}
              {q.cost_sheet && ` · cost ${q.cost_sheet}`}{q.boq && ` · boq ${q.boq}`}
              {q.sales_order && ` · SO ${q.sales_order}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {q.approved_with_conditions ? <StatusPill value="Approved w/ Conditions" /> : <StatusPill value={q.status} />}
          </div>
        </div>

        {/* Commercials + GP + exception engine */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Commercials</div>
            <div className="grid grid-cols-3 gap-3">
              <Cell label="Gross Total" value={inr(q.gross_total)} />
              {num("discount_percent", "Discount %")}
              {num("adjustment", "Adjustment ±")}
              <Cell label="Net (before GST)" value={inr(q.net_before_gst)} />
              {num("gst_percent", "GST %")}
              <Cell label="Grand Total" value={<strong>{inr(q.grand_total)}</strong>} />
            </div>
            <div className="mt-3 flex items-end gap-3">
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={form.credit_terms_standard} disabled={locked} onChange={(e) => setField("credit_terms_standard", e.target.checked)} />
                Standard credit terms
              </label>
              <input type="text" value={form.credit_terms} disabled={locked} placeholder="Credit terms note"
                onChange={(e) => setField("credit_terms", e.target.value)}
                className="flex-1 rounded px-2 py-1 text-xs disabled:opacity-60" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }} />
              {!locked && (
                <button onClick={saveCommercials} disabled={!dirty || busy === "save"}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
                  <Save size={13} /> Save
                </button>
              )}
            </div>
            {/* Commercial concessions — feed the approval matrix (§36-43) */}
            <div className="mt-3 grid grid-cols-4 gap-3">
              {num("foc_value", "FOC ₹")}
              {num("installation_waiver", "Instal. waiver ₹")}
              {num("transport_waiver", "Transport waiver ₹")}
              {num("price_override_percent", "Price override %")}
            </div>
            {/* Negotiated final total (§66) — back-computes the adjustment */}
            {!locked && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Negotiated grand total</div>
                  <input type="number" value={negotiated} onChange={(e) => setNegotiated(e.target.value)} placeholder={String(q.grand_total || "")}
                    className="mt-0.5 w-full rounded px-2 py-1 text-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff", color: "var(--text-primary)" }} />
                </div>
                <button onClick={applyNegotiated} disabled={busy === "negotiate" || !negotiated}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>
                  Apply
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Gross Profit &amp; Approval Routing</div>
            <div className="grid grid-cols-3 gap-3">
              <Cell label="Cost Basis" value={inr(q.cost_basis)} />
              <Cell label="Gross Profit" value={inr(q.gross_profit)} tone={TONE[q.gp_tone]} />
              <Cell label="GP %" value={`${q.gp_percent?.toFixed(1)}%`} tone={TONE[q.gp_tone]} />
              <Cell label="Target GP %" value={`${q.target_gp_percent}%`} />
              <Cell label="Min GP %" value={`${q.min_gp_percent}%`} />
              <Cell label="Routes To" value={<strong>{q.required_authority}</strong>} tone="var(--brand-primary)" />
            </div>
            {q.triggered_rules_list.length > 0 && (
              <div className="mt-2 rounded-lg p-2 text-[11px]" style={{ background: "var(--cream-dark, #ebe3d3)" }}>
                {q.triggered_rules_list.map((r, i) => (
                  <div key={i} style={{ color: "var(--text-primary)" }}>• {r.rule} → <strong>{r.routes_to}</strong></div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delivery & execution terms (§29/§30/§35) */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 md:grid-cols-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          {num("validity_days", "Validity (days)")}
          {txt("delivery_period", "Delivery Period")}
          {txt("installation_period", "Installation Period")}
          {txt("warranty_terms", "Warranty")}
          <div className="md:col-span-4">{txt("assumptions", "Assumptions (shown on customer quote)")}</div>
        </div>

        {/* Workflow */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          {(q.status === "Draft" || q.status === "Returned") && (
            <button onClick={() => post("submit_for_approval", {}, "Submitted for approval")} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>
              Submit for Approval
            </button>
          )}
          {pending && (
            <>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Deciding as <strong>{q.required_authority}</strong>:</span>
              <button onClick={() => post("decide", { action: "Approve", comment: window.prompt("Approval comment (optional)") ?? "" }, "Approved")} disabled={!!busy}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>Approve</button>
              <button onClick={() => { const c = window.prompt("Conditions to record & print:"); if (c) post("decide", { action: "Approve with Conditions", conditions: c }, "Approved with conditions") }} disabled={!!busy}
                className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--gold, #c8a24a)", color: "var(--brand-primary)" }}>Approve w/ Conditions</button>
              <button onClick={() => { const c = window.prompt("Reason to return for revision:"); if (c) post("decide", { action: "Return for Revision", comment: c }, "Returned for revision") }} disabled={!!busy}
                className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid var(--border, #e0d9cb)", color: "var(--text-primary)" }}>Return</button>
              <button onClick={() => { const c = window.prompt("Reason to reject:"); if (c) post("decide", { action: "Reject", comment: c }, "Rejected") }} disabled={!!busy}
                className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid #f3c2c2", color: "#dc2626" }}>Reject</button>
            </>
          )}
          {(q.status === "Approved" || q.status === "Rejected" || q.status === "Superseded" || q.status === "Converted") && !q.sales_order && (
            <button onClick={() => post("create_revision", {}, "Revision created", (r) => { if (r.name) navigate(`/quotation/quotations/${r.name}`) })} disabled={!!busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-primary)" }}>Create Revision</button>
          )}
          {q.conditions && <span className="text-xs" style={{ color: "#d97706" }}>Conditions: {q.conditions}</span>}
          {/* Print */}
          <div className="ml-auto flex items-center gap-1">
            {(["summary", "detailed", "technical", "internal"] as const).map((f) => (
              <button key={f} onClick={() => navigate(`/quotation/quotations/${q.name}/print/${f}`)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium" style={{ border: "0.5px solid var(--border, #e0d9cb)", color: "var(--brand-primary)" }}>
                <Printer size={11} /> {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lines */}
      <RegisterGrid title="Quotation Lines" columns={LINE_COLS} rows={q.lines} editable={!locked}
        onSave={saveLines} emptyLabel="No lines. Build on a cost sheet to seed Project/Modular lines." />

      {/* Scope — Inclusions / Exclusions (§31/§32) */}
      <div className="grid gap-4 md:grid-cols-2">
        <RegisterGrid title="Inclusions" columns={[{ key: "text", label: "Included", width: 320 }]} rows={q.inclusions} editable={!locked}
          onSave={saveInclusions} emptyLabel="No inclusions. Add what this quotation covers." />
        <RegisterGrid title="Exclusions" columns={[{ key: "text", label: "Excluded", width: 320 }]} rows={q.exclusions} editable={!locked}
          onSave={saveExclusions} emptyLabel="No exclusions. Add what is not covered." />
      </div>

      {/* Payment schedule (§28) — stored per-quotation; empty falls back to the
          standard stage template on the customer print. Amounts derive from the
          grand total at print time. */}
      <RegisterGrid title="Payment Schedule"
        columns={[{ key: "stage", label: "Stage", width: 280 }, { key: "percent", label: "%", type: "number", width: 100 }]}
        rows={q.payment_schedule} editable={!locked} onSave={savePaymentSchedule}
        emptyLabel="No custom schedule. The print uses the standard 10/40/40/10 stages until you set one." />

      {/* Revision comparison (print spec §52) */}
      {comparison && comparison.revisions.length > 1 && (() => {
        const revs = comparison.revisions
        const last = revs[revs.length - 1]
        const prev = revs[revs.length - 2]
        const delta = (a?: number, b?: number) => (a ?? 0) - (b ?? 0)
        const fmtD = (n: number) => (n === 0 ? "—" : (n > 0 ? "+" : "") + inr(n))
        return (
          <div className="mb-6 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
            <div className="mb-2 font-heading text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>Revision Comparison</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    <th className="py-1.5">Section</th>
                    {revs.map((r) => <th key={r.name} className="py-1.5 text-right">R{String(r.revision).padStart(2, "0")}</th>)}
                    <th className="py-1.5 text-right">Δ latest</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.section_order.map((sec) => (
                    <tr key={sec} className="border-t" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                      <td className="py-1.5">{sec}</td>
                      {revs.map((r) => <td key={r.name} className="py-1.5 text-right">{inr(r.sections[sec] || 0)}</td>)}
                      <td className="py-1.5 text-right" style={{ color: delta(last.sections[sec], prev.sections[sec]) ? "var(--brand-primary)" : "var(--text-muted)" }}>
                        {fmtD(delta(last.sections[sec], prev.sections[sec]))}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                    <td className="py-1.5">Grand Total</td>
                    {revs.map((r) => <td key={r.name} className="py-1.5 text-right">{inr(r.grand_total)}</td>)}
                    <td className="py-1.5 text-right" style={{ color: "var(--brand-primary)" }}>{fmtD(delta(last.grand_total, prev.grand_total))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Conversion gate (§4.11) */}
      {(q.status === "Approved" || q.status === "Converted") && (
        <div className="mb-6 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
          <div className="mb-2 font-heading text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>Sales Order Conversion (§4.11)</div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {q.conversion_gate.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm" style={{ color: c.ok ? "#15803d" : "var(--text-muted)" }}>
                {c.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {c.label}
              </div>
            ))}
          </div>
          {!q.sales_order && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={!!q.customer_acceptance} onChange={(e) => post("set_acceptance", { customer_acceptance: e.target.checked ? 1 : 0 }, "Updated")} />
                Customer acceptance recorded
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={!!q.advance_received} onChange={(e) => post("set_acceptance", { advance_received: e.target.checked ? 1 : 0 }, "Updated")} />
                Advance received &amp; verified
              </label>
              <button onClick={() => post("convert_to_sales_order", {}, "Converted to Sales Order", (r) => { if (r.sales_order) navigate(`/quotation/sales-orders/${r.sales_order}`) })}
                disabled={!!busy || !gateOk}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>
                Convert to Sales Order
              </button>
            </div>
          )}
          {q.sales_order && (
            <button onClick={() => navigate(`/quotation/sales-orders/${q.sales_order}`)} className="mt-3 text-sm font-medium" style={{ color: "var(--brand-primary)" }}>
              → View Sales Order {q.sales_order}
            </button>
          )}
        </div>
      )}

      {/* Terms */}
      <div className="mb-6 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-heading text-sm font-semibold" style={{ color: "var(--brand-primary)" }}>Terms &amp; Conditions</div>
          {!locked && (
            <select onChange={(e) => applyTerms(e.target.value)} defaultValue="" className="rounded px-2 py-1 text-xs" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
              <option value="">Apply a template…</option>
              {(templates ?? []).map((t) => <option key={t.name} value={t.name}>{t.template_name} · V{t.version} · {t.category}</option>)}
            </select>
          )}
        </div>
        <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--text-primary)", fontFamily: "inherit" }}>{q.terms_and_conditions || "No terms applied."}</pre>
      </div>

      {/* Approval log */}
      {q.approval_log.length > 0 && (
        <RegisterGrid title="Approval Log" columns={LOG_COLS} rows={q.approval_log} editable={false} onSave={async () => {}} />
      )}
    </div>
  )
}
