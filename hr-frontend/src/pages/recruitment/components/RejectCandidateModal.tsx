import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useRejectCandidateMutation } from "../hooks/useRecruitment"

interface Props {
  open: boolean
  applicantName: string
  onClose: () => void
}

export function RejectCandidateModal({ open, applicantName, onClose }: Props) {
  const [reason, setReason] = useState("")
  const reject = useRejectCandidateMutation()

  function handleSubmit() {
    if (!reason.trim()) return
    reject.mutate(
      { applicant: applicantName, rejection_reason: reason },
      { onSuccess: () => { onClose(); setReason("") } }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-600">Please provide a rejection reason.</p>
          <textarea
            className="w-full text-sm border rounded-lg p-2.5 resize-none min-h-[100px] focus:outline-none focus:ring-1 focus:ring-gray-400"
            placeholder="Does not meet technical requirements…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!reason.trim() || reject.isPending}
            onClick={handleSubmit}
          >
            {reject.isPending ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
