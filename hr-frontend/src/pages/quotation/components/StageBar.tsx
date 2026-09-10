// StageBar — the six-stage progress indicator carried by every Quotation Studio
// screen (Phase 2 spec §4.1): Measurement → BOQ → Costing → Quotation →
// Approval → Sales Order. `current` highlights the active stage; stages before
// it render as complete.
const STAGES = ["Measurement", "BOQ", "Costing", "Quotation", "Approval", "Sales Order"]

export function StageBar({ current }: { current: string }) {
  const activeIdx = STAGES.indexOf(current)
  return (
    <div className="mb-5 flex items-center gap-1 overflow-x-auto">
      {STAGES.map((s, i) => {
        const done = i < activeIdx
        const active = i === activeIdx
        const bg = active ? "var(--brand-primary)" : done ? "var(--gold, #c8a24a)" : "var(--cream-dark, #ebe3d3)"
        const color = active || done ? "#fff" : "var(--text-muted)"
        return (
          <div key={s} className="flex items-center">
            <div
              className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: bg, color }}
            >
              {i + 1}. {s}
            </div>
            {i < STAGES.length - 1 && (
              <div className="mx-0.5 h-px w-4" style={{ background: "var(--border, #e0d9cb)" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
