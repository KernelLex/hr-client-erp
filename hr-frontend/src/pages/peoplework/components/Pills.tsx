// Status + priority pills, matching the reference mockup's st-pill / pri-pill.
// Colour is derived from the value text so the backend can return plain strings.

type PillTone = "good" | "warn" | "bad" | "muted" | "info"

const TONE_STYLE: Record<PillTone, { bg: string; color: string }> = {
  good: { bg: "#F5F5F5", color: "#171717" },
  warn: { bg: "#F5F5F5", color: "#171717" },
  bad: { bg: "#fdeaea", color: "#dc2626" },
  info: { bg: "#F5F5F5", color: "#171717" },
  muted: { bg: "#F5F5F5", color: "#6a6a5c" },
}

function statusTone(value: string): PillTone {
  const v = value.toLowerCase()
  if (/(active|approved|approve|completed|complete|done|filed|paid|connected|cleared|settled|closed won|hired|joined|present)/.test(v)) return "good"
  if (/(pending|awaiting|in progress|in-progress|under review|needs review|draft|upcoming|due|on hold|open|scheduled|probation|configure|todo|to do|not started)/.test(v)) return "warn"
  if (/(rejected|reject|overdue|failed|cancelled|canceled|absent|left|blocked|closed lost|at risk|expired)/.test(v)) return "bad"
  return "info"
}

function priorityTone(value: string): PillTone {
  const v = value.toLowerCase()
  if (/(high|urgent|critical)/.test(v)) return "bad"
  if (/(medium|normal)/.test(v)) return "warn"
  if (/(low)/.test(v)) return "good"
  return "muted"
}

function Pill({ value, tone }: { value: string; tone: PillTone }) {
  const s = TONE_STYLE[tone]
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {value}
    </span>
  )
}

export function StatusPill({ value }: { value: string }) {
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>
  return <Pill value={value} tone={statusTone(value)} />
}

export function PriorityPill({ value }: { value: string }) {
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>
  return <Pill value={value} tone={priorityTone(value)} />
}
