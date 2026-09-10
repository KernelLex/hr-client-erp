// Quotation Studio · Terms templates (Phase 2 spec §4.10). A template is a
// versioned, categorised set of clauses. Creating one snapshots the chosen
// clauses' customer text into the template, so an approved quotation reproduces
// the exact terms in force at approval time. Quotations pick an Active template
// and the backend assembles it into the stamped T&C block.
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { termsGet, termsPost } from "../peoplework/client"
import type { ModulePayload } from "../peoplework/types"

const CATEGORIES = [
  "Complete Interior Project", "Trading and Supply", "Appliances",
  "Countertop Stone", "Labour and Installation", "Variation",
]

interface ClauseRow { code: string; title: string; category: string; mandatory: string; status: string }

export function TermsTemplatesPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ code: "", template_name: "", category: CATEGORIES[0], version: "1", effective_date: "", status: "Active" })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  const { data: clausesPayload } = useQuery({
    queryKey: ["q_terms_clauses_for_template"],
    queryFn: () => termsGet<ModulePayload>("get_clauses_page"),
    enabled: open,
  })
  const clauses = ((clausesPayload?.rows ?? []) as unknown as ClauseRow[]).filter((c) => c.status === "Active")

  function reset() {
    setForm({ code: "", template_name: "", category: CATEGORIES[0], version: "1", effective_date: "", status: "Active" })
    setPicked(new Set()); setErr(null)
  }
  function toggle(code: string) {
    setPicked((p) => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n })
  }

  async function submit() {
    if (!form.code || !form.template_name) { setErr("Code and template name are required"); return }
    setSubmitting(true)
    try {
      const res = await termsPost<{ success: boolean; error?: string }>("create_terms_template", {
        payload: { ...form, version: Number(form.version) || 1 },
        clauses: Array.from(picked),
      })
      if (res.success === false) { toast.error(res.error ?? "Could not create"); return }
      toast.success("Template created")
      setOpen(false); reset()
      qc.invalidateQueries({ queryKey: ["q_terms_templates"] })
    } catch (e) { toast.error((e as Error)?.message ?? "Could not create") } finally { setSubmitting(false) }
  }

  const input = (k: keyof typeof form, label: string, type = "text", opts?: string[]) => (
    <div className="w-[calc(50%-6px)]">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary, #6a6a5c)" }}>{label}</label>
      {opts ? (
        <select value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
          className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "var(--border-card)", background: "#fff", color: "#111827" }}>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
          className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "var(--border-card)", background: "#fff", color: "var(--text-primary)" }} />
      )}
    </div>
  )

  return (
    <>
      <ArchetypePage
        queryKey="q_terms_templates"
        title="Terms — Templates"
        workspaceLabel="Quotation Studio"
        fetcher={() => termsGet<ModulePayload>("get_templates_page")}
        searchPlaceholder="Search templates..."
        actions={
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>
            <Plus size={16} /> New Template
          </button>
        }
      />

      {open && (
        <div className="fixed inset-0 z-[500] flex justify-end">
          <div className="absolute inset-0" style={{ background: "rgba(30,58,47,0.45)" }} onClick={submitting ? undefined : () => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: "var(--border, #e0d9cb)" }}>
              <div>
                <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--brand-primary)" }}>New Terms Template</h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>Pick the clauses to snapshot into this version.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-gray-100" style={{ color: "var(--text-muted)" }}><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-x-3 gap-y-4">
                {input("code", "Code")}
                {input("template_name", "Template Name")}
                {input("category", "Category", "text", CATEGORIES)}
                {input("version", "Version", "number")}
                {input("effective_date", "Effective Date", "date")}
                {input("status", "Status", "text", ["Active", "Inactive"])}
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary, #6a6a5c)" }}>
                  Clauses ({picked.size} selected)
                </div>
                <div className="rounded-lg" style={{ border: "0.5px solid var(--border, #e0d9cb)" }}>
                  {clauses.length === 0 && <div className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>No active clauses. Create clauses first.</div>}
                  {clauses.map((c) => (
                    <label key={c.code} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0" style={{ borderColor: "var(--border, #e0d9cb)", color: "var(--text-primary)" }}>
                      <input type="checkbox" checked={picked.has(c.code)} onChange={() => toggle(c.code)} className="h-4 w-4" />
                      <span className="font-medium">{c.title}</span>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.code} · {c.category}{c.mandatory === "Yes" ? " · mandatory" : ""}</span>
                    </label>
                  ))}
                </div>
              </div>

              {err && <div className="mt-4 rounded-md px-3 py-2 text-xs" style={{ background: "#fdeaea", color: "#dc2626" }}>{err}</div>}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border, #e0d9cb)" }}>
              <button onClick={() => setOpen(false)} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ border: "var(--border-card)", color: "var(--text-primary)", background: "#fff" }}>Cancel</button>
              <button onClick={submit} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
                {submitting ? "Saving..." : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
