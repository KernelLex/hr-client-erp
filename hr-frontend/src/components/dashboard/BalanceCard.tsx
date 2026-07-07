interface BalanceRow {
  label: string
  value: React.ReactNode
  variant?: "default" | "warn" | "danger"
}

interface BalanceCardProps {
  label: string
  rows: BalanceRow[]
  sub?: string
  onClick?: () => void
}

const VARIANT_COLOR: Record<NonNullable<BalanceRow["variant"]>, string> = {
  default: "var(--brand-primary)",
  warn: "#b8860b",
  danger: "var(--color-danger)",
}

export function BalanceCard({ label, rows, sub, onClick }: BalanceCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-4 flex flex-col transition-all duration-200 cursor-pointer"
      style={{ background: "#fff", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--gold)"
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ""
        e.currentTarget.style.boxShadow = "var(--shadow-card)"
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between text-xs pt-1.5"
            style={i > 0 ? { borderTop: "0.5px dashed var(--border-card)" } : undefined}
          >
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{row.label}</span>
            <span className="font-heading text-sm font-semibold" style={{ color: VARIANT_COLOR[row.variant ?? "default"] }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {sub && (
        <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  )
}
