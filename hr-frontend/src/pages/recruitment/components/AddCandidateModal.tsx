import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAddCandidateMutation } from "../hooks/useRecruitment"

const SOURCES = ["LinkedIn", "Referral", "Job Portal", "Direct", "Other"]

interface Props {
  open: boolean
  jobOpeningName: string
  onClose: () => void
}

export function AddCandidateModal({ open, jobOpeningName, onClose }: Props) {
  const add = useAddCandidateMutation()
  const [form, setForm] = useState({
    applicant_name: "", email_id: "", phone_number: "",
    source: "", cover_letter: "", resume_link: "", applicant_rating: 0,
  })

  function set(k: string, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function handleSubmit() {
    if (!form.applicant_name || !form.email_id) return
    add.mutate(
      { job_opening: jobOpeningName, ...form, applicant_rating: form.applicant_rating || undefined },
      { onSuccess: () => { onClose(); setForm({ applicant_name: "", email_id: "", phone_number: "", source: "", cover_letter: "", resume_link: "", applicant_rating: 0 }) } }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Full Name *</label>
              <Input placeholder="Jane Smith" value={form.applicant_name} onChange={(e) => set("applicant_name", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Email *</label>
              <Input type="email" placeholder="jane@example.com" value={form.email_id} onChange={(e) => set("email_id", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Phone</label>
              <Input placeholder="+91 9876543210" value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Source</label>
              <select
                className="w-full text-sm border rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
              >
                <option value="">Select…</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Resume Link</label>
            <Input placeholder="https://linkedin.com/in/…" value={form.resume_link} onChange={(e) => set("resume_link", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Cover Letter</label>
            <textarea
              className="w-full text-sm border rounded-lg p-2.5 resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-gray-400"
              placeholder="Optional cover letter…"
              value={form.cover_letter}
              onChange={(e) => set("cover_letter", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Rating (1-5)</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("applicant_rating", n)}
                  className={`w-8 h-8 rounded-md text-sm font-medium border transition-colors ${form.applicant_rating >= n ? "bg-amber-400 border-amber-400 text-white" : "border-gray-200 text-gray-400 hover:border-amber-300"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.applicant_name || !form.email_id || add.isPending} onClick={handleSubmit}>
            {add.isPending ? "Adding…" : "Add Candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
