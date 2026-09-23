// Service & Warranty tickets — post-handover complaints, warranty, AMC.
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { serviceGet, servicePost } from "../peoplework/client"

type Ticket = {
  name?: string; ticket_title?: string; customer?: string; project?: string; company?: string
  category?: string; priority?: string; status?: string; reported_on?: string; assigned_to?: string
  description?: string; resolution?: string; resolved_on?: string
}
type ListResp = { tickets: Ticket[]; kpis: Record<string, number> }

const CATS = ["Complaint", "Warranty", "AMC / Maintenance", "Installation Fix", "Other"]
const PRIOS = ["Low", "Medium", "High", "Urgent"]
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"]
const field = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none w-full"
const PRIO_COLOR: Record<string, string> = { Low: "bg-gray-100 text-gray-600", Medium: "bg-blue-50 text-blue-700", High: "bg-amber-50 text-amber-700", Urgent: "bg-red-50 text-red-700" }
const STATUS_COLOR: Record<string, string> = { Open: "bg-red-50 text-red-700", "In Progress": "bg-amber-50 text-amber-700", Resolved: "bg-emerald-50 text-emerald-700", Closed: "bg-gray-100 text-gray-500" }

const blank: Ticket = { ticket_title: "", customer: "", category: "Complaint", priority: "Medium", status: "Open" }

export function ServicePage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<string>("")
  const [sel, setSel] = useState<Ticket | null>(null)
  const list = useQuery({ queryKey: ["svc_tickets", filter], queryFn: () => serviceGet<ListResp>("list_tickets", filter ? { status: filter } : {}) })
  const save = useMutation({
    mutationFn: (t: Ticket) => servicePost<Ticket>("save_ticket", { payload: t }),
    onSuccess: (d) => { setSel(d); qc.invalidateQueries({ queryKey: ["svc_tickets"] }) },
  })
  const del = useMutation({
    mutationFn: (name: string) => servicePost("delete_ticket", { name }),
    onSuccess: () => { setSel(null); qc.invalidateQueries({ queryKey: ["svc_tickets"] }) },
  })
  const k = list.data?.kpis

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-800">Service & Warranty</h1>
        <button onClick={() => setSel({ ...blank })} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">+ New Ticket</button>
      </div>
      <p className="text-sm text-gray-500 mb-5">Post-handover complaints, warranty claims and maintenance visits.</p>

      {k && (
        <div className="flex flex-wrap gap-4 mb-6">
          <Stat label="Open" value={k.open} tone="text-red-600" />
          <Stat label="In Progress" value={k.in_progress} tone="text-amber-600" />
          <Stat label="Resolved" value={k.resolved} tone="text-emerald-600" />
          <Stat label="Urgent" value={k.urgent} tone="text-red-700" />
          <Stat label="Total" value={k.total} />
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <button onClick={() => setFilter("")} className={`text-xs px-2 py-1 rounded ${!filter ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>All</button>
        {STATUSES.map((s) => <button key={s} onClick={() => setFilter(s)} className={`text-xs px-2 py-1 rounded ${filter === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>{s}</button>)}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400 border-b bg-gray-50"><th className="text-left p-2">Ticket</th><th>Customer</th><th>Category</th><th>Priority</th><th>Status</th><th>Reported</th></tr></thead>
          <tbody>
            {(list.data?.tickets || []).map((t) => (
              <tr key={t.name} className="border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer" onClick={() => setSel(t)}>
                <td className="p-2"><div className="text-slate-700">{t.ticket_title}</div><div className="text-xs text-gray-400">{t.name}</div></td>
                <td className="text-center text-slate-600">{t.customer || "—"}</td>
                <td className="text-center text-xs text-gray-500">{t.category}</td>
                <td className="text-center"><span className={`text-xs px-1.5 py-0.5 rounded ${PRIO_COLOR[t.priority || ""]}`}>{t.priority}</span></td>
                <td className="text-center"><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLOR[t.status || ""]}`}>{t.status}</span></td>
                <td className="text-center text-xs text-gray-500">{t.reported_on || "—"}</td>
              </tr>
            ))}
            {!(list.data?.tickets || []).length && <tr><td colSpan={6} className="text-center text-gray-300 py-6 text-xs">No tickets.</td></tr>}
          </tbody>
        </table>
      </div>

      {sel && <TicketDrawer t={sel} onClose={() => setSel(null)} onSave={(t) => save.mutate(t)} onDelete={sel.name ? () => del.mutate(sel.name!) : undefined} saving={save.isPending} />}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 min-w-[110px]"><div className="text-xs text-gray-400">{label}</div><div className={`text-xl font-bold ${tone || "text-slate-800"}`}>{value ?? 0}</div></div>
}

function TicketDrawer({ t, onClose, onSave, onDelete, saving }: { t: Ticket; onClose: () => void; onSave: (t: Ticket) => void; onDelete?: () => void; saving: boolean }) {
  const [d, setD] = useState<Ticket>(t)
  const set = (k: keyof Ticket, v: string) => setD({ ...d, [k]: v })
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4"><h2 className="font-semibold text-slate-700">{d.name ? "Edit ticket" : "New ticket"}</h2><button onClick={onClose} className="text-gray-400 text-xl">✕</button></div>
        <div className="space-y-3">
          <L label="Title"><input className={field} value={d.ticket_title || ""} onChange={(e) => set("ticket_title", e.target.value)} /></L>
          <L label="Customer"><input className={field} value={d.customer || ""} onChange={(e) => set("customer", e.target.value)} /></L>
          <L label="Project (optional)"><input className={field} value={d.project || ""} onChange={(e) => set("project", e.target.value)} placeholder="VE/PRJ/…" /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Category"><select className={field} value={d.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></L>
            <L label="Priority"><select className={field} value={d.priority} onChange={(e) => set("priority", e.target.value)}>{PRIOS.map((c) => <option key={c}>{c}</option>)}</select></L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Status"><select className={field} value={d.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((c) => <option key={c}>{c}</option>)}</select></L>
            <L label="Assigned to"><input className={field} value={d.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)} /></L>
          </div>
          <L label="Issue description"><textarea className={field} rows={3} value={d.description || ""} onChange={(e) => set("description", e.target.value)} /></L>
          <L label="Resolution"><textarea className={field} rows={2} value={d.resolution || ""} onChange={(e) => set("resolution", e.target.value)} /></L>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => onSave(d)} disabled={saving || !d.ticket_title} className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
          {onDelete && <button onClick={onDelete} className="rounded-md border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50">Delete</button>}
        </div>
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-500 mb-1 block">{label}</label>{children}</div>
}
