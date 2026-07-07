interface ChartCardProps {
  label: string
  children: React.ReactNode
  height?: number
}

export function ChartCard({ label, children, height = 180 }: ChartCardProps) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-2" style={{ height }}>
        {children}
      </div>
    </div>
  )
}
