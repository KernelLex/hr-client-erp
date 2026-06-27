const BASE = "/api/method/hr_client.api.graphs"

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE}.${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
    body: JSON.stringify(params),
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Graphs API error: ${res.status}`)
  const data = await res.json()
  return (data.message ?? data) as T
}

export interface GraphPreset {
  id: string
  title: string
  description: string
  chart_type: ChartType
  category: GraphCategory
  icon: string
  color: string
  params_schema: Record<string, unknown>
}

export type ChartType = "bar" | "line" | "area" | "pie" | "donut" | "bar_horizontal" | "composed"
export type GraphCategory = "Sales" | "Purchase" | "Finance" | "Inventory" | "Custom" | "All"

export interface ChartData {
  success: boolean
  title?: string
  description?: string
  chart_type?: ChartType
  category?: GraphCategory
  query_text?: string
  data: Record<string, unknown>[]
  x_key?: string
  y_keys?: string[]
  value_key?: string
  label_key?: string
  colors?: Record<string, string>
  error?: string
  interpretation?: Record<string, unknown>
}

export interface SavedGraph {
  name: string
  title: string
  chart_type: ChartType
  category: GraphCategory
  description: string
  query_text: string
  is_preset: number
  preset_id: string
  created_by_user: string
  thumbnail_data?: string
  creation: string
  modified: string
  data?: Record<string, unknown>[]
  config?: Record<string, unknown>
}

export interface SavedGraphsResult {
  success: boolean
  graphs: SavedGraph[]
  total: number
  page: number
}

export interface GraphStats {
  success: boolean
  total: number
  by_category: Record<string, number>
  by_type: Record<string, number>
}

export function getAvailablePresets(): Promise<{ success: boolean; presets: GraphPreset[] }> {
  return call("get_available_presets")
}

export function getPresetGraph(preset_id: string, params?: Record<string, unknown>): Promise<ChartData> {
  return call("get_preset_graph", {
    preset_id,
    params_json: params ? JSON.stringify(params) : undefined,
  })
}

export function generateGraphData(
  query: string,
  chart_type_hint?: string,
  date_from?: string,
  date_to?: string,
  fy?: string
): Promise<ChartData> {
  return call("generate_graph_data", { query, chart_type_hint, date_from, date_to, fy })
}

export function saveGraph(payload: {
  title: string
  chart_type: ChartType
  data_json: string
  config_json: string
  query_text?: string
  category?: string
  description?: string
  is_preset?: number
  preset_id?: string
  thumbnail_data?: string
}): Promise<{ success: boolean; name?: string; error?: string }> {
  return call("save_graph", payload)
}

export function getSavedGraphs(category?: string, page = 1): Promise<SavedGraphsResult> {
  return call("get_saved_graphs", { category: category || "All", page })
}

export function getSavedGraph(name: string): Promise<{ success: boolean; graph: SavedGraph }> {
  return call("get_saved_graph", { name })
}

export function deleteGraph(name: string): Promise<{ success: boolean; error?: string }> {
  return call("delete_graph", { name })
}

export function getGraphCsvData(name: string): Promise<{ success: boolean; csv?: string; filename?: string }> {
  return call("get_graph_csv_data", { name })
}

export function getGraphStats(): Promise<GraphStats> {
  return call("get_graph_stats")
}
