import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api, apiUrl } from "@/lib/api"
import { PageHeader } from "@/components/dashboard"
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

export default function LogisticsPage() {
  const guard = useAdminGuard()
  const navigate = useNavigate()
  const { data: availableFY = [] } = useAvailableFY()
  const [openVoucher, setOpenVoucher] = useState<VoucherRow | null>(null)
  if (guard) return guard

  return (
    <div className="min-h-full" style={{ background: "var(--bg-app)" }}>
      <PageHeader
        workspaceLabel="Vera Enterprises Workspace"
        title="Logistics — Delivery Notes"
      />
      <div className="px-6 md:px-7 pb-8">
        <div
          className="mb-5 px-4 py-3 rounded-xl text-xs"
          style={{ background: "var(--color-info-bg)", color: "#2c4a3a", border: "0.5px solid var(--info-border, #c4d4c4)" }}
        >
          Dispatch records derived from Tally Delivery Note vouchers. There is no vehicle, driver or route tracking yet.
        </div>
        <VoucherListView
          vtype="Delivery Note"
          initialFy="all"
          availableFY={availableFY}
          onBack={() => navigate("/accounting")} backLabel="Accounting"
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
