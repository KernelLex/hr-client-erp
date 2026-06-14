import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { usePipeline } from "./hooks/useRecruitment"
import { KanbanBoard } from "./components/KanbanBoard"
import { CandidateDetailDrawer } from "./components/CandidateDetailDrawer"
import { AddCandidateModal } from "./components/AddCandidateModal"
import { ArrowLeft, UserPlus } from "lucide-react"

export function PipelinePage() {
  const { jobOpening } = useParams<{ jobOpening: string }>()
  const navigate = useNavigate()

  const { data: pipeline, isLoading } = usePipeline(jobOpening ?? null)

  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)
  const [addCandidateOpen, setAddCandidateOpen] = useState(false)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/recruitment")}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <ArrowLeft size={14} />
            Jobs
          </button>
          {pipeline && (
            <>
              <span style={{ color: "#E2E8F0" }}>/</span>
              <div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {pipeline.job_opening.job_title}
                </span>
                {(pipeline.job_opening.department || pipeline.job_opening.designation) && (
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                    {[pipeline.job_opening.department?.replace(" - V", ""), pipeline.job_opening.designation]
                      .filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {pipeline && (
          <button
            onClick={() => setAddCandidateOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white px-3 py-1.5 rounded-lg transition-all"
            style={{ backgroundColor: "#4F46E5" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#3730A3")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#4F46E5")}
          >
            <UserPlus size={13} />
            Add Candidate
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading || !pipeline ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
            Loading pipeline…
          </div>
        ) : (
          <KanbanBoard pipeline={pipeline} onCardClick={setSelectedCandidate} />
        )}

        {selectedCandidate && (
          <CandidateDetailDrawer
            candidateName={selectedCandidate}
            open={true}
            onClose={() => setSelectedCandidate(null)}
            jobOpeningName={jobOpening}
          />
        )}
      </div>

      {jobOpening && (
        <AddCandidateModal
          open={addCandidateOpen}
          jobOpeningName={jobOpening}
          onClose={() => setAddCandidateOpen(false)}
        />
      )}
    </div>
  )
}
