// Project Delivery · Work Schedule board. The Project Ops Manager's daily view of
// work cards across all projects — filter by date range + assignee, analyse status.
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { projectExecGet } from "../peoplework/client"

type Card = { name: string; title: string; project: string; stage?: string; assigned_to?: string; scheduled_date?: string; priority?: string; status: string }
type Resp = { cards: Card[]; kpis: Record<string, number> }

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-gray-100 text-gray-600", "In Progress": "bg-[var(--bg-subtle)] text-[var(--text-primary)]",
  "Done": "bg-[var(--bg-subtle)] text-[var(--text-primary)]", "Blocked": "bg-red-100 text-red-700",
}

export function WorkSchedulePage() {
  const nav = useNavigate()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [who, setWho] = useState("")
  const params: Record<string, string> = {}
  if (from && to) { params.date_from = from; params.date_to = to }
  if (who) params.assigned_to = who
  const q = useQuery({ queryKey: ["work_schedule", from, to, who], queryFn: () => projectExecGet<Resp>("schedule", params) })

  const byDate: Record<string, Card[]> = {}
  for (const c of q.data?.cards || []) {
    const d = c.scheduled_date || "Unscheduled"
    ;(byDate[d] = byDate[d] || []).push(c)
  }
  const k = q.data?.kpis

  return (
    <div className="p-6 mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Work Schedule</h1>
      <p className="text-sm text-gray-500 mb-4">Daily work cards across all projects — plan and analyse the PM / carpenter schedule.</p>

      <div className="flex gap-2 items-end mb-5 flex-wrap">
        <div><label className="block text-xs text-gray-500 mb-1">From</label><input type="date" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">To</label><input type="date" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Assignee</label><input className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="anyone" value={who} onChange={(e) => setWho(e.target.value)} /></div>
      </div>

      {k && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {["total", "todo", "in_progress", "done", "blocked"].map((key) => (
            <div key={key} className="bg-white rounded-lg border border-gray-100 shadow-sm px-3 py-2"><div className="text-xs text-gray-400 capitalize">{key.replace("_", " ")}</div><div className="text-lg font-bold text-slate-800">{k[key]}</div></div>
          ))}
        </div>
      )}

      {Object.keys(byDate).sort().map((d) => (
        <div key={d} className="mb-5">
          <div className="text-sm font-semibold text-slate-600 mb-2">{d}</div>
          <div className="space-y-1.5">
            {byDate[d].map((c) => (
              <div key={c.name} onClick={() => nav(`/projects/${c.project}`)} className="flex justify-between items-center bg-white rounded-lg border border-gray-100 px-3 py-2 text-sm hover:border-[var(--border-subtle)] cursor-pointer">
                <div><span className="text-slate-700">{c.title}</span> <span className="text-xs text-gray-400">· {c.assigned_to || "unassigned"} · {c.project} · {c.stage}</span></div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || "bg-gray-100"}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {q.data && !q.data.cards.length && <div className="text-sm text-gray-400">No work cards in range.</div>}
    </div>
  )
}
