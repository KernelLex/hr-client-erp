/**
 * UI preferences for the monochrome overhaul — theme (light/dark) and density
 * (compact/default/comfortable). Stored in localStorage and applied as
 * data-attributes on <html>, which the token sets in index.css key off.
 */

export type Theme = "light" | "dark"
export type Density = "compact" | "default" | "comfortable"

const THEME_KEY = "ui_theme"
const DENSITY_KEY = "ui_density"
const DENSITIES: Density[] = ["compact", "default", "comfortable"]

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export function getTheme(): Theme {
  return read<Theme>(THEME_KEY, "light")
}

export function getDensity(): Density {
  return read<Density>(DENSITY_KEY, "default")
}

export function applyUiPrefs() {
  const root = document.documentElement
  root.setAttribute("data-theme", getTheme())
  root.setAttribute("data-density", getDensity())
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme) } catch { /* unavailable */ }
  document.documentElement.setAttribute("data-theme", theme)
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark"
  setTheme(next)
  return next
}

export function setDensity(density: Density) {
  try { localStorage.setItem(DENSITY_KEY, density) } catch { /* unavailable */ }
  document.documentElement.setAttribute("data-density", density)
}

export function cycleDensity(): Density {
  const next = DENSITIES[(DENSITIES.indexOf(getDensity()) + 1) % DENSITIES.length]
  setDensity(next)
  return next
}
