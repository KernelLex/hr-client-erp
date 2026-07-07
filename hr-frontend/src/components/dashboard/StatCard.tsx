import { cn } from "@/lib/utils"

type StatVariant = "default" | "warn" | "danger" | "success"

const VARIANT_COLOR: Record<StatVariant, string> = {
  default: "var(--brand-primary)",
  warn: "#b8860b",
  danger: "var(--color-danger)",
  success: "var(--color-success)",
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  variant?: StatVariant
  linkLabel?: string
  onClick?: () => void
  className?: string
}

export function StatCard({ label, value, sub, variant = "default", linkLabel, onClick, className }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn("rounded-xl p-4 transition-all duration-200", onClick && "cursor-pointer", className)}
      style={{ background: "#fff", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}
      onMouseEnter={(e) => {
        if (!onClick) return
        e.currentTarget.style.borderColor = "var(--gold)"
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"
        e.currentTarget.style.transform = "translateY(-1px)"
      }}
      onMouseLeave={(e) => {
        if (!onClick) return
        e.currentTarget.style.borderColor = ""
        e.currentTarget.style.boxShadow = "var(--shadow-card)"
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="font-heading mt-2 text-2xl" style={{ color: VARIANT_COLOR[variant], letterSpacing: "-0.5px" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          {sub}
        </div>
      )}
      {linkLabel && (
        <div
          className="text-[10px] mt-2 font-medium inline-block"
          style={{ color: "var(--brand-primary)", textDecoration: "underline", textDecorationColor: "var(--gold)", textUnderlineOffset: "2px" }}
        >
          {linkLabel}
        </div>
      )}
    </div>
  )
}
