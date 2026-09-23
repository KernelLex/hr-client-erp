// Project Delivery · Procurement (Phase 2). Build a Material Requirement Sheet from
// the project's BOQ, assign vendors (VOQ), then generate a PO per vendor.
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { procurementGet, procurementPost } from "../peoplework/client"

type MRLine = { idx: number; category: string; item_description: string; spec: string; qty: number; uom: string; item_code?: string; assigned_vendor?: string; est_rate?: number; est_amount?: number }
type MR = { exists: boolean; name?: string; mr_title?: string; status?: string; source_boqs?: string; lines?: MRLine[] }
type VOQ = { vendors: { vendor: string; lines: number; value: number }[]; unassigned: number }
type PO = { name: string; vendor: string; status: string; total?: number; is_intercompany?: number; supplying_company?: string; po_date?: string }
type POList = { pos: PO[]; kpis: Record<string, number> }

const inr = (n?: number) => "₹" + (n || 0).toLocaleString("en-IN")
const CAT_COLORS: Record<string, string> = { Carcass: "bg-amber-50 text-amber-700", Shutter: "bg-orange-50 text-orange-700", Finish: "bg-purple-50 text-purple-700", "Edge Band": "bg-teal-50 text-teal-700", Hardware: "bg-blue-50 text-blue-700" }

export function ProcurementPage() {
  const { name } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [lines, setLines] = useState<MRLine[] | null>(null)

  const mr = useQuery({ queryKey: ["mrs", name], queryFn: () => procurementGet<MR>("get_requirement", { project: name! }), enabled: !!name })
  const pos = useQuery({ queryKey: ["pos", name], queryFn: () => procurementGet<POList>("list_pos", { project: name! }), enabled: !!name })
  const mrName = mr.data?.name
  const voq = useQuery({ queryKey: ["voq", mrName], queryFn: () => procurementGet<VOQ>("get_voq", { name: mrName! }), enabled: !!mrName })

  const rows = lines ?? mr.data?.lines ?? []
  const refresh = () => { qc.invalidateQueries({ queryKey: ["mrs", name] }); qc.invalidateQueries({ queryKey: ["voq", mrName] }); qc.invalidateQueries({ queryKey: ["pos", name] }); setLines(null) }

  const build = useMutation({ mutationFn: () => procurementPost("build_requirement", { project: name }), onSuccess: () => refresh() })
  const save = useMutation({ mutationFn: () => procurementPost("save_requirement_lines", { name: mrName, lines: rows }), onSuccess: () => refresh() })
  const genPOs = useMutation({ mutationFn: () => procurementPost<{ count: number }>("generate_pos", { name: mrName }), onSuccess: () => refresh() })
  const poStatus = useMutation({ mutationFn: (b: { name: string; status: string }) => procurementPost("update_po_status", b), onSuccess: () => qc.invalidateQueries({ queryKey: ["pos", name] }) })

  const setVendor = (idx: number, v: string) => setLines(rows.map((r) => r.idx === idx ? { ...r, assigned_vendor: v } : r))
  const setRate = (idx: number, v: number) => setLines(rows.map((r) => r.idx === idx ? { ...r, est_rate: v, est_amount: (r.qty || 0) * v } : r))

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button onClick={() => nav(`/projects/${name}`)} className="text-sm text-indigo-600 hover:underline">← Back to project</button>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Procurement</h1>
        <button onClick={() => build.mutate()} disabled={build.isPending} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {build.isPending ? "Building…" : mr.data?.exists ? "↻ Rebuild from BOQ" : "Build from BOQ"}
        </button>
      </div>
      {build.isError && <div className="text-sm text-red-600">{(build.error as Error).message}</div>}

      {/* Material Requirement Sheet */}
      {mr.data?.exists && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <div><h2 className="font-semibold text-slate-700">Material Requirement Sheet</h2><div className="text-xs text-gray-400">{mr.data.name} · from {mr.data.source_boqs} · {mr.data.status}</div></div>
            <button onClick={() => save.mutate()} disabled={!lines || save.isPending} className="rounded-md border border-indigo-200 text-indigo-700 px-3 py-1.5 text-sm hover:bg-indigo-50 disabled:opacity-40">Save vendors/rates</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1">Item</th><th className="w-20">Cat</th><th className="text-right w-16">Qty</th><th className="w-14">UoM</th><th className="text-right w-24">Rate</th><th className="text-right w-24">Amount</th><th className="w-40 text-left">Vendor</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idx} className="border-b border-gray-50">
                  <td className="py-1.5"><div className="text-slate-700">{r.item_description}</div>{r.spec && <div className="text-xs text-gray-400">{r.spec}{r.item_code ? ` · ${r.item_code}` : ""}</div>}</td>
                  <td className="text-center"><span className={`text-xs px-1.5 py-0.5 rounded ${CAT_COLORS[r.category] || "bg-gray-50 text-gray-500"}`}>{r.category}</span></td>
                  <td className="text-right text-slate-600">{r.qty}</td>
                  <td className="text-center text-xs text-gray-500">{r.uom}</td>
                  <td className="text-right"><input className="w-20 text-right border border-gray-200 rounded px-1 py-0.5" type="number" value={r.est_rate ?? 0} onChange={(e) => setRate(r.idx, parseFloat(e.target.value) || 0)} /></td>
                  <td className="text-right text-slate-600">{inr((r.qty || 0) * (r.est_rate || 0))}</td>
                  <td><input className="w-36 border border-gray-200 rounded px-1 py-0.5" placeholder="vendor…" value={r.assigned_vendor ?? ""} onChange={(e) => setVendor(r.idx, e.target.value)} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="text-center text-gray-300 py-4 text-xs">No requirement lines.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* VOQ + generate POs */}
      {mr.data?.exists && voq.data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-slate-700">VOQ — Vendor Order Quantity</h2>
            <button onClick={() => genPOs.mutate()} disabled={genPOs.isPending || !voq.data.vendors.length} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
              {genPOs.isPending ? "Generating…" : "Generate POs"}
            </button>
          </div>
          {voq.data.vendors.map((v) => (
            <div key={v.vendor} className="flex justify-between border-b border-gray-50 py-1.5 text-sm"><span className="text-slate-700">{v.vendor}</span><span className="text-gray-500">{v.lines} lines · {inr(v.value)}</span></div>
          ))}
          {!voq.data.vendors.length && <div className="text-xs text-gray-400">Assign vendors on the requirement lines above, then generate POs.</div>}
          {voq.data.unassigned > 0 && <div className="text-xs text-amber-600 mt-2">{voq.data.unassigned} line(s) have no vendor yet.</div>}
        </div>
      )}

      {/* PO list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Purchase Orders {pos.data?.kpis ? <span className="text-xs text-gray-400 font-normal">· {pos.data.kpis.total} POs · {inr(pos.data.kpis.value)}{pos.data.kpis.intercompany ? ` · ${pos.data.kpis.intercompany} intercompany` : ""}</span> : null}</h2>
        {(pos.data?.pos || []).map((po) => (
          <div key={po.name} className="flex justify-between items-center border-b border-gray-50 py-1.5 text-sm">
            <div><span className="text-slate-700">{po.vendor}</span> <span className="text-xs text-gray-400">· {po.name} · {inr(po.total)}</span>{po.is_intercompany ? <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">intercompany → {po.supplying_company}</span> : null}</div>
            <select className="text-xs border border-gray-200 rounded px-1 py-0.5" value={po.status} onChange={(e) => poStatus.mutate({ name: po.name, status: e.target.value })}>
              <option>Draft</option><option>Sent</option><option>Received</option><option>Cancelled</option>
            </select>
          </div>
        ))}
        {!(pos.data?.pos || []).length && <div className="text-xs text-gray-300">No purchase orders yet.</div>}
      </div>
    </div>
  )
}
