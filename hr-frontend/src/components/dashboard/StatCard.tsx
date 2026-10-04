import { cn } from "@/lib/utils"

type StatVariant = "default" | "warn" | "danger" | "success"

const VARIANT_COLOR: Record<StatVariant, string> = {
  default: "var(--text-primary)",
  warn: "var(--text-primary)",
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
  /** optional lucide icon, rendered as a subtle chip in the top-right */
  icon?: React.ElementType
  className?: string
}

export function StatCard({ label, value, sub, variant = "default", linkLabel, onClick, icon: Icon, className }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn("rounded-2xl p-5 transition-all duration-200", onClick && "cursor-pointer", className)}
      style={{ background: "var(--bg-surface)", border: "var(--border-card)", boxShadow: "var(--shadow-card)" }}
      onMouseEnter={(e) => {
        if (!onClick) return
        e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"
        e.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(e) => {
        if (!onClick) return
        e.currentTarget.style.boxShadow = "var(--shadow-card)"
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {label}
        </div>
        {Icon && (
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
          >
            <Icon size={16} style={{ color: "var(--text-secondary)" }} />
          </div>
        )}
      </div>
      <div
        className="font-heading mt-3 text-[28px] leading-none"
        style={{ color: VARIANT_COLOR[variant], letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          {sub}
        </div>
      )}
      {linkLabel && (
        <div
          className="text-[11px] mt-3 font-medium inline-block"
          style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: "2px" }}
        >
          {linkLabel}
        </div>
      )}
    </div>
  )
}
