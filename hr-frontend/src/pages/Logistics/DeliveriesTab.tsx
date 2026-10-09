import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus, X, Upload, FileCheck2, Trash2, Truck,
} from "lucide-react"
import {
  listDeliveries, getDelivery, createDelivery, saveDelivery, updateDeliveryStatus, uploadPod,
  DELIVERY_STATUSES, type DeliveryListRow, type Delivery, type DeliveryItem, type DeliveryStatus,
} from "@/api/logistics"

const STATUS_TONE: Record<DeliveryStatus, { bg: string; fg: string }> = {
  "Pending": { bg: "var(--bg-subtle)", fg: "var(--text-secondary)" },
  "Ready for Dispatch": { bg: "#eff6ff", fg: "#1e40af" },
  "Dispatched": { bg: "#eef2ff", fg: "#3730a3" },
  "In Transit": { bg: "#fffbeb", fg: "#92400e" },
  "Delivered": { bg: "#ecfdf5", fg: "#065f46" },
  "Cancelled": { bg: "#fef2f2", fg: "#991b1b" },
}

function StatusBadge({ s }: { s: DeliveryStatus }) {
  const t = STATUS_TONE[s]
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: t.bg, color: t.fg }}>{s}</span>
}

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" }, { key: "open", label: "In progress" },
  { key: "Delivered", label: "Delivered" }, { key: "Cancelled", label: "Cancelled" },
]

export function DeliveriesTab() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Deep-link from the dashboard quick-add: /logistics?new=1 opens the create drawer.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreating(true)
      setSelected(null)
      searchParams.delete("new")
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data, isLoading } = useQuery({
    queryKey: ["deliveries", filter],
    queryFn: () => listDeliveries(filter && filter !== "open" ? filter : undefined, filter === "open" ? "open" : undefined),
    staleTime: 15_000,
  })
  const rows = data?.deliveries ?? []

  function refresh() {
    qc.invalidateQueries({ queryKey: ["deliveries"] })
    qc.invalidateQueries({ queryKey: ["delivery-dashboard"] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-xl">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={filter === f.key ? { background: "#fff", color: "var(--text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" } : { color: "var(--text-tertiary)" }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => { setCreating(true); setSelected(null) }}
          className="ml-auto flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg text-white"
          style={{ background: "var(--bg-inverse)" }}>
          <Plus size={15} /> New Delivery
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center" style={{ color: "var(--text-tertiary)" }}>
          <Truck size={34} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No deliveries yet. Create one to start tracking dispatch & proof of delivery.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border bg-white" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>{["Delivery", "Customer", "Status", "Transporter", "POD", "Expected", "Items"].map((h) => (
                <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r: DeliveryListRow) => (
                <tr key={r.name} onClick={() => { setSelected(r.name); setCreating(false) }}
                  className="border-t cursor-pointer hover:bg-[var(--overlay-hover)]" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="py-2.5 px-3 font-medium" style={{ color: "var(--text-primary)" }}>{r.delivery_title}<div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{r.name}</div></td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{r.customer_name || "—"}</td>
                  <td className="py-2.5 px-3"><StatusBadge s={r.status} /></td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{r.transporter}</td>
                  <td className="py-2.5 px-3">{r.pod_received ? <FileCheck2 size={15} className="text-green-600" /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{r.expected_date || "—"}</td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-tertiary)" }}>{r.item_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(selected || creating) && (
        <DeliveryDrawer
          name={selected}
          onClose={() => { setSelected(null); setCreating(false) }}
          onSaved={() => { refresh() }}
        />
      )}
    </div>
  )
}

// ── Detail / create drawer ────────────────────────────────────────────────────
const BLANK: Partial<Delivery> = { customer_name: "", status: "Pending", transporter: "Self / Manual", items: [] }

function DeliveryDrawer({ name, onClose, onSaved }: { name: string | null; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()
  const isNew = !name
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<Partial<Delivery>>(BLANK)
  const [busy, setBusy] = useState(false)

  const { data: loaded } = useQuery({
    queryKey: ["delivery", name],
    queryFn: () => getDelivery(name as string),
    enabled: !!name,
  })
  const set = (patch: Partial<Delivery>) => setDraft((x) => ({ ...x, ...patch }))
  // For an existing record we merge loaded + local edits.
  const view: Partial<Delivery> = isNew ? draft : { ...loaded, ...draft }

  function setItem(i: number, patch: Partial<DeliveryItem>) {
    const items = [...(view.items ?? [])]; items[i] = { ...items[i], ...patch }; set({ items })
  }
  function addItem() { set({ items: [...(view.items ?? []), { item_description: "", qty: 1, uom: "Nos" }] }) }
  function delItem(i: number) { const items = [...(view.items ?? [])]; items.splice(i, 1); set({ items }) }

  async function save() {
    setBusy(true)
    try {
      if (isNew) {
        if (!view.customer_name) { toast.error("Customer is required"); setBusy(false); return }
        await createDelivery(view)
        toast.success("Delivery created")
      } else {
        await saveDelivery(name as string, view)
        toast.success("Saved")
      }
      qc.invalidateQueries({ queryKey: ["delivery", name] })
      onSaved(); onClose()
    } catch (e: unknown) {
      toast.error(errMsg(e, "Could not save"))
    } finally { setBusy(false) }
  }

  async function changeStatus(status: DeliveryStatus) {
    if (isNew) { set({ status }); return }
    setBusy(true)
    try {
      await updateDeliveryStatus(name as string, status)
      toast.success(`Status → ${status}`)
      qc.invalidateQueries({ queryKey: ["delivery", name] }); onSaved()
    } catch (e: unknown) {
      toast.error(errMsg(e, "Could not update status"))
    } finally { setBusy(false) }
  }

  async function onPod(file: File) {
    if (isNew) { toast.error("Save the delivery first, then attach POD"); return }
    setBusy(true)
    try {
      await uploadPod(name as string, file)
      toast.success("Proof of delivery attached — you can now mark it Delivered")
      qc.invalidateQueries({ queryKey: ["delivery", name] }); onSaved()
    } catch (e: unknown) {
      toast.error(errMsg(e, "Upload failed"))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg h-full bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 bg-white border-b px-5 py-3 flex items-center justify-between" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{isNew ? "New Delivery" : view.delivery_title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: "var(--text-tertiary)" }} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Status row (existing only) */}
          {!isNew && (
            <div>
              <label className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Status (manual)</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {DELIVERY_STATUSES.map((s) => (
                  <button key={s} disabled={busy} onClick={() => changeStatus(s)}
                    className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                    style={view.status === s
                      ? { background: STATUS_TONE[s].bg, color: STATUS_TONE[s].fg, borderColor: STATUS_TONE[s].fg }
                      : { borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                    {s}
                  </button>
                ))}
              </div>
              {!view.pod_received && (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                  “Delivered” is only allowed once a Proof of Delivery document is attached below.
                </p>
              )}
            </div>
          )}

          <Txt label="Customer" value={view.customer_name} onChange={(v) => set({ customer_name: v })} />
          <Txt label="Sales Order / Reference" value={view.sales_order ?? ""} onChange={(v) => set({ sales_order: v })} />
          <Area label="Delivery Address" value={view.destination_address ?? ""} onChange={(v) => set({ destination_address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Txt label="Expected Date" type="date" value={view.expected_date ?? ""} onChange={(v) => set({ expected_date: v })} />
            <Txt label="Dispatch Date" type="date" value={view.dispatch_date ?? ""} onChange={(v) => set({ dispatch_date: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Sel label="Transporter" value={view.transporter ?? "Self / Manual"} options={["Self / Manual", "Porter", "Other"]} onChange={(v) => set({ transporter: v })} />
            <Txt label="Vehicle No." value={view.vehicle_no ?? ""} onChange={(v) => set({ vehicle_no: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Txt label="Driver Name" value={view.driver_name ?? ""} onChange={(v) => set({ driver_name: v })} />
            <Txt label="Driver Phone" value={view.driver_phone ?? ""} onChange={(v) => set({ driver_phone: v })} />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Goods</label>
              <button onClick={addItem} className="text-xs flex items-center gap-1" style={{ color: "var(--text-secondary)" }}><Plus size={12} /> Add item</button>
            </div>
            <div className="space-y-2 mt-1">
              {(view.items ?? []).map((it, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input value={it.item_description ?? ""} onChange={(e) => setItem(i, { item_description: e.target.value })} placeholder="Item / goods"
                    className="flex-1 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
                  <input value={it.qty ?? ""} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} placeholder="Qty" type="number"
                    className="w-16 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
                  <input value={it.uom ?? ""} onChange={(e) => setItem(i, { uom: e.target.value })} placeholder="Unit"
                    className="w-16 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: "var(--border-subtle)" }} />
                  <button onClick={() => delItem(i)}><Trash2 size={14} className="text-red-500" /></button>
                </div>
              ))}
              {(view.items ?? []).length === 0 && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No items added.</p>}
            </div>
          </div>

          {/* POD */}
          {!isNew && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Proof of Delivery</span>
                {view.pod_received
                  ? <span className="text-[11px] flex items-center gap-1 text-green-600"><FileCheck2 size={13} /> Attached</span>
                  : <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Not attached</span>}
              </div>
              {view.pod_document && <a href={view.pod_document} target="_blank" rel="noreferrer" className="text-xs underline block mt-1" style={{ color: "var(--text-secondary)" }}>View document</a>}
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPod(f) }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                <Upload size={13} /> {view.pod_document ? "Replace POD" : "Upload POD"}
              </button>
            </div>
          )}

          <Area label="Notes" value={view.notes ?? ""} onChange={(v) => set({ notes: v })} />
        </div>

        <div className="shrink-0 bg-white border-t px-5 py-3 flex gap-2" style={{ borderColor: "var(--border-subtle)" }}>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>Close</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg py-2 text-sm text-white disabled:opacity-50" style={{ background: "var(--bg-inverse)" }}>
            {busy ? "Saving…" : isNew ? "Create Delivery" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

function errMsg(e: unknown, fallback: string): string {
  const d = (e as { response?: { data?: { message?: { error?: string }; exc?: string } }; message?: string })
  return d?.response?.data?.message?.error || d?.message || fallback
}

function Txt({ label, value, onChange, type = "text" }: { label: string; value?: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
    </div>
  )
}
function Area({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{label}</label>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={2}
        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }} />
    </div>
  )
}
function Sel({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
