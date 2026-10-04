import { TabbedHub } from "@/components/layout/TabbedHub"
import { PipelineBoard } from "@/pages/crm/PipelineBoard"
import { EnquiriesPage } from "@/pages/crm/EnquiriesPage"
import { OpportunitiesPage } from "@/pages/crm/OpportunitiesPage"
import { ContactsPage } from "@/pages/crm/ContactsPage"
import { FollowupsPage } from "@/pages/crm/FollowupsPage"
import { SalesTeamPage } from "@/pages/crm/SalesTeamPage"

// CRM (Sales) — pipeline + its sub-screens under one entry. Pipeline is the
// default tab. Deep routes (/crm/:id, /crm/new, /crm/enquiries …) still resolve.
export function CrmHub() {
  return (
    <TabbedHub
      title="CRM"
      subtitle="Pipeline & leads"
      crumb="Sales / CRM"
      tabs={[
        { key: "pipeline", label: "Pipeline", element: <PipelineBoard /> },
        { key: "enquiries", label: "Enquiries", element: <EnquiriesPage /> },
        { key: "opportunities", label: "Opportunities", element: <OpportunitiesPage /> },
        { key: "contacts", label: "Customer Contacts", element: <ContactsPage /> },
        { key: "followups", label: "Follow-ups", element: <FollowupsPage /> },
        { key: "team", label: "Sales Team", element: <SalesTeamPage /> },
      ]}
    />
  )
}
