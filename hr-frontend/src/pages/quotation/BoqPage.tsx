// Quotation Studio · BOQ list (Phase 2 spec §4.3), stage 2. Rows open the
// editor; "New BOQ" builds on an approved measurement (whose rows seed the
// lines) or starts blank.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"
import { boqGet, boqPost, measurementGet } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

interface ApprovedMeasurement { name: string; measurement_title: string; company_name: string | null }

export function BoqPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data: approved } = useQuery({
    queryKey: ["q_approved_measurements"],
    queryFn: () => measurementGet<ApprovedMeasurement[]>("get_approved_measurements"),
    enabled: open,
  })

  const fields: FieldSpec[] = [
    { name: "boq_title", label: "Title", type: "text", required: true, placeholder: "e.g. Kitchen — BOQ" },
    { name: "company_name", label: "Company / Client", type: "text" },
    {
      name: "measurement_sheet", label: "Build on Measurement (approved)", type: "select",
      help: "Its rows seed the BOQ lines. Leave blank to start empty.",
      options: (approved ?? []).map((m) => ({
        value: m.name, label: `${m.name} · ${m.measurement_title}${m.company_name ? " · " + m.company_name : ""}`,
      })),
    },
  ]

  async function handleCreate(values: DrawerValues) {
    setSubmitting(true)
    try {
      const res = await boqPost<{ success: boolean; name: string }>("create_boq", { payload: values })
      toast.success("BOQ created")
      setOpen(false)
      navigate(`/quotation/boqs/${res.name}`)
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not create")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ArchetypePage
        queryKey="q_boqs"
        title="BOQ / Configuration"
        workspaceLabel="Quotation Studio"
        fetcher={() => boqGet<ModulePayload>("get_boqs_page")}
        searchPlaceholder="Search BOQs..."
        onRowClick={(row: Row) => navigate(`/quotation/boqs/${row.name}`)}
        actions={
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus size={16} /> New BOQ
          </button>
        }
      />
      <RecordDrawer
        open={open}
        title="New BOQ"
        subtitle="Build on an approved measurement, or start blank."
        fields={fields}
        submitLabel="Create & Open"
        submitting={submitting}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </>
  )
}
