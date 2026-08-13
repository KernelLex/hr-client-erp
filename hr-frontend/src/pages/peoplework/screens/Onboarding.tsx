// Onboarding system — bring new hires on board. A single action provisions the
// applicant/offer/onboarding records and starts the checklist.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { onboardingGet, onboardingPost } from "../client"
import type { ModulePayload, Row } from "../types"
import type { FieldSpec } from "../components/RecordDrawer"

export function OnboardingPage() {
  const { data: desigs } = useQuery({
    queryKey: ["onboarding_designation_options"],
    queryFn: () => onboardingGet<{ options: { value: string; label: string }[] }>("get_designation_options"),
    staleTime: 5 * 60 * 1000,
  })
  const { data: depts } = useQuery({
    queryKey: ["onboarding_department_options"],
    queryFn: () => onboardingGet<{ options: { value: string; label: string }[] }>("get_department_options"),
    staleTime: 5 * 60 * 1000,
  })

  const fields: FieldSpec[] = [
    { name: "applicant_name", label: "New Hire Name", type: "text", required: true, placeholder: "Full name" },
    { name: "email", label: "Email", type: "text", required: true, placeholder: "email@example.com" },
    { name: "designation", label: "Designation", type: "select", required: true, options: desigs?.options ?? [], placeholder: "Select role" },
    { name: "department", label: "Department", type: "select", options: depts?.options ?? [], placeholder: "Select department" },
    { name: "date_of_joining", label: "Date of Joining", type: "date", required: true },
  ]

  return (
    <SystemPage
      queryKey="hrms_onboarding"
      title="Onboarding"
      fetcher={() => onboardingGet<ModulePayload>("get_onboardings")}
      searchPlaceholder="Search onboardings..."
      create={{ label: "Onboard New Hire", drawerTitle: "Onboard New Hire", submitLabel: "Start Onboarding", successMessage: "Onboarding started", fields, submit: (v) => onboardingPost("onboard_new_hire", v) }}
      detail={{
        title: (row: Row) => `Onboarding · ${row["new_hire"]}`,
        actions: [
          { label: "Move to In Process", hidden: (r: Row) => r["status"] === "In Process", run: (r: Row) => onboardingPost("set_status", { name: r["id"], status: "In Process" }) },
          { label: "Mark Completed", variant: "primary", hidden: (r: Row) => r["status"] === "Completed", run: (r: Row) => onboardingPost("set_status", { name: r["id"], status: "Completed" }) },
        ],
      }}
    />
  )
}
