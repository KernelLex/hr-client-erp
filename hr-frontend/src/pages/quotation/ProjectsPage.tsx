// Quotation Studio · Project Control Screen — list (UI spec §5). Every project,
// anchored on its opportunity; opening one shows the full document chain rollup.
import { useNavigate } from "react-router-dom"
import { ArchetypePage } from "../peoplework/ArchetypePage"
import { projectGet } from "../peoplework/client"
import type { ModulePayload, Row } from "../peoplework/types"

export function ProjectsPage() {
  const navigate = useNavigate()
  return (
    <ArchetypePage
      queryKey="q_projects"
      title="Projects"
      workspaceLabel="Quotation Studio"
      fetcher={() => projectGet<ModulePayload>("list_projects")}
      searchPlaceholder="Search projects..."
      onRowClick={(row: Row) => navigate(`/quotation/projects/${row.name}`)}
    />
  )
}
