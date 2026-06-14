import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSubmitResignation, useSubmitExitInterview } from "../hooks/useEmployeeLifecycle"
import { Upload, FileText, X, Loader2, CheckCircle2, ThumbsUp, Minus, ThumbsDown } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const EXIT_REASONS = [
  "Better Opportunity",
  "Personal Reasons",
  "Relocation",
  "Higher Studies",
  "Compensation",
  "Work Environment",
  "Other",
]

interface Props {
  open: boolean
  onClose: () => void
  employeeId: string
  employeeName: string
}

type Step = "resignation" | "interview" | "done"
type Recommend = "Yes" | "No" | "Maybe" | null

export function ExitModal({ open, onClose, employeeId, employeeName }: Props) {
  const [step, setStep] = useState<Step>("resignation")

  // Step 1 state
  const [lastWorkingDay, setLastWorkingDay] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 2 state
  const [reason, setReason] = useState("")
  const [recommend, setRecommend] = useState<Recommend>(null)
  const [enjoyed, setEnjoyed] = useState("")
  const [improve, setImprove] = useState("")
  const [mgmtFeedback, setMgmtFeedback] = useState("")

  const submitResignation = useSubmitResignation()
  const submitInterview = useSubmitExitInterview()

  function handleFileChange(f: File | null) {
    if (!f) return
    const valid = ["application/pdf", "image/jpeg", "image/png"].includes(f.type)
    if (!valid) { toast.error("Only PDF, JPG, or PNG files accepted"); return }
    setFile(f)
  }

  async function handleResignationSubmit() {
    if (!lastWorkingDay) { toast.error("Please set the last working day"); return }
    try {
      await submitResignation.mutateAsync({
        employee_id: employeeId,
        resignation_date: new Date().toISOString().slice(0, 10),
        last_working_day: lastWorkingDay,
        resignation_letter_url: file ? `/files/${file.name}` : undefined,
      })
      toast.success("Resignation submitted")
      setStep("interview")
    } catch {
      toast.error("Failed to submit resignation")
    }
  }

  async function handleInterviewSubmit() {
    if (!reason) { toast.error("Please select a reason for leaving"); return }
    if (!recommend) { toast.error("Please answer the recommendation question"); return }
    if (!enjoyed.trim()) { toast.error("Please fill in what you enjoyed most"); return }
    if (!improve.trim()) { toast.error("Please fill in what could be improved"); return }
    try {
      await submitInterview.mutateAsync({
        employee_id: employeeId,
        exit_reason: reason,
        would_recommend: recommend,
        enjoyed_most: enjoyed,
        improvement_suggestions: improve,
        management_feedback: mgmtFeedback,
      })
      setStep("done")
    } catch {
      toast.error("Failed to submit exit interview")
    }
  }

  function handleClose() {
    setStep("resignation")
    setLastWorkingDay("")
    setFile(null)
    setReason("")
    setRecommend(null)
    setEnjoyed("")
    setImprove("")
    setMgmtFeedback("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "resignation" && "Submit Resignation"}
            {step === "interview" && "Exit Interview"}
            {step === "done" && "Thank You"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {step !== "done" && (
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", step === "resignation" ? "text-blue-600" : "text-green-600")}>
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", step === "resignation" ? "bg-blue-600 text-white" : "bg-green-500 text-white")}>
                {step === "resignation" ? "1" : <CheckCircle2 size={12} />}
              </div>
              Resignation
            </div>
            <div className="flex-1 h-px bg-gray-200" />
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", step === "interview" ? "text-blue-600" : "text-gray-400")}>
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", step === "interview" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500")}>
                2
              </div>
              Exit Interview
            </div>
          </div>
        )}

        {/* ── Step 1: Resignation Details ── */}
        {step === "resignation" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Last Working Day *</label>
              <input
                type="date"
                value={lastWorkingDay}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setLastWorkingDay(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Resignation Letter (optional)</label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
                  dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileChange(e.dataTransfer.files[0] ?? null) }}
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText size={20} className="text-blue-500 shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null) }}
                      className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">Drag & drop or click to upload</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG accepted</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
            </div>

            <Button
              className="w-full"
              disabled={!lastWorkingDay || submitResignation.isPending}
              onClick={handleResignationSubmit}
            >
              {submitResignation.isPending ? <><Loader2 size={14} className="animate-spin mr-2" />Submitting…</> : "Submit Resignation"}
            </Button>
          </div>
        )}

        {/* ── Step 2: Exit Interview ── */}
        {step === "interview" && (
          <div className="space-y-5">
            {/* Q1 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Primary reason for leaving *</label>
              <Select value={reason} onValueChange={(v) => setReason(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Q2 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Would you recommend this company to others? *</label>
              <div className="flex gap-3">
                {([["Yes", ThumbsUp, "bg-green-100 text-green-700 border-green-300"], ["Maybe", Minus, "bg-yellow-100 text-yellow-700 border-yellow-300"], ["No", ThumbsDown, "bg-red-100 text-red-700 border-red-300"]] as const).map(([val, Icon, activeClass]) => (
                  <button
                    key={val}
                    onClick={() => setRecommend(val as Recommend)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all",
                      recommend === val ? activeClass : "border-gray-200 text-gray-400 hover:border-gray-300"
                    )}
                  >
                    <Icon size={18} />
                    {val}
                  </button>
                ))}
              </div>
            </div>

            {/* Q3 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">What did you enjoy most about working here? *</label>
              <textarea
                value={enjoyed}
                onChange={(e) => setEnjoyed(e.target.value)}
                rows={3}
                placeholder="The collaborative culture, the technical challenges…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Q4 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">What could we improve? *</label>
              <textarea
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
                rows={3}
                placeholder="Better work-life balance, clearer growth paths…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Q5 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Any feedback for management? <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={mgmtFeedback}
                onChange={(e) => setMgmtFeedback(e.target.value)}
                rows={3}
                placeholder="Your thoughts on leadership, communication…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <Button
              className="w-full"
              disabled={submitInterview.isPending}
              onClick={handleInterviewSubmit}
            >
              {submitInterview.isPending ? <><Loader2 size={14} className="animate-spin mr-2" />Submitting…</> : "Submit Exit Interview"}
            </Button>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Your feedback has been recorded.</h3>
              <p className="text-sm text-gray-500 mt-1">Thank you for your service, {employeeName.split(" ")[0]}.</p>
              <p className="text-xs text-gray-400 mt-3">HR will be in touch regarding your final settlement and handover details.</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
