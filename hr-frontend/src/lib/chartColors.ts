/**
 * Chart palette for the UI overhaul.
 *
 * The app chrome + page internals are monochrome, but CHARTS ARE ALLOWED COLOUR
 * (owner decision) because multi-series data needs hue to stay legible. This is
 * the one place colour is intentional — always paired with legends + labels.
 *
 * Grid/axis stay neutral (grey) so the data, not the frame, carries the colour.
 */
export const CHART_SERIES = [
  "#2563eb", // blue
  "#059669", // green
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
  "#dc2626", // red
  "#0d9488", // teal
  "#9333ea", // purple
]

/** Pie/donut order — same categorical palette. */
export const PIE_SERIES = CHART_SERIES

/** Primary single-series colour (lines/bars with one metric). */
export const CHART_INK = "#2563eb"
export const CHART_GRID = "var(--border-subtle)"
export const CHART_AXIS = "var(--text-tertiary)"
export const CHART_SURFACE = "var(--bg-surface)"
/** Threshold / danger markers. */
export const CHART_DANGER = "#dc2626"

export const seriesColor = (i: number) => CHART_SERIES[((i % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length]
