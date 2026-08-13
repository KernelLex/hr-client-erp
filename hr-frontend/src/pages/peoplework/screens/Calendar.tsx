// Scheduling systems — Calendar, Meetings and Reminders, all backed by Event.
// Create entries and close them out as they pass.
import { SystemPage } from "../SystemPage"
import { calendarGet, calendarPost } from "../client"
import type { ModulePayload, Row } from "../types"
import type { FieldSpec } from "../components/RecordDrawer"

const STATUS_ACTIONS = {
  title: (row: Row) => String(row["subject"] ?? "Event"),
  actions: [
    {
      label: "Mark Complete",
      variant: "primary" as const,
      hidden: (row: Row) => row["status"] === "Completed",
      run: (row: Row) => calendarPost("set_event_status", { name: row["id"], status: "Completed" }),
    },
    {
      label: "Cancel",
      variant: "danger" as const,
      hidden: (row: Row) => row["status"] === "Cancelled",
      run: (row: Row) => calendarPost("set_event_status", { name: row["id"], status: "Cancelled" }),
    },
    {
      label: "Reopen",
      hidden: (row: Row) => row["status"] === "Open",
      run: (row: Row) => calendarPost("set_event_status", { name: row["id"], status: "Open" }),
    },
  ],
}

const CATEGORY_OPTS = ["Event", "Meeting", "Call", "Other"].map((c) => ({ value: c, label: c }))

export function CalendarPage() {
  const fields: FieldSpec[] = [
    { name: "subject", label: "Title", type: "text", required: true, placeholder: "Event title" },
    { name: "category", label: "Type", type: "select", options: CATEGORY_OPTS, default: "Event", half: true },
    { name: "all_day", label: "All day", type: "checkbox", half: true },
    { name: "starts_on", label: "Starts", type: "datetime", required: true, half: true },
    { name: "ends_on", label: "Ends", type: "datetime", half: true },
    { name: "description", label: "Details", type: "textarea" },
  ]
  return (
    <SystemPage
      queryKey="cal_calendar"
      title="Calendar"
      fetcher={() => calendarGet<ModulePayload>("get_calendar")}
      searchPlaceholder="Search events..."
      create={{ label: "New Event", drawerTitle: "New Event", submitLabel: "Add Event", successMessage: "Event added", fields, submit: (v) => calendarPost("create_event", v) }}
      detail={STATUS_ACTIONS}
    />
  )
}

export function MeetingsPage() {
  const fields: FieldSpec[] = [
    { name: "subject", label: "Meeting", type: "text", required: true, placeholder: "Meeting subject" },
    { name: "starts_on", label: "Starts", type: "datetime", required: true, half: true },
    { name: "ends_on", label: "Ends", type: "datetime", half: true },
    { name: "description", label: "Agenda", type: "textarea" },
  ]
  return (
    <SystemPage
      queryKey="cal_meetings"
      title="Meetings"
      fetcher={() => calendarGet<ModulePayload>("get_meetings")}
      searchPlaceholder="Search meetings..."
      create={{ label: "Schedule Meeting", drawerTitle: "Schedule Meeting", submitLabel: "Schedule", successMessage: "Meeting scheduled", fields, submit: (v) => calendarPost("create_event", { ...v, category: "Meeting" }) }}
      detail={STATUS_ACTIONS}
    />
  )
}

export function RemindersPage() {
  const fields: FieldSpec[] = [
    { name: "subject", label: "Reminder", type: "text", required: true, placeholder: "Remind me to..." },
    { name: "starts_on", label: "When", type: "datetime", required: true },
    { name: "description", label: "Notes", type: "textarea" },
  ]
  return (
    <SystemPage
      queryKey="cal_reminders"
      title="Reminders"
      fetcher={() => calendarGet<ModulePayload>("get_reminders")}
      searchPlaceholder="Search reminders..."
      create={{ label: "New Reminder", drawerTitle: "New Reminder", submitLabel: "Set Reminder", successMessage: "Reminder set", fields, submit: (v) => calendarPost("create_event", { ...v, category: "Other", send_reminder: 1 }) }}
      detail={STATUS_ACTIONS}
    />
  )
}
