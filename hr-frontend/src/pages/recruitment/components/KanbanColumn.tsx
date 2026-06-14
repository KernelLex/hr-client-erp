import { PipelineStage, CandidateCard as CandidateCardType } from "../types"
import { CandidateCard } from "./CandidateCard"
import { cn } from "@/lib/utils"

const STAGE_STYLES: Record<PipelineStage, { header: string; badge: string }> = {
  "Application Received": { header: "bg-gray-100 text-gray-700", badge: "bg-gray-200 text-gray-700" },
  "Screening":            { header: "bg-blue-50 text-blue-700",  badge: "bg-blue-100 text-blue-700" },
  "Interview":            { header: "bg-purple-50 text-purple-700", badge: "bg-purple-100 text-purple-700" },
  "Offer Sent":           { header: "bg-orange-50 text-orange-700", badge: "bg-orange-100 text-orange-700" },
  "Hired":                { header: "bg-green-50 text-green-700",  badge: "bg-green-100 text-green-700" },
  "Rejected":             { header: "bg-red-50 text-red-700",    badge: "bg-red-100 text-red-700" },
}

interface Props {
  stage: PipelineStage
  applicants: CandidateCardType[]
  onCardClick: (name: string) => void
}

export function KanbanColumn({ stage, applicants, onCardClick }: Props) {
  const styles = STAGE_STYLES[stage]

  return (
    <div className="flex flex-col w-[272px] shrink-0 rounded-xl bg-gray-50 border border-gray-200">
      <div className={cn("flex items-center justify-between px-3 py-2.5 rounded-t-xl", styles.header)}>
        <span className="text-xs font-semibold">{stage}</span>
        <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded-full", styles.badge)}>
          {applicants.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-220px)]">
        {applicants.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">
            No candidates
          </div>
        ) : (
          applicants.map((candidate) => (
            <CandidateCard
              key={candidate.name}
              candidate={candidate}
              onClick={() => onCardClick(candidate.name)}
            />
          ))
        )}
      </div>
    </div>
  )
}
