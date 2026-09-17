import { useQuery } from "@tanstack/react-query"
import { getGroupSummary } from "@/api/company"
import { useCompany } from "@/context/CompanyContext"

function inr(n: number): string {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1e7) return `₹ ${(v / 1e7).toFixed(2)} Cr`
  if (Math.abs(v) >= 1e5) return `₹ ${(v / 1e5).toFixed(2)} L`
  if (Math.abs(v) >= 1e3) return `₹ ${(v / 1e3).toFixed(1)}K`
  return `₹ ${v.toFixed(0)}`
}

/**
 * Owner-only consolidated view, shown on the Dashboard when the active company
 * is "All companies" (__ALL__). Group headline + a per-company split in each
 * company's own accent; clicking a company drills into it.
 */
export function GroupConsole() {
  const { availableCompanies, accentOf, setCompany } = useCompany()
  const { data, isLoading } = useQuery({
    queryKey: ["group_summary"],
    queryFn: getGroupSummary,
    staleTime: 1000 * 60,
  })

  if (isLoading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm text-sm text-gray-400">Loading group console…</div>
  }
  if (!data) return null

  const labelOf = (name: string) =>
    availableCompanies.find((c) => c.name === name)?.label || name

  const g = data.group_consolidated
  const elim = data.eliminations

  return (
    <div className="space-y-4">
      {/* Group headline */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: accentOf("__ALL__") }} />
          <h2 className="font-heading text-lg" style={{ color: "var(--text-primary)" }}>Group Console — All Companies</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Group Sales", value: g.sales },
            { label: "Group Purchases", value: g.purchase },
            { label: "Group Funds", value: g.funds },
          ].map((k) => (
            <div key={k.label} className="rounded-xl p-4" style={{ background: "var(--bg-app)" }}>
              <div className="text-xs text-gray-500">{k.label}</div>
              <div className="text-xl font-heading mt-1" style={{ color: "var(--text-primary)" }}>{inr(k.value)}</div>
            </div>
          ))}
        </div>
        {(elim.sales > 0 || elim.purchase > 0) && (
          <p className="mt-3 text-xs text-gray-400">
            Inter-company eliminated: sales {inr(elim.sales)}, purchases {inr(elim.purchase)}. Unmatched
            differences are shown in the inter-company reconciliation report.
          </p>
        )}
      </div>

      {/* Per-company split — click to drill in */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.companies.map((name) => {
          const row = data.per_company[name] || { sales: 0, purchase: 0, funds: 0 }
          const accent = accentOf(name)
          return (
            <button
              key={name}
              onClick={() => void setCompany(name)}
              className="text-left rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md"
              style={{ borderColor: "#eef0f2", borderTop: `3px solid ${accent}` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{labelOf(name)}</span>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Sales</dt><dd style={{ color: "var(--text-primary)" }}>{inr(row.sales)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Purchases</dt><dd style={{ color: "var(--text-primary)" }}>{inr(row.purchase)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Funds</dt><dd style={{ color: "var(--text-primary)" }}>{inr(row.funds)}</dd></div>
              </dl>
              <div className="mt-3 text-[11px]" style={{ color: accent }}>Open {labelOf(name)} →</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
