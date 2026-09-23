// Admin · Finish / Material Rate Card.
// The founding brief prices interiors "per sqft and finishes — each finish has a
// standard price per sqft". Vendor pricelists only cover branded hardware; the
// sheet goods / finishes / edge bands on carcass + shutter lines are priced by
// Vera per unit area. Owner maintains those standard rates here; they flow into
// the Material Requirement Sheet (procurement) so MRS lines get a real rate.
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { finishRateGet, finishRatePost } from "../peoplework/client"

type Rate = { name?: string; item_name?: string; scope?: string; rate?: number; uom?: string; status?: string; notes?: string }
type Summary = { total: number; priced: number; coverage_pct: number }
type ListResp = { rates: Rate[]; summary: Summary }

const SCOPES = ["Any", "Carcass", "Shutter", "Finish", "Edge Band"]
const field = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
const inr = (n?: number | null) => n == null || n === 0 ? "—" : "₹" + Number(n).toLocaleString("en-IN")

const blank: Rate = { item_name: "", scope: "Any", rate: 0, uom: "SFT", status: "Active" }

export function FinishRatesPage() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ["finish_rates"], queryFn: () => finishRateGet<ListResp>("list_rates") })
  const [draft, setDraft] = useState<Rate>(blank)

  const invalidate = () => qc.invalidateQueries({ queryKey: ["finish_rates"] })
  const saveRate = useMutation({
    mutationFn: (r: Rate) => finishRatePost("save_rate", { payload: r }),
    onSuccess: () => { setDraft(blank); invalidate() },
  })
  const delRate = useMutation({
    mutationFn: (name: string) => finishRatePost("delete_rate", { name }),
    onSuccess: invalidate,
  })
  const sync = useMutation({
    mutationFn: () => finishRatePost<{ created: number }>("sync_from_catalogue"),
    onSuccess: invalidate,
  })

  const s = list.data?.summary
  const rates = list.data?.rates || []
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Finish / Material Rates</h1>
      <p className="text-sm text-gray-500 mb-5">Standard per-unit rates (typically per SFT) for the materials, finishes and edge bands used on BOQ lines. These feed the Material Requirement Sheet so procurement gets a real cost.</p>

      {s && (
        <div className="flex gap-4 mb-6">
          <Stat label="Rate lines" value={s.total.toLocaleString("en-IN")} />
          <Stat label="Priced" value={s.priced.toLocaleString("en-IN")} />
          <Stat label="Coverage" value={`${s.coverage_pct}%`} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Rate card</h2>
          <button onClick={() => sync.mutate()} disabled={sync.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {sync.isPending ? "Syncing…" : "Sync from catalogue"}
          </button>
        </div>
        {sync.data && <div className="text-sm text-emerald-600 mb-2">✓ Added {sync.data.created} new rate line(s) from the studio catalogue. Fill in the rates below.</div>}
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400 border-b">
            <th className="text-left py-1">Finish / Material</th><th className="w-28">Applies to</th>
            <th className="w-28 text-right">Rate</th><th className="w-20">Unit</th><th className="w-24">Status</th><th className="w-8"></th>
          </tr></thead>
          <tbody>
            {rates.map((r) => (
              <RateRow key={r.name} row={r} onSave={(u) => saveRate.mutate({ ...u, name: r.name })} onDelete={() => delRate.mutate(r.name!)} />
            ))}
            {/* add row */}
            <tr>
              <td className="py-2"><input className={`${field} w-48`} placeholder="e.g. 18mm MDF, PU Matt" value={draft.item_name} onChange={(e) => setDraft({ ...draft, item_name: e.target.value })} /></td>
              <td><select className={field} value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>{SCOPES.map((sc) => <option key={sc}>{sc}</option>)}</select></td>
              <td className="text-right"><input className={`${field} w-24 text-right`} type="number" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: parseFloat(e.target.value) || 0 })} /></td>
              <td><input className={`${field} w-16`} value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value })} /></td>
              <td className="text-center"><select className={field} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option>Active</option><option>Inactive</option></select></td>
              <td className="text-right"><button onClick={() => draft.item_name && saveRate.mutate(draft)} className="text-indigo-600 hover:text-indigo-800 text-lg">+</button></td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">Names must match how the item appears on BOQ lines. Use “Sync from catalogue” to pre-load every studio material/finish/edge band at ₹0, then type the rates.</p>
      </div>
    </div>
  )
}

function RateRow({ row, onSave, onDelete }: { row: Rate; onSave: (u: Rate) => void; onDelete: () => void }) {
  const [rate, setRate] = useState<number>(row.rate ?? 0)
  const [dirty, setDirty] = useState(false)
  return (
    <tr className="border-b border-gray-50">
      <td className="py-1 text-slate-700">{row.item_name}</td>
      <td className="text-center text-gray-500">{row.scope}</td>
      <td className="text-right">
        <input className="w-24 text-right border border-gray-200 rounded px-1 py-0.5" type="number"
          value={rate} onChange={(e) => { setRate(parseFloat(e.target.value) || 0); setDirty(true) }} />
      </td>
      <td className="text-center text-gray-500">{row.uom}</td>
      <td className="text-center"><span className={row.status === "Active" ? "text-emerald-600" : "text-gray-400"}>{row.status}</span></td>
      <td className="text-right whitespace-nowrap">
        {dirty
          ? <button onClick={() => { onSave({ ...row, rate }); setDirty(false) }} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-2">Save</button>
          : <span className="text-gray-300 text-xs mr-2">{inr(row.rate)}</span>}
        <button onClick={onDelete} className="text-red-400 hover:text-red-600">✕</button>
      </td>
    </tr>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 min-w-[130px]"><div className="text-xs text-gray-400">{label}</div><div className="text-xl font-bold text-slate-800">{value}</div></div>
}
