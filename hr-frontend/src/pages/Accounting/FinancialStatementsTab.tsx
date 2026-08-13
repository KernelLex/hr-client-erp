import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, ChevronDown, ChevronRight, AlertCircle } from "lucide-react"
import { usePeriod, periodDateRange } from "./PeriodFilter"
import { accountingGet } from "./api"

interface LedgerAmount { ledger: string; amount: number }
interface GroupAmount { group: string; amount: number; ledgers: LedgerAmount[] }

interface PnLResult {
  period: { start: string; end: string }
  income: { total: number; groups: GroupAmount[] }
  expense: { total: number; groups: GroupAmount[] }
  net_profit: number
}

interface BalanceSheetResult {
  as_of: string
  assets: { total: number; groups: GroupAmount[] }
  liabilities: { total: number; groups: GroupAmount[] }
  equity: { total: number; groups: GroupAmount[] }
  balance_check: number
}

function fmtINR(n: number): string {
  // Pinpoint value — exact rupees + paise, Indian grouping. No Cr/L rounding.
  const sign = (n ?? 0) < 0 ? "−" : ""
  return `${sign}₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function GroupBreakdown({ groups, positiveColor = "text-[#2c2c2a]" }: { groups: GroupAmount[]; positiveColor?: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  function toggle(g: string) {
    setOpen(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n })
  }
  if (groups.length === 0) return <p className="text-xs text-gray-400 italic px-1 py-2">No entries.</p>
  return (
    <div className="space-y-0.5">
      {groups.map(g => (
        <div key={g.group}>
          <button
            onClick={() => toggle(g.group)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#f5efe4] text-sm"
          >
            <span className="flex items-center gap-1.5 text-gray-700">
              {open.has(g.group) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {g.group}
            </span>
            <span className={`font-mono font-semibold ${positiveColor}`}>{fmtINR(g.amount)}</span>
          </button>
          {open.has(g.group) && (
            <div className="pl-6 border-l border-gray-100 ml-3">
              {g.ledgers.map(l => (
                <div key={l.ledger} className="flex items-center justify-between px-2 py-1 text-xs text-gray-500">
                  <span>{l.ledger}</span>
                  <span className="font-mono">{fmtINR(l.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ProfitAndLoss() {
  const { year, month } = usePeriod()
  const { from, to } = periodDateRange({ year, month })

  const { data, isLoading, isError } = useQuery<PnLResult>({
    queryKey: ["profit-and-loss", from, to],
    queryFn: () => accountingGet("get_profit_and_loss", { from_date: from, to_date: to }),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      {/* Period comes from the shared Year → Month filter in the page header. */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="text-[#1e3a2f] animate-spin" /></div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Failed to load Profit &amp; Loss.</p>
      ) : data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Income</p>
              <p className="text-lg font-bold text-emerald-700">{fmtINR(data.income.total)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Expense</p>
              <p className="text-lg font-bold text-red-600">{fmtINR(data.expense.total)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Net Profit</p>
              <p className={`text-lg font-bold ${data.net_profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtINR(data.net_profit)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-[#2c2c2a] px-1 pb-1.5">Income</p>
            <GroupBreakdown groups={data.income.groups} positiveColor="text-emerald-700" />
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-[#2c2c2a] px-1 pb-1.5">Expenses</p>
            <GroupBreakdown groups={data.expense.groups} positiveColor="text-red-600" />
          </div>
        </>
      )}
    </div>
  )
}

function BalanceSheet() {
  const { data, isLoading, isError } = useQuery<BalanceSheetResult>({
    queryKey: ["balance-sheet"],
    queryFn: () => accountingGet("get_balance_sheet"),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={22} className="text-[#1e3a2f] animate-spin" /></div>
      ) : isError ? (
        <p className="py-12 text-center text-sm text-red-500">Failed to load Balance Sheet.</p>
      ) : data && (
        <>
          <p className="text-xs text-gray-400">As of latest Tally import ({data.as_of}) — a live snapshot, not a historical point-in-time statement.</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Assets</p>
              <p className="text-lg font-bold text-blue-700">{fmtINR(data.assets.total)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Liabilities</p>
              <p className="text-lg font-bold text-red-600">{fmtINR(data.liabilities.total)}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Equity</p>
              <p className="text-lg font-bold text-emerald-700">{fmtINR(data.equity.total)}</p>
            </div>
          </div>
          {Math.abs(data.balance_check) > 1 && (
            <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 shrink-0" />
              <span className="text-amber-800">
                Assets vs. Liabilities+Equity differ by {fmtINR(data.balance_check)} — likely current-year profit/retained
                earnings not yet posted to an Equity ledger in Tally, not necessarily a data error.
              </span>
            </div>
          )}
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-[#2c2c2a] px-1 pb-1.5">Assets</p>
            <GroupBreakdown groups={data.assets.groups} positiveColor="text-blue-700" />
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-[#2c2c2a] px-1 pb-1.5">Liabilities</p>
            <GroupBreakdown groups={data.liabilities.groups} positiveColor="text-red-600" />
          </div>
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-[#2c2c2a] px-1 pb-1.5">Equity</p>
            <GroupBreakdown groups={data.equity.groups} positiveColor="text-emerald-700" />
          </div>
        </>
      )}
    </div>
  )
}

export function FinancialStatementsTab() {
  const [tab, setTab] = useState<"pnl" | "bs">("pnl")
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl w-fit bg-[#f1f5f9]">
        {([["pnl", "Profit & Loss"], ["bs", "Balance Sheet"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === id ? "bg-white text-[#2c2c2a] shadow-sm" : "text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "pnl" ? <ProfitAndLoss /> : <BalanceSheet />}
    </div>
  )
}
