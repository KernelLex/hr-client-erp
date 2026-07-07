import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdminGuard } from "@/lib/useAdminGuard"
import { api, apiUrl } from "@/lib/api"
import { toast } from "sonner"
import {
  Users, Plus, Search, Lock, Eye, EyeOff,
  UserCheck, UserX, Trash2, KeyRound, Edit3,
  ShieldCheck, X, AlertTriangle, CheckCircle2,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRecord {
  name: string
  full_name: string
  user_type: string
  enabled: boolean
  roles: string[]
  last_login: string | null
  creation: string | null
  linked_employee: string | null
  linked_designation: string | null
  is_protected: boolean
}

interface Role {
  name: string
  description: string
}


// ── API hooks ─────────────────────────────────────────────────────────────────
function useUsers() {
  return useQuery<UserRecord[]>({
    queryKey: ["user_management_all"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.user_management.get_all_users"))
      return res.data.message as UserRecord[]
    },
    staleTime: 0,
    refetchOnMount: "always",
  })
}

function useAvailableRoles() {
  return useQuery<Role[]>({
    queryKey: ["available_roles"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.user_management.get_available_roles"))
      return res.data.message as Role[]
    },
    staleTime: 1000 * 60 * 10,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
}

function getAvatarColor(name: string) {
  const colors = ["#1e3a2f", "#c8a45c", "#059669", "#DC2626", "#D97706", "#0891B2"]
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length
  return colors[Math.abs(hash)]
}

function getRoleBadgeStyle(role: string): string {
  if (role.toLowerCase().includes("administrator") || role.toLowerCase().includes("system manager"))
    return "bg-red-100 text-red-700"
  if (role.toLowerCase().includes("hr"))
    return "bg-gold-100 text-gold-700"
  if (role.toLowerCase().includes("account"))
    return "bg-green-100 text-green-700"
  if (role.toLowerCase().includes("sales") || role.toLowerCase().includes("crm"))
    return "bg-blue-100 text-blue-700"
  if (role.toLowerCase().includes("logistic") || role.toLowerCase().includes("stock"))
    return "bg-orange-100 text-orange-700"
  return "bg-gray-100 text-gray-600"
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

// ── Password strength ─────────────────────────────────────────────────────────
function checkPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[!@#$%^&*()\-_=+[\]{}|;:,.<>?/\\'"~`]/.test(pw)) score++
  if (score <= 1) return { score, label: "Weak", color: "#EF4444" }
  if (score === 2) return { score, label: "Fair", color: "#F59E0B" }
  if (score === 3) return { score, label: "Good", color: "#3B82F6" }
  return { score, label: "Strong", color: "#10B981" }
}

function PasswordField({
  value,
  onChange,
  placeholder = "Password",
  showStrength = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  showStrength?: boolean
}) {
  const [show, setShow] = useState(false)
  const strength = checkPasswordStrength(value)
  return (
    <div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="mt-1.5">
          <div className="flex gap-1 mb-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-all"
                style={{ backgroundColor: i <= strength.score ? strength.color : "#E5E7EB" }}
              />
            ))}
          </div>
          <p className="text-xs" style={{ color: strength.color }}>{strength.label}</p>
          <ul className="text-xs text-gray-400 mt-1 space-y-0.5">
            {[
              [value.length >= 8, "8+ characters"],
              [/[A-Z]/.test(value), "Uppercase letter"],
              [/[0-9]/.test(value), "Number"],
              [/[!@#$%^&*()\-_=+[\]{}|;:,.<>?]/.test(value), "Special character"],
            ].map(([ok, label], i) => (
              <li key={i} className="flex items-center gap-1" style={{ color: ok ? "#10B981" : "#9CA3AF" }}>
                <CheckCircle2 size={10} />
                {label as string}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ roles, onClose, onSuccess }: { roles: Role[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirm: "" })
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const field = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const toggleRole = (r: string) => setSelectedRoles((s) => { const n = new Set(s); if (n.has(r)) { n.delete(r) } else { n.add(r) }; return n })

  async function submit() {
    setError("")
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password)
      return setError("All fields are required")
    if (form.password !== form.confirm)
      return setError("Passwords do not match")
    setLoading(true)
    try {
      await api.post(apiUrl("hr_client.api.user_management.create_user"), {
        email: form.email.trim(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        password: form.password,
        roles: JSON.stringify(Array.from(selectedRoles)),
      })
      toast.success(`User ${form.email} created`)
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { exc?: string; message?: string } } })?.response?.data
      setError(msg?.message || msg?.exc?.split("\n").pop() || "Failed to create user")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Add New User" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name *">
            <input value={form.firstName} onChange={(e) => field("firstName")(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="First name" />
          </FormField>
          <FormField label="Last Name *">
            <input value={form.lastName} onChange={(e) => field("lastName")(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="Last name" />
          </FormField>
        </div>
        <FormField label="Email *">
          <input value={form.email} onChange={(e) => field("email")(e.target.value)}
            type="email"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            placeholder="email@company.com" />
        </FormField>
        <FormField label="Password *">
          <PasswordField value={form.password} onChange={field("password")} showStrength placeholder="Password" />
        </FormField>
        <FormField label="Confirm Password *">
          <PasswordField value={form.confirm} onChange={field("confirm")} placeholder="Confirm password" />
        </FormField>
        <FormField label="Roles">
          <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto p-2 space-y-1">
            {roles.map((r) => (
              <label key={r.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                <input type="checkbox" checked={selectedRoles.has(r.name)}
                  onChange={() => toggleRole(r.name)} className="rounded" />
                <span className="text-sm text-gray-700">{r.name}</span>
              </label>
            ))}
          </div>
        </FormField>
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 rounded-lg bg-forest-600 py-2 text-sm text-white hover:bg-forest-700 disabled:opacity-50">
            {loading ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Roles Modal ──────────────────────────────────────────────────────────
function EditRolesModal({ user, roles, onClose, onSuccess }: { user: UserRecord; roles: Role[]; onClose: () => void; onSuccess: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const toggle = (r: string) => setSelected((s) => { const n = new Set(s); if (n.has(r)) { n.delete(r) } else { n.add(r) }; return n })

  async function submit() {
    setError("")
    setLoading(true)
    try {
      await api.post(apiUrl("hr_client.api.user_management.update_user_roles"), {
        user_email: user.name,
        roles: JSON.stringify(Array.from(selected)),
      })
      toast.success(`Roles updated for ${user.full_name}`)
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { exc?: string; message?: string } } })?.response?.data
      setError(msg?.message || "Failed to update roles")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Edit Roles" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="font-medium text-gray-900 text-sm">{user.full_name}</p>
          <p className="text-xs text-gray-500">{user.name}</p>
        </div>
        <FormField label="Assign Roles">
          <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto p-2 space-y-1">
            {roles.map((r) => (
              <label key={r.name} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-1">
                <input type="checkbox" checked={selected.has(r.name)}
                  onChange={() => toggle(r.name)} className="rounded mt-0.5" />
                <div>
                  <span className="text-sm text-gray-700">{r.name}</span>
                  {r.description && <p className="text-xs text-gray-400">{r.description}</p>}
                </div>
              </label>
            ))}
          </div>
        </FormField>
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 rounded-lg bg-forest-600 py-2 text-sm text-white hover:bg-forest-700 disabled:opacity-50">
            {loading ? "Saving..." : "Save Roles"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ user, onClose, onSuccess }: { user: UserRecord; onClose: () => void; onSuccess: () => void }) {
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError("")
    if (!pw) return setError("Password is required")
    if (pw !== confirm) return setError("Passwords do not match")
    setLoading(true)
    try {
      await api.post(apiUrl("hr_client.api.user_management.change_user_password"), {
        user_email: user.name,
        new_password: pw,
      })
      toast.success(`Password updated for ${user.full_name}`)
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { exc?: string; message?: string } } })?.response?.data
      setError(msg?.message || "Failed to change password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="font-medium text-gray-900 text-sm">{user.full_name}</p>
          <p className="text-xs text-gray-500">{user.name}</p>
        </div>
        <FormField label="New Password">
          <PasswordField value={pw} onChange={setPw} showStrength placeholder="New password" />
        </FormField>
        <FormField label="Confirm Password">
          <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm new password" />
        </FormField>
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 rounded-lg bg-forest-600 py-2 text-sm text-white hover:bg-forest-700 disabled:opacity-50">
            {loading ? "Changing..." : "Change Password"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  title, message, confirmLabel, danger = false,
  confirmEmail, targetEmail,
  onCancel, onConfirm, loading,
}: {
  title: string; message: string; confirmLabel: string; danger?: boolean
  confirmEmail?: boolean; targetEmail?: string
  onCancel: () => void; onConfirm: () => void; loading: boolean
}) {
  const [typed, setTyped] = useState("")
  const canConfirm = !confirmEmail || typed === targetEmail

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${danger ? "bg-red-100" : "bg-amber-100"}`}>
          <AlertTriangle size={18} className={danger ? "text-red-500" : "text-amber-500"} />
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        {confirmEmail && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Type <span className="font-mono font-medium text-gray-700">{targetEmail}</span> to confirm</label>
            <input value={typed} onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder={targetEmail} />
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading || !canConfirm}
            className={`flex-1 rounded-lg py-2 text-sm text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}`}>
            {loading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function UserManagement() {
  const guard = useAdminGuard()
  const queryClient = useQueryClient()

  const { data: users = [], isLoading } = useUsers()
  const { data: roles = [] } = useAvailableRoles()

  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [editRolesUser, setEditRolesUser] = useState<UserRecord | null>(null)
  const [changePwUser, setChangePwUser] = useState<UserRecord | null>(null)
  const [toggleUser, setToggleUser] = useState<UserRecord | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["user_management_all"] })

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter((u) =>
      u.full_name.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    )
  }, [users, search])

  const toggleStatus = useMutation({
    mutationFn: async ({ email, enabled }: { email: string; enabled: boolean }) => {
      await api.post(apiUrl("hr_client.api.user_management.toggle_user_status"), {
        user_email: email,
        enabled: enabled ? "true" : "false",
      })
    },
    onSuccess: (_, vars) => {
      toast.success(`User ${vars.enabled ? "enabled" : "disabled"}`)
      refresh()
      setToggleUser(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || "Failed to update user status")
    },
  })

  const doDelete = useMutation({
    mutationFn: async (email: string) => {
      await api.post(apiUrl("hr_client.api.user_management.delete_user"), { user_email: email })
    },
    onSuccess: () => {
      toast.success("User account deactivated")
      refresh()
      setDeleteUser(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || "Failed to delete user")
    },
  })

  if (guard) return guard

  return (
    <div className="p-6 max-w-6xl space-y-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: "var(--text-primary)" }}>
            User Management
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage system access and permissions
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-forest-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          <Plus size={15} />
          Add New User
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-32" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
                <div className="h-5 bg-gray-100 rounded w-20" />
                <div className="h-5 bg-gray-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No users found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Roles</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Last Login</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, idx) => (
                <tr key={u.name} className={`border-b last:border-0 hover:bg-gray-50/50 ${idx % 2 === 0 ? "" : "bg-gray-50/20"}`}>
                  {/* Avatar + name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: getAvatarColor(u.full_name) }}
                      >
                        {getInitials(u.full_name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.full_name}</p>
                        <p className="text-xs text-gray-400">{u.name}</p>
                        {u.linked_designation && (
                          <p className="text-xs text-forest-500">{u.linked_designation}</p>
                        )}
                      </div>
                      {u.is_protected && (
                        <div title="Protected account" className="text-amber-400">
                          <Lock size={13} />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Roles */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {u.roles.slice(0, 3).map((r) => (
                        <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleBadgeStyle(r)}`}>
                          {r}
                        </span>
                      ))}
                      {u.roles.length > 3 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          +{u.roles.length - 3}
                        </span>
                      )}
                      {u.roles.length === 0 && <span className="text-xs text-gray-400 italic">No roles</span>}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${u.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {u.enabled ? "Active" : "Inactive"}
                    </span>
                  </td>

                  {/* Last login */}
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {formatRelative(u.last_login)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    {u.is_protected ? (
                      <div className="flex justify-end items-center gap-1 text-amber-400" title="Protected — limited actions">
                        <ShieldCheck size={14} />
                        <span className="text-xs text-amber-500">Protected</span>
                      </div>
                    ) : (
                      <div className="flex justify-end items-center gap-1">
                        <ActionBtn
                          icon={<Edit3 size={13} />}
                          label="Edit Roles"
                          onClick={() => setEditRolesUser(u)}
                        />
                        <ActionBtn
                          icon={<KeyRound size={13} />}
                          label="Change Password"
                          onClick={() => setChangePwUser(u)}
                        />
                        <ActionBtn
                          icon={u.enabled ? <UserX size={13} /> : <UserCheck size={13} />}
                          label={u.enabled ? "Disable" : "Enable"}
                          onClick={() => setToggleUser(u)}
                          color={u.enabled ? "amber" : "green"}
                        />
                        <ActionBtn
                          icon={<Trash2 size={13} />}
                          label="Delete"
                          onClick={() => setDeleteUser(u)}
                          color="red"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>{users.length} total users</span>
        <span>·</span>
        <span>{users.filter((u) => u.enabled).length} active</span>
        <span>·</span>
        <span>{users.filter((u) => !u.enabled).length} inactive</span>
      </div>

      {/* Modals */}
      {showAdd && <AddUserModal roles={roles} onClose={() => setShowAdd(false)} onSuccess={refresh} />}
      {editRolesUser && <EditRolesModal user={editRolesUser} roles={roles} onClose={() => setEditRolesUser(null)} onSuccess={refresh} />}
      {changePwUser && <ChangePasswordModal user={changePwUser} onClose={() => setChangePwUser(null)} onSuccess={refresh} />}

      {toggleUser && (
        <ConfirmDialog
          title={toggleUser.enabled ? `Disable ${toggleUser.full_name}?` : `Enable ${toggleUser.full_name}?`}
          message={
            toggleUser.enabled
              ? "They will be logged out immediately and cannot log back in until re-enabled."
              : "This user will be able to log in again."
          }
          confirmLabel={toggleUser.enabled ? "Disable" : "Enable"}
          danger={toggleUser.enabled}
          onCancel={() => setToggleUser(null)}
          onConfirm={() => toggleStatus.mutate({ email: toggleUser.name, enabled: !toggleUser.enabled })}
          loading={toggleStatus.isPending}
        />
      )}

      {deleteUser && (
        <ConfirmDialog
          title={`Deactivate ${deleteUser.full_name}?`}
          message="This will permanently deactivate their account. All records and history will be preserved. This action cannot be easily undone."
          confirmLabel="Delete Account"
          danger
          confirmEmail
          targetEmail={deleteUser.name}
          onCancel={() => setDeleteUser(null)}
          onConfirm={() => doDelete.mutate(deleteUser.name)}
          loading={doDelete.isPending}
        />
      )}
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({
  icon, label, onClick, color = "default",
}: {
  icon: React.ReactNode; label: string; onClick: () => void; color?: "default" | "amber" | "green" | "red"
}) {
  const styles = {
    default: "text-gray-400 hover:text-forest-600 hover:bg-forest-50",
    amber: "text-gray-400 hover:text-amber-600 hover:bg-amber-50",
    green: "text-gray-400 hover:text-green-600 hover:bg-green-50",
    red: "text-gray-400 hover:text-red-600 hover:bg-red-50",
  }
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded-lg transition-colors ${styles[color]}`}
    >
      {icon}
    </button>
  )
}
