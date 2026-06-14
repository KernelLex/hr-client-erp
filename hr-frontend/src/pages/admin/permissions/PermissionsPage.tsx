import { useState } from "react"
import { toast } from "sonner"
import { Shield, Save, Users, CheckCircle2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/context/AuthContext"
import { useUsersWithPermissions, useUpdatePermissions } from "./usePermissions"
import {
  PERMISSION_MODULE_LABELS,
  MODULE_ICONS,
  type PermissionModule,
  type UserPermissions,
} from "./types"
import { Navigate } from "react-router-dom"

const ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])

const ALL_MODULES: PermissionModule[] = [
  "recruitment",
  "employee_lifecycle",
  "accounts",
  "projects",
  "logistics",
  "hr",
  "attendance",
  "expense",
]

const DEPT_STYLES: Record<string, { badge: string; avatar: string }> = {
  Admin:     { badge: "bg-purple-100 text-purple-700 border-purple-200", avatar: "bg-purple-600" },
  Project:   { badge: "bg-blue-100 text-blue-700 border-blue-200",       avatar: "bg-blue-600" },
  Accounts:  { badge: "bg-amber-100 text-amber-700 border-amber-200",    avatar: "bg-amber-500" },
  Logistics: { badge: "bg-green-100 text-green-700 border-green-200",    avatar: "bg-green-600" },
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function UserPermissionCard({ user }: { user: UserPermissions }) {
  const [perms, setPerms] = useState<Record<PermissionModule, boolean>>(
    () => ({ ...user.permissions })
  )
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const update = useUpdatePermissions()

  const style = DEPT_STYLES[user.department] ?? { badge: "bg-gray-100 text-gray-600 border-gray-200", avatar: "bg-gray-500" }

  function toggle(mod: PermissionModule) {
    setPerms((p) => ({ ...p, [mod]: !p[mod] }))
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    try {
      const result = await update.mutateAsync({ email: user.email, permissions: perms })
      if (result && (result as { success?: boolean }).success === false) {
        const msg = (result as { error?: string }).error ?? "Unknown error"
        toast.error(`Failed to save ${user.name}: ${msg}`)
        console.error("Permission save error:", result)
        return
      }
      setDirty(false)
      setSaved(true)
      toast.success(`Permissions saved for ${user.name}`)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Failed to save ${user.name}: ${msg}`)
      console.error("Permission save exception:", err)
    }
  }

  const enabledCount = ALL_MODULES.filter((m) => perms[m]).length

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${
      user.is_admin ? "border-purple-200 ring-1 ring-purple-100" : "border-gray-200"
    }`}>
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-full ${style.avatar} flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-white text-sm font-bold">{initials(user.name)}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{user.name}</p>
              {user.is_admin && (
                <span className="text-[10px] font-semibold bg-purple-600 text-white px-2 py-0.5 rounded-full">
                  Full Access
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${style.badge}`}>
            {user.department}
          </span>
          {!user.is_admin && (
            <span className="text-xs text-gray-400 tabular-nums">
              {enabledCount}/{ALL_MODULES.length}
            </span>
          )}
        </div>
      </div>

      {/* Designation */}
      <div className="px-5 py-2 bg-gray-50 border-y border-gray-100">
        <p className="text-xs text-gray-500 italic">{user.designation}</p>
      </div>

      {/* Module toggles */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_MODULES.map((mod) => (
            <div
              key={mod}
              onClick={() => !user.is_admin && toggle(mod)}
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 border cursor-pointer select-none transition-all ${
                user.is_admin
                  ? "bg-purple-50 border-purple-100 cursor-default"
                  : perms[mod]
                  ? "bg-blue-50 border-blue-100 hover:border-blue-300"
                  : "bg-gray-50 border-gray-100 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm leading-none">{MODULE_ICONS[mod]}</span>
                <span className={`text-xs font-medium truncate ${
                  user.is_admin ? "text-purple-700" : perms[mod] ? "text-blue-700" : "text-gray-500"
                }`}>
                  {PERMISSION_MODULE_LABELS[mod]}
                </span>
              </div>
              <Switch
                checked={perms[mod]}
                onCheckedChange={() => !user.is_admin && toggle(mod)}
                disabled={user.is_admin}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 flex items-center justify-between">
        {user.is_admin ? (
          <p className="text-xs text-purple-400">Administrator — permissions cannot be modified</p>
        ) : (
          <p className="text-xs text-gray-400">
            {enabledCount === ALL_MODULES.length ? "All modules enabled" : `${ALL_MODULES.length - enabledCount} module${ALL_MODULES.length - enabledCount !== 1 ? "s" : ""} restricted`}
          </p>
        )}
        {!user.is_admin && (
          <button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-all ${
              saved
                ? "bg-green-100 text-green-700"
                : dirty
                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saved ? (
              <><CheckCircle2 size={13} /> Saved</>
            ) : update.isPending ? (
              "Saving…"
            ) : (
              <><Save size={13} /> Save Changes</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export function PermissionsPage() {
  const { user } = useAuth()
  const { data, isLoading, isError } = useUsersWithPermissions()

  if (!user || !ADMIN_USERS.has(user.name)) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-purple-50 flex items-center justify-center shadow-sm">
            <Shield size={22} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Role Control</h1>
            <p className="text-xs text-gray-500 mt-0.5">Vera Enterprises — all users have full access by default</p>
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full">
            <Users size={13} />
            <span>{data.users.length} team members</span>
          </div>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-full bg-gray-200" />
                <div className="space-y-2">
                  <div className="h-3.5 bg-gray-200 rounded w-36" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="h-10 bg-gray-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
          Failed to load users. Make sure bench is running at{" "}
          <code className="bg-red-100 px-1 rounded">hrms.localhost:8000</code>.
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {data.users.map((u) => (
            <UserPermissionCard key={u.email} user={u} />
          ))}
        </div>
      )}
    </div>
  )
}
