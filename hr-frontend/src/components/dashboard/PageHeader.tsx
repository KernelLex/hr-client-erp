interface PageHeaderProps {
  workspaceLabel: string
  title: string
  right?: React.ReactNode
}

export function PageHeader({ workspaceLabel, title, right }: PageHeaderProps) {
  return (
    <header className="px-6 md:px-7 pt-5 pb-4 flex justify-between items-start gap-4 flex-wrap">
      <div>
        <div className="text-[10px] font-medium tracking-widest" style={{ color: "var(--text-secondary)" }}>
          {workspaceLabel.toUpperCase()}
        </div>
        <h1 className="font-heading text-[26px] mt-1" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
      </div>
      {right && <div className="flex items-center gap-2.5 flex-wrap">{right}</div>}
    </header>
  )
}

export function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs px-3.5 py-1.5 rounded-full"
      style={{ background: "#fff", border: "var(--border-card)", color: "var(--text-secondary)" }}
    >
      {children}
    </div>
  )
}
