// Quotation Studio · Cost Sheet list (Phase 2 spec §4.4), stage 3. Rows open the
// editor; "New Cost Sheet" builds on an approved BOQ.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"
import { costSheetGet, costSheetPost, boqGet } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

interface ApprovedBoq { name: string; boq_title: string; company_name: string | null }

export function CostSheetPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data: boqs } = useQuery({
    queryKey: ["q_approved_boqs"],
    queryFn: () => boqGet<ApprovedBoq[]>("get_approved_boqs"),
    enabled: open,
  })

  const fields: FieldSpec[] = [
    { name: "cost_title", label: "Title", type: "text", required: true, placeholder: "e.g. Kitchen — Cost Sheet" },
    {
      name: "boq", label: "Build on BOQ (approved)", type: "select", required: true,
      help: "Line costs + selling total are snapshotted from this BOQ.",
      options: (boqs ?? []).map((b) => ({
        value: b.name, label: `${b.name} · ${b.boq_title}${b.company_name ? " · " + b.company_name : ""}`,
      })),
    },
  ]

  async function handleCreate(values: DrawerValues) {
    setSubmitting(true)
    try {
      const res = await costSheetPost<{ success: boolean; name: string }>("create_cost_sheet", { payload: values })
      toast.success("Cost sheet created")
      setOpen(false)
      navigate(`/quotation/cost-sheets/${res.name}`)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not create")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ArchetypePage
        queryKey="q_cost_sheets"
        title="Cost Sheets"
        workspaceLabel="Quotation Studio"
        fetcher={() => costSheetGet<ModulePayload>("get_cost_sheets_page")}
        searchPlaceholder="Search cost sheets..."
        onRowClick={(row: Row) => navigate(`/quotation/cost-sheets/${row.name}`)}
        actions={
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>
            <Plus size={16} /> New Cost Sheet
          </button>
        }
      />
      <RecordDrawer
        open={open}
        title="New Cost Sheet"
        subtitle="Snapshot costs from an approved BOQ."
        fields={fields}
        submitLabel="Create & Open"
        submitting={submitting}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  )
}
