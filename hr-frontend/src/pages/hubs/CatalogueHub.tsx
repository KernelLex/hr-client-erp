import { TabbedHub } from "@/components/layout/TabbedHub"
import { MaterialsPage } from "@/pages/quotation/MaterialsPage"
import { FinishesPage } from "@/pages/quotation/FinishesPage"
import { HardwarePage } from "@/pages/quotation/HardwarePage"
import { UnitsPage } from "@/pages/quotation/UnitsPage"
import { PricingMethodsPage } from "@/pages/quotation/PricingMethodsPage"
import { TemplatesPage } from "@/pages/quotation/TemplatesPage"

// Studio Catalogue (Quotation Studio) — the master-data screens bundled under
// one entry. Each tab is the original page; the standalone routes still work.
export function CatalogueHub() {
  return (
    <TabbedHub
      title="Studio Catalogue"
      subtitle="Materials, finishes, hardware, units, pricing & templates"
      crumb="Sales / Quotation Studio / Catalogue"
      tabs={[
        { key: "materials", label: "Materials", element: <MaterialsPage /> },
        { key: "finishes", label: "Finishes", element: <FinishesPage /> },
        { key: "hardware", label: "Hardware", element: <HardwarePage /> },
        { key: "units", label: "Units", element: <UnitsPage /> },
        { key: "pricing", label: "Pricing Methods", element: <PricingMethodsPage /> },
        { key: "templates", label: "Templates", element: <TemplatesPage /> },
      ]}
    />
  )
}
