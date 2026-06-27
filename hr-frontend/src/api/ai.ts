const BASE = "/api/method/hr_client.api.ai"

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE}.${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": "fetch" },
    body: JSON.stringify(params),
    credentials: "include",
  })
  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  const data = await res.json()
  return (data.message ?? data) as T
}

export interface AIStatus {
  ollama_running: boolean
  models: string[]
  active_model: string | null
  ready: boolean
}

export interface AnalysisResult {
  success: boolean
  analysis?: string
  reason?: string
  linked?: { doctype: string; record: Record<string, unknown> }
}

export interface DashboardInsights {
  success: boolean
  health_score?: number
  health_label?: "Excellent" | "Good" | "Fair" | "Poor"
  insights?: string[]
  alerts?: string[]
  recommendations?: string[]
  reason?: string
}

export interface PeriodComparison {
  success: boolean
  summary?: string
  revenue_change_pct?: number
  expense_change_pct?: number
  trend?: "improving" | "declining" | "stable"
  key_differences?: string[]
  recommendation?: string
  period1?: string
  period2?: string
  period1_data?: { sales: number; purchases: number; count: number }
  period2_data?: { sales: number; purchases: number; count: number }
  reason?: string
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatResponse {
  success: boolean
  reply: string
}

export interface ReportResult {
  success: boolean
  report_type?: string
  report?: string
  reason?: string
}

export function checkAIStatus(): Promise<AIStatus> {
  return call<AIStatus>("check_ai_status")
}

export function analyseDocument(drive_file_name: string): Promise<AnalysisResult> {
  return call<AnalysisResult>("analyse_document", { drive_file_name })
}

export function analyseSelected(doc_names: string[]): Promise<AnalysisResult> {
  return call<AnalysisResult>("analyse_selected", {
    doc_names_json: JSON.stringify(doc_names),
  })
}

export function getDashboardInsights(): Promise<DashboardInsights> {
  return call<DashboardInsights>("get_dashboard_insights")
}

export function comparePeriods(period1: string, period2: string): Promise<PeriodComparison> {
  return call<PeriodComparison>("compare_periods", { period1, period2 })
}

export function chatWithVera(
  message: string,
  history: ChatMessage[],
  context_type = "general"
): Promise<ChatResponse> {
  return call<ChatResponse>("chat", {
    message,
    history_json: JSON.stringify(history),
    context_type,
  })
}

export function generateReport(
  report_type: string,
  filters?: Record<string, unknown>
): Promise<ReportResult> {
  return call<ReportResult>("generate_report", {
    report_type,
    filters_json: filters ? JSON.stringify(filters) : null,
  })
}

export interface OllamaHealth {
  status: "offline" | "online" | "healthy" | "error" | "online_no_model"
  model: string | null
  response_time_ms: number | null
  models_available: string[]
  error?: string | null
}

export interface ExtractionHealth {
  total_files: number
  processed: number
  pending: number
  failed: number
  success_rate: number
}

export interface DriveSyncHealth {
  last_sync: string | null
  last_sync_status: string | null
  files_found: number
  sync_health: "good" | "ok" | "stale" | "unknown"
  hours_ago: number | null
}

export interface DataQualityHealth {
  total_structured: number
  with_amounts: number
  with_parties: number
  quality_score: number
}

export interface AIHealth {
  ollama: OllamaHealth
  extraction: ExtractionHealth
  drive_sync: DriveSyncHealth
  data_quality: DataQualityHealth
  overall_score: number
  overall_label: "Excellent" | "Good" | "Fair" | "Poor" | "Unknown"
  overall_color: "green" | "blue" | "yellow" | "red" | "gray"
}

export function getAIHealth(): Promise<AIHealth> {
  return call<AIHealth>("get_ai_health")
}

export interface BusinessSnapshot {
  success: boolean
  // Tally snapshot aggregates
  total_sales: number
  fy_sales: number
  fy_purchases: number
  fy_collections: number
  sundry_debtors: number
  sundry_creditors: number
  gst_payable: number
  input_gst_credit: number
  cash_in_hand: number
  bank_balance: number
  tds_payable: number
  // Live voucher counts
  sales_count: number
  sales_total: number
  purchase_count: number
  purchase_total: number
  receipt_count: number
  receipt_total: number
  payment_count: number
  payment_total: number
  credit_note_count: number
  debit_note_count: number
  journal_count: number
  total_vouchers: number
  total_ledgers: number
  stock_item_count: number
  debtor_count: number
  creditor_count: number
  top_debtors: Record<string, number>
  top_creditors: Record<string, number>
  monthly_sales: Record<string, number>
  monthly_purchases: Record<string, number>
  monthly_collections: Record<string, number>
}

export function getBusinessSnapshot(): Promise<BusinessSnapshot> {
  return call<BusinessSnapshot>("get_business_snapshot")
}

// ── Verification System ───────────────────────────────────────────────────────

export interface VerificationRecord {
  name: string
  doctype: string
  verification_status: "Unverified" | "Verified" | "Needs Review" | "Corrected"
  confidence_score: number
  priority: "high" | "medium" | "low"
  drive_file: string | null
  extraction_method: string | null
  verified_by: string | null
  verified_on: string | null
}

export interface VerificationQueue {
  success: boolean
  total: number
  records: VerificationRecord[]
  summary: { high_priority: number; medium_priority: number; low_priority: number }
}

export interface FieldComparison {
  field: string
  label: string
  current_value: unknown
  original_value: unknown
  confidence: number
  was_changed: boolean
  confidence_label: "High" | "Medium" | "Low"
  confidence_color: "green" | "yellow" | "red"
}

export interface VerificationDetail {
  success: boolean
  record: Record<string, unknown>
  doctype: string
  docname: string
  field_comparison: FieldComparison[]
  field_confidence: Record<string, number>
  original_extraction: Record<string, unknown>
  source_content: string
  drive_file: { file_name: string; doc_type: string; drive_file_id: string; file_extension: string; drive_view_link: string; uploaded_by_name: string; file_date: string } | null
  overall_confidence: number
  verification_status: string
}

export interface AccuracySummary {
  total_records: number
  verified: number
  corrected: number
  needs_review: number
  unverified: number
  avg_confidence: number
  verification_rate: number
  accuracy_label: string
  accuracy_color: "green" | "blue" | "yellow" | "red"
}

export interface AccuracyStats {
  success: boolean
  summary: AccuracySummary
  by_doctype: Array<{ doctype: string; total: number; verified: number; corrected: number; unverified: number; avg_confidence: number; verification_rate: number }>
}

export interface CrosscheckResult {
  success: boolean
  crosscheck?: {
    field_results: Array<{ field: string; label: string; extracted_value: unknown; source_value: unknown; is_correct: boolean; confidence: number; note: string }>
    correct_count: number
    total_checked: number
    accuracy_pct: number
    critical_errors: string[]
    overall_assessment: string
    suggested_corrections: Record<string, unknown>
    has_corrections: boolean
  }
  error?: string
}

export function getVerificationQueue(status = "Unverified", doctype?: string): Promise<VerificationQueue> {
  return call<VerificationQueue>("get_verification_queue", { status, ...(doctype ? { doctype } : {}) })
}

export function getVerificationDetail(doctype: string, docname: string): Promise<VerificationDetail> {
  return call<VerificationDetail>("get_verification_detail", { doctype, docname })
}

export function verifyRecord(doctype: string, docname: string, corrections?: Record<string, unknown>, status = "Verified"): Promise<{ success: boolean; status: string; message: string }> {
  return call("verify_record", { doctype, docname, corrections: JSON.stringify(corrections ?? {}), status })
}

export function aiCrosscheck(doctype: string, docname: string, sourceContent: string): Promise<CrosscheckResult> {
  return call<CrosscheckResult>("ai_crosscheck", { doctype, docname, source_content: sourceContent })
}

export function applyAICorrections(doctype: string, docname: string, corrections: Record<string, unknown>): Promise<{ success: boolean }> {
  return call("apply_ai_corrections", { doctype, docname, corrections: JSON.stringify(corrections) })
}

export function reextractDocument(docName: string): Promise<unknown> {
  return call("reextract_document", { doc_name: docName, force: true })
}

export function getAccuracyStats(): Promise<AccuracyStats> {
  return call<AccuracyStats>("get_accuracy_stats")
}

// ── Smart Verification ────────────────────────────────────────────────────────

export interface AutoVerifyResult {
  success: boolean
  auto_verified: number
  needs_review: number
  review_queue: Array<{ doctype: string; docname: string; confidence: number; priority: string }>
  message: string
}

export interface ReviewProblemField {
  field: string
  label: string
  value: unknown
  confidence: number
}

export interface ReviewRecord {
  doctype: string
  docname: string
  confidence: number
  extraction_method: string
  problem_fields: ReviewProblemField[]
  all_fields: Record<string, unknown>
  source_text: string
  drive_file: { file_name: string; drive_view_link: string; file_extension: string } | null
  priority: "critical" | "high" | "medium"
}

export interface ReviewQueue {
  success: boolean
  total: number
  queue: ReviewRecord[]
}

export interface QuickActionResult {
  success: boolean
  action: string
  doctype: string
  docname: string
}

export function autoVerifyAll(threshold = 75): Promise<AutoVerifyResult> {
  return call<AutoVerifyResult>("auto_verify_all", { threshold })
}

export function getReviewQueue(): Promise<ReviewQueue> {
  return call<ReviewQueue>("get_review_queue")
}

export function quickAction(
  doctype: string,
  docname: string,
  action: "approve" | "reject" | "correct" | "skip",
  corrections?: Record<string, unknown>,
): Promise<QuickActionResult> {
  return call<QuickActionResult>("quick_action", {
    doctype,
    docname,
    action,
    corrections: corrections ? JSON.stringify(corrections) : null,
  })
}

export interface ResetAutoVerifiedResult {
  success: boolean
  reset: number
  message: string
}

export interface ExtractedRecord {
  doctype: string
  docname: string
  verification_status: "Unverified" | "Verified" | "Needs Review" | "Corrected"
  confidence_score: number
  verified_by: string | null
  verified_on: string
  drive_file: string | null
  extraction_method: string
  manual_review_required: boolean
  extraction_attempts: number
  last_extraction_at: string
  party: string
  amount: number
  date: string
  priority: "high" | "medium" | "low"
}

export interface AllExtractedRecordsResult {
  success: boolean
  total: number
  records: ExtractedRecord[]
  stats: {
    total: number
    verified: number
    corrected: number
    needs_review: number
    unverified: number
    manual_required: number
    avg_confidence: number
  }
}

export function resetAutoVerified(): Promise<ResetAutoVerifiedResult> {
  return call<ResetAutoVerifiedResult>("reset_auto_verified")
}

export function getAllExtractedRecords(
  status?: string,
  doctype?: string,
): Promise<AllExtractedRecordsResult> {
  return call<AllExtractedRecordsResult>("get_all_extracted_records", {
    ...(status ? { status } : {}),
    ...(doctype ? { doctype } : {}),
  })
}
