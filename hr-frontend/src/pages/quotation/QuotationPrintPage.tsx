// Quotation Studio · Quotation print views (Phase 2 spec §4.9). Four formats:
// Summary / Detailed Commercial / Technical BOQ (customer-facing, no cost or GP)
// and Internal Costing (confidential — shows cost basis + GP). The backend
// redacts cost/GP from the three customer formats; this page renders whatever it
// is given and exposes the browser print dialog.
import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Printer } from "lucide-react"
import { quotationGet } from "../peoplework/client"

interface PrintLine {
  line_type?: string; section?: string; specification?: string; measurement?: string
  quantity?: number; uom?: string; rate?: number; gross_amount?: number
}
interface PrintSection { section: string; subtotal: number; lines: PrintLine[] }
interface PrintDoc {
  format: string; format_label: string; customer_facing: boolean; watermark: string | null
  name: string; revision: number; title: string; company_name: string | null; status: string
  prepared_by?: string | null; date?: string | null
  lines: PrintLine[]; sections?: PrintSection[]; optional_lines?: PrintLine[]; terms_and_conditions: string | null; assumptions?: string | null
  gross_total?: number; discount_percent?: number; discount_amount?: number; adjustment?: number
  net_before_gst?: number; gst_percent?: number; gst_amount?: number; grand_total?: number
  cgst_percent?: number; cgst_amount?: number; sgst_percent?: number; sgst_amount?: number; amount_in_words?: string
  interstate?: boolean; place_of_supply?: string | null; igst_percent?: number | null; igst_amount?: number | null
  payment_schedule?: { stage: string; percent: number; amount: number }[]
  validity_days?: number | null; delivery_period?: string | null; installation_period?: string | null; warranty_terms?: string | null
  inclusions?: string[]; exclusions?: string[]
  company_info?: { name?: string; gstin?: string; phone?: string; email?: string; website?: string; address?: string }
  confidential?: boolean; cost_basis?: number; gross_profit?: number; gp_percent?: number
  target_gp_percent?: number; min_gp_percent?: number; cost_sheet?: string; conditions?: string
  required_authority?: string; triggered_rules?: string
  foc_value?: number; installation_waiver?: number; transport_waiver?: number; price_override_percent?: number
}

const inr = (n?: number) => (n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n))

export function QuotationPrintPage() {
  const { name = "", fmt = "summary" } = useParams()
  const navigate = useNavigate()

  const { data: d, isLoading, isError, error } = useQuery({
    queryKey: ["q_print", name, fmt],
    queryFn: () => quotationGet<PrintDoc>("get_quotation_print", { name, fmt }),
    staleTime: 0, refetchOnMount: "always",
  })

  // Print-setting toggles (§2/§26) — customer prints can hide dimensions / per-line
  // rates / the discount line to suit the audience. Default: show everything.
  const [showDimensions, setShowDimensions] = useState(true)
  const [showRates, setShowRates] = useState(true)
  const [showDiscount, setShowDiscount] = useState(true)
  const [showCover, setShowCover] = useState(false)
  const [showPrices, setShowPrices] = useState(true)

  // PDF auto file-naming (§77) — drive the browser "Save as PDF" default filename
  // via the document title while this page is mounted, then restore it.
  useEffect(() => {
    if (!d) return
    const prev = document.title
    const fmtSlug = (d.format_label || d.format || "Quotation").replace(/[^A-Za-z0-9]+/g, "_")
    document.title = `VE_QTN_${d.name}_Rev${String(d.revision).padStart(2, "0")}_${fmtSlug}`
    return () => { document.title = prev }
  }, [d])

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !d) return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const hasPricing = d.grand_total != null // technical BOQ omits all pricing
  const showPricing = hasPricing && showPrices // §46 — hide all prices (scope-only doc)
  const rates = showPricing && showRates
  // Columns preceding the Amount column in the detailed grid (for the Section Total colSpan).
  const preAmountCols = 1 /* Specification */ + (showDimensions ? 1 : 0) + 1 /* Qty */ + 1 /* UOM */ + (rates ? 1 : 0)

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button onClick={() => navigate(`/quotation/quotations/${name}`)} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={14} /> Back to quotation
        </button>
        <div className="flex items-center gap-3">
          {/* Print-setting toggles (§2/§26) — customer formats with pricing only. */}
          {d.customer_facing && d.format !== "summary" && (
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
              <Toggle label="Cover page" checked={showCover} onChange={setShowCover} />
              <Toggle label="Dimensions" checked={showDimensions} onChange={setShowDimensions} />
              {hasPricing && <Toggle label="Prices" checked={showPrices} onChange={setShowPrices} />}
              {showPricing && <Toggle label="Rates" checked={showRates} onChange={setShowRates} />}
              {showPricing && <Toggle label="Discount" checked={showDiscount} onChange={setShowDiscount} />}
            </div>
          )}
          {d.confidential && <span className="rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: "#fdeaea", color: "#dc2626" }}>CONFIDENTIAL — Internal Only</span>}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {/* Cover page (§5) — optional lead page for project quotes; own print page. */}
      {showCover && d.customer_facing && (
        <div className="mx-auto mb-6 flex max-w-3xl flex-col items-center justify-center rounded-xl bg-white p-12 text-center shadow-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)", minHeight: "60vh", breakAfter: "page" }}>
          {d.company_info?.name && <div className="font-heading text-2xl font-bold tracking-wide" style={{ color: "var(--brand-primary)" }}>{d.company_info.name}</div>}
          {d.company_info?.address && <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{d.company_info.address}</div>}
          <div className="mt-16 text-[11px] uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>Quotation</div>
          <h1 className="mt-2 font-heading text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>{d.title}</h1>
          {d.company_name && <div className="mt-2 text-lg" style={{ color: "var(--text-primary)" }}>Prepared for {d.company_name}</div>}
          <div className="mt-16 grid grid-cols-2 gap-x-10 gap-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="text-right">Quotation No</div><div className="text-left" style={{ color: "var(--text-primary)" }}>{d.name}</div>
            <div className="text-right">Revision</div><div className="text-left" style={{ color: "var(--text-primary)" }}>Rev {String(d.revision).padStart(2, "0")}</div>
            {d.date && <><div className="text-right">Date</div><div className="text-left" style={{ color: "var(--text-primary)" }}>{d.date}</div></>}
            {d.prepared_by && <><div className="text-right">Prepared By</div><div className="text-left" style={{ color: "var(--text-primary)" }}>{d.prepared_by}</div></>}
          </div>
          {d.company_info?.gstin && <div className="mt-16 text-[11px]" style={{ color: "var(--text-muted)" }}>GSTIN: {d.company_info.gstin}</div>}
        </div>
      )}

      <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
        {d.watermark && <div className="mb-4 text-center text-sm font-bold tracking-widest" style={{ color: "#dc2626" }}>{d.watermark}</div>}

        {/* Letterhead (§3) — customer-facing formats only. */}
        {d.company_info?.name && (
          <div className="mb-4 border-b pb-3 text-center" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            <div className="font-heading text-lg font-bold tracking-wide" style={{ color: "var(--brand-primary)" }}>{d.company_info.name}</div>
            {d.company_info.address && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{d.company_info.address}</div>}
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {[d.company_info.phone && `Ph: ${d.company_info.phone}`, d.company_info.email, d.company_info.website].filter(Boolean).join("  ·  ")}
            </div>
            {d.company_info.gstin && <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>GSTIN: {d.company_info.gstin}</div>}
          </div>
        )}

        <div className="mb-6 flex items-start justify-between border-b pb-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          <div>
            <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{d.format_label}</div>
            <h1 className="font-heading text-2xl font-semibold" style={{ color: "var(--brand-primary)" }}>{d.title}</h1>
            {d.company_name && <div className="mt-0.5 text-sm" style={{ color: "var(--text-primary)" }}>{d.company_name}</div>}
          </div>
          <div className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
            <div>{d.name}</div>
            <div>Rev {String(d.revision).padStart(2, "0")}</div>
            <div>{d.status}</div>
          </div>
        </div>

        {d.format === "summary" ? (
          /* Summary — section totals only (§9/§10), no line detail. */
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left text-[11px] uppercase tracking-wide">
                <th className="py-1.5">Sl.</th><th className="py-1.5">Scope</th><th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(d.sections ?? []).map((s, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                  <td className="py-1.5">{i + 1}</td><td className="py-1.5">{s.section}</td>
                  <td className="py-1.5 text-right">{inr(s.subtotal)}</td>
                </tr>
              ))}
              {(!d.sections || d.sections.length === 0) && <tr><td colSpan={3} className="py-3 text-center" style={{ color: "var(--text-muted)" }}>No lines.</td></tr>}
            </tbody>
          </table>
        ) : (
          /* Detailed / Technical — lines grouped under section headers with a subtotal (§15/§25). */
          (d.sections ?? []).map((s, si) => (
            <div key={si} className="mb-4">
              <div className="mb-1 mt-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--brand-primary)" }}>{s.section}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--text-muted)" }} className="text-left text-[11px] uppercase tracking-wide">
                    <th className="py-1">Specification</th>{showDimensions && <th className="py-1">Measurement</th>}
                    <th className="py-1 text-right">Qty</th><th className="py-1">UOM</th>
                    {rates && <th className="py-1 text-right">Rate</th>}
                    {showPricing && <th className="py-1 text-right">Amount</th>}
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((ln, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                      <td className="py-1">{ln.specification || "—"}</td>
                      {showDimensions && <td className="py-1">{ln.measurement || "—"}</td>}
                      <td className="py-1 text-right">{ln.quantity ?? "—"}</td>
                      <td className="py-1">{ln.uom || "—"}</td>
                      {rates && <td className="py-1 text-right">{inr(ln.rate)}</td>}
                      {showPricing && <td className="py-1 text-right">{inr(ln.gross_amount)}</td>}
                    </tr>
                  ))}
                  {showPricing && (
                    <tr className="border-t font-semibold" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                      <td className="py-1" colSpan={preAmountCols}>Section Total — {s.section}</td>
                      <td className="py-1 text-right">{inr(s.subtotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}
        {(!d.sections || d.sections.length === 0) && d.format !== "summary" && <div className="py-3 text-center text-sm" style={{ color: "var(--text-muted)" }}>No lines.</div>}

        {showPricing && (
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-1 text-sm">
              <Row label="Subtotal" value={inr(d.gross_total)} />
              {showDiscount && <Row label={`Discount (${d.discount_percent}%)`} value={`− ${inr(d.discount_amount)}`} />}
              {!!d.adjustment && <Row label="Adjustment" value={inr(d.adjustment)} />}
              <Row label="Taxable Value" value={inr(d.net_before_gst)} />
              {d.interstate ? (
                <Row label={`IGST (${d.igst_percent}%)`} value={inr(d.igst_amount)} />
              ) : (
                <>
                  <Row label={`CGST (${d.cgst_percent}%)`} value={inr(d.cgst_amount)} />
                  <Row label={`SGST (${d.sgst_percent}%)`} value={inr(d.sgst_amount)} />
                </>
              )}
              <div className="border-t pt-1" style={{ borderColor: "var(--border, #e0d9cb)" }}>
                <Row label="Grand Total" value={inr(d.grand_total)} strong />
              </div>
            </div>
          </div>
        )}
        {showPricing && d.amount_in_words && (
          <div className="mt-2 text-right text-xs italic" style={{ color: "var(--text-muted)" }}>{d.amount_in_words}</div>
        )}

        {/* Optional / alternate items (§23/§24) — priced add-ons, not in the grand total. */}
        {(d.optional_lines?.length ?? 0) > 0 && (
          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Optional Items <span className="normal-case font-normal">(not included in the grand total)</span></div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }} className="text-left text-[11px] uppercase tracking-wide">
                  <th className="py-1">Specification</th>{showDimensions && <th className="py-1">Measurement</th>}
                  <th className="py-1 text-right">Qty</th><th className="py-1">UOM</th>
                  {rates && <th className="py-1 text-right">Rate</th>}
                  {showPricing && <th className="py-1 text-right">Amount</th>}
                </tr>
              </thead>
              <tbody>
                {d.optional_lines!.map((ln, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                    <td className="py-1">{ln.specification || "—"}</td>
                    {showDimensions && <td className="py-1">{ln.measurement || "—"}</td>}
                    <td className="py-1 text-right">{ln.quantity ?? "—"}</td>
                    <td className="py-1">{ln.uom || "—"}</td>
                    {rates && <td className="py-1 text-right">{inr(ln.rate)}</td>}
                    {showPricing && <td className="py-1 text-right">{inr(ln.gross_amount)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment schedule (§28) — customer-facing, derived from the grand total. */}
        {d.customer_facing && d.payment_schedule && d.payment_schedule.length > 0 && (
          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Payment Terms</div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }} className="text-left text-[11px] uppercase tracking-wide">
                  <th className="py-1">Stage</th><th className="py-1 text-right">%</th><th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {d.payment_schedule.map((p, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                    <td className="py-1">{p.stage}</td>
                    <td className="py-1 text-right">{p.percent}%</td>
                    <td className="py-1 text-right">{inr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Internal Costing only (§4.9) */}
        {d.confidential && (
          <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "#fdeaea" }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#dc2626" }}>Internal Costing — Confidential</div>
            <div className="grid grid-cols-2 gap-2" style={{ color: "var(--text-primary)" }}>
              <Row label="Cost Basis" value={inr(d.cost_basis)} />
              <Row label="Gross Profit" value={inr(d.gross_profit)} />
              <Row label="GP %" value={`${d.gp_percent?.toFixed(1)}%`} />
              <Row label="Target / Min GP %" value={`${d.target_gp_percent}% / ${d.min_gp_percent}%`} />
              {d.cost_sheet && <Row label="Cost Sheet" value={d.cost_sheet} />}
              {d.required_authority && <Row label="Approval Authority" value={d.required_authority} />}
              {!!d.foc_value && <Row label="FOC Granted" value={inr(d.foc_value)} />}
              {!!d.installation_waiver && <Row label="Installation Waiver" value={inr(d.installation_waiver)} />}
              {!!d.transport_waiver && <Row label="Transport Waiver" value={inr(d.transport_waiver)} />}
              {!!d.price_override_percent && <Row label="Price Override %" value={`${d.price_override_percent}%`} />}
              {d.conditions && <Row label="Conditions" value={d.conditions} />}
            </div>
            {d.triggered_rules && (
              <div className="mt-2 text-[11px]" style={{ color: "#b91c1c" }}>
                <span className="font-semibold">Triggered rules: </span>{d.triggered_rules}
              </div>
            )}
          </div>
        )}

        {/* Delivery & execution terms (§12/§29/§30/§35) — customer-facing. */}
        {d.customer_facing && (d.validity_days || d.delivery_period || d.installation_period || d.warranty_terms) && (
          <div className="mt-6 grid gap-3 border-t pt-4 md:grid-cols-2" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            {!!d.validity_days && <Row label="Quotation Validity" value={`${d.validity_days} days from date`} />}
            {d.delivery_period && <Row label="Delivery Period" value={d.delivery_period} />}
            {d.installation_period && <Row label="Installation Period" value={d.installation_period} />}
            {d.warranty_terms && (
              <div className="md:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Warranty</div>
                <div className="text-sm" style={{ color: "var(--text-primary)" }}>{d.warranty_terms}</div>
              </div>
            )}
          </div>
        )}

        {/* Inclusions / Exclusions (§31/§32) — customer-facing. */}
        {d.customer_facing && ((d.inclusions?.length ?? 0) > 0 || (d.exclusions?.length ?? 0) > 0) && (
          <div className="mt-6 grid gap-4 border-t pt-4 md:grid-cols-2" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            {(d.inclusions?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#15803d" }}>Included</div>
                <ul className="list-disc pl-5 text-sm" style={{ color: "var(--text-primary)" }}>
                  {d.inclusions!.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {(d.exclusions?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#dc2626" }}>Excluded</div>
                <ul className="list-disc pl-5 text-sm" style={{ color: "var(--text-primary)" }}>
                  {d.exclusions!.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {d.customer_facing && d.assumptions && (
          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Assumptions</div>
            <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--text-primary)", fontFamily: "inherit" }}>{d.assumptions}</pre>
          </div>
        )}

        {d.terms_and_conditions && (
          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Terms &amp; Conditions</div>
            <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--text-primary)", fontFamily: "inherit" }}>{d.terms_and_conditions}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: strong ? 700 : 400 }}>{value}</span>
    </div>
  )
}
