import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import { PageHeader } from "@/components/dashboard"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Loader2 } from "lucide-react"
import { useAdminGuard } from "@/lib/useAdminGuard"

interface StockItem {
  item_name: string
  stock_group: string | null
  hsn_code: string | null
  gst_rate: number | null
  unit: string | null
  standard_rate: number | null
}

function useStockItems() {
  return useQuery({
    queryKey: ["tally-stock-items"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.operations.get_tally_stock_items"), {
        params: { limit: 1000 },
      })
      return res.data.message as StockItem[]
    },
    staleTime: 60_000,
  })
}

const columns: DataTableColumn<StockItem>[] = [
  { key: "item_name", header: "Item", sortable: true, render: (r) => <span className="font-medium text-gray-800">{r.item_name}</span> },
  { key: "stock_group", header: "Group", render: (r) => r.stock_group || "—" },
  { key: "hsn_code", header: "HSN Code", render: (r) => <span className="font-mono text-xs text-gray-500">{r.hsn_code || "—"}</span> },
  { key: "gst_rate", header: "GST %", align: "right", sortable: true, render: (r) => (r.gst_rate != null ? `${r.gst_rate}%` : "—") },
  { key: "unit", header: "Unit", render: (r) => r.unit || "—" },
  {
    key: "standard_rate",
    header: "Standard Rate",
    align: "right",
    sortable: true,
    render: (r) => (r.standard_rate != null ? `₹${r.standard_rate.toLocaleString("en-IN")}` : "—"),
  },
]

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3 bg-white" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-[#2c2c2a] leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function InventoryPage() {
  const guard = useAdminGuard()
  const { data, isLoading } = useStockItems()
  const [group, setGroup] = useState("all")

  const items = useMemo(() => data ?? [], [data])

  // Derived summary (computed from the loaded item master — nothing removed)
  const stats = useMemo(() => {
    const groups = new Set<string>()
    let withHsn = 0, withGst = 0, withRate = 0
    const gstDist: Record<string, number> = {}
    for (const it of items) {
      if (it.stock_group) groups.add(it.stock_group)
      if (it.hsn_code) withHsn++
      if (it.gst_rate != null) { withGst++; const k = `${it.gst_rate}%`; gstDist[k] = (gstDist[k] ?? 0) + 1 }
      if (it.standard_rate != null) withRate++
    }
    const topGst = Object.entries(gstDist).sort((a, b) => b[1] - a[1]).slice(0, 4)
    return { total: items.length, groupCount: groups.size, withHsn, withGst, withRate, groups: [...groups].sort(), topGst }
  }, [items])

  const filtered = useMemo(
    () => (group === "all" ? items : items.filter((it) => (it.stock_group || "") === group)),
    [items, group],
  )

  if (guard) return guard

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <PageHeader
        workspaceLabel="Vera Enterprises Workspace"
        title="Inventory"
        right={
          <div className="text-xs px-3.5 py-1.5 rounded-full" style={{ background: "#fff", border: "var(--border-card)", color: "var(--text-secondary)" }}>
            {data ? `${data.length.toLocaleString()} items` : "Loading…"} · from Tally stock master
          </div>
        }
      />
      <div className="px-6 md:px-7 pb-8 space-y-4">
        <div
          className="px-4 py-2.5 rounded-xl text-xs"
          style={{ background: "var(--color-info-bg)", color: "#2c4a3a", border: "0.5px solid var(--info-border, #c4d4c4)" }}
        >
          Item master imported from Tally exports — standard rate, HSN and GST% reflect the last uploaded XML. There is no live warehouse/bin-level stock tracking yet.
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--gold)" }} />
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Items" value={stats.total.toLocaleString("en-IN")} />
              <StatCard label="Stock Groups" value={stats.groupCount.toLocaleString("en-IN")} />
              <StatCard label="With HSN Code" value={`${stats.withHsn.toLocaleString("en-IN")}`} sub={stats.total ? `${Math.round((stats.withHsn / stats.total) * 100)}% of items` : undefined} />
              <StatCard
                label="GST Rate Spread"
                value={stats.topGst.length ? stats.topGst.map(([r]) => r).join(" · ") : "—"}
                sub={stats.topGst.length ? stats.topGst.map(([r, c]) => `${r}: ${c}`).join("  ") : undefined}
              />
            </div>

            {/* Group filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-400">Filter by group:</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#c8a45c] max-w-xs"
              >
                <option value="all">All groups ({stats.total.toLocaleString("en-IN")})</option>
                {stats.groups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {group !== "all" && (
                <span className="text-xs text-gray-400">{filtered.length.toLocaleString("en-IN")} items in “{group}”</span>
              )}
            </div>

            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(r) => r.item_name}
              searchable
              stickyHeader
              searchPlaceholder="Search item name, group or HSN…"
              searchText={(r) => `${r.item_name} ${r.stock_group ?? ""} ${r.hsn_code ?? ""}`}
              defaultSortKey="item_name"
              defaultSortDir="asc"
              emptyMessage="No stock items found — import a Tally XML export to populate the item master."
            />
          </>
        )}
      </div>
    </div>
  )
}
