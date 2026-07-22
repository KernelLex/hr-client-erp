import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, BookOpen, Target, BarChart3, FileText, Users, ClipboardList,
         BookMarked, Cog, Plus, Pencil, Trash2, X, Save } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { ADMIN_USERS } from "@/lib/constants"
import { toast } from "sonner"

// ── API ───────────────────────────────────────────────────────────────────────

const BASE = "/api/method/hr_client.api.org_hub"

async function apiFetch(endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  const resp = await fetch(`${BASE}.${endpoint}${qs ? "?" + qs : ""}`, { credentials: "include" })
  if (!resp.ok) throw new Error(`${resp.status}`)
  return (await resp.json()).message
}

async function apiPost(endpoint: string, body: Record<string, unknown>) {
  const token = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "fetch"
  const fd = new FormData()
  Object.entries(body).forEach(([k, v]) => fd.append(k, String(v ?? "")))
  const resp = await fetch(`${BASE}.${endpoint}`, {
    method: "POST", credentials: "include",
    headers: { "X-Frappe-CSRF-Token": token },
    body: fd,
  })
  if (!resp.ok) throw new Error(`${resp.status}`)
  const msg = (await resp.json()).message
  if (msg?.success === false) throw new Error(msg.error ?? "Unknown error")
  return msg
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Doc = Record<string, unknown>

interface MyOrgDocs {
  employee?: { company: string; department: string; designation: string }
  job_descriptions: Doc[]
  kras: Doc[]
  kpis: Doc[]
  sops: Doc[]
  policies: Doc[]
  handbook: Doc[]
  operations_manual: Doc[]
  processes: Doc[]
  forms_checklists: Doc[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPANY_COLOR: Record<string, string> = {
  "Vera Enterprises": "bg-blue-600",
  "Schones Leben": "bg-purple-600",
  "Hagan Modular": "bg-orange-500",
}

const COMPANIES = ["Vera Enterprises", "Schones Leben", "Hagan Modular"]

const TABS = [
  { id: "jd",       label: "Job Descriptions",   icon: Users,       doctype: "VE Job Description" },
  { id: "kra",      label: "KRAs",                icon: Target,      doctype: "VE KRA" },
  { id: "kpi",      label: "KPIs",                icon: BarChart3,   doctype: "VE KPI" },
  { id: "sop",      label: "SOPs",                icon: Cog,         doctype: "VE SOP" },
  { id: "policy",   label: "Policies",            icon: FileText,    doctype: "VE Policy" },
  { id: "handbook", label: "Handbook",            icon: BookOpen,    doctype: "VE Employee Handbook" },
  { id: "ops",      label: "Ops Manual",          icon: BookMarked,  doctype: "VE Operations Manual" },
  { id: "process",  label: "Processes",           icon: ClipboardList, doctype: "VE Department Process" },
  { id: "forms",    label: "Forms & Checklists",  icon: ClipboardList, doctype: "VE Forms Checklist" },
] as const

type TabId = (typeof TABS)[number]["id"]

// Field schema per doctype for add/edit modal
const FIELD_SCHEMA: Record<string, { key: string; label: string; type: "text"|"textarea"|"select"; options?: string[] }[]> = {
  "VE Job Description": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "designation", label: "Designation", type: "text" },
    { key: "reports_to", label: "Reports To", type: "text" },
    { key: "effective_date", label: "Effective Date (YYYY-MM-DD)", type: "text" },
    { key: "purpose", label: "Purpose / Role Summary", type: "textarea" },
    { key: "responsibilities", label: "Key Responsibilities", type: "textarea" },
    { key: "qualifications", label: "Qualifications", type: "textarea" },
    { key: "competencies", label: "Competencies", type: "textarea" },
  ],
  "VE KRA": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "designation", label: "Designation", type: "text" },
    { key: "kra_title", label: "KRA Title", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "weightage", label: "Weightage (%)", type: "text" },
    { key: "measurement_criteria", label: "Measurement Criteria", type: "text" },
    { key: "target", label: "Target", type: "text" },
    { key: "frequency", label: "Frequency", type: "select", options: ["Monthly","Quarterly","Annual"] },
  ],
  "VE KPI": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "designation", label: "Designation", type: "text" },
    { key: "kpi_name", label: "KPI Name", type: "text" },
    { key: "unit", label: "Unit (%, INR, count…)", type: "text" },
    { key: "target_value", label: "Target Value", type: "text" },
    { key: "frequency", label: "Frequency", type: "select", options: ["Daily","Weekly","Monthly","Quarterly","Annual"] },
    { key: "data_source", label: "Data Source", type: "text" },
  ],
  "VE SOP": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "sop_title", label: "SOP Title", type: "text" },
    { key: "sop_code", label: "SOP Code", type: "text" },
    { key: "version", label: "Version", type: "text" },
    { key: "effective_date", label: "Effective Date", type: "text" },
    { key: "responsible_role", label: "Responsible Role", type: "text" },
    { key: "purpose", label: "Purpose", type: "textarea" },
    { key: "scope", label: "Scope", type: "textarea" },
    { key: "procedure", label: "Procedure (step-by-step)", type: "textarea" },
  ],
  "VE Policy": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "policy_name", label: "Policy Name", type: "text" },
    { key: "policy_category", label: "Category", type: "select", options: ["HR","Finance","Operations","IT","Safety","Legal"] },
    { key: "version", label: "Version", type: "text" },
    { key: "effective_date", label: "Effective Date", type: "text" },
    { key: "content", label: "Policy Content", type: "textarea" },
  ],
  "VE Employee Handbook": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "section_order", label: "Section Order (number)", type: "text" },
    { key: "section_title", label: "Section Title", type: "text" },
    { key: "content", label: "Content", type: "textarea" },
  ],
  "VE Operations Manual": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "section_title", label: "Section Title", type: "text" },
    { key: "content", label: "Content", type: "textarea" },
  ],
  "VE Department Process": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "process_name", label: "Process Name", type: "text" },
    { key: "trigger_event", label: "Trigger Event", type: "text" },
    { key: "responsible_roles", label: "Responsible Roles", type: "text" },
    { key: "tools_used", label: "Tools Used", type: "text" },
    { key: "steps", label: "Steps (step-by-step)", type: "textarea" },
  ],
  "VE Forms Checklist": [
    { key: "company", label: "Company", type: "select", options: COMPANIES },
    { key: "department", label: "Department", type: "text" },
    { key: "form_title", label: "Form / Checklist Title", type: "text" },
    { key: "form_type", label: "Type", type: "select", options: ["Form","Checklist"] },
    { key: "instructions", label: "Instructions", type: "textarea" },
    { key: "items", label: "Fields / Items", type: "textarea" },
  ],
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: unknown }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{String(value)}</p>
    </div>
  )
}

function ViewModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 truncate pr-4">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-gray-700 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function EditModal({
  doctype, initial, onClose, onSaved,
}: {
  doctype: string; initial?: Doc; onClose: () => void; onSaved: () => void
}) {
  const isEdit = Boolean(initial?.name)
  const fields = FIELD_SCHEMA[doctype] ?? []
  const [form, setForm] = useState<Record<string, string>>(() => {
    const obj: Record<string, string> = {}
    fields.forEach(f => { obj[f.key] = String(initial?.[f.key] ?? "") })
    return obj
  })
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      if (isEdit) {
        await apiPost("update_org_doc", { doctype, name: initial!.name as string, fields_json: JSON.stringify(form) })
        toast.success("Entry updated")
      } else {
        // JD needs jd_title derived field
        const payload = { ...form }
        if (doctype === "VE Job Description" && !payload.jd_title) {
          payload.jd_title = `${payload.designation} — ${payload.company}`
        }
        await apiPost("create_org_doc", { doctype, fields_json: JSON.stringify(payload) })
        toast.success("Entry created")
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [doctype, form, initial, isEdit, onClose, onSaved])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{isEdit ? "Edit Entry" : `Add — ${doctype}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{f.label}</label>
              {f.type === "select" ? (
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}>
                  <option value="">— select —</option>
                  {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea rows={5} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
                  value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              ) : (
                <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <Save size={14} />{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-72 text-center">
        <p className="text-sm text-gray-700 mb-4">Delete this entry? This cannot be undone.</p>
        <div className="flex justify-center gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Row with admin actions ─────────────────────────────────────────────────────

function DocRow({
  primary, secondary, badge, doc, doctype, isAdmin,
  onView, onEdit, onDeleted,
}: {
  primary: string; secondary?: string; badge?: string; doc: Doc; doctype: string; isAdmin: boolean
  onView: () => void; onEdit: () => void; onDeleted: () => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const qc = useQueryClient()

  const deleteMut = useMutation({
    mutationFn: () => apiPost("delete_org_doc", { doctype, name: doc.name as string }),
    onSuccess: () => { toast.success("Deleted"); onDeleted(); qc.invalidateQueries() },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onView}>
          <p className="text-sm font-medium text-gray-900 truncate">{primary}</p>
          {secondary && <p className="text-xs text-gray-500 truncate mt-0.5">{secondary}</p>}
        </div>
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {badge && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{badge}</span>}
          {isAdmin && (
            <>
              <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 transition-all" title="Edit">
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDel(true)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all" title="Delete">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {confirmDel && (
        <ConfirmDelete
          onConfirm={() => { setConfirmDel(false); deleteMut.mutate() }}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  )
}

function SectionHeader({ icon: Icon, title, count, isAdmin, onAdd, loading }: {
  icon: React.ElementType; title: string; count?: number; isAdmin: boolean
  doctype?: string; onAdd: () => void; loading?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-indigo-600" />
      </div>
      <h3 className="font-semibold text-gray-900 text-sm flex-1">{title}</h3>
      {count !== undefined && !loading && (
        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{count}</span>
      )}
      {isAdmin && (
        <button onClick={onAdd}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  )
}

// ── Employee read view ────────────────────────────────────────────────────────

function EmployeeView() {
  const { data, isLoading, isError } = useQuery<MyOrgDocs>({
    queryKey: ["my-org-docs"],
    queryFn: () => apiFetch("get_my_org_docs"),
    staleTime: 300000,
  })

  if (isLoading) return <div className="p-8 text-center text-sm text-gray-400">Loading your documents…</div>
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-500">Failed to load. Please refresh.</div>

  const emp = data.employee
  const company = emp?.company ?? ""
  const accentBg = company === "Schones Leben" ? "bg-purple-600" : company === "Hagan Modular" ? "bg-orange-500" : "bg-blue-600"

  function Block({ title, docs, titleKey }: { title: string; docs: Doc[]; titleKey: string }) {
    if (!docs?.length) return null
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className={`${accentBg} px-5 py-3`}>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {emp && <p className="text-xs text-white/70 mt-0.5">{emp.department} · {emp.company}</p>}
        </div>
        <div className="divide-y divide-gray-50">
          {docs.map((doc, i) => {
            const label = String(doc[titleKey] ?? doc.name ?? "")
            return (
              <details key={i} className="group">
                <summary className="flex items-center justify-between px-5 py-3 cursor-pointer list-none hover:bg-gray-50">
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-5 pb-4 space-y-3 text-sm text-gray-700">
                  {Object.entries(doc).filter(([k]) => !["name","creation","modified","owner","doctype","idx"].includes(k) && doc[k]).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{k.replace(/_/g," ")}</p>
                      <p className="whitespace-pre-line leading-relaxed">{String(v)}</p>
                    </div>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {emp && (
        <div className={`${accentBg} rounded-xl p-4 mb-6 text-white`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Your Profile</p>
          <p className="text-lg font-bold mt-1">{emp.designation}</p>
          <p className="text-sm opacity-80">{emp.department} · {emp.company}</p>
        </div>
      )}
      <Block title="Your Job Description" docs={data.job_descriptions} titleKey="designation" />
      <Block title="Your Key Result Areas (KRAs)" docs={data.kras} titleKey="kra_title" />
      <Block title="Your KPIs" docs={data.kpis} titleKey="kpi_name" />
      <Block title="Department SOPs" docs={data.sops} titleKey="sop_title" />
      <Block title="Company Policies" docs={data.policies} titleKey="policy_name" />
      <Block title="Employee Handbook" docs={data.handbook} titleKey="section_title" />
      <Block title="Operations Manual" docs={data.operations_manual} titleKey="section_title" />
      <Block title="Department Processes" docs={data.processes} titleKey="process_name" />
      <Block title="Forms & Checklists" docs={data.forms_checklists} titleKey="form_title" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OrgHubPage() {
  const { user } = useAuth()
  const isAdmin = Boolean(user && ADMIN_USERS.has(user.name))

  const [company, setCompany] = useState("Vera Enterprises")
  const [tab, setTab] = useState<TabId>("jd")
  const [viewDoc, setViewDoc] = useState<Doc | null>(null)
  const [editDoc, setEditDoc] = useState<{ doctype: string; doc?: Doc } | null>(null)
  const qc = useQueryClient()

  const co = company

  function qKey(t: string) { return ["org-hub", t, co] }
  function invalidate() { qc.invalidateQueries({ queryKey: ["org-hub"] }) }

  const jdQ    = useQuery<Doc[]>({ queryKey: qKey("jd"),       queryFn: () => apiFetch("get_job_descriptions", { company: co }), staleTime: 60000 })
  const kraQ   = useQuery<Doc[]>({ queryKey: qKey("kra"),      queryFn: () => apiFetch("get_kras",             { company: co }), staleTime: 60000 })
  const kpiQ   = useQuery<Doc[]>({ queryKey: qKey("kpi"),      queryFn: () => apiFetch("get_kpis",             { company: co }), staleTime: 60000 })
  const sopQ   = useQuery<Doc[]>({ queryKey: qKey("sop"),      queryFn: () => apiFetch("get_sops",             { company: co }), staleTime: 60000 })
  const polQ   = useQuery<Doc[]>({ queryKey: qKey("policy"),   queryFn: () => apiFetch("get_policies",         { company: co }), staleTime: 60000 })
  const hbQ    = useQuery<Doc[]>({ queryKey: qKey("handbook"), queryFn: () => apiFetch("get_handbook",         { company: co }), staleTime: 60000 })
  const opsQ   = useQuery<Doc[]>({ queryKey: qKey("ops"),      queryFn: () => apiFetch("get_operations_manual",{ company: co }), staleTime: 60000 })
  const procQ  = useQuery<Doc[]>({ queryKey: qKey("process"),  queryFn: () => apiFetch("get_processes",        { company: co }), staleTime: 60000 })
  const formsQ = useQuery<Doc[]>({ queryKey: qKey("forms"),    queryFn: () => apiFetch("get_forms_checklists", { company: co }), staleTime: 60000 })

  const tabData: Record<TabId, { q: typeof jdQ; primaryKey: string; secondaryKey?: string; badgeKey?: string }> = {
    jd:       { q: jdQ,    primaryKey: "designation",   secondaryKey: "department",    badgeKey: "company" },
    kra:      { q: kraQ,   primaryKey: "kra_title",     secondaryKey: "designation",   badgeKey: "frequency" },
    kpi:      { q: kpiQ,   primaryKey: "kpi_name",      secondaryKey: "designation",   badgeKey: "unit" },
    sop:      { q: sopQ,   primaryKey: "sop_title",     secondaryKey: "department",    badgeKey: "sop_code" },
    policy:   { q: polQ,   primaryKey: "policy_name",   secondaryKey: "policy_category" },
    handbook: { q: hbQ,    primaryKey: "section_title", secondaryKey: "section_order" as string },
    ops:      { q: opsQ,   primaryKey: "section_title", secondaryKey: "department" },
    process:  { q: procQ,  primaryKey: "process_name",  secondaryKey: "department" },
    forms:    { q: formsQ, primaryKey: "form_title",    secondaryKey: "form_type" },
  }

  const currentTab = TABS.find(t => t.id === tab)!
  const { q, primaryKey, secondaryKey, badgeKey } = tabData[tab]

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app, #F8FAFC)" }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Org Hub</h1>
            <p className="text-xs text-gray-500">Job descriptions, KRAs, SOPs, policies &amp; processes</p>
          </div>
        </div>

        {/* Admin sees company filter; employee sees their own view */}
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {COMPANIES.map(c => (
              <button key={c} onClick={() => setCompany(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  company === c
                    ? `${COMPANY_COLOR[c] ?? "bg-indigo-600"} text-white shadow-sm`
                    : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
                }`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Employee view — non-admin */}
      {!isAdmin && <EmployeeView />}

      {/* Admin view */}
      {isAdmin && (
        <>
          {/* Tab bar */}
          <div className="bg-white border-b border-gray-100 px-6 overflow-x-auto">
            <div className="flex gap-0 min-w-max">
              {TABS.map(({ id, label, icon: Icon }) => {
                const cnt = tabData[id].q.data?.length ?? 0
                return (
                  <button key={id} onClick={() => setTab(id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}>
                    <Icon className="w-3.5 h-3.5" />{label}
                    <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tab === id ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>
                      {cnt}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <SectionHeader
                icon={currentTab.icon}
                title={currentTab.label}
                count={q.data?.length}
                isAdmin={isAdmin}
                doctype={currentTab.doctype}
                onAdd={() => setEditDoc({ doctype: currentTab.doctype })}
                loading={q.isLoading}
              />
              <div className="p-4">
                {q.isLoading && (
                  <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />)}</div>
                )}
                {!q.isLoading && !q.data?.length && (
                  <p className="text-xs text-gray-400 text-center py-6 italic">No entries yet — click Add to create the first one.</p>
                )}
                {!q.isLoading && q.data && q.data.length > 0 && (
                  <div className="space-y-2">
                    {q.data.map(doc => (
                      <DocRow
                        key={String(doc.name)}
                        doc={doc}
                        doctype={currentTab.doctype}
                        isAdmin={isAdmin}
                        primary={String(doc[primaryKey] ?? "")}
                        secondary={secondaryKey ? String(doc[secondaryKey] ?? "") : undefined}
                        badge={badgeKey ? String(doc[badgeKey] ?? "") : undefined}
                        onView={() => setViewDoc(doc)}
                        onEdit={() => setEditDoc({ doctype: currentTab.doctype, doc })}
                        onDeleted={invalidate}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* View modal */}
      {viewDoc && (
        <ViewModal
          title={String(viewDoc[tabData[tab].primaryKey] ?? viewDoc.name ?? "Detail")}
          onClose={() => setViewDoc(null)}
        >
          {Object.entries(viewDoc)
            .filter(([k]) => !["name","creation","modified","owner","doctype","idx","jd_title"].includes(k) && viewDoc[k] !== "" && viewDoc[k] !== null)
            .map(([k, v]) => <Field key={k} label={k.replace(/_/g, " ")} value={v} />)}
        </ViewModal>
      )}

      {/* Edit / Create modal */}
      {editDoc && (
        <EditModal
          doctype={editDoc.doctype}
          initial={editDoc.doc}
          onClose={() => setEditDoc(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  )
}
