import { ADMIN_USERS } from "@/lib/constants"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Shield, Save, Users, CheckCircle2, ChevronRight } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/context/AuthContext"
import { useUsersWithPermissions, useUpdatePermissions } from "./usePermissions"
import type { PermissionMap, RegistryGroup, UserPermissions } from "./types"
import { Navigate } from "react-router-dom"


const COMPANY_STYLES: Record<string, { badge: string; avatar: string }> = {
  "Vera Enterprises": { badge: "bg-blue-100 text-blue-700 border-blue-200", avatar: "bg-blue-600" },
  "Schones Leben": { badge: "bg-purple-100 text-purple-700 border-purple-200", avatar: "bg-purple-600" },
  "Hagan Modular": { badge: "bg-orange-100 text-orange-700 border-orange-200", avatar: "bg-orange-500" },
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

// All leaf keys in the registry (used for the "restricted" count).
function leafKeys(registry: RegistryGroup[]): string[] {
  const keys: string[] = []
  for (const g of registry) {
    if (g.items.length === 0) keys.push(g.key)
    for (const it of g.items) keys.push(it.key)
  }
  return keys
}

function GroupBlock({
  group,
  perms,
  disabled,
  onToggleKey,
}: {
  group: RegistryGroup
  perms: PermissionMap
  disabled: boolean
  onToggleKey: (key: string, value: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const groupOn = perms[group.key] !== false
  const hasItems = group.items.length > 0

  const enabledItems = hasItems ? group.items.filter((it) => groupOn && perms[it.key] !== false).length : 0

  return (
    <div className={`rounded-xl border ${groupOn ? "border-gray-200" : "border-gray-100 bg-gray-50/60"}`}>
      {/* Group header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => hasItems && setOpen((o) => !o)}
          className={`flex items-center gap-2 min-w-0 flex-1 text-left ${hasItems ? "cursor-pointer" : "cursor-default"}`}
        >
          {hasItems ? (
            <ChevronRight
              size={15}
              className="text-gray-400 shrink-0 transition-transform"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
          ) : (
            <span className="w-[15px] shrink-0" />
          )}
          <span className="text-base leading-none shrink-0">{group.icon ?? "▸"}</span>
          <span className={`text-sm font-semibold truncate ${groupOn ? "text-gray-800" : "text-gray-400"}`}>
            {group.label}
          </span>
          {group.admin && (
            <span className="text-[9px] font-semibold bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded shrink-0">admin</span>
          )}
          {hasItems && (
            <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
              {enabledItems}/{group.items.length}
            </span>
          )}
        </button>
        <Switch
          checked={groupOn}
          onCheckedChange={(v) => !disabled && onToggleKey(group.key, v)}
          disabled={disabled}
        />
      </div>

      {/* Subsection rows */}
      {hasItems && open && (
        <div className={`px-3 pb-2.5 pt-0.5 space-y-1 ${groupOn ? "" : "opacity-50 pointer-events-none"}`}>
          {group.items.map((it) => (
            <div key={it.key} className="flex items-center gap-2 pl-6 pr-1 py-1 rounded-lg hover:bg-gray-50">
              <span className="text-xs text-gray-600 truncate flex-1">{it.label}</span>
              {it.admin && (
                <span className="text-[9px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">admin</span>
              )}
              <Switch
                checked={groupOn && perms[it.key] !== false}
                onCheckedChange={(v) => !disabled && onToggleKey(it.key, v)}
                disabled={disabled || !groupOn}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UserPermissionCard({ user, registry }: { user: UserPermissions; registry: RegistryGroup[] }) {
  const [perms, setPerms] = useState<PermissionMap>(() => ({ ...user.permissions }))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const update = useUpdatePermissions()

  const style = COMPANY_STYLES[user.company] ?? { badge: "bg-gray-100 text-gray-600 border-gray-200", avatar: "bg-gray-500" }
  const allLeaves = useMemo(() => leafKeys(registry), [registry])
  const restrictedCount = allLeaves.filter((k) => perms[k] === false).length

  function toggleKey(key: string, value: boolean) {
    setPerms((p) => ({ ...p, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    try {
      const result = await update.mutateAsync({ email: user.email, permissions: perms })
      if (result && (result as { success?: boolean }).success === false) {
        toast.error(`Failed to save ${user.name}: ${(result as { error?: string }).error ?? "Unknown error"}`)
        return
      }
      setDirty(false)
      setSaved(true)
      toast.success(`Permissions saved for ${user.name}`)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      toast.error(`Failed to save ${user.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${
      user.is_admin ? "border-gold-200 ring-1 ring-gold-100" : "border-gray-200"
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
                <span className="text-[10px] font-semibold bg-gold-600 text-white px-2 py-0.5 rounded-full">Full Access</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${style.badge}`}>
            {user.company || user.department}
          </span>
          {!user.is_admin && (
            <span className="text-xs text-gray-400 tabular-nums">
              {restrictedCount === 0 ? "full access" : `${restrictedCount} restricted`}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-1.5 bg-gray-50 border-y border-gray-100">
        <p className="text-xs text-gray-500 italic">{user.designation}</p>
      </div>

      {/* Registry tree */}
      <div className="px-5 py-4 space-y-2">
        {user.is_admin ? (
          <p className="text-xs text-gold-500 py-2">Administrator — full access to every module, cannot be restricted.</p>
        ) : (
          registry.map((g) => (
            <GroupBlock key={g.key} group={g} perms={perms} disabled={false} onToggleKey={toggleKey} />
          ))
        )}
      </div>

      {/* Footer */}
      {!user.is_admin && (
        <div className="px-5 pb-4 flex items-center justify-end">
          <button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-all ${
              saved ? "bg-green-100 text-green-700"
              : dirty ? "bg-forest-700 text-white hover:bg-forest-800 shadow-sm"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saved ? (<><CheckCircle2 size={13} /> Saved</>) : update.isPending ? "Saving…" : (<><Save size={13} /> Save Changes</>)}
          </button>
        </div>
      )}
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
          <div className="h-11 w-11 rounded-2xl bg-gold-50 flex items-center justify-center shadow-sm">
            <Shield size={22} className="text-gold-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Role Control</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Full access by default — restrict any module or subsection per user
            </p>
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full">
            <Users size={13} />
            <span>{data.users.length} team members</span>
          </div>
        )}
      </div>

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
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-10 bg-gray-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
          Failed to load users. Make sure bench is running.
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {data.users.map((u) => (
            <UserPermissionCard key={u.email} user={u} registry={data.registry} />
          ))}
        </div>
      )}
    </div>
  )
}
