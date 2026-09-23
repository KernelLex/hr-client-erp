// Project Delivery · detail. Stage tracker + payment milestones + site log +
// work cards + variation + feedback. Drives the lifecycle in PROJECT_EXECUTION_PLAN.md.
import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { projectExecGet, projectExecPost } from "../peoplework/client"

type Milestone = { idx: number; label: string; stage: string; percent: number; amount: number; trigger: string; status: string; received_amount?: number; received_on?: string }
type SiteLog = { idx: number; log_date?: string; log_type: string; description: string; raised_by?: string; status: string; resolved_on?: string }
type WorkCard = { name: string; title: string; stage?: string; assigned_to?: string; scheduled_date?: string; priority?: string; status: string; instructions?: string }
type Project = {
  name: string; project_title: string; project_type: string; stage: string; status: string
  customer_name?: string; company?: string; site_address?: string; project_manager?: string
  contract_value?: number; advance_received?: number; outstanding?: number; percent_complete?: number
  stage_order: string[]; stage_index: number; next_stage?: string; exit_criteria?: string
  payment_milestones: Milestone[]; site_logs: SiteLog[]; work_cards?: WorkCard[]
  feedback_rating?: number; feedback_notes?: string
}

const inr = (n?: number) => "₹" + (n || 0).toLocaleString("en-IN")
const field = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"

export function ProjectDeliveryDetail() {
  const { name } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["proj_exec", name], queryFn: () => projectExecGet<Project>("get_project", { name: name! }), enabled: !!name })
  const p = q.data
  const refresh = () => qc.invalidateQueries({ queryKey: ["proj_exec", name] })

  const post = (endpoint: string) => useMutation({ mutationFn: (b: Record<string, unknown>) => projectExecPost<Project>(endpoint, b), onSuccess: () => refresh() })
  const advance = post("advance_stage")
  const pay = post("record_payment")
  const variation = post("raise_variation")
  const addLog = post("add_site_log")
  const resolveLog = post("resolve_site_log")
  const saveCard = useMutation({ mutationFn: (b: Record<string, unknown>) => projectExecPost("save_work_card", b), onSuccess: () => refresh() })
  const cardStatus = useMutation({ mutationFn: (b: Record<string, unknown>) => projectExecPost("update_work_card_status", b), onSuccess: () => refresh() })
  const feedback = post("save_feedback")

  const [note, setNote] = useState("")
  const [varAmt, setVarAmt] = useState(""); const [varReason, setVarReason] = useState("")
  const [logType, setLogType] = useState("Discrepancy"); const [logDesc, setLogDesc] = useState("")
  const [cardTitle, setCardTitle] = useState(""); const [cardWho, setCardWho] = useState(""); const [cardDate, setCardDate] = useState("")

  if (q.isLoading || !p) return <div className="p-6 text-gray-400">Loading…</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button onClick={() => nav("/projects")} className="text-sm text-indigo-600 hover:underline">← All projects</button>

      {/* header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{p.project_title}</h1>
            <div className="text-sm text-gray-500">{p.name} · {p.project_type} · {p.customer_name || "—"} · {p.company}</div>
            {p.site_address && <div className="text-xs text-gray-400 mt-1">📍 {p.site_address}</div>}
          </div>
          <div className="text-right">
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-600 text-white text-sm">{p.stage}</span>
            <div className="text-xs text-gray-400 mt-1">{p.status} · {p.percent_complete || 0}% complete</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-center">
          <div><div className="text-xs text-gray-400">Contract</div><div className="font-bold text-slate-700">{inr(p.contract_value)}</div></div>
          <div><div className="text-xs text-gray-400">Collected</div><div className="font-bold text-emerald-600">{inr(p.advance_received)}</div></div>
          <div><div className="text-xs text-gray-400">Outstanding</div><div className="font-bold text-amber-600">{inr(p.outstanding)}</div></div>
        </div>
      </div>

      {/* stage tracker */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Lifecycle</h2>
        <div className="flex flex-wrap gap-1 mb-3">
          {p.stage_order.map((s, i) => (
            <div key={s} className={`text-xs px-2 py-1 rounded ${i < p.stage_index ? "bg-emerald-100 text-emerald-700" : i === p.stage_index ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-400"}`}>{s}</div>
          ))}
        </div>
        {p.exit_criteria && <div className="text-xs text-gray-500 mb-3">Exit: {p.exit_criteria}</div>}
        {p.next_stage && (
          <div className="flex gap-2 items-center">
            <input className={field} placeholder={`Notes for advancing to "${p.next_stage}"…`} value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={() => { advance.mutate({ name: p.name, notes: note }); setNote("") }} disabled={advance.isPending}
              className="whitespace-nowrap rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Advance → {p.next_stage}</button>
          </div>
        )}
      </div>

      {/* payment milestones */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-slate-700">Payment Milestones</h2>
          <div className="flex gap-2 items-center">
            <input className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm" placeholder="± amount" value={varAmt} onChange={(e) => setVarAmt(e.target.value)} />
            <input className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm" placeholder="variation reason" value={varReason} onChange={(e) => setVarReason(e.target.value)} />
            <button onClick={() => { if (varAmt) { variation.mutate({ name: p.name, amount: varAmt, reason: varReason }); setVarAmt(""); setVarReason("") } }}
              className="rounded-md border border-amber-300 text-amber-700 px-2 py-1 text-sm hover:bg-amber-50">Variation</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1">Milestone</th><th>Stage</th><th className="text-right">%</th><th className="text-right">Amount</th><th className="text-center">Status</th><th></th></tr></thead>
          <tbody>
            {p.payment_milestones.map((m) => (
              <tr key={m.idx} className="border-b border-gray-50">
                <td className="py-1.5 text-slate-700">{m.label}</td>
                <td className="text-center text-xs text-gray-500">{m.stage}</td>
                <td className="text-right text-gray-500">{m.percent}%</td>
                <td className="text-right text-slate-600">{inr(m.amount)}</td>
                <td className="text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${m.status === "Received" ? "bg-emerald-100 text-emerald-700" : m.status === "Due" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>{m.status}</span></td>
                <td className="text-right">{m.status !== "Received" && <button onClick={() => pay.mutate({ name: p.name, idx: m.idx })} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Record ✓</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* site log */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Site Log — discrepancies, alterations, snags</h2>
        <div className="flex gap-2 mb-3">
          <select className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={logType} onChange={(e) => setLogType(e.target.value)}><option>Discrepancy</option><option>Alteration</option><option>Snag</option></select>
          <input className={field} placeholder="Describe the site issue…" value={logDesc} onChange={(e) => setLogDesc(e.target.value)} />
          <button onClick={() => { if (logDesc) { addLog.mutate({ name: p.name, log_type: logType, description: logDesc }); setLogDesc("") } }} className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800">Add</button>
        </div>
        {p.site_logs.map((l) => (
          <div key={l.idx} className="flex justify-between items-center border-b border-gray-50 py-1.5 text-sm">
            <div><span className={`text-xs px-1.5 py-0.5 rounded ${l.log_type === "Snag" ? "bg-red-50 text-red-600" : l.log_type === "Alteration" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>{l.log_type}</span> <span className="text-slate-700">{l.description}</span> <span className="text-xs text-gray-400">· {l.log_date}</span></div>
            {l.status === "Open" ? <button onClick={() => resolveLog.mutate({ name: p.name, idx: l.idx })} className="text-xs text-emerald-600 hover:underline">Resolve</button> : <span className="text-xs text-emerald-600">✓ Resolved</span>}
          </div>
        ))}
        {!p.site_logs.length && <div className="text-xs text-gray-300">No site issues logged.</div>}
      </div>

      {/* work cards */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Work Cards</h2>
        <div className="flex gap-2 mb-3">
          <input className={field} placeholder="Task (e.g. Fix carcass, wall A)" value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} />
          <input className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="Assigned to" value={cardWho} onChange={(e) => setCardWho(e.target.value)} />
          <input className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm" type="date" value={cardDate} onChange={(e) => setCardDate(e.target.value)} />
          <button onClick={() => { if (cardTitle) { saveCard.mutate({ payload: { title: cardTitle, project: p.name, stage: p.stage, assigned_to: cardWho, scheduled_date: cardDate, company: p.company } }); setCardTitle(""); setCardWho(""); setCardDate("") } }} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Add</button>
        </div>
        {(p.work_cards || []).map((c) => (
          <div key={c.name} className="flex justify-between items-center border-b border-gray-50 py-1.5 text-sm">
            <div><span className="text-slate-700">{c.title}</span> <span className="text-xs text-gray-400">· {c.assigned_to || "unassigned"} · {c.scheduled_date || "—"} · {c.stage}</span></div>
            <select className="text-xs border border-gray-200 rounded px-1 py-0.5" value={c.status} onChange={(e) => cardStatus.mutate({ name: c.name, status: e.target.value })}>
              <option>To Do</option><option>In Progress</option><option>Done</option><option>Blocked</option>
            </select>
          </div>
        ))}
        {!(p.work_cards || []).length && <div className="text-xs text-gray-300">No work cards yet.</div>}
      </div>

      {/* feedback */}
      {(p.stage === "Handover" || p.stage === "Closed") && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-slate-700 mb-3">Handover Feedback</h2>
          <div className="flex gap-2 items-center">
            <select className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={p.feedback_rating || 0} onChange={(e) => feedback.mutate({ name: p.name, rating: Number(e.target.value) / 5 })}>
              <option value={0}>Rating…</option>{[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{"★".repeat(r)}</option>)}
            </select>
            <input className={field} placeholder="Feedback notes" defaultValue={p.feedback_notes} onBlur={(e) => feedback.mutate({ name: p.name, notes: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  )
}
