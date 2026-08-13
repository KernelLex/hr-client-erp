// Shift Management — define Shift Types (working windows) and assign employees
// to them (Shift Assignments roster). Two operational screens.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { shiftGet, shiftPost, notesGet } from "../client"
import type { ModulePayload } from "../types"

const SHIFT_COLORS = ["Blue", "Green", "Orange", "Violet", "Cyan", "Red", "Yellow", "Pink"].map((c) => ({ value: c, label: c }))

export function ShiftTypesPage() {
  return (
    <SystemPage
      queryKey="shift_types"
      title="Shift Types"
      fetcher={() => shiftGet<ModulePayload>("get_shift_types")}
      searchPlaceholder="Search shifts..."
      create={{
        label: "New Shift",
        drawerTitle: "New Shift Type",
        submitLabel: "Create Shift",
        successMessage: "Shift created",
        fields: [
          { name: "shift_name", label: "Shift Name", type: "text", required: true, placeholder: "e.g. Factory A 08:00–16:00" },
          { name: "start_time", label: "Start Time", type: "text", required: true, placeholder: "HH:MM:SS", half: true, help: "24h, e.g. 08:00:00" },
          { name: "end_time", label: "End Time", type: "text", required: true, placeholder: "HH:MM:SS", half: true, help: "24h, e.g. 16:00:00" },
          { name: "color", label: "Colour", type: "select", options: SHIFT_COLORS, default: "Blue" },
        ],
        submit: (v) => shiftPost("create_shift_type", v),
      }}
    />
  )
}

export function ShiftAssignmentsPage() {
  const { data: emps } = useQuery({
    queryKey: ["shift_employee_options"],
    queryFn: () => notesGet<{ options: { value: string; label: string }[] }>("get_employee_options"),
    staleTime: 5 * 60 * 1000,
  })
  const { data: shifts } = useQuery({
    queryKey: ["shift_type_options"],
    queryFn: () => shiftGet<{ options: { value: string; label: string }[] }>("get_shift_type_options"),
    staleTime: 60 * 1000,
  })

  return (
    <SystemPage
      queryKey="shift_assignments"
      title="Shift Assignments"
      fetcher={() => shiftGet<ModulePayload>("get_shift_assignments")}
      searchPlaceholder="Search roster..."
      create={{
        label: "Assign Shift",
        drawerTitle: "Assign Employee to Shift",
        submitLabel: "Assign",
        successMessage: "Shift assigned",
        fields: [
          { name: "employee", label: "Employee", type: "select", required: true, options: emps?.options ?? [], placeholder: "Select employee" },
          { name: "shift_type", label: "Shift", type: "select", required: true, options: shifts?.options ?? [], placeholder: "Select shift" },
          { name: "start_date", label: "Start Date", type: "date", required: true, half: true },
          { name: "end_date", label: "End Date", type: "date", half: true, help: "Leave blank for standing" },
        ],
        submit: (v) => shiftPost("assign_shift", v),
      }}
    />
  )
}
