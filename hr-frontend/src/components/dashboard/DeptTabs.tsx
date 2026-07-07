export interface DeptTab {
  key: string
  label: string
  badge?: number
}

interface DeptTabsProps {
  tabs: DeptTab[]
  active: string
  onChange: (key: string) => void
}

export function DeptTabs({ tabs, active, onChange }: DeptTabsProps) {
  return (
    <div className="flex gap-2 px-6 md:px-7 mb-5 flex-wrap">
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full transition-all"
            style={
              isActive
                ? { background: "var(--brand-primary)", color: "#fff", border: "0.5px solid var(--brand-primary)" }
                : { background: "#fff", color: "var(--text-secondary)", border: "var(--border-card)" }
            }
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                style={isActive ? { background: "var(--gold)", color: "var(--brand-primary)" } : { background: "var(--brand-primary)", color: "#fff" }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
