// Admin · Hardware Packages (Standard / Premium / Luxury bundles, PRD §25).
// Owner defines each tier's contents from the live catalogue; rate auto-fills
// from the Vendor MRP price list. Used later to speed up BOQ/quotation prep.
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { hardwarePackageGet, hardwarePackagePost } from "../peoplework/client"

type Item = { item_code?: string; item_name?: string; brand?: string; qty?: number; uom?: string; rate?: number; amount?: number }
type Pkg = {
  name?: string; code?: string; package_name?: string; tier?: string; status?: string
  product_scope?: string; description?: string; auto_price?: number; package_price?: number; items?: Item[]
}
type ListResp = { packages: (Pkg & { item_count: number })[]; kpis: Record<string, number> }

const TIERS = ["Standard", "Premium", "Luxury"]
const EMPTY: Pkg = { package_name: "", tier: "Standard", status: "Active", product_scope: "", description: "", auto_price: 1, package_price: 0, items: [] }

const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
const label = "block text-xs font-medium text-gray-600 mb-1"
const inr = (n?: number) => "₹" + (n || 0).toLocaleString("en-IN")

export function HardwarePackagesPage() {
  const qc = useQueryClient()
  const [sel, setSel] = useState<Pkg | null>(null)
  const list = useQuery({ queryKey: ["hw_packages"], queryFn: () => hardwarePackageGet<ListResp>("list_packages") })

  const open = async (name?: string) => {
    if (!name) { setSel({ ...EMPTY, items: [] }); return }
    const full = await hardwarePackageGet<Pkg>("get_package", { name })
    setSel(full)
  }

  const save = useMutation({
    mutationFn: (p: Pkg) => hardwarePackagePost<Pkg>("save_package", { payload: p }),
    onSuccess: (data) => { setSel(data); qc.invalidateQueries({ queryKey: ["hw_packages"] }) },
  })
  const del = useMutation({
    mutationFn: (name: string) => hardwarePackagePost("delete_package", { name }),
    onSuccess: () => { setSel(null); qc.invalidateQueries({ queryKey: ["hw_packages"] }) },
  })
  const seed = useMutation({
    mutationFn: () => hardwarePackagePost<{ count: number }>("seed_starter_packages"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hw_packages"] }),
  })

  const total = (p: Pkg) => (p.items || []).reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Hardware Packages</h1>
      <p className="text-sm text-gray-500 mb-5">Define Standard / Premium / Luxury bundles once, then drop them into quotes.</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* list */}
        <div className="lg:col-span-2 space-y-3">
          <button onClick={() => open()} className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">+ New Package</button>
          {!(list.data?.packages || []).length && (
            <button onClick={() => seed.mutate()} disabled={seed.isPending} className="w-full rounded-md border border-emerald-200 text-emerald-700 px-4 py-2 text-sm hover:bg-emerald-50 disabled:opacity-40">
              {seed.isPending ? "Seeding…" : "✨ Seed starter packages"}
            </button>
          )}
          {TIERS.map((t) => {
            const rows = (list.data?.packages || []).filter((p) => p.tier === t)
            if (!rows.length) return null
            return (
              <div key={t}>
                <div className="text-xs font-semibold text-gray-400 uppercase mt-3 mb-1">{t}</div>
                {rows.map((p) => (
                  <button key={p.name} onClick={() => open(p.name)}
                    className={`w-full text-left rounded-lg border p-3 mb-2 bg-white hover:border-indigo-300 ${sel?.name === p.name ? "border-indigo-500 ring-1 ring-indigo-200" : "border-gray-200"}`}>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-700 text-sm">{p.package_name}</span>
                      <span className="text-sm text-slate-600">{inr(p.package_price)}</span>
                    </div>
                    <div className="text-xs text-gray-400">{p.item_count} items · {p.product_scope || "All"} · {p.status}</div>
                  </button>
                ))}
              </div>
            )
          })}
          {list.data && !list.data.packages.length && <div className="text-sm text-gray-400">No packages yet.</div>}
        </div>

        {/* editor */}
        <div className="lg:col-span-3">
          {!sel ? (
            <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-8 text-center">Select a package or create a new one.</div>
          ) : (
            <PackageEditor pkg={sel} onChange={setSel}
              onSave={() => save.mutate(sel)} saving={save.isPending}
              onDelete={sel.name ? () => del.mutate(sel.name!) : undefined}
              computedTotal={total(sel)} />
          )}
        </div>
      </div>
    </div>
  )
}

function PackageEditor({ pkg, onChange, onSave, saving, onDelete, computedTotal }: {
  pkg: Pkg; onChange: (p: Pkg) => void; onSave: () => void; saving: boolean
  onDelete?: () => void; computedTotal: number
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Item[]>([])
  const set = (k: keyof Pkg, v: unknown) => onChange({ ...pkg, [k]: v })
  const setItem = (i: number, k: keyof Item, v: unknown) => {
    const items = [...(pkg.items || [])]; items[i] = { ...items[i], [k]: v }; onChange({ ...pkg, items })
  }
  const addItem = (it: Item) => { onChange({ ...pkg, items: [...(pkg.items || []), { ...it, qty: 1 }] }); setQ(""); setResults([]) }
  const removeItem = (i: number) => onChange({ ...pkg, items: (pkg.items || []).filter((_, idx) => idx !== i) })

  const doSearch = async (val: string) => {
    setQ(val)
    if (val.trim().length < 2) { setResults([]); return }
    const r = await hardwarePackageGet<{ items: Item[] }>("search_items", { query: val })
    setResults(r.items || [])
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className={label}>Package Name *</label><input className={field} value={pkg.package_name || ""} onChange={(e) => set("package_name", e.target.value)} /></div>
        <div><label className={label}>Tier</label>
          <select className={field} value={pkg.tier} onChange={(e) => set("tier", e.target.value)}>{TIERS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className={label}>Applies To</label><input className={field} placeholder="Kitchen / Wardrobe / All" value={pkg.product_scope || ""} onChange={(e) => set("product_scope", e.target.value)} /></div>
        <div><label className={label}>Status</label>
          <select className={field} value={pkg.status} onChange={(e) => set("status", e.target.value)}><option>Active</option><option>Inactive</option></select></div>
        <div className="col-span-2"><label className={label}>Description</label><input className={field} value={pkg.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
      </div>

      {/* item search */}
      <div className="relative">
        <label className={label}>Add hardware from catalogue</label>
        <input className={field} placeholder="Search item code or name (min 2 chars)…" value={q} onChange={(e) => doSearch(e.target.value)} />
        {results.length > 0 && (
          <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto mt-1">
            {results.map((r) => (
              <button key={r.item_code} onClick={() => addItem(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between">
                <span>{r.item_name} <span className="text-gray-400">· {r.brand} · {r.item_code}</span></span>
                <span className="text-gray-600">{inr(r.rate)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* items table */}
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1">Item</th><th className="w-16 text-right">Qty</th><th className="w-24 text-right">Rate</th><th className="w-24 text-right">Amount</th><th className="w-8"></th></tr></thead>
        <tbody>
          {(pkg.items || []).map((it, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-1"><div className="text-slate-700">{it.item_name || it.item_code}</div><div className="text-xs text-gray-400">{it.brand} · {it.item_code}</div></td>
              <td><input className="w-14 text-right border border-gray-200 rounded px-1 py-0.5" type="number" value={it.qty ?? 1} onChange={(e) => setItem(i, "qty", parseFloat(e.target.value) || 0)} /></td>
              <td><input className="w-20 text-right border border-gray-200 rounded px-1 py-0.5" type="number" value={it.rate ?? 0} onChange={(e) => setItem(i, "rate", parseFloat(e.target.value) || 0)} /></td>
              <td className="text-right text-slate-600">{inr((it.qty || 0) * (it.rate || 0))}</td>
              <td className="text-right"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">✕</button></td>
            </tr>
          ))}
          {!(pkg.items || []).length && <tr><td colSpan={5} className="text-center text-gray-300 py-3 text-xs">No items — search above to add.</td></tr>}
        </tbody>
      </table>

      {/* pricing */}
      <div className="flex items-center justify-between border-t pt-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={!!pkg.auto_price} onChange={(e) => set("auto_price", e.target.checked ? 1 : 0)} />
          Auto-price (sum of items)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Sum {inr(computedTotal)}</span>
          <label className={label + " !mb-0"}>Package Price</label>
          <input className={`${field} w-32 text-right`} type="number" disabled={!!pkg.auto_price}
            value={pkg.auto_price ? computedTotal : (pkg.package_price || 0)}
            onChange={(e) => set("package_price", parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onSave} disabled={saving || !pkg.package_name} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "Saving…" : "Save Package"}</button>
        {onDelete && <button onClick={onDelete} className="rounded-md border border-red-200 text-red-600 px-3 py-2 text-sm hover:bg-red-50">Delete</button>}
      </div>
    </div>
  )
}
