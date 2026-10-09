import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api, apiUrl } from "@/lib/api"
import { PageHeader } from "@/components/dashboard"
import { VoucherListView, VoucherDocument, type VoucherRow } from "@/pages/Operations/VoucherBrowser"
import { DeliveriesTab } from "./DeliveriesTab"
import { GoodsReceiptsTab } from "./GoodsReceiptsTab"
import { PurchaseOrdersTab } from "./PurchaseOrdersTab"
import { getPorterStatus } from "@/api/logistics"
import { Truck, PackageCheck, Zap, FileText, ShoppingCart } from "lucide-react"

function useAvailableFY() {
  return useQuery({
    queryKey: ["available-fy"],
    queryFn: async () => (await api.get(apiUrl("hr_client.api.operations.get_available_financial_years"))).data.message as string[],
    staleTime: 60 * 60_000,
  })
}

type Tab = "deliveries" | "grn" | "po" | "porter" | "tally"
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "deliveries", label: "Deliveries (Outbound)", icon: <Truck size={15} /> },
  { id: "grn", label: "Goods Receipts (Inbound)", icon: <PackageCheck size={15} /> },
  { id: "po", label: "Purchase Orders", icon: <ShoppingCart size={15} /> },
  { id: "porter", label: "Porter", icon: <Zap size={15} /> },
  { id: "tally", label: "Tally Dispatch", icon: <FileText size={15} /> },
]

function PorterTab() {
  const { data } = useQuery({ queryKey: ["porter-status"], queryFn: getPorterStatus, staleTime: 60_000 })
  const configured = data?.configured
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border p-5 bg-white" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Zap size={18} style={{ color: "var(--text-secondary)" }} />
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Porter — on-demand logistics</h3>
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={configured ? { background: "#ecfdf5", color: "#065f46" } : { background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}>
            {configured ? "Connected" : "Not configured"}
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {data?.message ||
            "Once the Porter API key is added, you'll be able to get fare quotes, book a rider/vehicle for a delivery, and track it live — with status flowing back onto the delivery automatically."}
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {["Quote", "Create order", "Live track", "Cancel", "Webhooks"].map((c) => (
            <div key={c} className="text-center text-[11px] py-2 rounded-lg" style={{ background: "var(--bg-subtle)", color: "var(--text-tertiary)" }}>{c}</div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}>
        <p className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>How it will work</p>
        Porter is India intra-city goods delivery (2-wheeler on the API today; larger vehicles rolling out). Each delivery can be
        booked with Porter from its detail panel; the Porter order id, status and live-tracking link are stored on the delivery, and
        Porter webhooks keep the status current. Until the key is provided, manage deliveries manually under the Deliveries tab.
      </div>
    </div>
  )
}

export default function LogisticsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>("deliveries")
  const { data: availableFY = [] } = useAvailableFY()
  const [openVoucher, setOpenVoucher] = useState<VoucherRow | null>(null)

  // Deep-link to a specific tab, e.g. /logistics?tab=po (from search / quick links).
  useEffect(() => {
    const t = searchParams.get("tab") as Tab | null
    if (t && ["deliveries", "grn", "po", "porter", "tally"].includes(t)) setTab(t)
    else if (searchParams.get("newpo") === "1") setTab("po")
  }, [searchParams])

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <PageHeader workspaceLabel="Logistics" title="Deliveries, Goods Receipts & Transport" />
      <div className="px-6 md:px-7 pb-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b overflow-x-auto" style={{ borderColor: "var(--border-subtle)" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
              style={tab === t.id
                ? { borderColor: "var(--text-primary)", color: "var(--text-primary)" }
                : { borderColor: "transparent", color: "var(--text-tertiary)" }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "deliveries" && <DeliveriesTab />}
        {tab === "grn" && <GoodsReceiptsTab />}
        {tab === "po" && <PurchaseOrdersTab />}
        {tab === "porter" && <PorterTab />}
        {tab === "tally" && (
          <>
            <div className="mb-4 px-4 py-3 rounded-xl text-xs" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
              Dispatch records derived from Tally Delivery Note vouchers (reference only — manage live deliveries under the Deliveries tab).
            </div>
            <VoucherListView vtype="Delivery Note" initialFy="all" availableFY={availableFY}
              onBack={() => navigate("/accounting")} backLabel="Accounting" onOpen={setOpenVoucher} />
          </>
        )}
      </div>
      {openVoucher && <VoucherDocument voucher={openVoucher} onClose={() => setOpenVoucher(null)} onViewParty={() => {}} />}
    </div>
  )
}
