import { CheckCircle2, Circle } from "lucide-react"
import type { ITSetupChecklist } from "../types"
import { IT_LABELS } from "../types"
import { cn } from "@/lib/utils"

interface Props {
  checklist: ITSetupChecklist
  onChange: (key: keyof ITSetupChecklist, value: boolean) => void
  readonly?: boolean
}

export function ITSetupChecklist({ checklist, onChange, readonly = false }: Props) {
  const keys = Object.keys(checklist) as (keyof ITSetupChecklist)[]
  const done = keys.filter((k) => checklist[k]).length
  const total = keys.length

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-gray-700">{done}/{total} tasks complete</span>
        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {keys.map((key) => {
          const checked = checklist[key]
          return (
            <button
              key={key}
              disabled={readonly}
              onClick={() => !readonly && onChange(key, !checked)}
              className={cn(
                "w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors text-left",
                checked ? "bg-purple-50 border border-purple-100" : "bg-white border border-gray-100 hover:bg-gray-50",
                readonly && "cursor-default"
              )}
            >
              {checked
                ? <CheckCircle2 size={16} className="text-purple-600 shrink-0" />
                : <Circle size={16} className="text-gray-300 shrink-0" />
              }
              <span className={cn("text-xs", checked ? "text-purple-800 font-medium" : "text-gray-600")}>
                {IT_LABELS[key]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
