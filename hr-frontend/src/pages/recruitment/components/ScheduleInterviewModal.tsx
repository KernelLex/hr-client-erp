import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useScheduleInterviewMutation, useInterviewRounds } from "../hooks/useRecruitment"

interface Props {
  open: boolean
  applicantName: string
  jobOpeningName?: string
  onClose: () => void
}

export function ScheduleInterviewModal({ open, applicantName, onClose }: Props) {
  const { data: roundsData } = useInterviewRounds()
  const schedule = useScheduleInterviewMutation()
  const [form, setForm] = useState({ interview_round: "", scheduled_on: "", from_time: "", to_time: "" })

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function handleSubmit() {
    if (!form.interview_round || !form.scheduled_on || !form.from_time || !form.to_time) return
    schedule.mutate(
      { job_applicant: applicantName, ...form },
      { onSuccess: () => { onClose(); setForm({ interview_round: "", scheduled_on: "", from_time: "", to_time: "" }) } }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Interview Round *</label>
            <select
              className="w-full text-sm border rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
              value={form.interview_round}
              onChange={(e) => set("interview_round", e.target.value)}
            >
              <option value="">Select round…</option>
              {roundsData?.rounds?.map((r: { name: string; round_name: string }) => (
                <option key={r.name} value={r.name}>{r.round_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Date *</label>
            <Input type="date" value={form.scheduled_on} onChange={(e) => set("scheduled_on", e.target.value)} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-700 mb-1 block">From *</label>
              <Input type="time" value={form.from_time} onChange={(e) => set("from_time", e.target.value + ":00")} />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-700 mb-1 block">To *</label>
              <Input type="time" value={form.to_time} onChange={(e) => set("to_time", e.target.value + ":00")} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!form.interview_round || !form.scheduled_on || !form.from_time || !form.to_time || schedule.isPending}
            onClick={handleSubmit}
          >
            {schedule.isPending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
