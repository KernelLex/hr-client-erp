// Consolidated Group Dashboard — one view across all companies (VE / SL / HM).
import { useQuery } from "@tanstack/react-query"
import { groupDashboardGet } from "../peoplework/client"

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
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Group Dashboard</h1>
      <p className="text-sm text-gray-500 mb-5">All companies at a glance{d ? ` · FY from ${d.period.from}` : ""}.</p>

      {q.isLoading && <div className="text-sm text-gray-400">Loading…</div>}

      {d && (
        <>
          {/* combined KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Big label="Group Sales (FY)" value={cr(d.combined.net_sales)} tone="text-indigo-700" />
            <Big label="Active Projects" value={String(d.combined.projects)} />
            <Big label="Live Quotations" value={String(d.combined.quotations)} />
            <Big label="Vendor Outstanding" value={cr(d.combined.vendor_outstanding)} tone="text-red-600" />
            <Big label="Open Opportunities" value={String(d.combined.opportunities)} />
            <Big label="Open Service Tickets" value={String(d.combined.open_tickets)} tone={d.combined.open_tickets ? "text-amber-600" : undefined} />
            <Big label="Catalogue Items" value={d.combined.catalogue_items.toLocaleString("en-IN")} />
            <Big label="Employees" value={String(d.combined.employees)} />
          </div>

          {/* per company */}
          <h2 className="font-semibold text-slate-700 mb-3">By Company</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {d.companies.map((c) => (
              <div key={c.company} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="font-semibold text-slate-800 mb-3">{c.company}</div>
                <Row label="Sales (FY)" value={cr(c.net_sales)} strong />
                <Row label="Projects" value={String(c.projects ?? "—")} />
                <Row label="Quotations" value={String(c.quotations ?? "—")} />
                <Row label="Sales Orders" value={String(c.sales_orders ?? "—")} />
                <Row label="Open tickets" value={String(c.open_tickets)} />
                <Row label="Vendor dues" value={cr(c.vendor_outstanding)} tone={c.vendor_outstanding > 0 ? "text-red-600" : undefined} />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">Sales are from the imported Tally accounts; projects, quotations and tickets come from the live workflow modules. Companies with no data yet show 0.</p>
        </>
      )}
    </div>
  )
}

function Big({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4"><div className="text-xs text-gray-400 mb-1">{label}</div><div className={`text-xl font-bold ${tone || "text-slate-800"}`}>{value}</div></div>
}
function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return <div className="flex justify-between py-1 border-b border-gray-50 text-sm"><span className="text-gray-500">{label}</span><span className={`${strong ? "font-semibold" : ""} ${tone || "text-slate-700"}`}>{value}</span></div>
}
