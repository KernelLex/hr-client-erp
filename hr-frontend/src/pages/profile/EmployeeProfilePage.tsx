import { ADMIN_USERS } from "@/lib/constants"
import { useState, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Camera, Pencil, Check, X, ArrowLeft, Lock,
  CalendarDays, Clock, Shield, Plus, Mail, Phone,
  UserCircle, BarChart3,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import {
  getEmployeeProfile,
  updateOwnProfile,
  adminUpdateProfile,
  uploadProfilePhoto,
  type EmployeeProfile,
} from "@/api/employee"
import { useMyLeaves, useApplyLeave } from "@/pages/leave/useLeave"
import { LEAVE_TYPES, type LeaveApplication } from "@/pages/leave/types"
import { HolidaysContent } from "@/pages/holidays/HolidaysPage"


const SELF_EDITABLE = new Set([
  "image", "personal_email", "cell_number", "person_to_be_contacted",
  "emergency_phone_number", "current_address", "blood_group", "gender",
  "bank_name", "bank_ac_no", "custom_ifsc_code", "custom_skills",
  "custom_aadhaar_number", "custom_pan_number",
])

const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
const GENDER_OPTIONS = ["", "Male", "Female", "Non-binary", "Prefer not to say"]

type Tab = "profile" | "attendance" | "leave" | "holidays"

function readTab(): Tab {
  try {
    const v = localStorage.getItem("profile_tab") as Tab | null
    if (v === "profile" || v === "attendance" || v === "leave" || v === "holidays") return v
  } catch {}
  return "profile"
}

function saveTab(t: Tab) {
  try { localStorage.setItem("profile_tab", t) } catch {}
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}
function deptLabel(dept: string) { return dept.replace(/ - V$/, "") }
function formatDate(raw: string): string {
  if (!raw) return ""
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
}
function formatPhone(phone: string): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  return phone
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl p-6" style={{ border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center gap-2 mb-5">
        <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: "var(--brand-primary)" }} />
        <h2 className="font-semibold text-gray-800 flex items-center gap-1.5" style={{ fontSize: "15px" }}>
          {icon}{title}
        </h2>
      </div>
      {children}
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  field: keyof EmployeeProfile
  value: string
  editMode: boolean
  canEditThis: boolean
  draft: Partial<EmployeeProfile>
  onChange: (f: keyof EmployeeProfile, v: string) => void
  type?: string
  as?: "select" | "textarea"
  options?: string[]
  format?: (v: string) => string
  fullWidth?: boolean
}

function Field({ label, field, value, editMode, canEditThis, draft, onChange, type = "text", as, options, format, fullWidth }: FieldProps) {
  const current = String((draft[field] as string | undefined) ?? value ?? "")

  function display(raw: string) {
    if (!raw) return <span className="italic" style={{ color: "var(--text-muted)" }}>Not set</span>
    return format ? format(raw) : raw
  }

  const labelEl = (
    <p className="font-medium uppercase tracking-wide mb-1" style={{ fontSize: "11px", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
      {label}
    </p>
  )

  if (!editMode || !canEditThis) {
    return (
      <div className={fullWidth ? "col-span-2" : ""}>
        {labelEl}
        <div className="flex items-center gap-1.5">
          <p className="font-medium" style={{ fontSize: "14px", color: "var(--text-primary)" }}>{display(current)}</p>
          {editMode && !canEditThis && <Lock size={11} style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>
    )
  }

  if (as === "select" && options) {
    return (
      <div className={fullWidth ? "col-span-2" : ""}>
        {labelEl}
        <select
          className="w-full rounded-lg text-sm font-medium"
          style={{ border: "1px solid #b0d1bd", backgroundColor: "#eef5f1", color: "var(--text-primary)", padding: "6px 10px" }}
          value={current}
          onChange={(e) => onChange(field, e.target.value)}
        >
          {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </div>
    )
  }

  if (as === "textarea") {
    return (
      <div className={fullWidth ? "col-span-2" : ""}>
        {labelEl}
        <textarea
          rows={2}
          className="w-full rounded-lg text-sm font-medium resize-none"
          style={{ border: "1px solid #b0d1bd", backgroundColor: "#eef5f1", color: "var(--text-primary)", padding: "6px 10px" }}
          value={current}
          onChange={(e) => onChange(field, e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      {labelEl}
      <Input
        type={type}
        value={current}
        onChange={(e) => onChange(field, e.target.value)}
        className="h-8 text-sm font-medium"
        style={{ borderColor: "#b0d1bd", backgroundColor: "#eef5f1" }}
      />
    </div>
  )
}

// ─── SkillsEditor ─────────────────────────────────────────────────────────────

function SkillsEditor({ value, editMode, canEdit, onChange }: {
  value: string; editMode: boolean; canEdit: boolean; onChange: (v: string) => void
}) {
  const [newSkill, setNewSkill] = useState("")
  const skills = (value || "").split(",").map((s) => s.trim()).filter(Boolean)

  function addSkill() {
    const trimmed = newSkill.trim()
    if (!trimmed || skills.includes(trimmed)) return
    onChange([...skills, trimmed].join(", "))
    setNewSkill("")
  }

  if (!editMode || !canEdit) {
    if (skills.length === 0) {
      return <p className="italic text-sm" style={{ color: "var(--text-muted)" }}>
        {canEdit ? "No skills listed — click Edit Profile to add" : "No skills listed"}
      </p>
    }
    return (
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span key={s} className="text-xs font-medium px-3 py-1 rounded-full"
            style={{ border: "1px solid #85b89a", color: "#1e3a2f", backgroundColor: "#eef5f1" }}>
            {s}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        {skills.map((s) => (
          <span key={s} className="flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full"
            style={{ border: "1px solid #85b89a", color: "#1e3a2f", backgroundColor: "#eef5f1" }}>
            {s}
            <button onClick={() => onChange(skills.filter((x) => x !== s).join(", "))}
              className="hover:text-red-500 transition-colors ml-0.5" type="button">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Add a skill…" value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill() } }}
          className="h-8 text-sm flex-1" style={{ borderColor: "#b0d1bd", backgroundColor: "#eef5f1" }} />
        <Button type="button" size="sm" onClick={addSkill} className="gap-1 text-white"
          style={{ backgroundColor: "var(--brand-primary)" }}>
          <Plus size={13} /> Add
        </Button>
      </div>
    </div>
  )
}

// ─── ProfileHeader ────────────────────────────────────────────────────────────

interface ProfileHeaderProps {
  profile: EmployeeProfile
  isAdmin: boolean
  isSelf: boolean
  editMode: boolean
  saving: boolean
  hasChanges: boolean
  onEditClick: () => void
  onSave: () => void
  onCancel: () => void
  onPhotoClick: () => void
  photoMutating: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  onFileChange: (file: File) => void
}

function ProfileHeader({
  profile, isAdmin, isSelf, editMode, saving, hasChanges,
  onEditClick, onSave, onCancel, onPhotoClick, photoMutating, fileInputRef, onFileChange,
}: ProfileHeaderProps) {
  const navigate = useNavigate()
  const canEditProfile = isAdmin || isSelf
  const photoUrl = profile.image

  return (
    <div className="bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      {/* Gradient banner */}
      <div className="relative w-full" style={{ height: "120px", background: "linear-gradient(135deg, #1e3a2f 0%, #c8a45c 100%)" }}>
        {/* Back button */}
        {isAdmin && !isSelf && (
          <button onClick={() => navigate("/admin/employees")}
            className="absolute top-4 left-4 text-white/80 hover:text-white transition-colors flex items-center gap-1.5 text-sm font-medium">
            <ArrowLeft size={16} /> Back to Employees
          </button>
        )}
        {/* Edit / Save / Cancel */}
        {canEditProfile && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={onCancel}
                  className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors">
                  <X size={14} /> Cancel
                </button>
                <button onClick={onSave}
                  disabled={saving || !hasChanges}
                  className="flex items-center gap-1.5 text-white text-sm font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  <Check size={14} /> {saving ? "Saving…" : "Save Changes"}
                </button>
              </>
            ) : (
              <button onClick={onEditClick}
                className="flex items-center gap-1.5 text-white/90 hover:text-white text-sm font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
                <Pencil size={14} /> Edit Profile
              </button>
            )}
          </div>
        )}
      </div>

      {/* Avatar + info row */}
      <div className="px-6 pb-5" style={{ marginTop: "-40px" }}>
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative shrink-0" style={{ flexShrink: 0 }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: "#eef5f1", border: "4px solid white", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
              {photoUrl ? (
                <img src={photoUrl} alt={profile.employee_name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold" style={{ fontSize: "24px", color: "var(--brand-primary)" }}>
                  {getInitials(profile.employee_name)}
                </span>
              )}
            </div>
            {(editMode && canEditProfile) && (
              <button className="absolute bottom-0 right-0 bg-white border border-gray-200 rounded-full p-1.5 shadow-md hover:bg-gray-50 transition-colors"
                onClick={onPhotoClick} type="button" disabled={photoMutating}>
                <Camera size={12} className="text-gray-600" />
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileChange(f) }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0" style={{ paddingTop: "44px" }}>
            <h1 className="font-bold leading-tight" style={{ fontSize: "22px", color: "var(--text-primary)" }}>
              {profile.employee_name}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {profile.designation}
              {profile.department && <> · {deptLabel(profile.department)}</>}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {profile.company_email && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <Mail size={11} style={{ color: "#94A3B8" }} />
                  {profile.company_email}
                </span>
              )}
              {profile.cell_number && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <Phone size={11} style={{ color: "#94A3B8" }} />
                  {formatPhone(profile.cell_number)}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#ECFDF5", color: "#065F46" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "profile",    label: "Profile",       icon: <UserCircle size={14} /> },
  { id: "attendance", label: "Attendance",    icon: <Clock size={14} /> },
  { id: "leave",      label: "Leave History", icon: <CalendarDays size={14} /> },
  { id: "holidays",   label: "Holidays",      icon: <BarChart3 size={14} /> },
]

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="bg-white border-b" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex px-6">
        {TABS.map(({ id, label, icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
              style={{
                borderColor: isActive ? "#3d7d5c" : "transparent",
                color: isActive ? "#3d7d5c" : "#64748B",
                fontWeight: isActive ? 600 : 500,
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "#F8F7FF" }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent" }}
            >
              {icon}{label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── ProfileTabContent ────────────────────────────────────────────────────────

function ProfileTabContent({
  profile, isAdmin, editMode, draft, onChange,
}: {
  profile: EmployeeProfile
  isAdmin: boolean
  editMode: boolean
  draft: Partial<EmployeeProfile>
  onChange: (f: keyof EmployeeProfile, v: string) => void
}) {
  function canEdit(field: keyof EmployeeProfile): boolean {
    if (!editMode) return false
    if (isAdmin) return true
    return SELF_EDITABLE.has(field)
  }

  function fp(field: keyof EmployeeProfile, extra: Partial<FieldProps> = {}): FieldProps {
    return {
      label: "", field,
      value: String((profile[field] as string | undefined) ?? ""),
      editMode, canEditThis: canEdit(field), draft, onChange, ...extra,
    }
  }

  const skillsValue = String((draft.custom_skills as string | undefined) ?? profile.custom_skills ?? "")

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* LEFT: Personal Info + Documents */}
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Personal Information">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Field {...fp("date_of_birth", { label: "Date of Birth", type: "date", format: formatDate })} />
              <Field {...fp("gender", { label: "Gender", as: "select", options: GENDER_OPTIONS })} />
              <Field {...fp("blood_group", { label: "Blood Group", as: "select", options: BLOOD_GROUPS })} />
              <Field {...fp("personal_email", { label: "Personal Email", type: "email" })} />
              <Field {...fp("cell_number", { label: "Phone", format: formatPhone })} />
              <div className="col-span-2">
                <Field {...fp("current_address", { label: "Address", as: "textarea", fullWidth: true })} />
              </div>
              <Field {...fp("person_to_be_contacted", { label: "Emergency Contact" })} />
              <Field {...fp("emergency_phone_number", { label: "Emergency Phone", format: formatPhone })} />
            </div>
          </SectionCard>

          <SectionCard title="Documents" icon={<Shield size={14} style={{ color: "var(--brand-primary)" }} />}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {isAdmin ? (
                <>
                  <Field {...fp("custom_aadhaar_number", { label: "Aadhaar Number" })} />
                  <Field {...fp("custom_pan_number", { label: "PAN Number" })} />
                </>
              ) : (
                <>
                  {(["custom_aadhaar_number", "custom_pan_number"] as (keyof EmployeeProfile)[]).map((fld) => {
                    const lbl = fld === "custom_aadhaar_number" ? "Aadhaar Number" : "PAN Number"
                    return (
                      <div key={fld}>
                        <p className="font-medium uppercase tracking-wide mb-1" style={{ fontSize: "11px", color: "var(--text-muted)" }}>{lbl}</p>
                        {editMode ? (
                          <Input placeholder={`Enter ${lbl}`}
                            value={String((draft[fld] as string | undefined) ?? "")}
                            onChange={(e) => onChange(fld, e.target.value)}
                            className="h-8 text-sm font-medium"
                            style={{ borderColor: "#b0d1bd", backgroundColor: "#eef5f1" }} />
                        ) : (
                          <p className="font-medium flex items-center gap-1.5" style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                            {profile[fld]
                              ? <><Lock size={11} style={{ color: "var(--text-muted)" }} /> Stored securely</>
                              : <span className="italic" style={{ color: "var(--text-muted)" }}>Not set</span>}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </SectionCard>
        </div>

        {/* RIGHT: Work Info + Bank Details */}
        <div className="lg:col-span-3 space-y-5">
          <SectionCard title="Work Information">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Field {...fp("employee_id", { label: "Employee ID" })} />
              <Field {...fp("designation", { label: "Designation" })} />
              <Field {...fp("department", { label: "Department", value: deptLabel(profile.department) })} />
              <Field {...fp("date_of_joining", { label: "Date of Joining", type: "date", format: formatDate })} />
              <Field {...fp("employment_type", {
                label: "Employment Type",
                as: isAdmin ? "select" : undefined,
                options: ["", "Full-time", "Part-time", "Contract", "Probation"],
              })} />
              <Field {...fp("reports_to_name", { label: "Reporting Manager" })} />
              <Field {...fp("company_email", { label: "Work Email", type: "email" })} />
              <Field {...fp("status", { label: "Status" })} />
            </div>
          </SectionCard>

          <SectionCard title="Bank Details">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Field {...fp("bank_name", { label: "Bank Name" })} />
              <Field {...fp("bank_ac_no", { label: "Account Number" })} />
              <Field {...fp("custom_ifsc_code", { label: "IFSC Code" })} />
            </div>
          </SectionCard>

          <SectionCard title="Skills & Qualifications">
            <p className="font-medium uppercase tracking-wide mb-3" style={{ fontSize: "11px", color: "var(--text-muted)" }}>Skills</p>
            <SkillsEditor value={skillsValue} editMode={editMode} canEdit={canEdit("custom_skills")}
              onChange={(v) => onChange("custom_skills", v)} />
            {profile.education.length > 0 && (
              <div className="mt-4">
                <p className="font-medium uppercase tracking-wide mb-2" style={{ fontSize: "11px", color: "var(--text-muted)" }}>Education</p>
                <div className="space-y-1.5">
                  {profile.education.map((e, i) => (
                    <div key={i} className="text-sm" style={{ color: "var(--text-primary)" }}>
                      <span className="font-medium">{e.qualification}</span>
                      {e.school && <span style={{ color: "var(--text-secondary)" }}> · {e.school}</span>}
                      {e.year && <span style={{ color: "var(--text-muted)" }}> ({e.year})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {editMode && (
        <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <Lock size={11} /> Fields with a lock icon can only be changed by an admin.
        </p>
      )}
    </div>
  )
}

// ─── AttendanceTabContent ─────────────────────────────────────────────────────

function AttendanceTabContent() {
  return (
    <div className="p-6 flex flex-col items-center justify-center py-24" style={{ color: "var(--text-muted)" }}>
      <Clock size={48} className="mb-4 opacity-20" />
      <p className="text-base font-medium" style={{ color: "var(--text-secondary)" }}>Attendance history coming soon</p>
      <p className="text-sm mt-1">Your monthly Jibble attendance data will appear here</p>
    </div>
  )
}

// ─── ApplyLeaveModal ──────────────────────────────────────────────────────────

function ApplyLeaveModal({ onClose }: { onClose: () => void }) {
  const [leaveType, setLeaveType] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [reason, setReason] = useState("")
  const applyMutation = useApplyLeave()

  const totalDays = useMemo(() => {
    if (!fromDate || !toDate) return 0
    const from = new Date(fromDate)
    const to = new Date(toDate)
    if (to < from) return 0
    let count = 0
    const cur = new Date(from)
    while (cur <= to) {
      if (cur.getDay() !== 0) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }, [fromDate, toDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!leaveType || !fromDate || !toDate || !reason.trim()) {
      toast.error("Please fill all fields")
      return
    }
    const res = await applyMutation.mutateAsync({ leave_type: leaveType, from_date: fromDate, to_date: toDate, reason })
    if (res.success) {
      toast.success("Leave application submitted")
      onClose()
    } else {
      toast.error(res.error ?? "Failed to submit leave")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>Apply for Leave</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100">
            <X size={14} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Leave Type <span className="text-red-500">*</span></label>
            <select
              className="w-full rounded-lg text-sm border py-2 px-3"
              style={{ borderColor: "#E2E8F0", backgroundColor: "#fff", color: "var(--text-primary)" }}
              value={leaveType} onChange={(e) => setLeaveType(e.target.value)} required
            >
              <option value="">Select leave type…</option>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">From Date <span className="text-red-500">*</span></label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">To Date <span className="text-red-500">*</span></label>
              <Input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm" required />
            </div>
          </div>

          {totalDays > 0 && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: "#eef5f1", color: "#1e3a2f" }}>
              📅 {totalDays} working day{totalDays !== 1 ? "s" : ""} (Sundays excluded)
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border rounded-lg text-sm p-3 resize-none focus:outline-none focus:ring-1"
              style={{ borderColor: "#E2E8F0" }}
              rows={3}
              placeholder="Briefly describe the reason for leave…"
              value={reason} onChange={(e) => setReason(e.target.value)} required
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={applyMutation.isPending}>Cancel</Button>
            <Button type="submit" size="sm" className="text-white border-0"
              style={{ backgroundColor: "var(--brand-primary)" }}
              disabled={applyMutation.isPending || !leaveType || !fromDate || !toDate || !reason.trim()}>
              {applyMutation.isPending ? "Submitting…" : "Submit Application"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-1" style={{ border: "1px solid #F1F5F9", boxShadow: "var(--shadow-card)", borderLeft: `3px solid ${accent}` }}>
      <span className="text-2xl font-bold" style={{ color: accent }}>{value}</span>
      <span className="text-[11px] text-gray-400 leading-tight">{label}</span>
    </div>
  )
}

// ─── LeaveHistoryTabContent ───────────────────────────────────────────────────

type LeaveFilter = "All" | "Pending" | "Approved" | "Rejected"

function LeaveHistoryTabContent() {
  const [filter, setFilter] = useState<LeaveFilter>("All")
  const [showApply, setShowApply] = useState(false)

  const { data, isLoading } = useMyLeaves()
  const leaves: LeaveApplication[] = data?.data ?? []

  const filtered = filter === "All" ? leaves : leaves.filter((l) => l.status === filter)

  const totalDays = leaves.filter((l) => l.status === "Approved").reduce((s, l) => s + l.total_days, 0)
  const approvedCount = leaves.filter((l) => l.status === "Approved").length
  const pendingCount = leaves.filter((l) => l.status === "Pending").length
  const rejectedCount = leaves.filter((l) => l.status === "Rejected").length

  const FILTER_OPTIONS: LeaveFilter[] = ["All", "Pending", "Approved", "Rejected"]

  function statusBadge(status: string) {
    const styles: Record<string, React.CSSProperties> = {
      Approved: { backgroundColor: "#ECFDF5", color: "#065F46" },
      Rejected: { backgroundColor: "#FEF2F2", color: "#991B1B" },
      Pending:  { backgroundColor: "#FFFBEB", color: "#92400E" },
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
        style={styles[status] ?? styles.Pending}>
        {status}
      </span>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Days Approved This Year" value={totalDays} accent="#3d7d5c" />
        <SummaryCard label="Approved Requests" value={approvedCount} accent="#1D9E75" />
        <SummaryCard label="Pending Requests" value={pendingCount} accent="#F59E0B" />
        <SummaryCard label="Rejected Requests" value={rejectedCount} accent="#EF4444" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
              style={{
                borderColor: filter === f ? "var(--brand-primary)" : "#E5E7EB",
                backgroundColor: filter === f ? "var(--brand-primary)" : "#fff",
                color: filter === f ? "#fff" : "#6B7280",
              }}>
              {f}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowApply(true)} size="sm" className="text-white border-0 gap-1.5"
          style={{ backgroundColor: "var(--brand-primary)" }}>
          <Plus size={14} /> Apply for Leave
        </Button>
      </div>

      {/* Leave table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-0">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4 border-b border-gray-50 animate-pulse">
                <div className="h-4 bg-gray-100 rounded flex-1" />
                <div className="h-4 bg-gray-100 rounded w-24" />
                <div className="h-4 bg-gray-100 rounded w-20" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <CalendarDays size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {filter === "All" ? "No leave requests yet" : `No ${filter.toLowerCase()} requests`}
            </p>
            {filter === "All" && (
              <button onClick={() => setShowApply(true)}
                className="mt-3 text-sm font-medium underline" style={{ color: "var(--brand-primary)" }}>
                + Apply for Leave
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b-2 border-gray-100 bg-gray-50">
                  {["Type", "From", "To", "Days", "Reason", "Applied On", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((leave, i) => (
                  <tr key={leave.name} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    style={{ backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                      {leave.leave_type}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{leave.from_date}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{leave.to_date}</td>
                    <td className="px-4 py-3 text-center font-semibold" style={{ color: "var(--brand-primary)" }}>
                      {leave.total_days}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                      <span className="block truncate" title={leave.reason}>{leave.reason || "—"}</span>
                      {leave.status === "Rejected" && leave.admin_remarks && (
                        <span className="block text-[11px] mt-0.5 italic text-red-500">
                          Remarks: {leave.admin_remarks}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-[12px]">{leave.applied_on}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{statusBadge(leave.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showApply && <ApplyLeaveModal onClose={() => setShowApply(false)} />}
    </div>
  )
}

// ─── Main EmployeeProfilePage ─────────────────────────────────────────────────

export function EmployeeProfilePage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  const isAdmin = !!user && ADMIN_USERS.has(user.name)
  const profileEmail = id ? decodeURIComponent(id) : user?.name ?? ""
  const isSelf = !id || user?.name === profileEmail

  const [activeTab, setActiveTab] = useState<Tab>(readTab)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Partial<EmployeeProfile>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["employee_profile", profileEmail],
    queryFn: () => getEmployeeProfile(profileEmail),
    enabled: !!profileEmail,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile) return
      if (isAdmin && !isSelf) await adminUpdateProfile(profileEmail, draft)
      else await updateOwnProfile(draft)
    },
    onSuccess: () => {
      toast.success("Profile saved")
      setEditMode(false)
      setDraft({})
      qc.invalidateQueries({ queryKey: ["employee_profile", profileEmail] })
    },
    onError: () => toast.error("Failed to save profile"),
  })

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadProfilePhoto(file, isSelf ? undefined : profileEmail),
    onSuccess: () => {
      toast.success("Photo updated")
      qc.invalidateQueries({ queryKey: ["employee_profile", profileEmail] })
    },
    onError: () => toast.error("Photo upload failed"),
  })

  function handleChange(field: keyof EmployeeProfile, val: string) {
    setDraft((prev) => ({ ...prev, [field]: val }))
  }

  function switchTab(t: Tab) {
    setActiveTab(t)
    saveTab(t)
  }

  function handleEditClick() {
    if (activeTab !== "profile") switchTab("profile")
    setEditMode(true)
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-full" style={{ backgroundColor: "var(--bg-app)" }}>
        <div className="h-[188px] animate-pulse" style={{ background: "linear-gradient(135deg, #1e3a2f 0%, #c8a45c 100%)" }} />
        <div className="h-14 bg-white border-b border-gray-100 animate-pulse" />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-64 rounded-xl animate-pulse bg-gray-100 ${i <= 1 ? "lg:col-span-2" : "lg:col-span-3"}`} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>No employee profile found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    )
  }

  // For admin-viewing-other: only show profile tab (they have AdminEmployeeDetailPage for the full view)
  const showTabs = isSelf

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--bg-app)" }}>
      {/* Always-visible profile header */}
      <ProfileHeader
        profile={profile}
        isAdmin={isAdmin}
        isSelf={isSelf}
        editMode={editMode}
        saving={saveMutation.isPending}
        hasChanges={Object.keys(draft).length > 0}
        onEditClick={handleEditClick}
        onSave={() => saveMutation.mutate()}
        onCancel={() => { setDraft({}); setEditMode(false) }}
        onPhotoClick={() => fileInputRef.current?.click()}
        photoMutating={photoMutation.isPending}
        fileInputRef={fileInputRef}
        onFileChange={(file) => photoMutation.mutate(file)}
      />

      {/* Tab bar (self-view only) */}
      {showTabs && <TabBar active={activeTab} onChange={switchTab} />}

      {/* Tab content */}
      {(!showTabs || activeTab === "profile") && (
        <ProfileTabContent
          profile={profile}
          isAdmin={isAdmin}
          editMode={editMode}
          draft={draft}
          onChange={handleChange}
        />
      )}
      {showTabs && activeTab === "attendance" && <AttendanceTabContent />}
      {showTabs && activeTab === "leave" && <LeaveHistoryTabContent />}
      {showTabs && activeTab === "holidays" && (
        <div className="p-6">
          <HolidaysContent />
        </div>
      )}
    </div>
  )
}
