import { cn } from "@/lib/utils"
import { JobOpeningListItem } from "../types"
import { Plus, ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  jobOpenings: JobOpeningListItem[]
  selectedJobOpening: string | null
  onSelect: (name: string) => void
  onCreateNew: () => void
  isLoading: boolean
}

export function JobOpeningsSidebar({ jobOpenings, selectedJobOpening, onSelect, onCreateNew, isLoading }: Props) {
  const [closedExpanded, setClosedExpanded] = useState(false)

  const unique = Array.from(new Map(jobOpenings.map((j) => [j.name, j])).values())
  const open = unique.filter((j) => j.status === "Open")
  const closed = unique.filter((j) => j.status === "Closed")

  if (isLoading) {
    return (
      <div className="w-64 border-r bg-white flex flex-col shrink-0 p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="w-64 border-r bg-white flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Job Openings</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onCreateNew} title="New Job Opening">
          <Plus size={14} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {open.length === 0 && (
          <p className="text-xs text-gray-400 px-2 py-4 text-center">No open job openings</p>
        )}
        {open.map((job, index) => (
          <JobOpeningItem key={`${job.name}-${index}`} job={job} isSelected={selectedJobOpening === job.name} onClick={() => onSelect(job.name)} />
        ))}

        {closed.length > 0 && (
          <div className="pt-2">
            <button
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 w-full"
              onClick={() => setClosedExpanded((v) => !v)}
            >
              {closedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Closed ({closed.length})
            </button>
            {closedExpanded && closed.map((job, index) => (
              <JobOpeningItem key={`${job.name}-closed-${index}`} job={job} isSelected={selectedJobOpening === job.name} onClick={() => onSelect(job.name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function JobOpeningItem({ job, isSelected, onClick }: { job: JobOpeningListItem; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg transition-colors border-l-2",
        isSelected
          ? "bg-blue-50 border-l-blue-500 text-blue-900"
          : "border-l-transparent hover:bg-gray-50 text-gray-700"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight line-clamp-2">{job.job_title}</p>
        <span className={cn(
          "text-[11px] font-bold rounded-full px-1.5 py-0.5 shrink-0 mt-0.5",
          isSelected ? "bg-blue-200 text-blue-800" : "bg-gray-100 text-gray-600"
        )}>
          {job.applicant_counts.total}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{job.department} · {job.designation}</p>
    </button>
  )
}
