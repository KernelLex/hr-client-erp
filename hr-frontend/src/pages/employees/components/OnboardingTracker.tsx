import { useState } from "react"
import { Check, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DocumentChecklist } from "./DocumentChecklist"
import { ITSetupChecklist } from "./ITSetupChecklist"
import { useUpdateOnboardingStage, useSendWelcomeEmail } from "../hooks/useEmployeeLifecycle"
import type { OnboardingStage, DocumentsChecklist, ITSetupChecklist as ITChecklist } from "../types"
import { MANDATORY_DOCS } from "../types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const STAGES: { key: OnboardingStage; label: string; short: string }[] = [
  { key: "Offer Accepted", label: "Offer Accepted", short: "Offer" },
  { key: "Documents Collected", label: "Documents", short: "Docs" },
  { key: "IT Setup", label: "IT Setup", short: "IT" },
  { key: "First Day", label: "First Day", short: "Day 1" },
]

const NEXT_STAGE: Partial<Record<OnboardingStage, OnboardingStage>> = {
  "Offer Accepted": "Documents Collected",
  "Documents Collected": "IT Setup",
  "IT Setup": "First Day",
  "First Day": "Active",
}

const NEXT_LABEL: Partial<Record<OnboardingStage, string>> = {
  "Offer Accepted": "Start Document Collection",
  "Documents Collected": "Move to IT Setup",
  "IT Setup": "Move to First Day",
  "First Day": "Mark as Joined — Send Welcome Email",
}

interface Props {
  employeeId: string
  currentStage: OnboardingStage
  docsChecklist: DocumentsChecklist
  itChecklist: ITChecklist
  onStageChange?: (stage: OnboardingStage) => void
}

export function OnboardingTracker({ employeeId, currentStage, docsChecklist, itChecklist, onStageChange }: Props) {
  const [docs, setDocs] = useState<DocumentsChecklist>(docsChecklist)
  const [it, setIt] = useState<ITChecklist>(itChecklist)

  const updateStage = useUpdateOnboardingStage()
  const sendWelcome = useSendWelcomeEmail()

  const stageIndex = STAGES.findIndex((s) => s.key === currentStage)
  const isActive = currentStage !== "Active"

  function canAdvance(): { ok: boolean; reason?: string } {
    if (currentStage === "Documents Collected") {
      const missing = MANDATORY_DOCS.filter((k) => docs[k] === "pending").map((k) => k.replace(/_/g, " "))
      if (missing.length > 0) return { ok: false, reason: `Mandatory docs pending: ${missing.join(", ")}` }
    }
    if (currentStage === "IT Setup") {
      const allDone = Object.values(it).every(Boolean)
      if (!allDone) return { ok: false, reason: "Complete all IT setup tasks first" }
    }
    return { ok: true }
  }

  async function handleAdvance() {
    const next = NEXT_STAGE[currentStage]
    if (!next) return
    const { ok, reason } = canAdvance()
    if (!ok) { toast.error(reason); return }

    const checklistData = currentStage === "Documents Collected" ? docs : currentStage === "IT Setup" ? it : undefined

    try {
      await updateStage.mutateAsync({ employee_id: employeeId, stage: next, checklist_data: checklistData })
      if (next === "Active") {
        await sendWelcome.mutateAsync(employeeId)
        toast.success("Employee marked as joined! Welcome email sent.")
      } else {
        toast.success(`Moved to ${next}`)
      }
      onStageChange?.(next)
    } catch {
      toast.error("Failed to update stage")
    }
  }

  const { ok: canGo, reason: blockReason } = canAdvance()

  return (
    <div>
      {/* Stepper */}
      <div className="flex items-center mb-6">
        {STAGES.map((stage, i) => {
          const done = i < stageIndex || currentStage === "Active"
          const active = i === stageIndex && currentStage !== "Active"
          return (
            <div key={stage.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                  done ? "bg-green-500 border-green-500 text-white"
                    : active ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-gray-200 text-gray-400"
                )}>
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span className={cn("text-[10px] mt-1 font-medium", active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400")}>
                  {stage.short}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-1 mb-4 transition-colors", done ? "bg-green-400" : "bg-gray-200")} />
              )}
            </div>
          )
        })}
        {/* Active end state */}
        <div className="flex items-center">
          <div className={cn("w-0.5 h-0.5 mx-1 mb-4 flex-1", currentStage === "Active" ? "bg-green-400" : "bg-gray-200")} />
          <div className="flex flex-col items-center">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all", currentStage === "Active" ? "bg-green-500 border-green-500 text-white" : "bg-white border-gray-200 text-gray-400")}>
              {currentStage === "Active" ? <Check size={14} /> : "✓"}
            </div>
            <span className={cn("text-[10px] mt-1 font-medium", currentStage === "Active" ? "text-green-600" : "text-gray-400")}>Active</span>
          </div>
        </div>
      </div>

      {/* Current stage checklist */}
      {currentStage === "Offer Accepted" && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-600">
          Offer has been accepted. Begin collecting required documents to proceed.
        </div>
      )}

      {currentStage === "Documents Collected" && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Document Collection</p>
          <DocumentChecklist checklist={docs} onChange={(k, v) => setDocs((d) => ({ ...d, [k]: v }))} />
        </div>
      )}

      {currentStage === "IT Setup" && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">IT Setup Tasks</p>
          <ITSetupChecklist checklist={it} onChange={(k, v) => setIt((d) => ({ ...d, [k]: v }))} />
        </div>
      )}

      {currentStage === "First Day" && (
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 mb-4 text-sm text-orange-700">
          All setup complete. Click below to mark the employee as joined and send a welcome email.
        </div>
      )}

      {currentStage === "Active" && (
        <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-sm text-green-700 flex items-center gap-2">
          <Check size={16} />
          Onboarding complete — employee is active.
        </div>
      )}

      {/* Advance button */}
      {isActive && NEXT_STAGE[currentStage] && (
        <div className="mt-4">
          {!canGo && blockReason && (
            <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
              <span>⚠</span> {blockReason}
            </p>
          )}
          <Button
            className={cn("w-full gap-2", currentStage === "First Day" ? "bg-green-600 hover:bg-green-700 text-white" : "")}
            disabled={!canGo || updateStage.isPending || sendWelcome.isPending}
            onClick={handleAdvance}
          >
            {(updateStage.isPending || sendWelcome.isPending) ? (
              <><Loader2 size={14} className="animate-spin" />Updating…</>
            ) : currentStage === "First Day" ? (
              <><Mail size={14} />{NEXT_LABEL[currentStage]}</>
            ) : (
              <><Check size={14} />{NEXT_LABEL[currentStage]}</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
