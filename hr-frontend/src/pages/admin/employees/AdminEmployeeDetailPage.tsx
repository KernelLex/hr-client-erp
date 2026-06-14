import { useState, useRef } from "react"
import { useParams, useNavigate, Navigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Camera, Pencil, Check, X, Lock, CalendarDays, Clock,
  Plus, Trash2, Mail, Hash,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useAuth } from "@/context/AuthContext"
import { api, apiUrl } from "@/lib/api"
import {
  getEmployeeProfile, adminUpdateProfile, uploadProfilePhoto,
  type EmployeeProfile,
} from "@/api/employee"
import { useEmployeeLeaveHistory, useApproveLeave, useRejectLeave } from "@/pages/leave/useLeave"
import { useUsersWithPermissions, useUpdatePermissions } from "@/pages/admin/permissions/usePermissions"
import {
  PERMISSION_MODULE_LABELS, MODULE_ICONS,
  type PermissionModule,
} from "@/pages/admin/permissions/types"

const ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

const ALL_MODULES: PermissionModule[] = [
  "recruitment", "employee_lifecycle", "accounts", "projects",
  "logistics", "hr", "attendance", "expense",
]

const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]

const GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
]

function getGradient(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % GRADIENTS.length
  return GRADIENTS[Math.abs(h)]
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function departmentLabel(dept: string) {
  return dept.replace(/ - V$/, "")
}

// ── Shared field renderer ─────────────────────────────────────────────────────

function ProfileField({
  label, value, field, editMode, draft, onChange, type = "text", as, options,
}: {
  label: string; value: string; field: keyof EmployeeProfile; editMode: boolean
  draft: Partial<EmployeeProfile>; onChange: (f: keyof EmployeeProfile, v: string) => void
  type?: string; as?: "select"; options?: string[]
}) {
  const current = (draft[field] as string) ?? value
  if (!editMode) {
    return (
      <div className="space-y-1">
        <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", fontWeight: 500 }}>
          {label}
        </p>
        <p style={{ fontSize: "14px", fontWeight: 500, color: current ? "#0F172A" : "#CBD5E1" }}>
          {current || <em style={{ fontStyle: "italic", color: "#CBD5E1" }}>Not set</em>}
        </p>
      </div>
    )
  }
  if (as === "select" && options) {
    return (
      <div className="space-y-1">
        <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", fontWeight: 500 }}>
          {label}
        </p>
        <select
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          value={current}
          onChange={(e) => onChange(field, e.target.value)}
        >
          {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", fontWeight: 500 }}>
        {label}
      </p>
      <Input type={type} value={current} onChange={(e) => onChange(field, e.target.value)} className="h-8 text-sm" />
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-white rounded-xl p-5"
      style={{
        border: "1px solid #E2E8F0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        borderLeft: "4px solid #4F46E5",
      }}
    >
      <p className="text-sm font-semibold text-gray-800 mb-4">{title}</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">{children}</div>
    </div>
  )
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ email, profile }: { email: string; profile: EmployeeProfile }) {
  const qc = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Partial<EmployeeProfile>>({})

  const saveMutation = useMutation({
    mutationFn: () => adminUpdateProfile(email, draft),
    onSuccess: () => {
      toast.success("Profile saved")
      setEditMode(false)
      setDraft({})
      qc.invalidateQueries({ queryKey: ["employee_profile", email] })
    },
    onError: () => toast.error("Failed to save profile"),
  })

  function onChange(field: keyof EmployeeProfile, val: string) {
    setDraft((p) => ({ ...p, [field]: val }))
  }

  function fp(field: keyof EmployeeProfile, extra?: object) {
    return { field, value: (profile[field] as string) ?? "", editMode, draft, onChange, ...extra }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        {editMode ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setDraft({}); setEditMode(false) }} className="gap-1">
              <X size={14} /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || Object.keys(draft).length === 0}
              className="gap-1"
              style={{ backgroundColor: "#4F46E5", color: "white" }}
            >
              <Check size={14} /> {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditMode(true)} className="gap-1">
            <Pencil size={14} /> Edit Profile
          </Button>
        )}
      </div>

      <InfoSection title="Personal Information">
        <ProfileField {...fp("date_of_birth")} label="Date of Birth" type="date" />
        <ProfileField {...fp("gender")} label="Gender" />
        <ProfileField {...fp("blood_group")} label="Blood Group" as="select" options={BLOOD_GROUPS} />
        <ProfileField {...fp("personal_email")} label="Personal Email" type="email" />
        <ProfileField {...fp("cell_number")} label="Personal Phone" />
        <ProfileField {...fp("current_address")} label="Address" />
        <ProfileField {...fp("person_to_be_contacted")} label="Emergency Contact" />
        <ProfileField {...fp("emergency_phone_number")} label="Emergency Phone" />
      </InfoSection>

      <InfoSection title="Work Information">
        <ProfileField field="employee_id" value={profile.employee_id} label="Employee ID" editMode={false} draft={draft} onChange={onChange} />
        <ProfileField {...fp("designation")} label="Designation" as="select"
          options={["", "Manager", "Project Manager", "Accounts Manager", "Accounts Executive", "GST & TDS Specialist", "Logistics Manager", "Stock Monitor", "Porter Executive"]} />
        <ProfileField field="department" value={departmentLabel(profile.department)} label="Department" editMode={false} draft={draft} onChange={onChange} />
        <ProfileField {...fp("date_of_joining")} label="Date of Joining" type="date" />
        <ProfileField {...fp("employment_type")} label="Employment Type" as="select"
          options={["", "Full-time", "Part-time", "Contract", "Probation"]} />
        <ProfileField field="reports_to_name" value={profile.reports_to_name} label="Reporting Manager" editMode={false} draft={draft} onChange={onChange} />
        <ProfileField {...fp("company_email")} label="Work Email" type="email" />
        <ProfileField {...fp("status")} label="Status" as="select" options={["Active", "Inactive", "Left"]} />
      </InfoSection>

      <InfoSection title="Bank Details">
        <ProfileField {...fp("bank_name")} label="Bank Name" />
        <ProfileField {...fp("bank_ac_no")} label="Account Number" />
        <ProfileField {...fp("custom_ifsc_code")} label="IFSC Code" />
      </InfoSection>
    </div>
  )
}

// ── Leave History Tab ─────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "Approved") return <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs">Approved</Badge>
  if (status === "Rejected") return <Badge className="bg-red-50 text-red-700 border-0 text-xs">Rejected</Badge>
  return <Badge className="bg-amber-50 text-amber-700 border-0 text-xs">Pending</Badge>
}

function LeaveHistoryTab({ email }: { email: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useEmployeeLeaveHistory(email)
  const approve = useApproveLeave()
  const reject = useRejectLeave()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [remarks, setRemarks] = useState("")

  async function handleApprove(id: string) {
    const res = await approve.mutateAsync({ leave_id: id })
    if (res.success) {
      toast.success("Leave approved")
      qc.invalidateQueries({ queryKey: ["employee_leave_history", email] })
    } else {
      toast.error(res.error ?? "Failed to approve")
    }
  }

  async function handleReject() {
    if (!rejectId) return
    if (!remarks.trim()) { toast.error("Rejection reason is required"); return }
    const res = await reject.mutateAsync({ leave_id: rejectId, admin_remarks: remarks })
    if (res.success) {
      toast.success("Leave rejected")
      setRejectId(null)
      setRemarks("")
      qc.invalidateQueries({ queryKey: ["employee_leave_history", email] })
    } else {
      toast.error(res.error ?? "Failed to reject")
    }
  }

  if (isLoading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse mt-4" />
  const leaves = data?.data ?? []

  return (
    <div className="pt-4 space-y-3">
      {leaves.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No leave records found</p>
        </div>
      ) : (
        leaves.map((leave) => (
          <div
            key={leave.name}
            className="bg-white rounded-xl p-4"
            style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{leave.leave_type}</span>
                  {statusBadge(leave.status)}
                </div>
                <p className="text-xs text-gray-500">
                  {leave.from_date} → {leave.to_date} · <span className="font-medium">{leave.total_days} day{leave.total_days !== 1 ? "s" : ""}</span>
                </p>
                {leave.reason && <p className="text-xs text-gray-600">{leave.reason}</p>}
                {leave.admin_remarks && <p className="text-xs text-gray-500 italic">Remarks: {leave.admin_remarks}</p>}
                <p className="text-[10px] text-gray-400">Applied {leave.applied_on}</p>
              </div>
              {leave.status === "Pending" && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleApprove(leave.name)} disabled={approve.isPending}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => { setRejectId(leave.name); setRemarks("") }}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Reject Leave Request</h3>
            <textarea
              className="w-full border border-gray-300 rounded-md text-sm p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={3}
              placeholder="Reason for rejection (required)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRemarks("") }}>Cancel</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleReject} disabled={reject.isPending}>
                {reject.isPending ? "Rejecting…" : "Confirm Reject"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Permissions Tab ───────────────────────────────────────────────────────────

function PermissionsTab({ email }: { email: string }) {
  const { data, isLoading } = useUsersWithPermissions()
  const updateMutation = useUpdatePermissions()
  const [localPerms, setLocalPerms] = useState<Record<PermissionModule, boolean> | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  const userData = data?.users.find((u) => u.email === email)

  const perms: Record<PermissionModule, boolean> = localPerms
    ?? (userData ? { ...userData.permissions } : Object.fromEntries(ALL_MODULES.map((m) => [m, true])) as Record<PermissionModule, boolean>)

  function toggle(mod: PermissionModule) {
    setLocalPerms((prev) => {
      const base = prev ?? (userData ? { ...userData.permissions } : Object.fromEntries(ALL_MODULES.map((m) => [m, true])) as Record<PermissionModule, boolean>)
      return { ...base, [mod]: !base[mod] }
    })
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    try {
      const result = await updateMutation.mutateAsync({ email, permissions: perms })
      if (result && (result as { success?: boolean }).success === false) {
        toast.error((result as { error?: string }).error ?? "Failed to save permissions")
        return
      }
      setDirty(false)
      setSaved(true)
      toast.success("Permissions saved")
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions")
    }
  }

  if (isLoading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse mt-4" />

  if (userData?.is_admin) {
    return (
      <div className="pt-4 text-center py-12 text-gray-400">
        <Lock size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Administrator — permissions cannot be modified</p>
      </div>
    )
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ALL_MODULES.map((mod) => (
          <button
            key={mod}
            type="button"
            className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 text-left"
            onClick={() => toggle(mod)}
          >
            <span className="text-lg leading-none">{MODULE_ICONS[mod]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{PERMISSION_MODULE_LABELS[mod]}</p>
            </div>
            <Switch checked={perms[mod]} onCheckedChange={() => toggle(mod)} />
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || updateMutation.isPending}
          onClick={handleSave}
          style={saved ? { backgroundColor: "#059669", color: "white" } : { backgroundColor: "#4F46E5", color: "white" }}
        >
          {saved ? <><Check size={14} className="mr-1" /> Saved</> : updateMutation.isPending ? "Saving…" : "Save Permissions"}
        </Button>
      </div>
    </div>
  )
}

// ── Notes Right Column ────────────────────────────────────────────────────────

interface EmployeeNote {
  name: string
  note_content: string
  tag: "Good" | "Bad" | "Neutral"
  created_by_user: string
  created_on: string
}

const NOTE_BASE = "hr_client.api.notes"
function notesUrl(method: string) { return apiUrl(`${NOTE_BASE}.${method}`) }

const TAG_SELECTED: Record<string, { bg: string; border: string; text: string }> = {
  Good:    { bg: "#D1FAE5", border: "#6EE7B7", text: "#065F46" },
  Neutral: { bg: "#FEF9C3", border: "#FDE047", text: "#713F12" },
  Bad:     { bg: "#FEE2E2", border: "#FCA5A5", text: "#991B1B" },
}

const TAG_BADGE: Record<string, { bg: string; text: string }> = {
  Good:    { bg: "#D1FAE5", text: "#065F46" },
  Neutral: { bg: "#FEF9C3", text: "#713F12" },
  Bad:     { bg: "#FEE2E2", text: "#991B1B" },
}

function TagBadge({ tag }: { tag: string }) {
  const s = TAG_BADGE[tag] ?? TAG_BADGE.Neutral
  return (
    <span
      className="text-[12px] font-semibold px-2.5 py-0.5"
      style={{ backgroundColor: s.bg, color: s.text, borderRadius: "6px" }}
    >
      {tag}
    </span>
  )
}

function SentimentButton({
  label, selected, onClick,
}: { label: "Good" | "Neutral" | "Bad"; selected: boolean; onClick: () => void }) {
  const s = TAG_SELECTED[label]
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: "20px",
        padding: "6px 16px",
        fontSize: "13px",
        fontWeight: selected ? 600 : 400,
        border: selected ? `1px solid ${s.border}` : "1px solid #D1D5DB",
        backgroundColor: selected ? s.bg : "white",
        color: selected ? s.text : "#6B7280",
        transition: "all 0.15s ease",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

function NotesColumn({ email }: { email: string }) {
  const qc = useQueryClient()
  const [noteText, setNoteText] = useState("")
  const [tag, setTag] = useState<"Good" | "Neutral" | "Bad">("Neutral")
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editTag, setEditTag] = useState<"Good" | "Neutral" | "Bad">("Neutral")
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ success: boolean; notes: EmployeeNote[] }>({
    queryKey: ["employee_notes", email],
    queryFn: () =>
      api.get(notesUrl("get_notes"), { params: { employee_email: email } })
        .then((r) => r.data.message),
    staleTime: 30_000,
    enabled: !!email,
  })

  const notes = data?.notes ?? []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim()) { toast.error("Note content is required"); return }
    setSubmitting(true)
    try {
      const res = await api.post(notesUrl("add_note"), { employee_email: email, note_content: noteText.trim(), tag })
      const msg = res.data.message
      if (msg?.success === false) throw new Error(msg?.error ?? "Failed")
      qc.invalidateQueries({ queryKey: ["employee_notes", email] })
      setNoteText("")
      setTag("Neutral")
      toast.success("Note added")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add note")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(noteId: string) {
    if (!editText.trim()) { toast.error("Note content is required"); return }
    try {
      const res = await api.post(notesUrl("update_note"), { note_id: noteId, note_content: editText.trim(), tag: editTag })
      const msg = res.data.message
      if (msg?.success === false) throw new Error(msg?.error ?? "Failed")
      qc.invalidateQueries({ queryKey: ["employee_notes", email] })
      setEditId(null)
      toast.success("Note updated")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update")
    }
  }

  async function handleDelete(noteId: string) {
    setDeletingId(noteId)
    try {
      const res = await api.post(notesUrl("delete_note"), { note_id: noteId })
      if (res.data.message?.success === false) throw new Error()
      qc.invalidateQueries({ queryKey: ["employee_notes", email] })
      toast.success("Note deleted")
    } catch {
      toast.error("Failed to delete note")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Add note card */}
      <div
        className="bg-white rounded-xl p-4"
        style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        <p className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: "#4F46E5" }}>
          <Plus size={14} /> Add Private Note
        </p>
        <form onSubmit={handleAdd} className="space-y-3">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Write a private note about this employee…"
            className="w-full resize-none text-sm rounded-lg px-3 py-2.5"
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              outline: "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
              minHeight: "80px",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#4F46E5"
              e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#E2E8F0"
              e.target.style.boxShadow = "none"
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {(["Good", "Neutral", "Bad"] as const).map((t) => (
              <SentimentButton key={t} label={t} selected={tag === t} onClick={() => setTag(t)} />
            ))}
            <button
              type="submit"
              disabled={submitting || !noteText.trim()}
              style={{
                marginLeft: "auto",
                backgroundColor: "#4F46E5",
                color: "white",
                borderRadius: "8px",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting || !noteText.trim() ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#3730A3" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#4F46E5" }}
            >
              {submitting ? "Saving…" : "Add Note"}
            </button>
          </div>
        </form>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.name}
              className="bg-white rounded-[10px] p-4"
              style={{
                border: "1px solid #E2E8F0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                marginBottom: "12px",
              }}
            >
              {editId === note.name ? (
                <div className="space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full text-sm rounded-lg px-3 py-2.5 resize-none"
                    style={{ border: "1px solid #E2E8F0", outline: "none", minHeight: "80px" }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#4F46E5"
                      e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#E2E8F0"
                      e.target.style.boxShadow = "none"
                    }}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {(["Good", "Neutral", "Bad"] as const).map((t) => (
                      <SentimentButton key={t} label={t} selected={editTag === t} onClick={() => setEditTag(t)} />
                    ))}
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditId(null)} className="h-7 text-xs">
                        <X size={12} className="mr-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleUpdate(note.name)}
                        className="h-7 text-xs" style={{ backgroundColor: "#4F46E5", color: "white" }}>
                        <Check size={12} className="mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Top row: badge + author + date + actions */}
                  <div className="flex items-center gap-2 mb-2">
                    <TagBadge tag={note.tag} />
                    <span className="text-[13px] text-gray-500 flex-1 truncate">
                      {note.created_by_user}
                      {note.created_on && (
                        <> · {new Date(note.created_on).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
                      )}
                    </span>
                    <button
                      className="p-1 rounded"
                      style={{ color: "#94A3B8", transition: "color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#4F46E5")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
                      onClick={() => { setEditId(note.name); setEditText(note.note_content); setEditTag(note.tag) }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="p-1 rounded"
                      disabled={deletingId === note.name}
                      style={{ color: "#94A3B8", transition: "color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
                      onClick={() => handleDelete(note.name)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Note text */}
                  <p className="whitespace-pre-wrap" style={{ fontSize: "14px", color: "#0F172A", lineHeight: 1.6 }}>
                    {note.note_content}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Profile Header Card ───────────────────────────────────────────────────────

function ProfileHeaderCard({ profile, email }: { profile: EmployeeProfile; email: string }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gradient = profile.image ? "" : getGradient(profile.employee_name)

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadProfilePhoto(file, email),
    onSuccess: () => {
      toast.success("Photo updated")
      qc.invalidateQueries({ queryKey: ["employee_profile", email] })
    },
    onError: () => toast.error("Photo upload failed"),
  })

  return (
    <div
      className="bg-white rounded-xl overflow-hidden"
      style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      {/* Gradient banner */}
      <div className="h-20" style={{ background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)" }} />

      {/* Avatar overlapping banner */}
      <div className="relative px-5 pb-4" style={{ marginTop: "-40px" }}>
        <div className="relative inline-block">
          <div
            className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              border: "3px solid white",
              background: gradient || "#EDE9FE",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            }}
          >
            {profile.image ? (
              <img src={profile.image} alt={profile.employee_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-2xl">{getInitials(profile.employee_name)}</span>
            )}
          </div>
          <button
            className="absolute bottom-0 right-0 bg-white border border-gray-200 rounded-full p-1 shadow hover:bg-gray-50"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={11} className="text-gray-600" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) photoMutation.mutate(f) }}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <h2 className="text-xl font-bold text-gray-900">{profile.employee_name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs font-normal bg-indigo-50 text-indigo-700 border-0">
              {profile.designation}
            </Badge>
            <Badge variant="secondary" className="text-xs font-normal bg-emerald-50 text-emerald-700 border-0">
              {profile.status || "Active"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
            <Mail size={12} className="shrink-0" />
            <span>{profile.company_email || email}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Hash size={12} className="shrink-0" />
            <span className="font-mono">{profile.employee_id}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminEmployeeDetailPage() {
  const { email: rawEmail } = useParams<{ email: string }>()
  const email = rawEmail ? decodeURIComponent(rawEmail) : ""
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = !!user && ADMIN_USERS.has(user.name)

  const { data: profile, isLoading } = useQuery({
    queryKey: ["employee_profile", email],
    queryFn: () => getEmployeeProfile(email),
    enabled: !!email && isAdmin,
  })

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col min-h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <button onClick={() => navigate("/admin/employees")} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft size={18} />
        </button>
        {isLoading ? (
          <div className="space-y-1">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{profile?.employee_name ?? email}</h1>
            <p className="text-xs text-gray-500">
              {profile ? `${profile.designation} · ${departmentLabel(profile.department)}` : ""}
            </p>
          </div>
        )}
      </div>

      {/* Two-column content */}
      <div className="flex flex-1 gap-6 p-6 min-h-0">

        {/* LEFT COLUMN */}
        <div className="flex-1 min-w-0 space-y-4">
          {isLoading ? (
            <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ) : profile ? (
            <ProfileHeaderCard profile={profile} email={email} />
          ) : (
            <div className="bg-white rounded-xl p-6 text-center text-gray-400 border border-gray-100">
              <p className="text-sm">Profile not found</p>
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="profile">
            <TabsList className="border border-gray-200 bg-gray-50">
              <TabsTrigger value="profile" className="text-xs px-4">Profile</TabsTrigger>
              <TabsTrigger value="leave" className="text-xs px-4 flex items-center gap-1">
                <CalendarDays size={12} /> Leave History
              </TabsTrigger>
              <TabsTrigger value="attendance" className="text-xs px-4 flex items-center gap-1">
                <Clock size={12} /> Attendance
              </TabsTrigger>
              <TabsTrigger value="permissions" className="text-xs px-4">Permissions</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              {profile ? (
                <ProfileTab email={email} profile={profile} />
              ) : !isLoading ? (
                <p className="text-sm text-gray-400 pt-4">No profile data.</p>
              ) : null}
            </TabsContent>

            <TabsContent value="leave">
              <LeaveHistoryTab email={email} />
            </TabsContent>

            <TabsContent value="attendance">
              <div className="pt-4 text-center py-16 text-gray-400">
                <Clock size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500">Attendance data coming soon</p>
                <p className="text-xs text-gray-400 mt-1">Jibble per-employee history will appear here</p>
              </div>
            </TabsContent>

            <TabsContent value="permissions">
              <PermissionsTab email={email} />
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT COLUMN — Notes (always visible) */}
        <div className="w-[320px] shrink-0">
          <Card className="bg-white shadow-sm border-0 ring-1 ring-gray-100 sticky top-6">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-800">Private Notes</CardTitle>
              <p className="text-xs text-gray-400">Admin eyes only</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              <NotesColumn email={email} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
