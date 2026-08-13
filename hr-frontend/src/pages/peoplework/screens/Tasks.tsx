// To-Do System — Personal Tasks (Frappe ToDo) and Team Tasks (ERPNext Task).
// Full operational systems: create, assign, move across the kanban, close out.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { todoGet, todoPost } from "../client"
import type { ModulePayload } from "../types"
import type { FieldSpec } from "../components/RecordDrawer"

const PRIORITY_OPTS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
]

export function PersonalTasksPage() {
  return (
    <SystemPage
      queryKey="todo_personal"
      title="Personal Tasks"
      fetcher={() => todoGet<ModulePayload>("get_personal_tasks")}
      searchPlaceholder="Search tasks..."
      create={{
        label: "New Task",
        drawerTitle: "New Personal Task",
        submitLabel: "Add Task",
        successMessage: "Task added",
        fields: [
          { name: "task", label: "Task", type: "textarea", required: true, placeholder: "What needs doing?" },
          { name: "priority", label: "Priority", type: "select", options: PRIORITY_OPTS, default: "Medium", half: true },
          { name: "due", label: "Due Date", type: "date", half: true },
        ],
        submit: (v) => todoPost("create_task", v),
      }}
      detail={{
        title: (row) => String(row["task"] ?? "Task"),
        actions: [
          {
            label: "Mark Complete",
            variant: "primary",
            hidden: (row) => row["status"] === "Closed",
            successMessage: "Task completed",
            run: (row) => todoPost("set_personal_status", { name: row["id"], status: "Closed" }),
          },
          {
            label: "Reopen",
            hidden: (row) => row["status"] === "Open",
            run: (row) => todoPost("set_personal_status", { name: row["id"], status: "Open" }),
          },
          {
            label: "Cancel",
            variant: "danger",
            hidden: (row) => row["status"] === "Cancelled",
            run: (row) => todoPost("set_personal_status", { name: row["id"], status: "Cancelled" }),
          },
        ],
      }}
    />
  )
}

const TEAM_PRIORITY_OPTS = [...PRIORITY_OPTS, { value: "Urgent", label: "Urgent" }]
const TEAM_STATUSES = ["Working", "Pending Review", "Completed", "Cancelled"]

export function TeamTasksPage() {
  const { data: users } = useQuery({
    queryKey: ["todo_assignable_users"],
    queryFn: () => todoGet<{ options: { value: string; label: string }[] }>("get_assignable_users"),
    staleTime: 5 * 60 * 1000,
  })

  const fields: FieldSpec[] = [
    { name: "subject", label: "Task", type: "text", required: true, placeholder: "Task title" },
    { name: "assign_to", label: "Assign To", type: "select", options: users?.options ?? [], placeholder: "Unassigned" },
    { name: "priority", label: "Priority", type: "select", options: TEAM_PRIORITY_OPTS, default: "Medium", half: true },
    { name: "due", label: "Due Date", type: "date", half: true },
    { name: "description", label: "Details", type: "textarea", placeholder: "Optional details" },
  ]

  return (
    <SystemPage
      queryKey="todo_team"
      title="Team Tasks"
      fetcher={() => todoGet<ModulePayload>("get_team_tasks")}
      searchPlaceholder="Search team tasks..."
      create={{
        label: "New Task",
        drawerTitle: "New Team Task",
        submitLabel: "Create Task",
        successMessage: "Task created",
        fields,
        submit: (v) => todoPost("create_team_task", v),
      }}
      detail={{
        title: (row) => String(row["task"] ?? "Task"),
        actions: TEAM_STATUSES.map((s) => ({
          label: s === "Completed" ? "Mark Complete" : s === "Cancelled" ? "Cancel" : `Move to ${s}`,
          variant: (s === "Completed" ? "primary" : s === "Cancelled" ? "danger" : "default") as "primary" | "danger" | "default",
          hidden: (row) => row["status"] === s,
          successMessage: `Moved to ${s}`,
          run: (row) => todoPost("set_team_status", { name: row["id"], status: s }),
        })),
      }}
    />
  )
}
