// Tally enrichment API — Ollama-powered enrichment + verification for VE Tally Voucher data

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

async function apiGet(method: string): Promise<any> {
  const res = await fetch(`/api/method/${method}`, { credentials: "include" })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Request failed")
  return json.message
}

async function apiPost(method: string, body: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": getCsrf() },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Request failed")
  return json.message
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnrichmentStats {
  total: number
  enriched: number
  pending: number
  anomalies: number
  needs_review: number
  verified: number
  categories: Record<string, number>
}

export interface EnrichmentStatus {
  status: "idle" | "running" | "done" | "error"
  progress: number
  processed: number
  total: number
  message: string
  ts?: number
}

export interface AnomalyRow {
  voucher_name: string
  tally_guid: string
  voucher_type: string
  voucher_number: string
  voucher_date: string
  party_name: string
  party_norm: string
  amount: number
  amount_fmt: string
  narration: string
  debit_ledger: string
  credit_ledger: string
  anomaly_reason: string
  tx_category: string
  gst_type: string
  confidence: number
}

export interface NormalizationRow {
  original: string
  normalized: string
  count: number
  sample_voucher: string
}

export interface PageResult<T> {
  rows: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

// ── API functions ────────────────────────────────────────────────────────────

export const getEnrichmentStatus  = (): Promise<EnrichmentStatus>        => apiGet("hr_client.api.tally_enrich.get_enrichment_status")
export const getEnrichmentStats   = (): Promise<EnrichmentStats>         => apiGet("hr_client.api.tally_enrich.get_enrichment_stats")
export const startEnrichment      = (): Promise<{ queued: boolean; pending?: number; message?: string }> =>
  apiPost("hr_client.api.tally_enrich.start_enrichment")
export const stopEnrichment       = (): Promise<{ stopped: boolean }>    => apiPost("hr_client.api.tally_enrich.stop_enrichment")

export const getAnomalyQueue = (page = 1): Promise<PageResult<AnomalyRow>> =>
  apiPost("hr_client.api.tally_enrich.get_anomaly_queue", { page, page_size: 25 })

export const getNormalizationQueue = (page = 1): Promise<PageResult<NormalizationRow>> =>
  apiPost("hr_client.api.tally_enrich.get_normalization_queue", { page, page_size: 25 })

export const markAnomalyReviewed = (tally_guid: string, confirmed = false, note = ""): Promise<{ success: boolean }> =>
  apiPost("hr_client.api.tally_enrich.mark_anomaly_reviewed", { tally_guid, confirmed, note })

export const bulkDismissAnomalies = (guids: string[]): Promise<{ dismissed: number }> =>
  apiPost("hr_client.api.tally_enrich.bulk_dismiss_anomalies", { tally_guids_json: JSON.stringify(guids) })
