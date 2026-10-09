import { api, apiUrl } from "@/lib/api"

// ── Payables & Receivables (canonical VE Tally Ledger / Voucher) ──────────────

export type PartyDirection =
  | "receivable" | "payable" | "advance_from_customer" | "advance_to_vendor" | "settled"

export interface ArApSummary {
  company: string | null
  receivable_total: number; receivable_fmt: string; receivable_count: number
  payable_total: number; payable_fmt: string; payable_count: number
  net_total: number; net_fmt: string
  top_receivables: { party: string; amount: number; amount_fmt: string }[]
  top_payables: { party: string; amount: number; amount_fmt: string }[]
}

export interface PartySearchRow {
  party: string
  group: string
  gstin: string | null
  company: string
  direction: PartyDirection
  amount: number
  amount_fmt: string
}

export interface AgingBucket { amount: number; fmt: string; label: string }

export interface PartyOpenInvoice {
  number: string
  date: string | null
  amount: number; amount_fmt: string
  open_amount: number; open_amount_fmt: string
  age_days: number | null
  bucket: string
}

export interface PartyTxn {
  type: string
  number: string
  date: string
  amount: number; amount_fmt: string
  signed: -1 | 0 | 1
  narration: string
}

export interface PartyLedger {
  party: string
  mailing_name: string | null
  company: string
  group: string
  gstin: string | null
  pan: string | null
  state: string | null
  phone: string | null
  address: string | null
  direction: PartyDirection
  is_debtor: boolean
  is_creditor: boolean
  outstanding: number; outstanding_fmt: string
  opening_balance: number; opening_fmt: string
  total_charged: number; total_charged_fmt: string
  total_paid: number; total_paid_fmt: string
  unexplained: number; unexplained_fmt: string | null
  aging: Record<string, AgingBucket>
  open_invoices: PartyOpenInvoice[]
  open_invoice_count: number
  transactions: PartyTxn[]
  transaction_count: number
}

export async function getArApSummary(): Promise<ArApSummary> {
  const res = await api.get(apiUrl("hr_client.api.operations.get_ar_ap_summary"))
  return res.data.message
}

export async function searchParties(query: string, kind: "all" | "receivable" | "payable" = "all"): Promise<{ results: PartySearchRow[]; total: number }> {
  const res = await api.get(apiUrl("hr_client.api.operations.search_parties"), {
    params: { query, kind, limit: 40 },
  })
  return res.data.message
}

export async function getPartyLedger(party: string): Promise<PartyLedger> {
  const res = await api.get(apiUrl("hr_client.api.operations.get_party_ledger"), {
    params: { party_name: party },
  })
  return res.data.message
}
