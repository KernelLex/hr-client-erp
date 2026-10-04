import { TabbedHub } from "@/components/layout/TabbedHub"
import { TermsTemplatesPage } from "@/pages/quotation/TermsTemplatesPage"
import { TermsClausesPage } from "@/pages/quotation/TermsClausesPage"

// Terms (Quotation Studio) — templates + clauses under one entry.
export function TermsHub() {
  return (
    <TabbedHub
      title="Terms"
      subtitle="Templates & clauses"
      crumb="Sales / Quotation Studio / Terms"
      tabs={[
        { key: "templates", label: "Templates", element: <TermsTemplatesPage /> },
        { key: "clauses", label: "Clauses", element: <TermsClausesPage /> },
      ]}
    />
  )
}
