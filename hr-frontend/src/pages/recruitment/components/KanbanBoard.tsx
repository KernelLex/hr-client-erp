import { PipelineData } from "../types"
import { KanbanColumn } from "./KanbanColumn"

interface Props {
  pipeline: PipelineData
  onCardClick: (name: string) => void
}

export function KanbanBoard({ pipeline, onCardClick }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-6 pt-4">
      {pipeline.stages.map(({ stage, applicants }) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          applicants={applicants}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  )
}
