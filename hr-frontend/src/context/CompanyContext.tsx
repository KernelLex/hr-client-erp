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
  accentOf: () => "#171717",
})

// Group / "All companies" console accent — deliberately distinct from every
// single-company accent so the consolidated view is unmistakable at a glance.
const GROUP_ACCENT = "#444444" // slate

// ── Per-company theming ───────────────────────────────────────────────────────
// Monochrome UI overhaul (2026-10): the app is intentionally colour-free, so the
// active company no longer re-tints the chrome. applyCompanyTheme now just clears
// any previously-set inline overrides so the greyscale tokens in index.css win.
const THEME_VARS = [
  "--company-accent", "--gold", "--gold-light", "--brand-primary",
  "--brand-primary-dark", "--bg-sidebar", "--bg-sidebar-hover",
  "--bg-sidebar-active", "--bg-app",
]

function applyCompanyTheme(_accentHex: string | null) {
  // Monochrome UI overhaul (2026-10): the app is intentionally colour-free, so
  // the per-company accent no longer tints the chrome. We always clear any
  // inline overrides so the greyscale tokens in index.css take effect. Each
  // company still shows its own name/abbreviation — just not an accent colour.
  const root = document.documentElement.style
  THEME_VARS.forEach((v) => root.removeProperty(v))
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
      return c?.accent || "#171717"
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
