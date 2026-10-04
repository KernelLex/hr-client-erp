import { cn } from "@/lib/utils"

/**
 * Monochrome status badge — meaning comes from icon + label + weight/border,
 * never from colour alone. Part of the monochrome UI overhaul.
 *
 *   <StatusBadge kind="success">Approved</StatusBadge>
 *   <StatusBadge kind="pending">Draft</StatusBadge>
 */
export type StatusKind = "neutral" | "info" | "success" | "pending" | "warning" | "critical"

const GLYPH: Record<StatusKind, string> = {
  neutral: "",
  info: "ⓘ",
  success: "✓",
  pending: "◴",
  warning: "△",
  critical: "⊗",
}

const VARIANT: Record<StatusKind, string> = {
  neutral: "",
  info: "info",
  success: "success",
  pending: "pending",
  warning: "warning",
  critical: "critical",
}

export function StatusBadge({
  kind = "neutral",
  children,
  showGlyph = true,
  className,
}: {
  kind?: StatusKind
  children: React.ReactNode
  showGlyph?: boolean
  className?: string
}) {
  const glyph = GLYPH[kind]
  return (
    <span className={cn("ui-badge", VARIANT[kind], className)}>
      {showGlyph && glyph ? <span aria-hidden>{glyph}</span> : null}
      {children}
    </span>
  )
}
