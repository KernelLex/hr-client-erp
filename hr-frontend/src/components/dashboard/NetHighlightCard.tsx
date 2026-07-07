interface NetHighlightCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}

export function NetHighlightCard({ label, value, sub }: NetHighlightCardProps) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: `linear-gradient(135deg, var(--brand-primary), var(--bg-sidebar-hover))`, color: "var(--cream)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--gold)" }}>
        {label}
      </div>
      <div className="font-heading mt-2 text-3xl" style={{ color: "var(--cream)", letterSpacing: "-0.5px" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1.5" style={{ color: "var(--gold-light)" }}>
          {sub}
        </div>
      )}
    </div>
  )
}
