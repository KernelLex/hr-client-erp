import { CheckCircle2, Clock, MinusCircle, AlertTriangle } from "lucide-react"
import type { DocumentsChecklist, DocStatus } from "../types"
import { DOC_LABELS, MANDATORY_DOCS } from "../types"
import { cn } from "@/lib/utils"

interface Props {
  checklist: DocumentsChecklist
  onChange: (key: keyof DocumentsChecklist, status: DocStatus) => void
  readonly?: boolean
}

const STATUS_CONFIG: Record<DocStatus, { icon: React.ReactNode; label: string; color: string }> = {
  received: { icon: <CheckCircle2 size={14} />, label: "Received", color: "text-green-600" },
  pending: { icon: <Clock size={14} />, label: "Pending", color: "text-amber-500" },
  waived: { icon: <MinusCircle size={14} />, label: "Waived", color: "text-gray-400" },
}

export function DocumentChecklist({ checklist, onChange, readonly = false }: Props) {
  const keys = Object.keys(checklist) as (keyof DocumentsChecklist)[]
  const total = keys.length
  const done = keys.filter((k) => checklist[k] !== "pending").length
  const mandatoryPending = MANDATORY_DOCS.filter((k) => checklist[k] === "pending")

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">{done}/{total} documents</span>
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
        </div>
      </div>

      {mandatoryPending.length > 0 && (
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>Mandatory pending: {mandatoryPending.map((k) => DOC_LABELS[k]).join(", ")}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {keys.map((key) => {
          const status = checklist[key]
          const cfg = STATUS_CONFIG[status]
          const isMandatory = MANDATORY_DOCS.includes(key)
          return (
            <div key={key} className={cn("flex items-center justify-between py-2 px-3 rounded-lg", status === "received" ? "bg-green-50" : status === "waived" ? "bg-gray-50" : "bg-white border border-gray-100")}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("shrink-0", cfg.color)}>{cfg.icon}</span>
                <span className="text-xs text-gray-700 truncate">
                  {DOC_LABELS[key]}
                  {isMandatory && <span className="text-red-400 ml-0.5">*</span>}
                </span>
              </div>
              {!readonly && (
                <div className="flex gap-1 shrink-0 ml-2">
                  {status !== "received" && (
                    <button onClick={() => onChange(key, "received")} className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                      Received
                    </button>
                  )}
                  {status !== "waived" && (
                    <button onClick={() => onChange(key, "waived")} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                      Waive
                    </button>
                  )}
                  {status !== "pending" && (
                    <button onClick={() => onChange(key, "pending")} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">* Mandatory documents — must be received or waived to proceed</p>
    </div>
  )
}
