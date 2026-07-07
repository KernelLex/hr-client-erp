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
  { key: "item_name", header: "Item", render: (r) => <span className="font-medium">{r.item_name}</span> },
  { key: "stock_group", header: "Group", render: (r) => r.stock_group || "—" },
  { key: "hsn_code", header: "HSN Code", render: (r) => r.hsn_code || "—" },
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

export default function InventoryPage() {
  const guard = useAdminGuard()
  const { data, isLoading } = useStockItems()
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
      <div className="px-6 md:px-7 pb-8">
        <div
          className="mb-5 px-4 py-3 rounded-xl text-xs"
          style={{ background: "var(--color-info-bg)", color: "#2c4a3a", border: "0.5px solid var(--info-border, #c4d4c4)" }}
        >
          Item master imported from Tally exports — standard rate, HSN and GST% reflect the last uploaded XML. There is no live warehouse/bin-level stock tracking yet.
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--gold)" }} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.item_name}
            searchable
            searchPlaceholder="Search item name or stock group..."
            searchText={(r) => `${r.item_name} ${r.stock_group ?? ""} ${r.hsn_code ?? ""}`}
            defaultSortKey="item_name"
            defaultSortDir="asc"
            emptyMessage="No stock items found — import a Tally XML export to populate the item master."
          />
        )}
      </div>
    </div>
  )
}
