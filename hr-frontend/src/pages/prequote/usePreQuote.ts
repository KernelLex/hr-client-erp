import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiUrl } from "@/lib/api"

const NS = "hr_client.api.prequote"

async function get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get(apiUrl(`${NS}.${endpoint}`), { params })
  const msg = res.data.message
  if (msg?.success === false) throw new Error(msg?.error ?? "Request failed")
  return msg as T
}

async function post<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const res = await api.post(apiUrl(`${NS}.${endpoint}`), body)
  const msg = res.data.message
  if (msg?.success === false) throw new Error(msg?.error ?? "Request failed")
  return msg as T
}

export interface PreQuote {
  name: string
  customer_name: string
  quotation_type: string
  project_name?: string
  mobile: string
  requirement_source?: string
  status: string
  opportunity?: string
  creation: string
}

export function usePreQuotes() {
  return useQuery({
    queryKey: ["prequotes"],
    queryFn: () => get<{ prequotes: PreQuote[] }>("get_prequotes").then((r) => r.prequotes),
    staleTime: 30_000,
  })
}

export function useCreatePreQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post<{ name: string }>("create_prequote", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequotes"] })
      toast.success("Pre-Quote created")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useConvertPreQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      post<{ opportunity: string }>("convert_to_opportunity", { name }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["prequotes"] })
      toast.success(`Opportunity ${r.opportunity} created`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
