// Training system — Programs (courses) and Sessions (scheduled events).
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { trainingGet, trainingPost } from "../client"
import type { ModulePayload, Row } from "../types"
import type { FieldSpec } from "../components/RecordDrawer"

export function TrainingProgramsPage() {
  return (
    <SystemPage
      queryKey="training_programs"
      title="Training Programs"
      fetcher={() => trainingGet<ModulePayload>("get_programs")}
      searchPlaceholder="Search programs..."
      create={{
        label: "New Program",
        drawerTitle: "New Training Program",
        submitLabel: "Create",
        successMessage: "Program created",
        fields: [
          { name: "program_name", label: "Program Name", type: "text", required: true, placeholder: "e.g. Panel Saw Safety" },
          { name: "trainer_name", label: "Trainer", type: "text", placeholder: "Trainer name" },
          { name: "description", label: "Description", type: "textarea", required: true, placeholder: "What this program covers" },
        ],
        submit: (v) => trainingPost("create_program", v),
      }}
      detail={{
        title: (row: Row) => String(row["program"] ?? "Program"),
        actions: [
          { label: "Mark Complete", variant: "primary", hidden: (r: Row) => r["status"] === "Completed", run: (r: Row) => trainingPost("set_program_status", { name: r["id"], status: "Completed" }) },
          { label: "Cancel", variant: "danger", hidden: (r: Row) => r["status"] === "Cancelled", run: (r: Row) => trainingPost("set_program_status", { name: r["id"], status: "Cancelled" }) },
        ],
      }}
    />
  )
}

const EVENT_TYPE_OPTS = ["Seminar", "Theory", "Workshop", "Conference", "Exam", "Internet", "Self-Study"].map((t) => ({ value: t, label: t }))

export function TrainingSessionsPage() {
  const { data: progs } = useQuery({
    queryKey: ["training_program_options"],
    queryFn: () => trainingGet<{ options: { value: string; label: string }[] }>("get_program_options"),
    staleTime: 60 * 1000,
  })

  const fields: FieldSpec[] = [
    { name: "event_name", label: "Session Name", type: "text", required: true, placeholder: "Session title" },
    { name: "training_program", label: "Program", type: "select", options: progs?.options ?? [], placeholder: "Link to a program" },
    { name: "event_type", label: "Type", type: "select", options: EVENT_TYPE_OPTS, default: "Workshop", half: true },
    { name: "trainer_name", label: "Trainer", type: "text", half: true },
    { name: "location", label: "Location", type: "text", required: true, placeholder: "Where" },
    { name: "start_time", label: "Starts", type: "datetime", required: true, half: true },
    { name: "end_time", label: "Ends", type: "datetime", required: true, half: true },
    { name: "introduction", label: "Introduction", type: "textarea" },
  ]

  return (
    <SystemPage
      queryKey="training_sessions"
      title="Training Sessions"
      fetcher={() => trainingGet<ModulePayload>("get_events")}
      searchPlaceholder="Search sessions..."
      create={{ label: "Schedule Session", drawerTitle: "Schedule Training Session", submitLabel: "Schedule", successMessage: "Session scheduled", fields, submit: (v) => trainingPost("schedule_event", v) }}
      detail={{
        title: (row: Row) => String(row["event"] ?? "Session"),
        actions: [
          { label: "Mark Complete", variant: "primary", hidden: (r: Row) => r["status"] === "Completed", run: (r: Row) => trainingPost("set_event_status", { name: r["id"], status: "Completed" }) },
          { label: "Cancel", variant: "danger", hidden: (r: Row) => r["status"] === "Cancelled", run: (r: Row) => trainingPost("set_event_status", { name: r["id"], status: "Cancelled" }) },
        ],
      }}
    />
  )
}
