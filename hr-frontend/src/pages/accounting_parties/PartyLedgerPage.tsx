import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Search, ArrowDownLeft, ArrowUpRight, Building2, Phone, MapPin,
  FileText, Loader2, X, Hash, CreditCard,
} from "lucide-react"
import {
  getArApSummary, searchParties, getPartyLedger,
  type PartyDirection, type PartyLedger,
} from "@/api/parties"
import { useAdminGuard } from "@/lib/useAdminGuard"

const DIR_LABEL: Record<PartyDirection, string> = {
  receivable: "Owes us",
  payable: "We owe",
  advance_from_customer: "Advance from them",
  advance_to_vendor: "Advance we paid",
  settled: "Settled",
}

function dirTone(d: PartyDirection): { bg: string; fg: string; icon: React.ReactNode } {
  if (d === "receivable" || d === "advance_to_vendor")
    return { bg: "#ecfdf5", fg: "#065f46", icon: <ArrowDownLeft size={14} /> }
  if (d === "payable" || d === "advance_from_customer")
    return { bg: "#fef2f2", fg: "#991b1b", icon: <ArrowUpRight size={14} /> }
  return { bg: "var(--bg-subtle)", fg: "var(--text-secondary)", icon: null }
}

const BUCKET_ORDER = ["b0_30", "b31_60", "b61_90", "b90_plus", "unknown"]
const BUCKET_TONE: Record<string, string> = {
  b0_30: "#065f46", b31_60: "#92400e", b61_90: "#9a3412", b90_plus: "#991b1b", unknown: "#6b7280",
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryBar() {
  const { data } = useQuery({ queryKey: ["arap-summary"], queryFn: getArApSummary, staleTime: 60_000 })
  const cards = [
    { label: "Others owe us", value: data?.receivable_fmt, sub: `${data?.receivable_count ?? 0} parties`, tone: "#065f46" },
    { label: "We owe others", value: data?.payable_fmt, sub: `${data?.payable_count ?? 0} parties`, tone: "#991b1b" },
    { label: "Net position", value: data?.net_fmt, sub: (data?.net_total ?? 0) >= 0 ? "net receivable" : "net payable", tone: "var(--text-primary)" },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{c.label}</p>
          <p className="text-2xl font-semibold mt-1" style={{ color: c.tone }}>{c.value ?? "—"}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Party detail ──────────────────────────────────────────────────────────────
function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5" style={{ color: "var(--text-tertiary)" }}>{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</p>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{value}</p>
      </div>
    </div>
  )
}

function PartyDetail({ party }: { party: string }) {
  const { data, isLoading, isError } = useQuery<PartyLedger>({
    queryKey: ["party-ledger", party],
    queryFn: () => getPartyLedger(party),
    staleTime: 30_000,
  })
  const [tab, setTab] = useState<"open" | "all">("open")

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" style={{ color: "var(--text-tertiary)" }} /></div>
  if (isError || !data) return <div className="py-20 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Couldn't load this party.</div>

  const tone = dirTone(data.direction)
  const agingTotal = BUCKET_ORDER.reduce((s, k) => s + (data.aging[k]?.amount ?? 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border bg-white p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{data.party}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{data.group} · {data.company}</p>
          </div>
          <div className="rounded-xl px-4 py-2 text-right" style={{ background: tone.bg }}>
            <div className="flex items-center gap-1.5 justify-end text-[11px] font-semibold uppercase tracking-wide" style={{ color: tone.fg }}>
              {tone.icon}{DIR_LABEL[data.direction]}
            </div>
            <p className="text-2xl font-bold mt-0.5" style={{ color: tone.fg }}>{data.outstanding_fmt}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <Field icon={<Hash size={13} />} label="GSTIN" value={data.gstin} />
          <Field icon={<CreditCard size={13} />} label="PAN" value={data.pan} />
          <Field icon={<Phone size={13} />} label="Phone" value={data.phone} />
          <Field icon={<Building2 size={13} />} label="State" value={data.state} />
          <Field icon={<MapPin size={13} />} label="Address" value={data.address} />
        </div>
      </div>

      {/* Totals + aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11px] uppercase tracking-wide mb-3" style={{ color: "var(--text-tertiary)" }}>Lifetime</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p style={{ color: "var(--text-tertiary)" }}>Invoiced</p><p className="font-semibold">{data.total_charged_fmt}</p></div>
            <div><p style={{ color: "var(--text-tertiary)" }}>{data.is_debtor ? "Received" : "Paid"}</p><p className="font-semibold">{data.total_paid_fmt}</p></div>
            {data.opening_balance > 0 && <div><p style={{ color: "var(--text-tertiary)" }}>Opening</p><p className="font-semibold">{data.opening_fmt}</p></div>}
            <div><p style={{ color: "var(--text-tertiary)" }}>Transactions</p><p className="font-semibold">{data.transaction_count}</p></div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[11px] uppercase tracking-wide mb-3" style={{ color: "var(--text-tertiary)" }}>Outstanding by age (FIFO)</p>
          <div className="space-y-1.5">
            {BUCKET_ORDER.filter((k) => (data.aging[k]?.amount ?? 0) > 0).map((k) => {
              const b = data.aging[k]
              const pct = agingTotal > 0 ? (b.amount / agingTotal) * 100 : 0
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0" style={{ color: "var(--text-secondary)" }}>{b.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BUCKET_TONE[k] }} />
                  </div>
                  <span className="w-20 text-right font-medium" style={{ color: "var(--text-primary)" }}>{b.fmt}</span>
                </div>
              )
            })}
            {agingTotal === 0 && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nothing outstanding.</p>}
          </div>
          {data.unexplained_fmt && (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
              Includes {data.unexplained_fmt} from opening balance / journal adjustments not tied to a specific invoice.
            </p>
          )}
        </div>
      </div>

      {/* Invoice / transaction tables */}
      <div className="rounded-xl border bg-white" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex gap-1 p-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          {([["open", `Open invoices (${data.open_invoice_count})`], ["all", `All transactions (${data.transaction_count})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={tab === k ? { background: "var(--bg-subtle)", color: "var(--text-primary)" } : { color: "var(--text-tertiary)" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "open" ? (
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>{["Invoice", "Date", "Age", "Invoice amt", "Still open"].map((h, i) => (
                <th key={h} className={`py-2 px-3 text-[11px] font-semibold uppercase ${i >= 3 ? "text-right" : "text-left"}`} style={{ color: "var(--text-tertiary)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {data.open_invoices.map((inv, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>{inv.number}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-secondary)" }}>{inv.date ?? "—"}</td>
                  <td className="py-2 px-3" style={{ color: inv.age_days != null && inv.age_days > 90 ? "#991b1b" : "var(--text-secondary)" }}>{inv.age_days != null ? `${inv.age_days}d` : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: "var(--text-tertiary)" }}>{inv.amount_fmt}</td>
                  <td className="py-2 px-3 text-right font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{inv.open_amount_fmt}</td>
                </tr>
              ))}
              {data.open_invoices.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                  No matched open invoices — the balance is from opening / journal entries.
                </td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr>{["Type", "Voucher", "Date", "Note", "Amount"].map((h, i) => (
                <th key={h} className={`py-2 px-3 text-[11px] font-semibold uppercase ${i === 4 ? "text-right" : "text-left"}`} style={{ color: "var(--text-tertiary)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {data.transactions.map((t, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="py-2 px-3"><span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{t.type}</span></td>
                  <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>{t.number}</td>
                  <td className="py-2 px-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{t.date}</td>
                  <td className="py-2 px-3 max-w-[280px] truncate" style={{ color: "var(--text-tertiary)" }}>{t.narration}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: t.signed < 0 ? "#065f46" : "var(--text-primary)" }}>
                    {t.signed < 0 ? "−" : t.signed > 0 ? "+" : ""}{t.amount_fmt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PartyLedgerPage() {
  const guard = useAdminGuard()
  const [params, setParams] = useSearchParams()
  const [kind, setKind] = useState<"all" | "receivable" | "payable">("all")
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const selected = params.get("party") || ""

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 250)
    return () => clearTimeout(t)
  }, [input])

  const { data: results, isFetching } = useQuery({
    queryKey: ["party-search", query, kind],
    queryFn: () => searchParties(query, kind),
    staleTime: 30_000,
  })

  const summaryForList = useQuery({ queryKey: ["arap-summary"], queryFn: getArApSummary, staleTime: 60_000 })
  // When no search typed, seed the list with top parties for quick access.
  const rows = useMemo(() => results?.results ?? [], [results])

  function pick(party: string) {
    setParams((p) => { p.set("party", party); return p }, { replace: true })
  }

  if (guard) return guard

  return (
    <div className="p-6 space-y-5 min-h-full">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Payables &amp; Receivables</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Who owes us, who we owe — with invoices and aging, straight from Tally.</p>
      </div>

      <SummaryBar />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        {/* Left: search + list */}
        <div className="rounded-xl border bg-white flex flex-col" style={{ borderColor: "var(--border-subtle)", maxHeight: "calc(100vh - 220px)" }}>
          <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search a company / party…"
                className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border outline-none focus:ring-2"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
              {input && <button onClick={() => setInput("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={14} style={{ color: "var(--text-tertiary)" }} /></button>}
            </div>
            <div className="flex gap-1">
              {([["all", "All"], ["receivable", "Owes us"], ["payable", "We owe"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setKind(k)}
                  className="flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors"
                  style={kind === k ? { background: "var(--bg-inverse)", color: "var(--text-inverse)" } : { background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {isFetching && rows.length === 0 ? (
              <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} /></div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{query ? "No parties found." : "Type to search, or pick from the totals above."}</p>
            ) : rows.map((r) => {
              const tone = dirTone(r.direction)
              return (
                <button key={r.party} onClick={() => pick(r.party)}
                  className="w-full text-left px-3 py-2.5 border-b transition-colors hover:bg-[var(--overlay-hover)]"
                  style={{ borderColor: "var(--border-subtle)", background: selected === r.party ? "var(--overlay-selected)" : "transparent" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.party}</span>
                    <span className="text-sm font-semibold shrink-0" style={{ color: tone.fg }}>{r.amount_fmt}</span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{DIR_LABEL[r.direction]} · {r.group}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: detail or hint */}
        <div>
          {selected ? (
            <PartyDetail party={selected} />
          ) : (
            <div className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {([["Biggest receivables", summaryForList.data?.top_receivables, "#065f46"], ["Biggest payables", summaryForList.data?.top_payables, "#991b1b"]] as const).map(([title, list, tone]) => (
                  <div key={title}>
                    <p className="text-[11px] uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
                      <FileText size={12} /> {title}
                    </p>
                    <div className="space-y-1">
                      {(list ?? []).map((p) => (
                        <button key={p.party} onClick={() => pick(p.party)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--overlay-hover)]">
                          <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{p.party}</span>
                          <span className="text-sm font-semibold shrink-0" style={{ color: tone as string }}>{p.amount_fmt}</span>
                        </button>
                      ))}
                      {(!list || list.length === 0) && <p className="text-sm px-2" style={{ color: "var(--text-tertiary)" }}>None.</p>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm mt-5 pt-4 border-t" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}>
                Search or pick a party to see its full breakdown — outstanding, aging, open invoices and every transaction.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
