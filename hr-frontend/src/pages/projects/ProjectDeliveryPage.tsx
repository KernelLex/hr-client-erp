// Project Delivery · list + KPIs. The execution side of a job (after the quote is
// accepted): stage, value, collected vs outstanding. See PROJECT_EXECUTION_PLAN.md.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { projectExecGet, projectExecPost } from "../peoplework/client"

type Project = {
  name: string; project_title: string; project_type: string; stage: string; status: string
  customer_name?: string; contract_value?: number; advance_received?: number
  outstanding?: number; percent_complete?: number; target_completion?: string
}
type ListResp = { projects: Project[]; kpis: Record<string, number> }

const inr = (n?: number) => "₹" + (n || 0).toLocaleString("en-IN")
const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--border-subtle)] focus:outline-none"

export function ProjectDeliveryPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [modal, setModal] = useState<"manual" | "quote" | null>(null)
  const list = useQuery({ queryKey: ["proj_exec"], queryFn: () => projectExecGet<ListResp>("list_projects") })

  const createManual = useMutation({
    mutationFn: (p: Record<string, unknown>) => projectExecPost<{ name: string }>("create_project", { payload: p }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["proj_exec"] }); nav(`/projects/${d.name}`) },
  })
  const createFromQuote = useMutation({
    mutationFn: (quotation: string) => projectExecPost<{ name: string }>("create_from_quotation", { quotation }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["proj_exec"] }); nav(`/projects/${d.name}`) },
  })

  const k = list.data?.kpis
  return (
    <div className="p-6 mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-800">Project Delivery</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal("quote")} className="rounded-md border border-[var(--border-subtle)] text-[var(--text-primary)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)]">From Quotation</button>
          <button onClick={() => setModal("manual")} className="rounded-md bg-[var(--bg-inverse)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--bg-inverse)]">+ New Project</button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">Run accepted jobs from design to handover — stages, payments, site issues and work cards.</p>

      {k && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="Active projects" value={String(k.active)} />
          <Stat label="Pipeline value" value={inr(k.pipeline_value)} />
          <Stat label="Collected" value={inr(k.collected)} tone="emerald" />
          <Stat label="Outstanding" value={inr(k.outstanding)} tone="amber" />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500"><tr>
            <th className="text-left px-4 py-2">Project</th><th className="text-left">Customer</th><th>Stage</th>
            <th className="text-right">Value</th><th className="text-right">Outstanding</th><th className="w-32">Progress</th>
          </tr></thead>
          <tbody>
            {(list.data?.projects || []).map((p) => (
              <tr key={p.name} onClick={() => nav(`/projects/${p.name}`)} className="border-t border-gray-50 hover:bg-[var(--bg-subtle)] cursor-pointer">
                <td className="px-4 py-2"><div className="font-medium text-slate-700">{p.project_title}</div><div className="text-xs text-gray-400">{p.name} · {p.project_type}</div></td>
                <td className="text-slate-600">{p.customer_name || "—"}</td>
                <td className="text-center"><span className="inline-block px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs">{p.stage}</span></td>
                <td className="text-right text-slate-600">{inr(p.contract_value)}</td>
                <td className="text-right text-[var(--text-primary)]">{inr(p.outstanding)}</td>
                <td className="px-3"><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[var(--bg-subtle)]0" style={{ width: `${p.percent_complete || 0}%` }} /></div><div className="text-[10px] text-gray-400 text-right">{p.percent_complete || 0}%</div></td>
              </tr>
            ))}
            {list.data && !list.data.projects.length && <tr><td colSpan={6} className="text-center text-gray-400 py-8">No projects yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal === "manual" && <ManualModal onClose={() => setModal(null)} onCreate={(p) => createManual.mutate(p)} busy={createManual.isPending} />}
      {modal === "quote" && <QuoteModal onClose={() => setModal(null)} onCreate={(q) => createFromQuote.mutate(q)} busy={createFromQuote.isPending} error={createFromQuote.error as Error} />}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const c = tone === "emerald" ? "text-[var(--text-primary)]" : tone === "amber" ? "text-[var(--text-primary)]" : "text-slate-800"
  return <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3"><div className="text-xs text-gray-400">{label}</div><div className={`text-xl font-bold ${c}`}>{value}</div></div>
}

function ManualModal({ onClose, onCreate, busy }: { onClose: () => void; onCreate: (p: Record<string, unknown>) => void; busy: boolean }) {
  const [f, setF] = useState({ project_title: "", project_type: "Interior", customer_name: "", contract_value: "", site_address: "", project_manager: "" })
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  return (
    <Modal title="New Project" onClose={onClose}>
      <div className="space-y-3">
        <div><Label>Project Title *</Label><input className={field} value={f.project_title} onChange={(e) => set("project_title", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><select className={field} value={f.project_type} onChange={(e) => set("project_type", e.target.value)}><option>Interior</option><option>Trading</option></select></div>
          <div><Label>Contract Value</Label><input className={field} type="number" value={f.contract_value} onChange={(e) => set("contract_value", e.target.value)} /></div>
        </div>
        <div><Label>Customer</Label><input className={field} value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} /></div>
        <div><Label>Site Address</Label><input className={field} value={f.site_address} onChange={(e) => set("site_address", e.target.value)} /></div>
        <div><Label>Project Manager</Label><input className={field} value={f.project_manager} onChange={(e) => set("project_manager", e.target.value)} /></div>
        <button disabled={busy || !f.project_title} onClick={() => onCreate(f)} className="w-full rounded-md bg-[var(--bg-inverse)] py-2 text-sm font-medium text-white hover:bg-[var(--bg-inverse)] disabled:opacity-50">{busy ? "Creating…" : "Create Project"}</button>
      </div>
    </Modal>
  )
}

function QuoteModal({ onClose, onCreate, busy, error }: { onClose: () => void; onCreate: (q: string) => void; busy: boolean; error?: Error }) {
  const [q, setQ] = useState("")
  return (
    <Modal title="Create Project from Quotation" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Enter the accepted quotation ID. Customer, company, value and payment milestones are copied automatically.</p>
        <input className={field} placeholder="VE/QTN/2026/00001" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <div className="text-sm text-red-600">{error.message}</div>}
        <button disabled={busy || !q} onClick={() => onCreate(q)} className="w-full rounded-md bg-[var(--bg-inverse)] py-2 text-sm font-medium text-white hover:bg-[var(--bg-inverse)] disabled:opacity-50">{busy ? "Creating…" : "Create Project"}</button>
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4"><h2 className="font-semibold text-slate-700">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button></div>
        {children}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) { return <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label> }
