import { useState, useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronRight, ChevronDown, Search, Loader2,
  FolderOpen, Folder, FileText,
} from "lucide-react"
import { accountingGet } from "./api"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Account {
  name: string
  account_name: string
  parent_account: string
  root_type: "Asset" | "Liability" | "Equity" | "Income" | "Expense" | ""
  is_group: 0 | 1
  balance: number
  children: Account[]
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
        className="flex items-center gap-2 py-2 pr-3 rounded-lg transition-colors
          hover:bg-[#f5efe4] cursor-pointer group select-none"
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

        {/* Account name */}
        <span className={`flex-1 text-sm truncate ${isGroup ? "font-semibold text-[#2c2c2a]" : "font-normal text-[#4a4a42]"}`}>
          {acc.account_name}
        </span>

        {/* Root type badge — show only at top level */}
        {depth === 0 && acc.root_type && (
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

// ── Chart of Accounts Tab ─────────────────────────────────────────────────────

export function ChartOfAccountsTab() {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: tree = [], isLoading, isError } = useQuery<Account[]>({
    queryKey: ["tally-chart-of-accounts"],
    queryFn: () => accountingGet("get_tally_chart_of_accounts"),
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
            placeholder="Search by account or group name…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#c8a45c] bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{leafCount} ledger accounts</span>
      </div>

      <p className="text-xs text-gray-400 -mt-1">
        Imported from Tally — read-only. Balances shown in each account's normal direction (Dr for Assets/Expenses, Cr for Liabilities/Equity/Income).
      </p>

      {/* Column header */}
      <div className="flex items-center gap-2 px-2 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
        <span className="w-4 shrink-0" />
        <span className="w-4 shrink-0" />
        <span className="flex-1">Account Name</span>
        <span className="shrink-0 min-w-[60px] text-right">Balance</span>
      </div>

      {/* Tree */}
      <div className="space-y-0.5">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 italic">
            {tree.length === 0
              ? "No Tally data imported yet. Run “Import from Tally” first."
              : `No accounts match "${search}".`}
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
    </div>
  )
}
