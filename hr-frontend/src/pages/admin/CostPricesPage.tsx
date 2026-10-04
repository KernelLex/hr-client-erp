// Admin · Cost / Dealer Prices.
// Catalogue is MRP-only. Here the owner supplies real cost: a dealer discount %
// per brand (auto-derives cost = MRP × (1−%)) and/or a per-item override.
// Both write to the "Vendor Cost" buying price list so quotes show true profit.
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { vendorCostGet, vendorCostPost } from "../peoplework/client"

type Rule = { name?: string; brand?: string; discount_percent?: number; status?: string; notes?: string }
type Summary = { total_items: number; with_cost: number; coverage_pct: number }
type ListResp = { rules: Rule[]; summary: Summary }
type SearchItem = { item_code: string; item_name: string; brand: string; mrp?: number; cost?: number }

const field = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--border-subtle)] focus:outline-none"
const inr = (n?: number | null) => n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN")

export function CostPricesPage() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ["cost_rules"], queryFn: () => vendorCostGet<ListResp>("list_rules") })
  const [draft, setDraft] = useState<Rule>({ brand: "", discount_percent: 0, status: "Active" })

  const saveRule = useMutation({
    mutationFn: (r: Rule) => vendorCostPost("save_rule", { payload: r }),
    onSuccess: () => { setDraft({ brand: "", discount_percent: 0, status: "Active" }); qc.invalidateQueries({ queryKey: ["cost_rules"] }) },
  })
  const delRule = useMutation({
    mutationFn: (name: string) => vendorCostPost("delete_rule", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost_rules"] }),
  })
  const apply = useMutation({
    mutationFn: () => vendorCostPost<{ updated: number }>("apply_discounts"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost_rules"] }),
  })

  const s = list.data?.summary
  return (
    <div className="p-6 mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Cost / Dealer Prices</h1>
      <p className="text-sm text-gray-500 mb-5">The price lists you gave are selling price (MRP) only. Enter your real cost here so quotes can show true profit.</p>

      {/* coverage */}
      {s && (
        <div className="flex gap-4 mb-6">
          <Stat label="Catalogue items" value={s.total_items.toLocaleString("en-IN")} />
          <Stat label="With cost set" value={s.with_cost.toLocaleString("en-IN")} />
          <Stat label="Coverage" value={`${s.coverage_pct}%`} />
        </div>
      )}

      {/* brand discounts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Dealer discount by brand</h2>
          <button onClick={() => apply.mutate()} disabled={apply.isPending}
            className="rounded-md bg-[var(--bg-inverse)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--bg-inverse)] disabled:opacity-50">
            {apply.isPending ? "Applying…" : "Apply discounts → cost"}
          </button>
        </div>
        {apply.data && <div className="text-sm text-[var(--text-primary)] mb-2">✓ Updated cost on {apply.data.updated.toLocaleString("en-IN")} items.</div>}
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1">Brand</th><th className="w-28 text-right">Discount %</th><th className="w-24">Status</th><th className="w-8"></th></tr></thead>
          <tbody>
            {(list.data?.rules || []).map((r) => (
              <tr key={r.name} className="border-b border-gray-50">
                <td className="py-1 text-slate-700">{r.brand}</td>
                <td className="text-right text-slate-600">{r.discount_percent}%</td>
                <td className="text-center"><span className={r.status === "Active" ? "text-[var(--text-primary)]" : "text-gray-400"}>{r.status}</span></td>
                <td className="text-right"><button onClick={() => delRule.mutate(r.name!)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
            {/* add row */}
            <tr>
              <td className="py-2"><input className={`${field} w-40`} placeholder="Brand (e.g. Blum)" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></td>
              <td className="text-right"><input className={`${field} w-20 text-right`} type="number" value={draft.discount_percent} onChange={(e) => setDraft({ ...draft, discount_percent: parseFloat(e.target.value) || 0 })} /></td>
              <td className="text-center">
                <select className={field} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option>Active</option><option>Inactive</option></select></td>
              <td className="text-right"><button onClick={() => draft.brand && saveRule.mutate(draft)} className="text-[var(--text-primary)] hover:text-[var(--text-primary)] text-lg">+</button></td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">After adding/editing brand discounts, click “Apply discounts → cost” to recompute cost = MRP × (1 − discount%).</p>
      </div>

      {/* per-item override */}
      <PerItemCost onSaved={() => qc.invalidateQueries({ queryKey: ["cost_rules"] })} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 min-w-[130px]"><div className="text-xs text-gray-400">{label}</div><div className="text-xl font-bold text-slate-800">{value}</div></div>
}

function PerItemCost({ onSaved }: { onSaved: () => void }) {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<SearchItem[]>([])
  const [edits, setEdits] = useState<Record<string, number>>({})
  const save = useMutation({
    mutationFn: ({ item_code, cost }: { item_code: string; cost: number }) => vendorCostPost("set_item_cost", { item_code, cost }),
    onSuccess: () => onSaved(),
  })
  const doSearch = async (val: string) => {
    setQ(val)
    if (val.trim().length < 2) { setItems([]); return }
    const r = await vendorCostGet<{ items: SearchItem[] }>("search_items", { query: val })
    setItems(r.items || [])
  }
  const field2 = "rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--border-subtle)] focus:outline-none"
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-semibold text-slate-700 mb-3">Per-item cost override</h2>
      <input className={`${field2} w-full mb-3`} placeholder="Search item code or name…" value={q} onChange={(e) => doSearch(e.target.value)} />
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1">Item</th><th className="w-24 text-right">MRP</th><th className="w-28 text-right">Cost</th><th className="w-16"></th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.item_code} className="border-b border-gray-50">
                <td className="py-1"><div className="text-slate-700">{it.item_name}</div><div className="text-xs text-gray-400">{it.brand} · {it.item_code}</div></td>
                <td className="text-right text-gray-500">{inr(it.mrp)}</td>
                <td className="text-right"><input className="w-24 text-right border border-gray-200 rounded px-1 py-0.5" type="number" defaultValue={it.cost ?? undefined} placeholder={inr(it.cost)} onChange={(e) => setEdits({ ...edits, [it.item_code]: parseFloat(e.target.value) || 0 })} /></td>
                <td className="text-right"><button onClick={() => save.mutate({ item_code: it.item_code, cost: edits[it.item_code] ?? it.cost ?? 0 })} className="text-[var(--text-primary)] hover:text-[var(--text-primary)] text-xs font-medium">Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
