import { useQuery } from "@tanstack/react-query"

export interface TallySummary {
  cash_bank: string
  cash_bank_raw: number
  receivables: string
  recv_raw: number
  payables: string
  pay_raw: number
  fy_sales: string
  fy_sales_raw: number
  fy_purchases: string
  fy_purch_raw: number
  net_gst: string
  stock_skus: number
  as_of: string
}

export async function fetchTallySummary(): Promise<TallySummary | null> {
  const res = await fetch(
    "/api/method/hr_client.api.operations.get_tally_financial_summary",
    { credentials: "include" }
  )
  if (!res.ok) return null
  const json = await res.json()
  return json.message || null
}

export function useTallySummary() {
  return useQuery<TallySummary | null>({
    queryKey: ["tally-summary"],
    queryFn: fetchTallySummary,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
}

export function formatDate(d: string) {
  if (!d || d.length < 10) return "—"
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const parts = d.split("-")
  if (parts.length === 3) return `${parts[2]} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`
  return d
}
