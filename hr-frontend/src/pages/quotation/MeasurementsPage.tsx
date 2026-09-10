// Quotation Studio · Measurement Sheets list (Phase 2 spec §4.2), stage 1.
// Uses the ArchetypePage renderer for the KPI strip + table; rows open the full
// editor, and "New Measurement" creates a draft then jumps into it.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"
import { measurementGet, measurementPost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

const CREATE_FIELDS: FieldSpec[] = [
  { name: "measurement_title", label: "Title", type: "text", required: true, placeholder: "e.g. Kitchen — Site Survey" },
  { name: "company_name", label: "Company / Client", type: "text" },
  {
    name: "measurement_type", label: "Type", type: "select", default: "Site Survey",
    options: ["Site Survey", "Final Measurement", "Production Measurement"].map((t) => ({ value: t, label: t })),
  },
  { name: "measurement_date", label: "Date", type: "date" },
  { name: "drawing_reference", label: "Drawing Reference", type: "text" },
]

export function MeasurementsPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(values: DrawerValues) {
    setSubmitting(true)
    try {
      const res = await measurementPost<{ success: boolean; name: string }>("create_measurement", { payload: values })
      toast.success("Measurement created")
      setOpen(false)
      navigate(`/quotation/measurements/${res.name}`)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not create")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ArchetypePage
        queryKey="q_measurements"
        title="Measurement Sheets"
        workspaceLabel="Quotation Studio"
        fetcher={() => measurementGet<ModulePayload>("get_measurements_page")}
        searchPlaceholder="Search measurements..."
        onRowClick={(row: Row) => navigate(`/quotation/measurements/${row.name}`)}
        actions={
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus size={16} /> New Measurement
          </button>
        }
      />
      <RecordDrawer
        open={open}
        title="New Measurement"
        subtitle="Create the sheet, then add rows in the editor."
        fields={CREATE_FIELDS}
        submitLabel="Create & Open"
        submitting={submitting}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  )
}
