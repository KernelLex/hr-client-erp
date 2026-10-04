import { useState } from "react"
import { usePreQuotes, useCreatePreQuote, useConvertPreQuote } from "./usePreQuote"

const SOURCES = ["Walk-in", "Architect", "Interior Designer", "Referral", "Dealer",
  "Website", "Social Media", "Existing Customer", "Builder", "Other"]
const LEVELS = ["Economy", "Standard", "Premium", "Luxury"]

const EMPTY = {
  customer_name: "", mobile: "", email: "", quotation_type: "Project",
  project_name: "", site_location: "", architect_designer: "", requirement_source: "",
  product_scope: "", requirement_summary: "", finish_level: "", hardware_level: "",
  expected_budget_min: "", expected_budget_max: "",
  estimated_range_min: "", estimated_range_max: "", expected_completion: "",
}

export default function PreQuotePage() {
  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY })
  const { data: prequotes, isLoading } = usePreQuotes()
  const create = useCreatePreQuote()
  const convert = useConvertPreQuote()

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const submit = () => {
    if (!form.customer_name || !form.mobile) return
    const payload: Record<string, unknown> = {}
    Object.entries(form).forEach(([k, v]) => { if (v !== "") payload[k] = v })
    create.mutate(payload, { onSuccess: () => setForm({ ...EMPTY }) })
  }

  const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--border-subtle)] focus:outline-none"
  const label = "block text-xs font-medium text-gray-600 mb-1"

  return (
    <div className="p-6 mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Pre-Quote</h1>
      <p className="text-sm text-gray-500 mb-6">Capture a requirement and a budgetary estimate, then convert it to an Opportunity.</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">New Pre-Quote</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label}>Customer *</label><input className={field} value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} /></div>
            <div><label className={label}>Mobile *</label><input className={field} value={form.mobile} onChange={(e) => set("mobile", e.target.value)} /></div>
            <div><label className={label}>Email</label><input className={field} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><label className={label}>Type</label>
              <select className={field} value={form.quotation_type} onChange={(e) => set("quotation_type", e.target.value)}>
                <option>Project</option><option>Trading</option>
              </select></div>
            <div><label className={label}>Project Name</label><input className={field} value={form.project_name} onChange={(e) => set("project_name", e.target.value)} /></div>
            <div><label className={label}>Requirement Source</label>
              <select className={field} value={form.requirement_source} onChange={(e) => set("requirement_source", e.target.value)}>
                <option value="">—</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div className="col-span-2"><label className={label}>Site Location</label><input className={field} value={form.site_location} onChange={(e) => set("site_location", e.target.value)} /></div>
            <div><label className={label}>Finish Level</label>
              <select className={field} value={form.finish_level} onChange={(e) => set("finish_level", e.target.value)}>
                <option value="">—</option>{LEVELS.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className={label}>Hardware Level</label>
              <select className={field} value={form.hardware_level} onChange={(e) => set("hardware_level", e.target.value)}>
                <option value="">—</option>{LEVELS.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className={label}>Budget (min)</label><input className={field} type="number" value={form.expected_budget_min} onChange={(e) => set("expected_budget_min", e.target.value)} /></div>
            <div><label className={label}>Budget (max)</label><input className={field} type="number" value={form.expected_budget_max} onChange={(e) => set("expected_budget_max", e.target.value)} /></div>
            <div className="col-span-2"><label className={label}>Product / Scope</label><textarea className={field} rows={2} value={form.product_scope} onChange={(e) => set("product_scope", e.target.value)} /></div>
            <div className="col-span-2"><label className={label}>Requirement Summary</label><textarea className={field} rows={2} value={form.requirement_summary} onChange={(e) => set("requirement_summary", e.target.value)} /></div>
          </div>
          <button onClick={submit} disabled={create.isPending || !form.customer_name || !form.mobile}
            className="mt-4 rounded-md bg-[var(--bg-inverse)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--bg-inverse)] disabled:opacity-50">
            {create.isPending ? "Saving…" : "Create Pre-Quote"}
          </button>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-slate-700 mb-4">Recent Pre-Quotes</h2>
          {isLoading ? <p className="text-sm text-gray-400">Loading…</p>
            : !prequotes?.length ? <p className="text-sm text-gray-400">No pre-quotes yet.</p>
            : (
              <div className="space-y-3">
                {prequotes.map((p) => (
                  <div key={p.name} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">{p.customer_name}</div>
                        <div className="text-xs text-gray-500">{p.project_name || p.quotation_type} · {p.mobile}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "Converted" ? "bg-[var(--bg-subtle)] text-[var(--text-primary)]" : p.status === "Dropped" ? "bg-red-100 text-red-600" : "bg-[var(--bg-subtle)] text-[var(--text-primary)]"}`}>{p.status}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">{p.name}</span>
                      {p.status !== "Converted" ? (
                        <button onClick={() => convert.mutate(p.name)} disabled={convert.isPending}
                          className="ml-auto text-xs rounded bg-[var(--bg-inverse)] px-2 py-1 text-white hover:bg-[var(--bg-inverse)] disabled:opacity-50">
                          Convert to Opportunity
                        </button>
                      ) : p.opportunity ? <span className="ml-auto text-xs text-[var(--text-primary)]">→ {p.opportunity}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
