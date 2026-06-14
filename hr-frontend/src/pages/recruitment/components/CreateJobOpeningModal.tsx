import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateJobOpeningMutation, useInterviewRounds, useDesignations, useDepartments } from "../hooks/useRecruitment"
import { Plus, Trash2 } from "lucide-react"

interface RoundRow {
  interview_round: string
  is_required: number
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (name: string) => void
}

export function CreateJobOpeningModal({ open, onClose, onCreated }: Props) {
  const create = useCreateJobOpeningMutation()
  const { data: roundsData } = useInterviewRounds()
  const { data: designations = [] } = useDesignations()
  const { data: departments = [] } = useDepartments()

  const [form, setForm] = useState({
    job_title: "", designation: "", department: "", description: "",
    employment_type: "", location: "", lower_range: "", upper_range: "",
  })
  const [rounds, setRounds] = useState<RoundRow[]>([])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function addRound() {
    setRounds((r) => [...r, { interview_round: "", is_required: 1 }])
  }

  function removeRound(i: number) {
    setRounds((r) => r.filter((_, idx) => idx !== i))
  }

  function handleSubmit() {
    if (!form.job_title || !form.designation) return
    const payload = {
      ...form,
      lower_range: form.lower_range ? Number(form.lower_range) : undefined,
      upper_range: form.upper_range ? Number(form.upper_range) : undefined,
      interview_rounds: rounds
        .filter((r) => r.interview_round)
        .map((r, i) => ({ sequence: i + 1, interview_round: r.interview_round, is_required: r.is_required })),
    }
    create.mutate(payload, {
      onSuccess: (data) => {
        onClose()
        if (onCreated && data?.job_opening?.name) onCreated(data.job_opening.name)
      },
    })
  }

  const selectClass = "w-full text-sm border rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Job Opening</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700 mb-1 block">Job Title *</label>
              <Input placeholder="e.g. Senior Accounts Manager" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Designation *</label>
              <select className={selectClass} value={form.designation} onChange={(e) => set("designation", e.target.value)}>
                <option value="">Select designation…</option>
                {designations.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Department</label>
              <select className={selectClass} value={form.department} onChange={(e) => set("department", e.target.value)}>
                <option value="">Select department…</option>
                {departments.map((d) => (
                  <option key={d.name} value={d.name}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Employment Type</label>
              <select className={selectClass} value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)}>
                <option value="">Select…</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Location</label>
              <Input placeholder="Bangalore" value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Salary From (₹)</label>
              <Input type="number" placeholder="800000" value={form.lower_range} onChange={(e) => set("lower_range", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Salary To (₹)</label>
              <Input type="number" placeholder="1200000" value={form.upper_range} onChange={(e) => set("upper_range", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
              <textarea
                className="w-full text-sm border rounded-lg p-2.5 resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder="We are looking for…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Interview Round Sequence</label>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={addRound}>
                <Plus size={12} className="mr-1" /> Add Round
              </Button>
            </div>
            <div className="space-y-2">
              {rounds.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}.</span>
                  <select
                    className="flex-1 text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    value={r.interview_round}
                    onChange={(e) => {
                      const updated = [...rounds]
                      updated[i] = { ...updated[i], interview_round: e.target.value }
                      setRounds(updated)
                    }}
                  >
                    <option value="">Select round…</option>
                    {roundsData?.rounds?.map((rd: { name: string; round_name: string }) => (
                      <option key={rd.name} value={rd.name}>{rd.round_name}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <input
                      type="checkbox"
                      checked={r.is_required === 1}
                      onChange={(e) => {
                        const updated = [...rounds]
                        updated[i] = { ...updated[i], is_required: e.target.checked ? 1 : 0 }
                        setRounds(updated)
                      }}
                    /> Required
                  </label>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={() => removeRound(i)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
              {rounds.length === 0 && (
                <p className="text-xs text-gray-400">No rounds added. Click "+ Add Round" to add.</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.job_title || !form.designation || create.isPending} onClick={handleSubmit}>
            {create.isPending ? "Creating…" : "Create Job Opening"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
