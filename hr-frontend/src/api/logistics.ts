import { api, apiUrl } from "@/lib/api"

// ── Deliveries (outbound) ─────────────────────────────────────────────────────

export type DeliveryStatus =
  | "Pending" | "Ready for Dispatch" | "Dispatched" | "In Transit" | "Delivered" | "Cancelled"

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "Pending", "Ready for Dispatch", "Dispatched", "In Transit", "Delivered", "Cancelled",
]

export interface DeliveryItem {
  item_description?: string
  spec?: string
  qty?: number
  uom?: string
  remarks?: string
}

export interface DeliveryListRow {
  name: string
  delivery_title: string
  customer_name: string
  status: DeliveryStatus
  company: string
  expected_date: string | null
  dispatch_date: string | null
  delivered_on: string | null
  transporter: string
  pod_received: boolean
  project: string | null
  item_count: number
}

export interface Delivery {
  name: string
  delivery_title: string
  company: string
  project: string | null
  customer_name: string
  sales_order: string | null
  destination_address: string | null
  status: DeliveryStatus
  expected_date: string | null
  dispatch_date: string | null
  delivered_on: string | null
  transporter: string
  vehicle_no: string | null
  driver_name: string | null
  driver_phone: string | null
  pod_document: string | null
  pod_received: boolean
  pod_notes: string | null
  porter_order_id: string | null
  porter_status: string | null
  porter_tracking_url: string | null
  managed_by: string | null
  notes: string | null
  items: DeliveryItem[]
}

export async function listDeliveries(status?: string, scope?: string): Promise<{ deliveries: DeliveryListRow[]; total: number }> {
  const res = await api.get(apiUrl("hr_client.api.logistics.list_deliveries"), { params: { status, scope } })
  return res.data.message
}
export async function getDelivery(name: string): Promise<Delivery> {
  const res = await api.get(apiUrl("hr_client.api.logistics.get_delivery"), { params: { name } })
  return res.data.message
}
export async function createDelivery(payload: Partial<Delivery>): Promise<Delivery> {
  const res = await api.post(apiUrl("hr_client.api.logistics.create_delivery"), { payload: JSON.stringify(payload) })
  return res.data.message
}
export async function saveDelivery(name: string, payload: Partial<Delivery>): Promise<Delivery> {
  const res = await api.post(apiUrl("hr_client.api.logistics.save_delivery"), { name, payload: JSON.stringify(payload) })
  return res.data.message
}
export async function updateDeliveryStatus(name: string, status: DeliveryStatus): Promise<Delivery> {
  const res = await api.post(apiUrl("hr_client.api.logistics.update_delivery_status"), { name, status })
  return res.data.message
}
export async function uploadPod(name: string, file: File): Promise<Delivery> {
  const form = new FormData()
  form.append("name", name)
  form.append("file", file)
  const csrf = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "fetch"
  const res = await fetch(apiUrl("hr_client.api.logistics.upload_pod"), {
    method: "POST", credentials: "include",
    headers: { "X-Frappe-CSRF-Token": csrf },
    body: form,
  })
  const json = await res.json()
  if (!res.ok || json.exc || json.message?.success === false) {
    throw new Error(json.message?.error || json.exc || "POD upload failed")
  }
  return json.message
}

export interface DeliveryDashboard {
  counts: Record<DeliveryStatus, number>
  in_progress: number
  delivered: number
  total: number
  recent: (DeliveryListRow & { goods: string[] })[]
}
export async function getDeliveryDashboard(): Promise<DeliveryDashboard> {
  const res = await api.get(apiUrl("hr_client.api.logistics.delivery_dashboard"))
  return res.data.message
}

// ── Goods Receipts (inbound) ──────────────────────────────────────────────────

export interface GrnListRow {
  name: string
  grn_title: string
  vendor: string
  purchase_order: string
  project: string
  status: string
  receipt_date: string | null
  total: number
  ordered_qty: number
  received_qty: number
  line_count: number
  short_lines: number
  fully_received: boolean
}
export interface GrnLine {
  item_description?: string; spec?: string; item_code?: string; uom?: string
  ordered_qty?: number; received_qty?: number; rate?: number; amount?: number; source_po_line?: string
}
export interface Grn {
  name: string; grn_title: string; project: string; purchase_order: string; vendor: string
  company: string; status: string; total: number; notes: string | null; receipt_date: string | null
  lines: GrnLine[]
}

export async function listGoodsReceipts(status?: string): Promise<{ grns: GrnListRow[]; total: number }> {
  const res = await api.get(apiUrl("hr_client.api.logistics.list_goods_receipts"), { params: { status } })
  return res.data.message
}
export async function listPosAwaitingReceipt(): Promise<{ pos: { name: string; vendor: string; project: string; status: string; po_date: string | null; total: number }[]; total: number }> {
  const res = await api.get(apiUrl("hr_client.api.logistics.list_pos_awaiting_receipt"))
  return res.data.message
}
export async function getGrn(name: string): Promise<Grn> {
  const res = await api.get(apiUrl("hr_client.api.project_procurement.get_grn"), { params: { name } })
  return res.data.message
}
export async function createGrnFromPo(po: string): Promise<Grn> {
  const res = await api.post(apiUrl("hr_client.api.project_procurement.create_grn_from_po"), { po })
  return res.data.message
}
export async function saveGrnLines(name: string, lines: GrnLine[], receipt_date?: string, notes?: string): Promise<Grn> {
  const res = await api.post(apiUrl("hr_client.api.project_procurement.save_grn_lines"), { name, lines: JSON.stringify(lines), receipt_date, notes })
  return res.data.message
}
export async function confirmGrn(name: string): Promise<Grn> {
  const res = await api.post(apiUrl("hr_client.api.project_procurement.confirm_grn"), { name })
  return res.data.message
}

// ── Porter (scaffold) ─────────────────────────────────────────────────────────
export interface PorterStatus { configured: boolean; env: string | null; base_url: string | null; capabilities: string[]; message: string | null }
export async function getPorterStatus(): Promise<PorterStatus> {
  const res = await api.get(apiUrl("hr_client.api.porter.get_porter_status"))
  return res.data.message
}

// ── Logistics handler gate (dashboard quick-add) ──────────────────────────────
export async function isLogisticsHandler(): Promise<boolean> {
  const res = await api.get(apiUrl("hr_client.api.logistics.is_logistics_handler"))
  return !!res.data.message?.is_handler
}

// ── Purchase Orders (standalone — project optional) ───────────────────────────
export interface PoListRow {
  name: string; vendor: string; project: string | null; status: string
  po_date: string | null; total: number; is_intercompany: 0 | 1; supplying_company: string | null
}
export interface PoLineInput { item_description: string; spec?: string; qty?: number; uom?: string; rate?: number }
export interface ProjectOption { name: string; project_title: string; company: string }

export async function listPurchaseOrders(project?: string): Promise<{ pos: PoListRow[]; kpis: Record<string, number> }> {
  const res = await api.get(apiUrl("hr_client.api.project_procurement.list_pos"), { params: { project } })
  return res.data.message
}
export async function listProjectOptions(): Promise<ProjectOption[]> {
  const res = await api.get(apiUrl("hr_client.api.project_procurement.list_project_options"))
  return res.data.message?.projects ?? []
}
export async function createPurchaseOrder(payload: {
  vendor: string; project?: string | null; po_date?: string; notes?: string; lines: PoLineInput[]
}): Promise<{ name: string; total: number; project: string | null }> {
  const res = await api.post(apiUrl("hr_client.api.project_procurement.create_po"), { payload: JSON.stringify(payload) })
  return res.data.message
}
