// Document Link Bar (print/UI spec §4) — the six-stage chain shown on every
// studio document so a user can jump Opportunity → Measurement → BOQ → Cost
// Sheet → Quotation → Sales Order. The links come from get_document_chain, which
// resolves the whole chain from whichever document is open.
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { quotationGet } from "../../peoplework/client"

interface Chain {
  opportunity?: string | null; measurement?: string | null; boq?: string | null
  cost_sheet?: string | null; quotation?: string | null; sales_order?: string | null
}

const STEPS: { key: keyof Chain; label: string; route: (n: string) => string | null }[] = [
  { key: "opportunity", label: "Opportunity", route: () => "/crm/opportunities" },
  { key: "measurement", label: "Measurement", route: (n) => `/quotation/measurements/${n}` },
  { key: "boq", label: "BOQ", route: (n) => `/quotation/boqs/${n}` },
  { key: "cost_sheet", label: "Cost Sheet", route: (n) => `/quotation/cost-sheets/${n}` },
  { key: "quotation", label: "Quotation", route: (n) => `/quotation/quotations/${n}` },
  { key: "sales_order", label: "Sales Order", route: (n) => `/quotation/sales-orders/${n}` },
]

export function DocumentLinkBar({ doctype, name }: { doctype: string; name: string }) {
  const navigate = useNavigate()
  const { data: chain } = useQuery({
    queryKey: ["doc_chain", doctype, name],
    queryFn: () => quotationGet<Chain>("get_document_chain", { doctype, name }),
    staleTime: 30_000,
  })
  if (!chain) return null
  const steps = STEPS.filter((s) => chain[s.key])
  if (steps.length <= 1) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        const val = chain[s.key] as string
        const current = val === name
        const to = s.route(val)
        return (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && <span style={{ color: "var(--text-muted)" }}>→</span>}
            <button
              disabled={current || !to}
              onClick={() => to && navigate(to)}
              className="rounded px-1.5 py-0.5 disabled:cursor-default"
              style={{
                background: current ? "var(--brand-primary)" : "var(--cream-dark, #ebe3d3)",
                color: current ? "#fff" : "var(--brand-primary)",
              }}
              title={`${s.label} ${val}`}
            >
              <span className="font-semibold">{s.label}</span> {val}
            </button>
          </span>
        )
      })}
    </div>
  )
}
