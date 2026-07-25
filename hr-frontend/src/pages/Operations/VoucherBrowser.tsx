import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  TrendingUp, Package, BookOpen, ShoppingCart, ShoppingBag,
  FileMinus, FilePlus, Truck, Archive, File,
  Upload, Download, ArrowLeftRight, FileText,
  ChevronRight, ChevronLeft, Search, X, Loader2, ExternalLink, Printer,
} from "lucide-react"

// ── API helpers ────────────────────────────────────────────────────────────────

function getCsrf(): string {
  const m = document.cookie.match(/csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "fetch"
}

async function apiPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": getCsrf() },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.exc) throw new Error(json.exc || "Request failed")
  return json.message
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VoucherRow {
  name: string
  voucher_type: string
  voucher_number: string
  voucher_date: string
  party_name: string
  amount: number
  amount_fmt: string
  narration: string
  debit_ledger: string
  credit_ledger: string
}

interface VoucherPage {
  data: VoucherRow[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface VoucherLine { cnt: number; total: number; fmt: string }

// ── Type configuration (no emojis — icon-only) ────────────────────────────────

interface TypeConfig {
  label: string
  color: string
  bg: string
  border: string
  icon: React.ElementType
  partyLabel: string
}

const VTYPE_CONFIG: Record<string, TypeConfig> = {
  "Sales":             { label: "Sales Invoice",    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: TrendingUp,     partyLabel: "Bill To" },
  "PERFORMA INVOICE":  { label: "Performa Invoice", color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4", icon: FileText,       partyLabel: "Bill To" },
  "Sales Order":       { label: "Sales Order",      color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: ShoppingCart,   partyLabel: "Client" },
  "Purchase":          { label: "Purchase Invoice", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: Package,        partyLabel: "Vendor" },
  "Purchase Order":    { label: "Purchase Order",   color: "#e11d48", bg: "#fff1f2", border: "#fecdd3", icon: ShoppingBag,    partyLabel: "Vendor" },
  "Receipt":           { label: "Receipt",          color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: Download,       partyLabel: "Received From" },
  "Payment":           { label: "Payment",          color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: Upload,         partyLabel: "Paid To" },
  "Journal":           { label: "Journal Entry",    color: "#c8a45c", bg: "#fdf8ef", border: "#ddd6fe", icon: BookOpen,       partyLabel: "Party" },
  "Contra":            { label: "Contra Entry",     color: "#1e3a2f", bg: "#eef5f1", border: "#b0d1bd", icon: ArrowLeftRight, partyLabel: "Party" },
  "Credit Note":       { label: "Credit Note",      color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: FileMinus,      partyLabel: "Issued To" },
  "Debit Note":        { label: "Debit Note",       color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8", icon: FilePlus,       partyLabel: "Issued By" },
  "Delivery Note":     { label: "Delivery Note",    color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc", icon: Truck,          partyLabel: "Delivered To" },
  "Stock Journal":     { label: "Stock Journal",    color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", icon: Archive,        partyLabel: "Party" },
  "Other":             { label: "Other",            color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: File,           partyLabel: "Party" },
}

const TYPE_ORDER = [
  "Sales", "PERFORMA INVOICE", "Sales Order",
  "Purchase", "Purchase Order",
  "Receipt", "Payment",
  "Credit Note", "Debit Note",
  "Journal", "Contra",
  "Delivery Note", "Stock Journal", "Other",
]

// ── Date helpers ───────────────────────────────────────────────────────────────

function fmtShortDate(d: string): string {
  if (!d || d.length < 10) return "—"
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const [y, m, day] = d.split("-")
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`
}


function formatIndian(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN")
}

// ── Folder card (Level 1) ─────────────────────────────────────────────────────

function FolderCard({
  vtype, line, onClick,
}: {
  vtype: string; line: VoucherLine; onClick: () => void
}) {
  const cfg = VTYPE_CONFIG[vtype] || VTYPE_CONFIG["Other"]
  const Icon = cfg.icon

  return (
    <button onClick={onClick}
      className="group relative bg-white rounded-2xl border border-gray-100 p-5 text-left
                 transition-all duration-200 hover:shadow-lg hover:border-gray-200
                 hover:-translate-y-1 active:translate-y-0 w-full overflow-hidden">
      {/* Top color bar */}
      <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl" style={{ backgroundColor: cfg.color }} />

      <div className="mt-1 mb-4 flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
             style={{ backgroundColor: cfg.bg }}>
          <Icon size={20} style={{ color: cfg.color }} strokeWidth={1.5} />
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg leading-none"
              style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          {line.cnt.toLocaleString()} entries
        </span>
      </div>

      <p className="font-semibold text-[14px] text-gray-800 group-hover:text-forest-600 transition-colors leading-tight">
        {cfg.label}
      </p>
      <p className="text-xl font-bold mt-1 font-mono tracking-tight" style={{ color: cfg.color }}>
        {line.fmt}
      </p>

      <ChevronRight size={14}
        className="absolute right-4 bottom-4 text-gray-200 group-hover:text-forest-400 transition-all group-hover:translate-x-0.5" />
    </button>
  )
}

// ── Types for full voucher detail ─────────────────────────────────────────────

interface LedgerEntry {
  ledger: string
  amount: number
  is_dr: boolean
  is_party: boolean
}

interface InventoryEntry {
  name: string
  hsn: string
  rate: number
  rate_unit: string
  discount: number
  amount: number
  qty: number
  qty_unit: string
}

export interface VoucherDetail extends VoucherRow {
  all_ledger_entries: LedgerEntry[]
  inventory_entries: InventoryEntry[]
  party_mailing_name?: string
  party_gstin?: string
  party_address?: string
  party_state?: string
  party_pincode?: string
  party_phone?: string
  party_gst_type?: string
}

// ── Amount in words ────────────────────────────────────────────────────────────

function amountInWords(n: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
                 "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
                 "Seventeen","Eighteen","Nineteen"]
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"]

  function words(num: number): string {
    if (num === 0) return ""
    if (num < 20) return ones[num] + " "
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "") + " "
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred " + words(num % 100)
    if (num < 100000) return words(Math.floor(num / 1000)) + "Thousand " + words(num % 1000)
    if (num < 10000000) return words(Math.floor(num / 100000)) + "Lakh " + words(num % 100000)
    return words(Math.floor(num / 10000000)) + "Crore " + words(num % 10000000)
  }

  const rupees = Math.floor(n)
  const paise  = Math.round((n - rupees) * 100)
  let result = "INR " + (words(rupees).trim() || "Zero")
  if (paise > 0) result += " and " + words(paise).trim() + " Paise"
  return result + " Only"
}

// ── Voucher Document overlay (Level 3) ────────────────────────────────────────

export function VoucherDocument({
  voucher, onClose, onViewParty,
}: {
  voucher: VoucherRow; onClose: () => void; onViewParty: (p: string) => void
}) {
  const cfg  = VTYPE_CONFIG[voucher.voucher_type] || VTYPE_CONFIG["Other"]
  const Icon = cfg.icon
  const party = voucher.party_name || voucher.debit_ledger || ""
  const [detail, setDetail] = useState<VoucherDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/method/hr_client.api.operations.get_voucher_detail?name=${encodeURIComponent(voucher.name)}`, {
      credentials: "include",
    })
      .then(r => r.json())
      .then(j => { setDetail(j.message); setLoading(false) })
      .catch(() => setLoading(false))
  }, [voucher.name])

  const inv    = detail?.inventory_entries   ?? []
  const ledgers = detail?.all_ledger_entries ?? []

  // Split ledgers: non-party (tax/sales lines) vs party line
  const taxLedgers    = ledgers.filter(l => !l.is_party)
  const subtotal      = inv.reduce((s, i) => s + i.amount, 0)
  const hasItems      = inv.length > 0
  const hasAllLedgers = ledgers.length > 1  // more than just debit+credit

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ overscrollBehavior: "contain" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: "blur(4px)" }} onClick={onClose} />

      {/* Document container */}
      <div className="relative w-full max-w-[780px] max-h-[95vh] overflow-y-auto rounded-3xl"
           style={{ overscrollBehavior: "contain" }}>

        {/* Controls bar */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-white/50 text-xs font-mono">{voucher.name}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 transition-colors px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
              <Printer size={12} /> Print
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* The document */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* ── HEADER ── */}
          <div style={{ backgroundColor: cfg.color }} className="px-8 py-7">
            {/* Company name */}
            <div className="mb-1">
              <p className="text-white font-bold text-lg tracking-wide">VERA ENTERPRISES</p>
              <p className="text-white/60 text-[11px] leading-relaxed mt-0.5">
                No. 3/143, GROUND FLOOR, 3rd MAIN, 4th FLOOR, Sadashiv Nagar · Nidamanagla · Bengaluru – 560010
              </p>
              <p className="text-white/60 text-[11px] mt-0.5">GSTIN/UIN: <span className="font-mono text-white/80">29AAFPV9778F1ZZ</span></p>
            </div>
            {/* Invoice title row */}
            <div className="mt-5 flex items-end justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                     style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <Icon size={20} className="text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white leading-tight">Tax Invoice</h1>
                  <p className="text-white/65 text-[11px] font-medium mt-0.5">{cfg.label}</p>
                </div>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <div className="flex items-center gap-4 justify-end">
                  <div>
                    <p className="text-white/50 text-[9px] uppercase tracking-wider">Invoice No.</p>
                    <p className="text-white font-mono font-semibold text-sm">{voucher.voucher_number || "—"}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-[9px] uppercase tracking-wider">Date</p>
                    <p className="text-white font-semibold text-sm">{fmtShortDate(voucher.voucher_date)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── BILL TO ── */}
          <div className="px-8 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-1">{cfg.partyLabel}</p>
                <p className="text-gray-900 font-semibold text-base leading-snug">
                  {(detail?.party_mailing_name && detail.party_mailing_name !== party ? detail.party_mailing_name : party) || "—"}
                </p>
                {detail?.party_address && (
                  <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">{detail.party_address}{detail.party_pincode ? ` – ${detail.party_pincode}` : ""}</p>
                )}
                {detail?.party_state && (
                  <p className="text-gray-400 text-[11px]">{detail.party_state}</p>
                )}
                {detail?.party_phone && (
                  <p className="text-gray-400 text-[11px] mt-0.5">Ph: {detail.party_phone}</p>
                )}
              </div>
              {detail?.party_gstin && (
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">GSTIN</p>
                  <p className="font-mono text-[11px] text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-100">{detail.party_gstin}</p>
                  {detail.party_gst_type && (
                    <p className="text-[9px] text-gray-400 mt-0.5">{detail.party_gst_type}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading details…</span>
            </div>
          ) : (
            <>
              {/* ── ITEMS TABLE ── */}
              {hasItems && (
                <div className="px-8 pt-6">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-3">Items</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: cfg.bg }}>
                          <th className="text-left py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400 w-6">#</th>
                          <th className="text-left py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">Description</th>
                          <th className="text-left py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">HSN/SAC</th>
                          <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">Qty</th>
                          <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">Rate</th>
                          <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">Disc%</th>
                          <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase tracking-widest text-gray-400">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.map((item, idx) => (
                          <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-3 px-3 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="py-3 px-3 text-gray-800 font-medium leading-snug max-w-[240px]">{item.name}</td>
                            <td className="py-3 px-3 text-gray-500 font-mono text-xs">{item.hsn || "—"}</td>
                            <td className="py-3 px-3 text-right text-gray-700 whitespace-nowrap">
                              {item.qty % 1 === 0 ? item.qty.toFixed(0) : item.qty.toFixed(2)}
                              {item.qty_unit && <span className="text-gray-400 text-xs ml-1">{item.qty_unit}</span>}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-700 whitespace-nowrap font-mono text-xs">
                              {item.rate > 0 ? `₹${item.rate.toLocaleString("en-IN")}` : "—"}
                              {item.rate_unit && <span className="text-gray-400 text-[10px] ml-1">/{item.rate_unit}</span>}
                            </td>
                            <td className="py-3 px-3 text-right text-gray-500 text-xs">
                              {item.discount > 0 ? `${item.discount}%` : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-gray-900 whitespace-nowrap font-mono">
                              ₹{item.amount.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {inv.length > 1 && (
                        <tfoot>
                          <tr className="border-t-2 border-gray-200" style={{ backgroundColor: cfg.bg }}>
                            <td colSpan={6} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">
                              Subtotal
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-800 font-mono">
                              ₹{subtotal.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAX / LEDGER BREAKDOWN ── */}
              {(hasAllLedgers || (!hasItems && (voucher.debit_ledger || voucher.credit_ledger))) && (
                <div className="px-8 pt-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-3">
                    {hasItems ? "Tax & Charges" : "Ledger Entries"}
                  </p>
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    <table className="w-full">
                      <thead style={{ backgroundColor: cfg.bg }}>
                        <tr>
                          <th className="text-left py-2.5 px-4 text-[9px] font-bold uppercase tracking-widest text-gray-400 w-14">Entry</th>
                          <th className="text-left py-2.5 px-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">Account / Ledger</th>
                          <th className="text-right py-2.5 px-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hasAllLedgers
                          ? (hasItems ? taxLedgers : ledgers).map((l, idx) => (
                              <tr key={idx} className="border-t border-gray-50">
                                <td className="py-3 px-4">
                                  <span className="text-[10px] font-black tracking-widest"
                                        style={{ color: l.is_dr ? cfg.color : "#9ca3af" }}>
                                    {l.is_dr ? "DR" : "CR"}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-gray-700 text-sm">{l.ledger}</td>
                                <td className="py-3 px-4 text-right font-mono text-sm text-gray-800">
                                  ₹{l.amount.toLocaleString("en-IN")}
                                </td>
                              </tr>
                            ))
                          : (
                            <>
                              {voucher.debit_ledger && (
                                <tr className="border-t border-gray-50">
                                  <td className="py-3 px-4">
                                    <span className="text-[10px] font-black tracking-widest" style={{ color: cfg.color }}>DR</span>
                                  </td>
                                  <td className="py-3 px-4 text-gray-700 text-sm">{voucher.debit_ledger}</td>
                                  <td className="py-3 px-4 text-right font-mono text-sm text-gray-800">—</td>
                                </tr>
                              )}
                              {voucher.credit_ledger && (
                                <tr className="border-t border-gray-50">
                                  <td className="py-3 px-4">
                                    <span className="text-[10px] font-black tracking-widest text-gray-300">CR</span>
                                  </td>
                                  <td className="py-3 px-4 text-gray-500 text-sm">{voucher.credit_ledger}</td>
                                  <td className="py-3 px-4 text-right font-mono text-sm text-gray-500">—</td>
                                </tr>
                              )}
                            </>
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── NARRATION ── */}
              {voucher.narration && (
                <div className="px-8 pt-5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-2">Narration</p>
                  <div className="rounded-xl px-4 py-3 border border-gray-100 bg-gray-50/50">
                    <p className="text-sm text-gray-500 leading-relaxed italic">{voucher.narration}</p>
                  </div>
                </div>
              )}

              {/* ── TOTAL + AMOUNT IN WORDS ── */}
              <div className="px-8 pt-5 pb-6">
                <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Total Amount</p>
                      <p className="text-[11px] text-gray-400 italic leading-relaxed max-w-[340px]">
                        {amountInWords(detail?.amount ?? voucher.amount)}
                      </p>
                    </div>
                    <p className="text-3xl font-bold font-mono tracking-tight" style={{ color: cfg.color }}>
                      {formatIndian(detail?.amount ?? voucher.amount)}
                    </p>
                  </div>
                  {/* Bank details */}
                  <div className="border-t pt-3 mt-1" style={{ borderColor: cfg.border }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Bank Details</p>
                    <p className="text-[11px] text-gray-600">
                      <span className="font-medium">ICICI Bank</span>
                      <span className="text-gray-400 mx-1.5">·</span>
                      A/C: <span className="font-mono">419705500695</span>
                      <span className="text-gray-400 mx-1.5">·</span>
                      IFSC: <span className="font-mono">ICIC0004197</span>
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── FOOTER ── */}
          {party && voucher.party_name && (
            <div className="px-8 pb-6 flex items-center justify-between border-t border-gray-50 pt-4">
              <button onClick={() => { onClose(); onViewParty(voucher.party_name) }}
                className="flex items-center gap-2 text-sm font-medium text-forest-600 hover:text-forest-800 transition-colors">
                <ExternalLink size={13} />
                View full statement for {voucher.party_name}
              </button>
              <p className="text-[9px] text-gray-300">This is a computer generated invoice</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Voucher List view (Level 2) ───────────────────────────────────────────────

export function VoucherListView({
  vtype, initialFy, availableFY, onBack, onOpen,
}: {
  vtype: string; initialFy: string; availableFY: string[]
  onBack: () => void; onOpen: (v: VoucherRow) => void
}) {
  const cfg = VTYPE_CONFIG[vtype] || VTYPE_CONFIG["Other"]
  const Icon = cfg.icon

  const [localFy,       setLocalFy]       = useState(initialFy)
  const [searchInput,   setSearchInput]   = useState("")
  const [search,        setSearch]        = useState("")
  const [page,          setPage]          = useState(1)
  const [sort,          setSort]          = useState("date_desc")

  // Reset page when any filter changes
  useEffect(() => { setPage(1) }, [vtype, localFy, search, sort])

  const { data, isLoading, isFetching } = useQuery<VoucherPage>({
    queryKey: ["voucher-list", vtype, localFy, search, page, sort],
    queryFn: () => apiPost("hr_client.api.operations.get_voucher_list", {
      voucher_type: vtype, fy: localFy, search, page, page_size: 50, sort,
    }),
    staleTime: 60_000,
    retry: 1,
  })

  function doSearch() { setSearch(searchInput); setPage(1) }
  function clearSearch() { setSearchInput(""); setSearch(""); setPage(1) }

  const totalPages = data?.pages ?? 1

  return (
    <div className="space-y-4">
      {/* List header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0">
          <ChevronLeft size={15} />
          <span>All Types</span>
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
               style={{ backgroundColor: cfg.bg }}>
            <Icon size={15} style={{ color: cfg.color }} strokeWidth={1.5} />
          </div>
          <h2 className="font-semibold text-gray-900">{cfg.label}</h2>
          {data && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {data.total.toLocaleString()} entries
            </span>
          )}
        </div>
        {isFetching && <Loader2 size={13} className="text-gray-400 animate-spin ml-auto" />}
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search input */}
        <div className="flex-1 min-w-[200px] relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Search party, narration or voucher number…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white
                       focus:outline-none focus:border-forest-300 focus:ring-1 focus:ring-forest-100 transition-colors"
          />
          {searchInput && (
            <button onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>
        <button onClick={doSearch}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
          Search
        </button>
        {/* FY filter */}
        <select value={localFy} onChange={e => { setLocalFy(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-forest-300">
          <option value="all">All Time</option>
          {availableFY.map(y => <option key={y} value={y}>{y.replace("-", "–")}</option>)}
        </select>
        {/* Sort */}
        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-forest-300">
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="amount_desc">Highest amount</option>
          <option value="amount_asc">Lowest amount</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-forest-400 animate-spin" />
            <p className="text-sm text-gray-400">Loading entries…</p>
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                 style={{ backgroundColor: cfg.bg }}>
              <Icon size={22} style={{ color: cfg.color }} strokeWidth={1.5} />
            </div>
            <p className="text-gray-500 text-sm font-medium">No entries found</p>
            {search && <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filter</p>}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr className="bg-gray-50/80">
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Voucher #</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Party</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden lg:table-cell">Narration</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.data.map((row) => {
                  const displayParty = row.party_name || row.debit_ledger || "—"
                  return (
                    <tr key={row.name} onClick={() => onOpen(row)}
                      className="hover:bg-slate-50/70 cursor-pointer transition-colors group">
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap text-xs font-mono">
                        {fmtShortDate(row.voucher_date)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-gray-700 bg-gray-50 group-hover:bg-white px-1.5 py-0.5 rounded transition-colors">
                          {row.voucher_number || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800 truncate max-w-[200px]">{displayParty}</p>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs hidden lg:table-cell max-w-[220px]">
                        <p className="truncate">{row.narration || "—"}</p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-semibold text-sm" style={{ color: cfg.color }}>
                          {row.amount_fmt}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50 bg-gray-50/40">
                <span className="text-xs text-gray-400">
                  {data.total.toLocaleString()} entries · 50 per page
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30
                               px-2.5 py-1.5 rounded-lg hover:bg-white transition-all disabled:cursor-not-allowed">
                    <ChevronLeft size={12} /> Prev
                  </button>
                  <span className="text-xs text-gray-500 px-3 py-1.5 font-medium">
                    {page} / {totalPages}
                  </span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30
                               px-2.5 py-1.5 rounded-lg hover:bg-white transition-all disabled:cursor-not-allowed">
                    Next <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main VoucherBrowser component ─────────────────────────────────────────────

export function VoucherBrowser({
  globalFy, availableFY, finSummary, onViewParty,
}: {
  globalFy: string
  availableFY: string[]
  finSummary: Record<string, VoucherLine> | undefined
  onViewParty: (party: string) => void
}) {
  const [view,         setView]         = useState<"folders" | "list">("folders")
  const [activeType,   setActiveType]   = useState("")
  const [openVoucher,  setOpenVoucher]  = useState<VoucherRow | null>(null)

  // Reset to folders when global FY changes
  useEffect(() => { setView("folders") }, [globalFy])

  function getLine(vtype: string): VoucherLine | undefined {
    if (!finSummary) return undefined
    const keyMap: Record<string, string> = {
      "Sales":            "sales",
      "PERFORMA INVOICE": "performa",
      "Sales Order":      "sales_order",
      "Purchase":         "purchase",
      "Purchase Order":   "purchase_order",
      "Receipt":          "receipt",
      "Payment":          "payment",
      "Credit Note":      "credit_note",
      "Debit Note":       "debit_note",
      "Journal":          "journal",
      "Contra":           "contra",
      "Delivery Note":    "delivery_note",
      "Stock Journal":    "stock_journal",
      "Other":            "other",
    }
    return finSummary[keyMap[vtype]]
  }

  return (
    <>
      {view === "folders" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {globalFy !== "all"
                ? `Voucher Types · FY ${globalFy.replace("-", "–")}`
                : "Voucher Types · All Time"}
            </p>
            {finSummary && (
              <span className="text-xs text-gray-400">
                {Object.values(finSummary)
                  .filter((v): v is VoucherLine => typeof v === "object" && "cnt" in v)
                  .reduce((s, v) => s + v.cnt, 0)
                  .toLocaleString()} total entries
              </span>
            )}
          </div>

          {!finSummary ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {TYPE_ORDER.map(vtype => {
                const line = getLine(vtype)
                if (!line || line.cnt === 0) return null
                return (
                  <FolderCard
                    key={vtype}
                    vtype={vtype}
                    line={line}
                    onClick={() => { setActiveType(vtype); setView("list") }}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {view === "list" && (
        <VoucherListView
          vtype={activeType}
          initialFy={globalFy}
          availableFY={availableFY}
          onBack={() => setView("folders")}
          onOpen={setOpenVoucher}
        />
      )}

      {openVoucher && (
        <VoucherDocument
          voucher={openVoucher}
          onClose={() => setOpenVoucher(null)}
          onViewParty={(party) => {
            setOpenVoucher(null)
            onViewParty(party)
          }}
        />
      )}
    </>
  )
}
