// Vendor Payments & Supplier Ledger — what we owe each vendor vs what we've paid.
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { vendorPaymentGet, vendorPaymentPost } from "../peoplework/client"

type LedgerRow = { vendor: string; ordered: number; received: number; paid: number; outstanding: number; pos: number }
type LedgerResp = { ledger: LedgerRow[]; kpis: Record<string, number> }
type Payment = { name?: string; vendor?: string; amount?: number; payment_date?: string; mode?: string; reference?: string; purchase_order?: string; project?: string; notes?: string }
type PayResp = { payments: Payment[] }

const inr = (n?: number) => "₹" + (n || 0).toLocaleString("en-IN")
const field = "rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[var(--border-subtle)] focus:outline-none"
const MODES = ["Bank Transfer", "Cheque", "Cash", "UPI", "Other"]
const blank: Payment = { vendor: "", amount: 0, mode: "Bank Transfer" }

export function VendorPaymentsPage() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Payment>(blank)
  const ledger = useQuery({ queryKey: ["supplier_ledger"], queryFn: () => vendorPaymentGet<LedgerResp>("get_supplier_ledger") })
  const pays = useQuery({ queryKey: ["vendor_payments"], queryFn: () => vendorPaymentGet<PayResp>("list_payments") })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["supplier_ledger"] }); qc.invalidateQueries({ queryKey: ["vendor_payments"] }) }
  const rec = useMutation({ mutationFn: (p: Payment) => vendorPaymentPost("record_payment", { payload: p }), onSuccess: () => { setDraft(blank); invalidate() } })
  const del = useMutation({ mutationFn: (name: string) => vendorPaymentPost("delete_payment", { name }), onSuccess: invalidate })
  const k = ledger.data?.kpis

  return (
    <div className="p-6 mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Vendor Payments</h1>
      <p className="text-sm text-gray-500 mb-5">What each supplier is owed (received vs paid) and a log of payments made.</p>

      {k && (
        <div className="flex flex-wrap gap-4 mb-6">
          <Stat label="Vendors" value={String(k.vendors)} />
          <Stat label="Ordered" value={inr(k.ordered)} />
          <Stat label="Received" value={inr(k.received)} />
          <Stat label="Paid" value={inr(k.paid)} tone="text-[var(--text-primary)]" />
          <Stat label="Outstanding" value={inr(k.outstanding)} tone="text-red-600" />
        </div>
      )}

      {/* ledger */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-slate-700 mb-3">Supplier Ledger</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1">Vendor</th><th className="text-right">POs</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th></tr></thead>
          <tbody>
            {(ledger.data?.ledger || []).map((r) => (
              <tr key={r.vendor} className="border-b border-gray-50">
                <td className="py-1.5 text-slate-700">{r.vendor}</td>
                <td className="text-right text-gray-500">{r.pos}</td>
                <td className="text-right text-gray-500">{inr(r.ordered)}</td>
                <td className="text-right text-gray-500">{inr(r.received)}</td>
                <td className="text-right text-[var(--text-primary)]">{inr(r.paid)}</td>
                <td className={`text-right font-medium ${r.outstanding > 0 ? "text-red-600" : "text-gray-400"}`}>{inr(r.outstanding)}</td>
              </tr>
            ))}
            {!(ledger.data?.ledger || []).length && <tr><td colSpan={6} className="text-center text-gray-300 py-4 text-xs">No purchase orders / receipts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* record payment */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-slate-700 mb-3">Record a payment</h2>
        <div className="flex flex-wrap items-end gap-3">
          <L label="Vendor"><input className={`${field} w-40`} value={draft.vendor || ""} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></L>
          <L label="Amount"><input className={`${field} w-28 text-right`} type="number" value={draft.amount || 0} onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })} /></L>
          <L label="Date"><input className={field} type="date" value={draft.payment_date || ""} onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })} /></L>
          <L label="Mode"><select className={field} value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></L>
          <L label="Reference"><input className={`${field} w-32`} value={draft.reference || ""} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></L>
          <button onClick={() => draft.vendor && draft.amount ? rec.mutate(draft) : null} disabled={rec.isPending} className="rounded-md bg-[var(--bg-inverse)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--bg-inverse)] disabled:opacity-40">{rec.isPending ? "…" : "Record"}</button>
        </div>
      </div>

      {/* payment log */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Payments</h2>
        {(pays.data?.payments || []).map((p) => (
          <div key={p.name} className="flex justify-between items-center border-b border-gray-50 py-1.5 text-sm">
            <div><span className="text-slate-700">{p.vendor}</span> <span className="text-xs text-gray-400">· {p.payment_date} · {p.mode}{p.reference ? ` · ${p.reference}` : ""}</span></div>
            <div className="flex items-center gap-3"><span className="text-slate-600">{inr(p.amount)}</span><button onClick={() => del.mutate(p.name!)} className="text-red-400 hover:text-red-600 text-xs">✕</button></div>
          </div>
        ))}
        {!(pays.data?.payments || []).length && <div className="text-xs text-gray-300">No payments recorded yet.</div>}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3 min-w-[120px]"><div className="text-xs text-gray-400">{label}</div><div className={`text-lg font-bold ${tone || "text-slate-800"}`}>{value}</div></div>
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-500 mb-1 block">{label}</label>{children}</div>
}
