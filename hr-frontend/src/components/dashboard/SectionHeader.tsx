export function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h2 className="text-[17px] font-semibold mb-2.5 flex items-center gap-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
      {icon}
      {children}
    </h2>
  )
}

export function SectionSubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold mt-3 mb-2" style={{ color: "var(--text-secondary)", letterSpacing: "-0.005em" }}>
      {children}
    </h3>
  )
}
