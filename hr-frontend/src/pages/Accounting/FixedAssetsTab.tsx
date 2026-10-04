import { AlertCircle } from "lucide-react"
import { LedgerStatementView } from "./LedgerStatementView"

export function FixedAssetsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
        <AlertCircle size={14} className="text-[var(--text-primary)] shrink-0" />
        <span className="text-[var(--text-primary)]">
          Tally books fixed assets as ledger accounts, not individual asset records — there's no
          acquisition date, useful life, or per-asset tracking available, only ledger balances and movements.
        </span>
      </div>
      <LedgerStatementView scope="fixed_assets" placeholder="Search fixed asset ledgers…" />
    </div>
  )
}
