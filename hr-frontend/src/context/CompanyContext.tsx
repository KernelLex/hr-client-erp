import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "./AuthContext"
import { getMyCompanies, setActiveCompany, type CompanyBrand } from "@/api/company"
import { getActiveCompany, setActiveCompanyCache } from "@/lib/api"

export const ALL_COMPANIES = "__ALL__"

interface CompanyContextValue {
  activeCompany: string | null
  availableCompanies: CompanyBrand[]
  isGroupOwner: boolean
  isPlatformAdmin: boolean
  isLoading: boolean
  /** Switch the active company. Clears all cached queries so no stale
      other-company rows are ever shown (looks like a leak otherwise). */
  setCompany: (company: string) => Promise<void>
  /** Accent hex for a company (falls back to the brand default). */
  accentOf: (company: string | null) => string
}

const CompanyContext = createContext<CompanyContextValue>({
  activeCompany: null,
  availableCompanies: [],
  isGroupOwner: false,
  isPlatformAdmin: false,
  isLoading: true,
  setCompany: async () => {},
  accentOf: () => "#4F46E5",
})

// Group / "All companies" console accent — deliberately distinct from every
// single-company accent so the consolidated view is unmistakable at a glance.
const GROUP_ACCENT = "#334155" // slate

// ── Per-company theming ───────────────────────────────────────────────────────
// The whole app is re-tinted from the active company's accent by overriding the
// design-system CSS vars on :root. Every surface that reads var(--bg-sidebar),
// var(--gold), var(--brand-primary), var(--bg-app) etc. recolours automatically —
// sidebar, top bar, 2FA screen, primary buttons, headers.
type RGB = [number, number, number]
const DARK: RGB = [18, 22, 20]
const WHITE: RGB = [255, 255, 255]

function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

const THEME_VARS = [
  "--company-accent", "--gold", "--gold-light", "--brand-primary",
  "--brand-primary-dark", "--bg-sidebar", "--bg-sidebar-hover",
  "--bg-sidebar-active", "--bg-app",
]

function applyCompanyTheme(accentHex: string | null) {
  const root = document.documentElement.style
  if (!accentHex) {
    // Fall back to the static Vera theme in index.css.
    THEME_VARS.forEach((v) => root.removeProperty(v))
    return
  }
  let rgb: RGB
  try {
    rgb = hexToRgb(accentHex)
  } catch {
    THEME_VARS.forEach((v) => root.removeProperty(v))
    return
  }
  root.setProperty("--company-accent", accentHex)
  root.setProperty("--gold", accentHex)
  root.setProperty("--gold-light", mix(rgb, WHITE, 0.3))
  // Darkened accents keep white text readable on buttons / brand surfaces.
  root.setProperty("--brand-primary", mix(rgb, DARK, 0.42))
  root.setProperty("--brand-primary-dark", mix(rgb, DARK, 0.62))
  root.setProperty("--bg-sidebar", mix(rgb, DARK, 0.8))
  root.setProperty("--bg-sidebar-hover", mix(rgb, DARK, 0.66))
  root.setProperty("--bg-sidebar-active", mix(rgb, DARK, 0.55))
  // Very subtle full-page tint (cards stay white).
  root.setProperty("--bg-app", mix(rgb, WHITE, 0.93))
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth()
  const queryClient = useQueryClient()

  const [activeCompany, setActive] = useState<string | null>(getActiveCompany())
  const [availableCompanies, setAvailable] = useState<CompanyBrand[]>([])
  const [isGroupOwner, setIsGroupOwner] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isLoading, setLoading] = useState(true)

  // Revalidate against the server on every mount — localStorage is only a cache.
  useEffect(() => {
    let alive = true
    if (!isLoggedIn) {
      setLoading(false)
      return
    }
    setLoading(true)
    getMyCompanies()
      .then((data) => {
        if (!alive) return
        setAvailable(data.companies)
        setIsGroupOwner(data.is_group_owner)
        setIsPlatformAdmin(data.is_platform_admin)
        // Trust the server's resolved active company; reconcile the cache.
        const resolved =
          data.active_company ||
          (data.companies[0] ? data.companies[0].name : null)
        setActive(resolved)
        setActiveCompanyCache(resolved)
      })
      .catch(() => {
        /* leave whatever cache we had; endpoints still re-validate server-side */
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [isLoggedIn])

  const setCompany = useCallback(
    async (company: string) => {
      // Optimistically flip the cache so in-flight requests carry the new company.
      setActiveCompanyCache(company)
      setActive(company)
      try {
        if (company !== ALL_COMPANIES) await setActiveCompany(company)
      } catch {
        /* server re-validates anyway; ignore transient failures */
      }
      // Drop ALL cached queries so no previous-company rows survive the switch.
      queryClient.clear()
    },
    [queryClient],
  )

  const accentOf = useCallback(
    (company: string | null) => {
      if (company === ALL_COMPANIES) return GROUP_ACCENT
      const c = availableCompanies.find((x) => x.name === company)
      return c?.accent || "#4F46E5"
    },
    [availableCompanies],
  )

  // Re-tint the entire app from the active company's accent. Runs whenever the
  // company or the resolved accent (once availableCompanies loads) changes.
  useEffect(() => {
    applyCompanyTheme(activeCompany ? accentOf(activeCompany) : null)
  }, [activeCompany, accentOf])

  return (
    <CompanyContext.Provider
      value={{
        activeCompany,
        availableCompanies,
        isGroupOwner,
        isPlatformAdmin,
        isLoading,
        setCompany,
        accentOf,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  return useContext(CompanyContext)
}
