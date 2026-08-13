// Notes — company-wide employee-notes feed. The admin logs observations on the
// team, tagged Good / Bad / Neutral; they surface on the employee profile.
import { useQuery } from "@tanstack/react-query"
import { SystemPage } from "../SystemPage"
import { notesGet, notesPost } from "../client"
import type { ModulePayload } from "../types"

export function NotesPage() {
  const { data: emps } = useQuery({
    queryKey: ["notes_employee_options"],
    queryFn: () => notesGet<{ options: { value: string; label: string }[] }>("get_employee_options"),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <SystemPage
      queryKey="notes_feed"
      title="Notes"
      fetcher={() => notesGet<ModulePayload>("get_all_notes")}
      searchPlaceholder="Search notes..."
      create={{
        label: "Add Note",
        drawerTitle: "New Note",
        submitLabel: "Save Note",
        successMessage: "Note added",
        fields: [
          { name: "employee", label: "Employee", type: "select", required: true, options: emps?.options ?? [], placeholder: "Select employee" },
          {
            name: "tag",
            label: "Tag",
            type: "select",
            required: true,
            default: "Neutral",
            options: [
              { value: "Good", label: "Good" },
              { value: "Neutral", label: "Neutral" },
              { value: "Bad", label: "Concern" },
            ],
          },
          { name: "note_content", label: "Note", type: "textarea", required: true, placeholder: "Observation..." },
        ],
        submit: (v) => notesPost("create_note", v),
      }}
    />
  )
}
