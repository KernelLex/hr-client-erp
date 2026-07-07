export function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xl mb-3 flex items-center gap-2" style={{ color: "var(--brand-primary)" }}>
      {icon}
      {children}
    </h2>
  )
}

export function SectionSubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading text-[15px] mt-4 mb-2.5" style={{ color: "var(--brand-primary)" }}>
      {children}
    </h3>
  )
}
