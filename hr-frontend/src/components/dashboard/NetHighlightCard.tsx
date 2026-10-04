interface NetHighlightCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}

export function NetHighlightCard({ label, value, sub }: NetHighlightCardProps) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--bg-inverse)", color: "var(--text-inverse)" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-inverse)", opacity: 0.7 }}>
        {label}
      </div>
      <div className="font-heading mt-2 text-3xl" style={{ color: "var(--text-inverse)", letterSpacing: "-0.5px" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1.5" style={{ color: "var(--text-inverse)", opacity: 0.6 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
