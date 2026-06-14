import { CandidateCard as CandidateCardType } from "../types"
import { Badge } from "@/components/ui/badge"
import { Star, ExternalLink } from "lucide-react"
import { formatDistanceToNow } from "@/lib/dateUtils"

interface Props {
  candidate: CandidateCardType
  onClick: () => void
}

export function CandidateCard({ candidate, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{candidate.applicant_name}</p>
        {candidate.resume_link && (
          <a
            href={candidate.resume_link}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-blue-500 shrink-0 mt-0.5"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      <p className="text-xs text-gray-400 truncate">{candidate.email_id}</p>

      {candidate.custom_current_interview_round_name && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-200 bg-purple-50">
          {candidate.custom_current_interview_round_name}
        </Badge>
      )}

      <div className="flex items-center justify-between">
        {candidate.applicant_rating ? (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={10}
                className={i < candidate.applicant_rating! ? "fill-amber-400 text-amber-400" : "text-gray-200"}
              />
            ))}
          </div>
        ) : (
          <span />
        )}
        <span className="text-[10px] text-gray-400">{formatDistanceToNow(candidate.creation)}</span>
      </div>

      {candidate.source && (
        <p className="text-[10px] text-gray-400">{candidate.source}</p>
      )}
    </div>
  )
}
