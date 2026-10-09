import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { X, PackageCheck, AlertTriangle, CheckCircle2, FilePlus2, Printer } from "lucide-react"
import {
  listGoodsReceipts, listPosAwaitingReceipt, getGrn, createGrnFromPo, saveGrnLines, confirmGrn,
  type GrnListRow, type Grn, type GrnLine,
} from "@/api/logistics"
import { printGrnReceipt } from "./printGrn"

export function GoodsReceiptsTab() {
  const qc = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)

  const { data: grnData, isLoading } = useQuery({ queryKey: ["grns"], queryFn: () => listGoodsReceipts(), staleTime: 15_000 })
  const { data: poData } = useQuery({ queryKey: ["pos-awaiting"], queryFn: listPosAwaitingReceipt, staleTime: 15_000 })
  const grns = grnData?.grns ?? []
  const pos = poData?.pos ?? []

  function refresh() {
    qc.invalidateQueries({ queryKey: ["grns"] })
    qc.invalidateQueries({ queryKey: ["pos-awaiting"] })
  }

  async function makeReceipt(po: string) {
    try {
      const grn = await createGrnFromPo(po)
      toast.success("Order receipt created — confirm received quantities")
      refresh(); setOpen(grn.name)
    } catch { toast.error("Could not create order receipt") }
  }

  return (
    <div className="space-y-5">
      {/* POs awaiting receipt */}
      {pos.length > 0 && (
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>Purchase orders awaiting a receipt</p>
          <div className="space-y-1.5">
            {pos.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 text-sm py-1">
                <div><span className="font-medium" style={{ color: "var(--text-primary)" }}>{p.vendor}</span>
                  <span className="text-[11px] ml-2" style={{ color: "var(--text-tertiary)" }}>{p.name} · {p.po_date || ""}</span></div>
                <button onClick={() => makeReceipt(p.name)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                  <FilePlus2 size={13} /> Create order receipt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GRN list */}
      {isLoading ? (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</div>
      ) : grns.length === 0 ? (
        <div className="py-16 text-center" style={{ color: "var(--text-tertiary)" }}>
          <PackageCheck size={34} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No goods receipts yet. Create one from a purchase order above to check what arrived.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border bg-white" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>{["Receipt", "Vendor", "PO", "Status", "Ordered", "Received", "Check"].map((h) => (
                <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {grns.map((r: GrnListRow) => (
                <tr key={r.name} onClick={() => setOpen(r.name)} className="border-t cursor-pointer hover:bg-[var(--overlay-hover)]" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="py-2.5 px-3 font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</td>
                  <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{r.vendor}</td>
                  <td className="py-2.5 px-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>{r.purchase_order}</td>
                  <td className="py-2.5 px-3"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{r.status}</span></td>
                  <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-tertiary)" }}>{r.ordered_qty}</td>
                  <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-primary)" }}>{r.received_qty}</td>
                  <td className="py-2.5 px-3">
                    {r.fully_received
                      ? <span className="flex items-center gap-1 text-[11px] text-green-600"><CheckCircle2 size={13} /> All received</span>
                      : <span className="flex items-center gap-1 text-[11px]" style={{ color: "#92400e" }}><AlertTriangle size={13} /> {r.short_lines} short</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <GrnDrawer name={open} onClose={() => setOpen(null)} onSaved={refresh} />}
    </div>
  )
}

function GrnDrawer({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()
  const [lines, setLines] = useState<GrnLine[] | null>(null)
  const [busy, setBusy] = useState(false)
  const { data } = useQuery<Grn>({ queryKey: ["grn", name], queryFn: () => getGrn(name) })
  const rows = lines ?? data?.lines ?? []
  const isDraft = data?.status === "Draft"

  function setQty(i: number, v: number) {
    const next = (lines ?? data?.lines ?? []).map((l, idx) => idx === i ? { ...l, received_qty: v } : l)
    setLines(next)
  }

  async function save(confirm: boolean) {
    setBusy(true)
    try {
      await saveGrnLines(name, rows)
      if (confirm) await confirmGrn(name)
      toast.success(confirm ? "Receipt confirmed" : "Saved")
      qc.invalidateQueries({ queryKey: ["grn", name] }); onSaved()
      if (confirm) onClose()
    } catch { toast.error("Could not save receipt") } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg h-full bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 bg-white border-b px-5 py-3 flex items-center justify-between" style={{ borderColor: "var(--border-subtle)" }}>
          <div><h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{name}</h3>
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{data?.vendor} · {data?.status}</p></div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => data && printGrnReceipt({ ...data, lines: rows })}
              disabled={!data}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border disabled:opacity-40"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <Printer size={13} /> Print receipt
            </button>
            <button onClick={onClose}><X size={18} style={{ color: "var(--text-tertiary)" }} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>Confirm the received quantity against what was ordered. Short lines are flagged so you can see exactly what's missing.</p>
          <table className="w-full text-sm">
            <thead><tr>{["Item", "Ordered", "Received"].map((h) => <th key={h} className="text-left py-1.5 text-[11px] uppercase" style={{ color: "var(--text-tertiary)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((l, i) => {
                const short = (l.received_qty ?? 0) < (l.ordered_qty ?? 0)
                return (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="py-2 pr-2" style={{ color: "var(--text-primary)" }}>{l.item_description}<div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{l.spec} {l.uom}</div></td>
                    <td className="py-2 pr-2 font-mono" style={{ color: "var(--text-tertiary)" }}>{l.ordered_qty}</td>
                    <td className="py-2">
                      <input type="number" value={l.received_qty ?? 0} disabled={!isDraft} onChange={(e) => setQty(i, Number(e.target.value))}
                        className="w-20 rounded-lg border px-2 py-1 text-sm font-mono" style={{ borderColor: short ? "#fca5a5" : "var(--border-subtle)", color: short ? "#991b1b" : "var(--text-primary)" }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {isDraft && (
          <div className="shrink-0 bg-white border-t px-5 py-3 flex gap-2" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={() => save(false)} disabled={busy} className="flex-1 rounded-lg border py-2 text-sm" style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>Save</button>
            <button onClick={() => save(true)} disabled={busy} className="flex-1 rounded-lg py-2 text-sm text-white disabled:opacity-50" style={{ background: "var(--bg-inverse)" }}>{busy ? "…" : "Confirm Received"}</button>
          </div>
        )}
      </div>
    </div>
  )
}
