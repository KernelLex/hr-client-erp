import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, X, Trash2, ShoppingCart } from "lucide-react"
import {
  listPurchaseOrders, listProjectOptions, createPurchaseOrder,
  type PoListRow, type PoLineInput,
} from "@/api/logistics"

const PO_STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: "var(--bg-subtle)", fg: "var(--text-secondary)" },
  Sent: { bg: "#eff6ff", fg: "#1d4ed8" },
  Received: { bg: "#ecfdf5", fg: "#065f46" },
  Cancelled: { bg: "#fef2f2", fg: "#991b1b" },
}

export function PurchaseOrdersTab() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep-link: /logistics?tab=po&new=1 opens the create drawer directly.
  useEffect(() => {
    if (searchParams.get("newpo") === "1") {
      setCreating(true)
      searchParams.delete("newpo")
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => listPurchaseOrders(),
    staleTime: 15_000,
  })
  const rows = data?.pos ?? []
  const kpis = data?.kpis ?? {}

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-4 text-sm">
          <Kpi label="Total" value={kpis.total ?? 0} />
          <Kpi label="Draft" value={kpis.draft ?? 0} />
          <Kpi label="Sent" value={kpis.sent ?? 0} />
          <Kpi label="Received" value={kpis.received ?? 0} />
        </div>
        <button onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg text-white"
          style={{ background: "var(--bg-inverse)" }}>
          <Plus size={15} /> New Purchase Order
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center" style={{ color: "var(--text-tertiary)" }}>
          <ShoppingCart size={34} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No purchase orders yet. Raise one — with or without linking it to a project.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border bg-white" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>{["PO", "Vendor", "Project", "Status", "Date", "Total"].map((h) => (
                <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r: PoListRow) => (
                <tr key={r.name} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="py-2.5 px-3 font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{r.vendor}{r.is_intercompany ? <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#eff6ff", color: "#1d4ed8" }}>intercompany</span> : null}</td>
                  <td className="py-2.5 px-3 text-[12px]" style={{ color: r.project ? "var(--text-secondary)" : "var(--text-tertiary)" }}>{r.project || "— standalone —"}</td>
                  <td className="py-2.5 px-3"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: PO_STATUS_TONE[r.status]?.bg, color: PO_STATUS_TONE[r.status]?.fg }}>{r.status}</span></td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{r.po_date || "—"}</td>
                  <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-primary)" }}>{(r.total ?? 0).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewPoDrawer
          onClose={() => setCreating(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); qc.invalidateQueries({ queryKey: ["pos-awaiting"] }); setCreating(false) }}
        />
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-wide mr-1.5" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  )
}

const BLANK_LINE: PoLineInput = { item_description: "", spec: "", qty: 1, uom: "", rate: 0 }

function NewPoDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [vendor, setVendor] = useState("")
  const [project, setProject] = useState<string>("")
  const [poDate, setPoDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<PoLineInput[]>([{ ...BLANK_LINE }])
  const [busy, setBusy] = useState(false)

  const { data: projects = [] } = useQuery({ queryKey: ["po-project-options"], queryFn: listProjectOptions, staleTime: 60_000 })

  function setLine(i: number, patch: Partial<PoLineInput>) {
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)

  async function save() {
    if (!vendor.trim()) { toast.error("Enter a vendor"); return }
    const clean = lines.filter((l) => l.item_description.trim())
    if (!clean.length) { toast.error("Add at least one line item"); return }
    setBusy(true)
    try {
      const res = await createPurchaseOrder({ vendor: vendor.trim(), project: project || null, po_date: poDate, notes, lines: clean })
      toast.success(`Purchase order ${res.name} created${res.project ? "" : " (standalone)"}`)
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Could not create purchase order")
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg h-full bg-white overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>New Purchase Order</h3>
          <button onClick={onClose}><X size={18} style={{ color: "var(--text-tertiary)" }} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Vendor">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Supplier / company name"
              className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
          </Field>

          <Field label="Link to project (optional)">
            <select value={project} onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
              <option value="">— No project (standalone PO) —</option>
              {projects.map((p) => (
                <option key={p.name} value={p.name}>{p.project_title || p.name} · {p.company}</option>
              ))}
            </select>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>Leave blank to raise a PO not tied to any project.</p>
          </Field>

          <Field label="PO date">
            <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Line items</label>
              <button onClick={() => setLines((ls) => [...ls, { ...BLANK_LINE }])} className="text-xs flex items-center gap-1" style={{ color: "var(--text-secondary)" }}><Plus size={12} /> Add line</button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="flex gap-2">
                    <input value={l.item_description} onChange={(e) => setLine(i, { item_description: e.target.value })} placeholder="Item description"
                      className="flex-1 rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
                    {lines.length > 1 && (
                      <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 size={15} style={{ color: "var(--text-tertiary)" }} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <input value={l.spec ?? ""} onChange={(e) => setLine(i, { spec: e.target.value })} placeholder="Spec"
                      className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: "var(--border-subtle)" }} />
                    <input type="number" value={l.qty ?? 0} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} placeholder="Qty"
                      className="rounded-md border px-2 py-1.5 text-xs font-mono" style={{ borderColor: "var(--border-subtle)" }} />
                    <input value={l.uom ?? ""} onChange={(e) => setLine(i, { uom: e.target.value })} placeholder="UOM"
                      className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: "var(--border-subtle)" }} />
                    <input type="number" value={l.rate ?? 0} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} placeholder="Rate"
                      className="rounded-md border px-2 py-1.5 text-xs font-mono" style={{ borderColor: "var(--border-subtle)" }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm mt-2" style={{ color: "var(--text-secondary)" }}>Total: <span className="font-semibold font-mono" style={{ color: "var(--text-primary)" }}>{total.toLocaleString("en-IN")}</span></div>
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
          </Field>
        </div>
        <div className="sticky bottom-0 bg-white border-t px-5 py-3 flex gap-2" style={{ borderColor: "var(--border-subtle)" }}>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg py-2 text-sm text-white disabled:opacity-50" style={{ background: "var(--bg-inverse)" }}>{busy ? "…" : "Create PO"}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide block mb-1.5" style={{ color: "var(--text-tertiary)" }}>{label}</label>
      {children}
    </div>
  )
}
