import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, ExternalLink, Phone, Mail, ChevronDown, X } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useCandidate, useMoveCandidateMutation, useUpdateCandidateNotesMutation } from "../hooks/useRecruitment"
import { PipelineStage } from "../types"
import { formatDate } from "@/lib/dateUtils"
import { RejectCandidateModal } from "./RejectCandidateModal"
import { ScheduleInterviewModal } from "./ScheduleInterviewModal"

const STAGE_COLORS: Record<PipelineStage, string> = {
  "Application Received": "bg-gray-100 text-gray-700",
  "Screening":            "bg-blue-100 text-blue-700",
  "Interview":            "bg-purple-100 text-purple-700",
  "Offer Sent":           "bg-orange-100 text-orange-700",
  "Hired":                "bg-green-100 text-green-700",
  "Rejected":             "bg-red-100 text-red-700",
}

const INTERVIEW_STATUS_COLORS: Record<string, string> = {
  "Pending":      "bg-yellow-100 text-yellow-700",
  "Under Review": "bg-blue-100 text-blue-700",
  "Cleared":      "bg-green-100 text-green-700",
  "Rejected":     "bg-red-100 text-red-700",
}

const MOVEABLE_STAGES: PipelineStage[] = ["Application Received", "Screening", "Interview", "Rejected"]

interface Props {
  candidateName: string | null
  open: boolean
  onClose: () => void
  jobOpeningName?: string
}

export function CandidateDetailDrawer({ candidateName, open, onClose, jobOpeningName }: Props) {
  const { data, isLoading } = useCandidate(open ? candidateName : null)
  const move = useMoveCandidateMutation()
  const updateNotes = useUpdateCandidateNotesMutation()
  const [notes, setNotes] = useState("")
  const [notesInit, setNotesInit] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  useEffect(() => {
    if (!open) setNotesInit(false)
  }, [open])

  useEffect(() => {
    if (data?.applicant && !notesInit) {
      setNotes(data.applicant.custom_internal_notes ?? "")
      setNotesInit(true)
    }
  }, [data, notesInit])

  const candidate = data?.applicant

  if (!open) return null

  return (
    <>
      {/* Overlay — covers only the kanban content area (parent must be relative) */}
      <div
        className="absolute inset-0 bg-black/40 z-10"
        onClick={() => { onClose(); setRejectOpen(false); setScheduleOpen(false) }}
      />

      {/* Drawer panel */}
      <div className="absolute inset-y-0 right-0 w-full max-w-[480px] bg-white shadow-2xl z-20 flex flex-col overflow-hidden border-l">
        {isLoading || !candidate ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 leading-tight">{candidate.applicant_name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{candidate.job_title_display}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={STAGE_COLORS[candidate.custom_pipeline_stage as PipelineStage]}>
                    {candidate.custom_pipeline_stage}
                  </Badge>
                  <button
                    onClick={() => { onClose(); setNotesInit(false) }}
                    className="flex size-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border rounded-md bg-white hover:bg-gray-50 transition-colors h-7">
                    Move to <ChevronDown size={12} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {MOVEABLE_STAGES.filter((s) => s !== candidate.custom_pipeline_stage).map((stage) => (
                      <DropdownMenuItem
                        key={stage}
                        onClick={() => move.mutate({ applicant: candidate.name, stage })}
                      >
                        {stage}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {candidate.custom_pipeline_stage !== "Rejected" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setRejectOpen(true)}
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
              <TabsList className="mx-5 mt-3 shrink-0 w-auto justify-start h-8 bg-gray-100 rounded-md p-0.5">
                {["overview", "interviews", "offer", "notes"].map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="text-xs capitalize h-7 px-3">
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                {/* Overview */}
                <TabsContent value="overview" className="px-5 py-4 space-y-4 mt-0">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail size={14} />
                      <a href={`mailto:${candidate.email_id}`} className="hover:text-blue-600">{candidate.email_id}</a>
                    </div>
                    {candidate.phone_number && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone size={14} />
                        <span>{candidate.phone_number}</span>
                      </div>
                    )}
                    {candidate.resume_link && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <ExternalLink size={14} />
                        <a href={candidate.resume_link} target="_blank" rel="noreferrer" className="hover:text-blue-600 truncate">
                          Resume / LinkedIn
                        </a>
                      </div>
                    )}
                  </div>

                  {candidate.applicant_rating !== undefined && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Rating</p>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={14} className={i < candidate.applicant_rating! ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.source && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Source</p>
                      <p className="text-sm">{candidate.source}</p>
                    </div>
                  )}

                  {candidate.cover_letter && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Cover Letter</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{candidate.cover_letter}</p>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">Applied {formatDate(candidate.creation)}</p>
                </TabsContent>

                {/* Interviews */}
                <TabsContent value="interviews" className="px-5 py-4 space-y-3 mt-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setScheduleOpen(true)}>
                    + Schedule Interview
                  </Button>
                  {data.interviews.length === 0 ? (
                    <p className="text-sm text-gray-400">No interviews scheduled.</p>
                  ) : (
                    data.interviews.map((iv: import("../types").Interview) => (
                      <div key={iv.name} className="border rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{iv.round_name ?? iv.interview_round}</p>
                          <Badge className={`text-[11px] ${INTERVIEW_STATUS_COLORS[iv.status] ?? ""}`}>
                            {iv.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatDate(iv.scheduled_on)} · {iv.from_time?.slice(0, 5)} – {iv.to_time?.slice(0, 5)}
                        </p>
                        {iv.interview_summary && (
                          <p className="text-xs text-gray-600 italic">"{iv.interview_summary}"</p>
                        )}
                        {iv.average_rating !== undefined && (
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={10} className={i < iv.average_rating! ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* Offer */}
                <TabsContent value="offer" className="px-5 py-4 mt-0">
                  {data.offer ? (
                    <div className="border rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Job Offer</p>
                        <Badge className={
                          data.offer.status === "Accepted" ? "bg-green-100 text-green-700" :
                          data.offer.status === "Rejected" ? "bg-red-100 text-red-700" :
                          "bg-orange-100 text-orange-700"
                        }>
                          {data.offer.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500">Offer date: {formatDate(data.offer.offer_date)}</p>
                      <p className="text-xs text-gray-500">Designation: {data.offer.designation}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No offer sent yet.</p>
                  )}
                </TabsContent>

                {/* Notes */}
                <TabsContent value="notes" className="px-5 py-4 mt-0">
                  <p className="text-xs text-gray-500 mb-2">Internal HR notes (not visible to candidate)</p>
                  <textarea
                    className="w-full text-sm border rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-400 min-h-[140px]"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => {
                      if (candidate && notes !== candidate.custom_internal_notes) {
                        updateNotes.mutate({ applicant: candidate.name, notes })
                      }
                    }}
                    placeholder="Add internal notes here…"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Auto-saves on blur</p>
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </div>

      <RejectCandidateModal
        open={rejectOpen}
        applicantName={candidate?.name ?? ""}
        onClose={() => setRejectOpen(false)}
      />

      <ScheduleInterviewModal
        open={scheduleOpen}
        applicantName={candidate?.name ?? ""}
        jobOpeningName={jobOpeningName}
        onClose={() => setScheduleOpen(false)}
      />
    </>
  )
}
