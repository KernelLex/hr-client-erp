// ── Admin identity ──────────────────────────────────────────────────────────
// Single source of truth. Update here when admin changes.
export const ADMIN_USERS  = new Set(["Administrator", "owais@veraenterprises.in"])
export const OWAIS_USERS  = ADMIN_USERS   // alias used in approval flows
export const COMPANY_NAME = "Vera Enterprises"

export const isAdmin  = (user: string | undefined) => !!user && ADMIN_USERS.has(user)
export const isOwais  = (user: string | undefined) => !!user && OWAIS_USERS.has(user)

// ── Financial year helpers ───────────────────────────────────────────────────
/** Indian FY starts 1 Apr. Returns e.g. "2026-27" for any date in Apr 2026–Mar 2027. */
export function currentFYLabel(): string {
  const now = new Date()
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${String(startYear + 1).slice(2)}`
}

export function prevFYLabel(): string {
  const now = new Date()
  const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1
  return `${startYear}-${String(startYear + 1).slice(2)}`
}

/** Returns the last N financial year labels, newest first. */
export function recentFYLabels(n = 3): string[] {
  const now = new Date()
  const latest = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return Array.from({ length: n }, (_, i) => {
    const y = latest - i
    return `${y}-${String(y + 1).slice(2)}`
  })
}
