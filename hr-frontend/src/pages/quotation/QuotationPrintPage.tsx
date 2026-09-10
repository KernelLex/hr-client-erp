// Quotation Studio · Quotation print views (Phase 2 spec §4.9). Four formats:
// Summary / Detailed Commercial / Technical BOQ (customer-facing, no cost or GP)
// and Internal Costing (confidential — shows cost basis + GP). The backend
// redacts cost/GP from the three customer formats; this page renders whatever it
// is given and exposes the browser print dialog.
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Printer } from "lucide-react"
import { quotationGet } from "../peoplework/client"

interface PrintLine {
  line_type?: string; section?: string; specification?: string; measurement?: string
  quantity?: number; uom?: string; rate?: number; gross_amount?: number
}
interface PrintDoc {
  format: string; format_label: string; customer_facing: boolean; watermark: string | null
  name: string; revision: number; title: string; company_name: string | null; status: string
  lines: PrintLine[]; terms_and_conditions: string | null
  gross_total?: number; discount_percent?: number; discount_amount?: number; adjustment?: number
  net_before_gst?: number; gst_percent?: number; gst_amount?: number; grand_total?: number
  confidential?: boolean; cost_basis?: number; gross_profit?: number; gp_percent?: number
  target_gp_percent?: number; min_gp_percent?: number; cost_sheet?: string; conditions?: string
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

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !d) return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const showPricing = d.grand_total != null // technical BOQ omits all pricing

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button onClick={() => navigate(`/quotation/quotations/${name}`)} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={14} /> Back to quotation
        </button>
        <div className="flex items-center gap-2">
          {d.confidential && <span className="rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: "#fdeaea", color: "#dc2626" }}>CONFIDENTIAL — Internal Only</span>}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
        {d.watermark && <div className="mb-4 text-center text-sm font-bold tracking-widest" style={{ color: "#dc2626" }}>{d.watermark}</div>}

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

        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }} className="text-left text-[11px] uppercase tracking-wide">
              <th className="py-1.5">Section</th>
              <th className="py-1.5">Specification</th>
              <th className="py-1.5">Measurement</th>
              <th className="py-1.5 text-right">Qty</th>
              <th className="py-1.5">UOM</th>
              {showPricing && <th className="py-1.5 text-right">Rate</th>}
              {showPricing && <th className="py-1.5 text-right">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {d.lines.map((ln, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                <td className="py-1.5">{ln.section || "—"}</td>
                <td className="py-1.5">{ln.specification || "—"}</td>
                <td className="py-1.5">{ln.measurement || "—"}</td>
                <td className="py-1.5 text-right">{ln.quantity ?? "—"}</td>
                <td className="py-1.5">{ln.uom || "—"}</td>
                {showPricing && <td className="py-1.5 text-right">{inr(ln.rate)}</td>}
                {showPricing && <td className="py-1.5 text-right">{inr(ln.gross_amount)}</td>}
              </tr>
            ))}
            {d.lines.length === 0 && <tr><td colSpan={7} className="py-3 text-center" style={{ color: "var(--text-muted)" }}>No lines.</td></tr>}
          </tbody>
        </table>

        {showPricing && (
          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <Row label="Gross" value={inr(d.gross_total)} />
              <Row label={`Discount (${d.discount_percent}%)`} value={`− ${inr(d.discount_amount)}`} />
              {!!d.adjustment && <Row label="Adjustment" value={inr(d.adjustment)} />}
              <Row label="Net before GST" value={inr(d.net_before_gst)} />
              <Row label={`GST (${d.gst_percent}%)`} value={inr(d.gst_amount)} />
              <div className="border-t pt-1" style={{ borderColor: "var(--border, #e0d9cb)" }}>
                <Row label="Grand Total" value={inr(d.grand_total)} strong />
              </div>
            </div>
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
              {d.conditions && <Row label="Conditions" value={d.conditions} />}
            </div>
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

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: strong ? 700 : 400 }}>{value}</span>
    </div>
  )
}
