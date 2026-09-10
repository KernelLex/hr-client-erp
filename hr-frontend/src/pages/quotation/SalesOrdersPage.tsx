// Quotation Studio · Sales Orders list (Phase 2 spec §4.11), stage 6. Read view
// of the approved commercial baselines produced by gated conversion; no create
// here — a Sales Order exists only by converting an approved quotation.
import { useNavigate } from "react-router-dom"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { salesOrderGet } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

export function SalesOrdersPage() {
  const navigate = useNavigate()
  return (
    <ArchetypePage
      queryKey="q_sales_orders"
      title="Sales Orders"
      workspaceLabel="Quotation Studio"
      fetcher={() => salesOrderGet<ModulePayload>("get_sales_orders_page")}
      searchPlaceholder="Search sales orders..."
      onRowClick={(row: Row) => navigate(`/quotation/sales-orders/${row.name}`)}
    />
  )
}
