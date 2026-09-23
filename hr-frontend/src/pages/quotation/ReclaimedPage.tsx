// Reclaimed Materials · list. Returned / rejected / surplus stock kept for
// reuse; opening a piece shows where it can be used on current jobs.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { RecordDrawer, type FieldSpec, type DrawerValues } from "../peoplework/components/RecordDrawer"
import { reclaimedGet, reclaimedPost } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

interface Savings {
  waste_avoided: number; pieces_reused: number; reusable_value: number
  available: number; reserved: number
  by_material: { material: string; value: number }[]
  recent_reused: { material_title: string; value: number; project: string }[]
}

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0)

export function ReclaimedPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data: savings } = useQuery({
    queryKey: ["reuse_savings"],
    queryFn: () => reclaimedGet<Savings>("get_reuse_savings"),
    staleTime: 60 * 1000,
  })

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

  const maxMat = Math.max(1, ...(savings?.by_material ?? []).map((m) => m.value))

  return (
    <>
      {savings && savings.pieces_reused > 0 && (
        <div className="mb-4 rounded-xl p-4 shadow-sm" style={{ border: "0.5px solid #bbf7d0", background: "#f0fdf4" }}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#15803d" }}>♻ Reuse impact</span>
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              <b>{inr(savings.waste_avoided)}</b> waste avoided · <b>{savings.pieces_reused}</b> pieces reused
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {inr(savings.reusable_value)} still reusable on hand ({savings.available} available · {savings.reserved} reserved)
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {savings.by_material.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Saved by material</div>
                <div className="space-y-1">
                  {savings.by_material.slice(0, 6).map((m) => (
                    <div key={m.material} className="flex items-center gap-2">
                      <div className="w-32 shrink-0 truncate text-xs" style={{ color: "var(--text-primary)" }}>{m.material}</div>
                      <div className="h-3 flex-1 rounded" style={{ background: "#dcfce7" }}>
                        <div className="h-3 rounded" style={{ width: `${Math.max(4, (m.value / maxMat) * 100)}%`, background: "#22c55e" }} />
                      </div>
                      <div className="w-20 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{inr(m.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {savings.recent_reused.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Recently reused</div>
                <div className="space-y-1">
                  {savings.recent_reused.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate" style={{ color: "var(--text-primary)" }}>{r.material_title}</span>
                      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{r.project} · {inr(r.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
