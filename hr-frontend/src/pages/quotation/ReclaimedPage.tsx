// Reclaimed Materials · list. Returned / rejected / surplus stock kept for
// reuse; opening a piece shows where it can be used on current jobs.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"
import { reclaimedGet, reclaimedPost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

export function ReclaimedPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fields: FieldSpec[] = [
    { name: "material_title", label: "Material", type: "text", required: true, placeholder: "e.g. 18mm BWP Ply — Walnut" },
    { name: "return_reason", label: "Return Reason", type: "select", options: ["Rejected", "Surplus / Leftover", "Project Cancelled", "Damaged (usable)", "Offcut", "Other"].map((v) => ({ value: v, label: v })) },
    { name: "quantity", label: "Quantity", type: "text", placeholder: "1" },
  ]

  async function handleCreate(values: DrawerValues) {
    setSubmitting(true)
    try {
      const res = await reclaimedPost<{ success: boolean; name: string }>("create_reclaimed", { payload: values })
      toast.success("Logged to reclaimed inventory")
      setOpen(false)
      navigate(`/quotation/reclaimed/${res.name}`)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not create")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ArchetypePage
        queryKey="q_reclaimed"
        title="Reclaimed Materials"
        workspaceLabel="Quotation Studio"
        fetcher={() => reclaimedGet<ModulePayload>("list_reclaimed")}
        searchPlaceholder="Search returned stock..."
        onRowClick={(row: Row) => navigate(`/quotation/reclaimed/${row.name}`)}
        actions={
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>
            <Plus size={16} /> Log Returned Material
          </button>
        }
      />
      <RecordDrawer
        open={open}
        title="Log Returned Material"
        subtitle="Capture a returned / surplus piece. Add its spec, photos and location on the next screen."
        fields={fields}
        submitLabel="Create & Open"
        submitting={submitting}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  )
}
