// Quotation Studio · Sales Order detail (Phase 2 spec §4.11), stage 6 — the
// final stage of the six-stage chain. Shows the locked commercial baseline, the
// full traceability back to the quotation / BOQ / cost sheet revisions it was
// converted from, the order lines, and the Open → Confirmed → Cancelled status
// controls. The §5 project handover is triggered off a Confirmed order.
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { salesOrderGet, salesOrderPost } from "../peoplework/client"
import { StatusPill } from "../peoplework/components/Pills"
import { StageBar } from "./components/StageBar"
import { RegisterGrid, type GridCol, type GridRow } from "./components/RegisterGrid"

interface SalesOrder {
  name: string; so_title: string; opportunity: string | null; company_name: string | null
  so_date: string | null; status: string; stage: string; grand_total: number
  prepared_by: string | null
  quotation: string | null; quotation_revision: number | null
  boq: string | null; boq_revision: number | null
  cost_sheet: string | null; cost_sheet_revision: number | null
  notes: string | null; lines: GridRow[]
}

const LINE_COLS: GridCol[] = [
  { key: "line_type", label: "Type", width: 130 },
  { key: "section", label: "Section", width: 90 },
  { key: "specification", label: "Specification", width: 220 },
  { key: "quantity", label: "Qty", width: 55 },
  { key: "uom", label: "UOM", width: 55 },
  { key: "rate", label: "Rate", width: 100 },
  { key: "gross_amount", label: "Gross", width: 110 },
]

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0)
const rev = (r: number | null) => (r ? ` · R${String(r).padStart(2, "0")}` : "")

export function SalesOrderEditor() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["q_sales_order", name],
    queryFn: () => salesOrderGet<{ sales_order: SalesOrder }>("get_sales_order", { name }),
    staleTime: 0, refetchOnMount: "always",
  })
  const so = data?.sales_order

  async function setStatus(status: string) {
    setBusy(true)
    try {
      await salesOrderPost("set_status", { name, status })
      toast.success(`Marked ${status}`)
      qc.invalidateQueries({ queryKey: ["q_sales_order", name] })
    } catch (e) { toast.error((e as Error)?.message ?? "Could not update") } finally { setBusy(false) }
  }

  if (isLoading) return <div className="p-6" style={{ color: "var(--text-muted)" }}>Loading…</div>
  if (isError || !so) return <div className="p-6" style={{ color: "#dc2626" }}>Could not load: {(error as Error)?.message ?? "not found"}</div>

  const Cell = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</div>
    </div>
  )
  const Link = ({ to, label }: { to: string | null; label: string }) =>
    to ? <button onClick={() => navigate(to)} className="text-sm font-medium" style={{ color: "var(--brand-primary)" }}>{label}</button> : <span className="text-sm" style={{ color: "var(--text-muted)" }}>—</span>

  return (
    <div className="p-6">
      <button onClick={() => navigate("/quotation/sales-orders")} className="mb-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Sales Orders
      </button>

      <StageBar current="Sales Order" />

      <div className="mb-5 rounded-xl p-4" style={{ border: "0.5px solid var(--border, #e0d9cb)", background: "#fff" }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold" style={{ color: "var(--brand-primary)" }}>{so.so_title}</h1>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {so.name}{so.so_date && ` · ${so.so_date}`}{so.company_name && ` · ${so.company_name}`}
            </div>
          </div>
          <StatusPill value={so.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cell label="Grand Total" value={<strong>{inr(so.grand_total)}</strong>} />
          <Cell label="Prepared By" value={so.prepared_by} />
          <Cell label="Opportunity" value={so.opportunity} />
          <Cell label="Stage" value={so.stage} />
        </div>

        {/* Traceability to the approved chain it was converted from (§4.11). */}
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Approved Baseline</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Cell label={`Quotation${rev(so.quotation_revision)}`} value={<Link to={so.quotation ? `/quotation/quotations/${so.quotation}` : null} label={so.quotation ?? "—"} />} />
            <Cell label={`BOQ${rev(so.boq_revision)}`} value={<Link to={so.boq ? `/quotation/boqs/${so.boq}` : null} label={so.boq ?? "—"} />} />
            <Cell label={`Cost Sheet${rev(so.cost_sheet_revision)}`} value={<Link to={so.cost_sheet ? `/quotation/cost-sheets/${so.cost_sheet}` : null} label={so.cost_sheet ?? "—"} />} />
          </div>
        </div>

        {/* Status controls */}
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
          {so.status === "Open" && (
            <button onClick={() => setStatus("Confirmed")} disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--gold, #c8a24a)" }}>
              Confirm Order
            </button>
          )}
          {so.status === "Confirmed" && (
            <span className="self-center text-xs" style={{ color: "#15803d" }}>Confirmed — ready for §5 project handover.</span>
          )}
          {so.status !== "Cancelled" && (
            <button onClick={() => { if (window.confirm("Cancel this sales order?")) setStatus("Cancelled") }} disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ border: "0.5px solid #f3c2c2", color: "#dc2626" }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <RegisterGrid title="Order Lines" columns={LINE_COLS} rows={so.lines} editable={false}
        onSave={async () => {}} emptyLabel="No lines." />
    </div>
  )
}
