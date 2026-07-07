const DAY_BUCKETS: Array<{ max: number; color: string; label: string }> = [
  { max: 30, color: "var(--color-success)", label: "0-30 days" },
  { max: 60, color: "var(--color-warning)", label: "30-60 days" },
  { max: 90, color: "var(--color-danger)", label: "60-90 days" },
  { max: Infinity, color: "var(--color-maroon)", label: "90+ days" },
]

const MONTH_BUCKETS: Array<{ max: number; color: string; label: string }> = [
  { max: 6, color: "var(--color-success)", label: "0-6 months" },
  { max: 12, color: "var(--color-warning)", label: "6-12 months" },
  { max: 24, color: "var(--color-danger)", label: "12-24 months" },
  { max: Infinity, color: "var(--color-maroon)", label: "24+ months" },
]

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap"
      style={{ background: color }}
    >
      {text}
    </span>
  )
}

export function AgingPill({ days }: { days: number }) {
  const bucket = DAY_BUCKETS.find((b) => days <= b.max)!
  return <Pill text={`${days} days`} color={bucket.color} />
}

export function AgingPillMonths({ months }: { months: number }) {
  const bucket = MONTH_BUCKETS.find((b) => months <= b.max)!
  return <Pill text={`${months} mo`} color={bucket.color} />
}

export function AgingLegend({ months = false }: { months?: boolean }) {
  const buckets = months ? MONTH_BUCKETS : DAY_BUCKETS
  return (
    <div className="flex gap-2 flex-wrap mb-3">
      {buckets.map((b) => (
        <Pill key={b.label} text={b.label} color={b.color} />
      ))}
    </div>
  )
}
