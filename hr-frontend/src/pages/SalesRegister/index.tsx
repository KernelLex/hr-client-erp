import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api, apiUrl } from "@/lib/api"
import { PageHeader, DeptTabs } from "@/components/dashboard"
import { VoucherListView, VoucherDocument, type VoucherRow } from "@/pages/Operations/VoucherBrowser"
import { useAdminGuard } from "@/lib/useAdminGuard"

function useAvailableFY() {
  return useQuery({
    queryKey: ["available-fy"],
    queryFn: async () => {
      const res = await api.get(apiUrl("hr_client.api.operations.get_available_financial_years"))
      return res.data.message as string[]
    },
    staleTime: 60 * 60_000,
  })
}

export default function SalesRegisterPage() {
  const guard = useAdminGuard()
  const navigate = useNavigate()
  const { data: availableFY = [] } = useAvailableFY()
  const [vtype, setVtype] = useState<"Sales" | "Sales Order" | "PERFORMA INVOICE">("Sales")
  const [openVoucher, setOpenVoucher] = useState<VoucherRow | null>(null)
  if (guard) return guard

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <PageHeader workspaceLabel="Vera Enterprises Workspace" title="Sales Register" />
      <DeptTabs
        tabs={[
          { key: "Sales", label: "Sales Invoices" },
          { key: "Sales Order", label: "Sales Orders" },
          { key: "PERFORMA INVOICE", label: "Performa Invoices" },
        ]}
        active={vtype}
        onChange={(k) => setVtype(k as typeof vtype)}
      />
      <div className="px-6 md:px-7 pb-8">
        <VoucherListView
          vtype={vtype}
          initialFy="all"
          availableFY={availableFY}
          onBack={() => navigate("/accounting")}
          onOpen={setOpenVoucher}
        />
      </div>
      {openVoucher && (
        <VoucherDocument
          voucher={openVoucher}
          onClose={() => setOpenVoucher(null)}
          onViewParty={() => {}}
        />
      )}
    </div>
  )
}
