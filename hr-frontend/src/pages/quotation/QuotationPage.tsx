// Quotation Studio · Customer Quotation list (Phase 2 spec §4.5), stage 4.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"
import { quotationGet, quotationPost, costSheetGet } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

interface ApprovedCostSheet { name: string; cost_title: string; company_name: string | null }

export function QuotationPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data: sheets } = useQuery({
    queryKey: ["q_approved_cost_sheets"],
    queryFn: () => costSheetGet<ApprovedCostSheet[]>("get_approved_cost_sheets"),
    enabled: open,
  })

  const fields: FieldSpec[] = [
    { name: "quotation_title", label: "Title", type: "text", required: true, placeholder: "e.g. Kitchen — Quotation" },
    {
      name: "cost_sheet", label: "Build on Cost Sheet (approved)", type: "select", required: true,
      help: "Lines seed from its BOQ; cost basis + GP targets come from it.",
      options: (sheets ?? []).map((s) => ({
        value: s.name, label: `${s.name} · ${s.cost_title}${s.company_name ? " · " + s.company_name : ""}`,
      })),
    },
  ]

  async function handleCreate(values: DrawerValues) {
    setSubmitting(true)
    try {
      const res = await quotationPost<{ success: boolean; name: string }>("create_quotation", { payload: values })
      toast.success("Quotation created")
      setOpen(false)
      navigate(`/quotation/quotations/${res.name}`)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not create")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ArchetypePage
        queryKey="q_quotations"
        title="Customer Quotations"
        workspaceLabel="Quotation Studio"
        fetcher={() => quotationGet<ModulePayload>("get_quotations_page")}
        searchPlaceholder="Search quotations..."
        onRowClick={(row: Row) => navigate(`/quotation/quotations/${row.name}`)}
        actions={
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>
            <Plus size={16} /> New Quotation
          </button>
        }
      />
      <RecordDrawer
        open={open}
        title="New Quotation"
        subtitle="Build on an approved cost sheet."
        fields={fields}
        submitLabel="Create & Open"
        submitting={submitting}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  )
}
