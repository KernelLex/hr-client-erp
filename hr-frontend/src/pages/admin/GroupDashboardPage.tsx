// Consolidated Group Dashboard — one view across all companies (VE / SL / HM).
import { useQuery } from "@tanstack/react-query"
import { groupDashboardGet } from "../peoplework/client"
import { StatCard } from "@/components/dashboard"
import { TrendingUp, Layers, FileText, Wallet, Target, LifeBuoy, Package, Users } from "lucide-react"

type Block = { company: string; net_sales: number; quotations: number | null; projects: number | null; sales_orders: number | null; open_tickets: number; vendor_outstanding: number }
type Combined = { net_sales: number; quotations: number; projects: number; sales_orders: number; open_tickets: number; vendor_outstanding: number; opportunities: number; catalogue_items: number; employees: number }
type Resp = { period: { from: string; to: string }; companies: Block[]; combined: Combined }

const cr = (n?: number) => {
  const v = n || 0
  if (Math.abs(v) >= 1e7) return "₹" + (v / 1e7).toFixed(2) + " Cr"
  if (Math.abs(v) >= 1e5) return "₹" + (v / 1e5).toFixed(2) + " L"
  return "₹" + v.toLocaleString("en-IN")
}

export function GroupDashboardPage() {
  const q = useQuery({ queryKey: ["group_overview"], queryFn: () => groupDashboardGet<Resp>("get_group_overview") })
  const d = q.data

  return (
    <div className="p-6 mx-auto">
      <h1 className="font-heading text-[26px] mb-1" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Group Dashboard</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>All companies at a glance{d ? ` · FY from ${d.period.from}` : ""}.</p>

      {q.isLoading && <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</div>}

      {d && (
        <>
          {/* combined KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Group Sales (FY)" value={cr(d.combined.net_sales)} icon={TrendingUp} />
            <StatCard label="Active Projects" value={String(d.combined.projects)} icon={Layers} />
            <StatCard label="Live Quotations" value={String(d.combined.quotations)} icon={FileText} />
            <StatCard label="Vendor Outstanding" value={cr(d.combined.vendor_outstanding)} icon={Wallet} />
            <StatCard label="Open Opportunities" value={String(d.combined.opportunities)} icon={Target} />
            <StatCard label="Open Service Tickets" value={String(d.combined.open_tickets)} icon={LifeBuoy} />
            <StatCard label="Catalogue Items" value={d.combined.catalogue_items.toLocaleString("en-IN")} icon={Package} />
            <StatCard label="Employees" value={String(d.combined.employees)} icon={Users} />
          </div>

          {/* per company */}
          <h2 className="font-heading text-lg mb-3" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>By Company</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {d.companies.map((c) => (
              <div key={c.company} className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
                <div className="font-semibold mb-3 pb-3" style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>{c.company}</div>
                <Row label="Sales (FY)" value={cr(c.net_sales)} strong />
                <Row label="Projects" value={String(c.projects ?? "—")} />
                <Row label="Quotations" value={String(c.quotations ?? "—")} />
                <Row label="Sales Orders" value={String(c.sales_orders ?? "—")} />
                <Row label="Open tickets" value={String(c.open_tickets)} />
                <Row label="Vendor dues" value={cr(c.vendor_outstanding)} />
              </div>
            ))}
          </div>
          <p className="text-xs mt-5" style={{ color: "var(--text-tertiary)" }}>Sales are from the imported Tally accounts; projects, quotations and tickets come from the live workflow modules. Companies with no data yet show 0.</p>
        </>
      )}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-sm" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="mono-num" style={{ fontWeight: strong ? 600 : 400, color: strong ? "var(--text-primary)" : "var(--text-secondary)" }}>{value}</span>
    </div>
  )
}
