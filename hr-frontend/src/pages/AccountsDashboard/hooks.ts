import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, apiUrl } from "@/lib/api"
import type {
  FundsSummary, AccountsSummary, GSTSummary, RPSummary,
  PaginatedResult, CreditorRow, CreditorAdvRow, DebtorRow, DebtorAdvRow,
  CashFlowStatement, InventorySummary, StockRow, ImportStatus,
} from "./types"

const BASE = "hr_client.api.accounts_dashboard"

function useAD<T>(key: string[], method: string, params?: Record<string, unknown>) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const res = await api.get(apiUrl(`${BASE}.${method}`), { params })
      return res.data.message as T
    },
    staleTime: 5 * 60_000,
    refetchOnMount: "always",
  })
}

export function useFundsSummary() {
  return useAD<FundsSummary>(["funds-summary"], "get_available_funds_summary")
}

export function useAccountsSummary(period: string, customStart?: string, customEnd?: string) {
  return useAD<AccountsSummary>(
    ["accounts-summary", period, customStart ?? "", customEnd ?? ""],
    "get_accounts_summary",
    { period, custom_start: customStart, custom_end: customEnd },
  )
}

export function useGSTSummary(period: string, customStart?: string, customEnd?: string) {
  return useAD<GSTSummary>(
    ["gst-summary", period, customStart ?? "", customEnd ?? ""],
    "get_gst_summary",
    { period, custom_start: customStart, custom_end: customEnd },
  )
}

export function useRPSummary(period: string, customStart?: string, customEnd?: string) {
  return useAD<RPSummary>(
    ["rp-summary", period, customStart ?? "", customEnd ?? ""],
    "get_receivables_payables_summary",
    { period, custom_start: customStart, custom_end: customEnd },
  )
}

export function useCashFlow(period: string, customStart?: string, customEnd?: string) {
  return useAD<CashFlowStatement>(
    ["cashflow", period, customStart ?? "", customEnd ?? ""],
    "get_cash_flow_statement",
    { period, custom_start: customStart, custom_end: customEnd },
  )
}

export function useInventorySummary() {
  return useAD<InventorySummary>(["inventory-summary"], "get_inventory_summary")
}

// ── Paginated report hooks ─────────────────────────────────────────────────────

export function useCreditors(search: string, agingFilter: string, sortBy: string, sortOrder: string, page: number) {
  return useAD<PaginatedResult<CreditorRow>>(
    ["creditors", search, agingFilter, sortBy, sortOrder, String(page)],
    "get_creditors_report",
    { search, aging_filter: agingFilter, sort_by: sortBy, sort_order: sortOrder, page, page_size: 50 },
  )
}

export function useCreditorAdvances(search: string, sortBy: string, sortOrder: string, page: number) {
  return useAD<PaginatedResult<CreditorAdvRow>>(
    ["creditor-advances", search, sortBy, sortOrder, String(page)],
    "get_creditors_advance_report",
    { search, sort_by: sortBy, sort_order: sortOrder, page, page_size: 50 },
  )
}

export function useDebtors(search: string, agingFilter: string, sortBy: string, sortOrder: string, page: number) {
  return useAD<PaginatedResult<DebtorRow>>(
    ["debtors", search, agingFilter, sortBy, sortOrder, String(page)],
    "get_debtors_report",
    { search, aging_filter: agingFilter, sort_by: sortBy, sort_order: sortOrder, page, page_size: 50 },
  )
}

export function useDebtorAdvances(search: string, sortBy: string, sortOrder: string, page: number) {
  return useAD<PaginatedResult<DebtorAdvRow>>(
    ["debtor-advances", search, sortBy, sortOrder, String(page)],
    "get_debtors_advance_report",
    { search, sort_by: sortBy, sort_order: sortOrder, page, page_size: 50 },
  )
}

export function useStockMovement(category: string, search: string, page: number) {
  return useAD<PaginatedResult<StockRow>>(
    ["stock-movement", category, search, String(page)],
    "get_stock_movement_report",
    { category, search, page, page_size: 50 },
  )
}

// ── Import ─────────────────────────────────────────────────────────────────────

export function useImportStatus() {
  return useQuery<ImportStatus>({
    queryKey: ["accounts-import-status"],
    queryFn: async () => {
      const res = await api.get(apiUrl(`${BASE}.get_import_status`))
      return res.data.message as ImportStatus
    },
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "running" ? 3000 : false
    },
  })
}

export function useTriggerImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(apiUrl(`${BASE}.trigger_tally_import`), {})
      return res.data.message
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts-import-status"] })
    },
  })
}
