import { AlertCircle } from "lucide-react"
import { LedgerStatementView } from "./LedgerStatementView"

export function BankReconciliationTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
        <AlertCircle size={14} className="text-[var(--text-primary)] shrink-0" />
        <span className="text-[var(--text-primary)]">
          Register of Tally-recorded transactions per bank/cash ledger — there's no external bank statement
          import in this system, so this isn't a true reconciliation against your bank's own records yet.
        </span>
      </div>
      <LedgerStatementView scope="bank_cash" placeholder="Search bank or cash ledgers…" />
    </div>
  )
}
