import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ChevronRight, ChevronDown, Search, Plus, X, Loader2,
  FolderOpen, Folder, FileText,
} from "lucide-react"
import { toast } from "sonner"

// ── API helpers ────────────────────────────────────────────────────────────────

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

const BASE = "/api/method/hr_client.api.accounting"

async function apiFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  const res = await fetch(`${BASE}.${endpoint}${qs}`, {
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": getCsrf() },
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const json = await res.json()
  if (json.exc) throw new Error(json.exc)
  if (json.message?.success === false) throw new Error(json.message.error ?? "Request failed")
  return json.message
}

async function apiPost<T>(endpoint: string, body: Record<string, string>): Promise<T> {
  const fd = new FormData()
  Object.entries(body).forEach(([k, v]) => fd.append(k, v))
  const res = await fetch(`${BASE}.${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": getCsrf() },
    body: fd,
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const json = await res.json()
  if (json.exc) throw new Error(json.exc)
  if (json.message?.success === false) throw new Error(json.message.error ?? "Request failed")
  return json.message
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Account {
  name: string
  account_name: string
  account_number: string | null
  parent_account: string
  account_type: string
  root_type: "Asset" | "Liability" | "Equity" | "Income" | "Expense"
  is_group: 0 | 1
  currency: string
  disabled: 0 | 1
  balance: number
  children: Account[]
}

interface AccountGroup {
  name: string
  account_name: string
  root_type: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROOT_TYPE_COLORS: Record<string, string> = {
  Asset:     "bg-blue-50 text-blue-700 border border-blue-100",
  Liability: "bg-red-50 text-red-700 border border-red-100",
  Equity:    "bg-emerald-50 text-emerald-700 border border-emerald-100",
  Income:    "bg-purple-50 text-purple-700 border border-purple-100",
  Expense:   "bg-orange-50 text-orange-700 border border-orange-100",
}

function fmtBalance(balance: number): string {
  const abs = Math.abs(balance)
  const sign = balance < 0 ? "−" : ""
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)}L`
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)}K`
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function flattenTree(accounts: Account[]): Account[] {
  const result: Account[] = []
  function walk(nodes: Account[]) {
    for (const n of nodes) {
      result.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(accounts)
  return result
}

function filterTree(accounts: Account[], query: string): Account[] {
  if (!query) return accounts
  const q = query.toLowerCase()
  function matches(acc: Account): boolean {
    if (acc.account_name.toLowerCase().includes(q)) return true
    if (acc.account_number && acc.account_number.toLowerCase().includes(q)) return true
    return acc.children.some(matches)
  }
  function filter(nodes: Account[]): Account[] {
    return nodes
      .filter(matches)
      .map(acc => ({ ...acc, children: filter(acc.children) }))
  }
  return filter(accounts)
}

// ── Account tree node ─────────────────────────────────────────────────────────

function AccountNode({
  acc, depth, expanded, onToggle,
}: {
  acc: Account
  depth: number
  expanded: Set<string>
  onToggle: (name: string) => void
}) {
  const isExpanded = expanded.has(acc.name)
  const hasChildren = acc.children?.length > 0
  const isGroup = Boolean(acc.is_group)

  return (
    <>
      <div
        className={`flex items-center gap-2 py-2 pr-3 rounded-lg transition-colors
          hover:bg-[#f5efe4] cursor-pointer group select-none
          ${acc.disabled ? "opacity-40" : ""}`}
        style={{ paddingLeft: `${10 + depth * 18}px` }}
        onClick={() => isGroup && hasChildren && onToggle(acc.name)}
      >
        {/* Chevron expand/collapse */}
        <span className="shrink-0 w-4 flex items-center justify-center text-gray-400">
          {isGroup && hasChildren
            ? isExpanded
              ? <ChevronDown size={13} />
              : <ChevronRight size={13} />
            : null}
        </span>

        {/* Folder / file icon */}
        <span className="shrink-0">
          {isGroup
            ? isExpanded
              ? <FolderOpen size={14} className="text-[#c8a45c]" />
              : <Folder size={14} className="text-[#c8a45c]" />
            : <FileText size={13} className="text-gray-300" />}
        </span>

        {/* Account number */}
        <span className="shrink-0 text-[11px] text-gray-400 font-mono w-14 truncate">
          {acc.account_number || ""}
        </span>

        {/* Account name */}
        <span className={`flex-1 text-sm truncate ${isGroup ? "font-semibold text-[#2c2c2a]" : "font-normal text-[#4a4a42]"}`}>
          {acc.account_name}
        </span>

        {/* Account type badge */}
        {acc.account_type && !isGroup && (
          <span className="hidden lg:inline shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
            {acc.account_type}
          </span>
        )}

        {/* Root type badge — show only at top level */}
        {depth === 0 && (
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROOT_TYPE_COLORS[acc.root_type] ?? "bg-gray-100 text-gray-600"}`}>
            {acc.root_type}
          </span>
        )}

        {/* Balance */}
        <span className={`shrink-0 text-xs font-mono font-semibold tabular-nums min-w-[60px] text-right
          ${acc.balance > 0 ? "text-[#2c2c2a]" : acc.balance < 0 ? "text-red-600" : "text-gray-300"}`}>
          {acc.balance !== 0 ? fmtBalance(acc.balance) : (isGroup ? "" : "—")}
        </span>
      </div>

      {/* Children */}
      {isGroup && hasChildren && isExpanded && (
        <>
          {acc.children.map(child => (
            <AccountNode
              key={child.name}
              acc={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </>
      )}
    </>
  )
}

// ── New Account Modal ─────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  "", "Bank", "Cash", "Fixed Asset", "Receivable", "Payable",
  "Tax", "Income Account", "Expense Account", "Cost of Goods Sold",
  "Depreciation", "Accumulated Depreciation", "Capital Work in Progress",
  "Stock", "Stock Adjustment", "Round Off", "Equity",
  "Chargeable", "Temporary", "Provisions", "Reserve and Surplus",
]

const ROOT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"]

function NewAccountModal({
  company,
  groups,
  onClose,
}: {
  company: string
  groups: AccountGroup[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    account_name: "",
    parent_account: "",
    root_type: "",
    account_type: "",
    is_group: "0",
  })

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ success: boolean; name: string }>("create_account", {
        ...form,
        company,
      }),
    onSuccess: () => {
      toast.success("Account created successfully")
      qc.invalidateQueries({ queryKey: ["chart-of-accounts", company] })
      qc.invalidateQueries({ queryKey: ["account-groups", company] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function set(k: keyof typeof form, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  const canSave = form.account_name.trim() && form.parent_account && form.root_type

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(30,58,47,0.4)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[#2c2c2a]">New Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Account Name */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c8a45c] focus:ring-1 focus:ring-[#c8a45c]/30"
              value={form.account_name}
              onChange={e => set("account_name", e.target.value)}
              placeholder="e.g. Trade Debtors"
            />
          </div>

          {/* Parent Account */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              Parent Account <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#c8a45c] text-gray-800"
              value={form.parent_account}
              onChange={e => set("parent_account", e.target.value)}
            >
              <option value="">— select parent —</option>
              {groups.map(g => (
                <option key={g.name} value={g.name}>
                  {g.account_name}
                </option>
              ))}
            </select>
          </div>

          {/* Root Type */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              Root Type <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#c8a45c] text-gray-800"
              value={form.root_type}
              onChange={e => set("root_type", e.target.value)}
            >
              <option value="">— select root type —</option>
              {ROOT_TYPES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Account Type */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              Account Type
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#c8a45c] text-gray-800"
              value={form.account_type}
              onChange={e => set("account_type", e.target.value)}
            >
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>{t || "— none —"}</option>
              ))}
            </select>
          </div>

          {/* Is Group toggle */}
          <div className="flex items-center gap-3 py-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Is Group
            </label>
            <button
              type="button"
              onClick={() => set("is_group", form.is_group === "1" ? "0" : "1")}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                form.is_group === "1" ? "bg-[#1e3a2f]" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  form.is_group === "1" ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-xs text-gray-400">
              {form.is_group === "1" ? "Yes — can have sub-accounts" : "No — ledger account"}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSave || mutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 transition-colors"
            style={{ background: canSave ? "#1e3a2f" : "#6a6a5c" }}
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            {mutation.isPending ? "Creating…" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Chart of Accounts Tab ─────────────────────────────────────────────────────

export function ChartOfAccountsTab({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)

  const { data: tree = [], isLoading, isError } = useQuery<Account[]>({
    queryKey: ["chart-of-accounts", company],
    queryFn: () => apiFetch("get_chart_of_accounts", { company }),
    staleTime: 60_000,
  })

  const { data: groups = [] } = useQuery<AccountGroup[]>({
    queryKey: ["account-groups", company],
    queryFn: () => apiFetch("get_account_groups", { company }),
    staleTime: 60_000,
  })

  // Auto-expand root accounts when data first loads
  useEffect(() => {
    if (tree.length > 0 && expanded.size === 0) {
      setExpanded(new Set(tree.map(a => a.name)))
    }
  }, [tree]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => filterTree(tree, search), [tree, search])

  // When searching, expand everything so matches are visible
  const displayExpanded = useMemo<Set<string>>(() => {
    if (!search) return expanded
    return new Set(flattenTree(filtered).map(a => a.name))
  }, [search, filtered, expanded])

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const leafCount = useMemo(() => flattenTree(tree).filter(a => !a.is_group).length, [tree])

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="text-[#1e3a2f] animate-spin" />
    </div>
  )

  if (isError) return (
    <div className="py-12 text-center text-sm text-red-500">
      Failed to load chart of accounts. Please refresh the page.
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by account name or number…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#c8a45c] bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{leafCount} ledger accounts</span>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-white transition-colors whitespace-nowrap"
          style={{ background: "#1e3a2f" }}
        >
          <Plus size={13} /> New Account
        </button>
      </div>

      {/* Column header */}
      <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
        <span className="w-4 shrink-0" />
        <span className="w-4 shrink-0" />
        <span className="w-14 shrink-0">No.</span>
        <span className="flex-1">Account Name</span>
        <span className="hidden lg:block shrink-0 w-36">Type</span>
        <span className="shrink-0 min-w-[60px] text-right">Balance</span>
      </div>

      {/* Tree */}
      <div className="space-y-0.5">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 italic">
            No accounts match "{search}".
          </p>
        ) : (
          filtered.map(acc => (
            <AccountNode
              key={acc.name}
              acc={acc}
              depth={0}
              expanded={displayExpanded}
              onToggle={toggle}
            />
          ))
        )}
      </div>

      {showModal && (
        <NewAccountModal
          company={company}
          groups={groups}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
