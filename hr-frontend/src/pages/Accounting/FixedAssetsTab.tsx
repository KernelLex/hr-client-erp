import { AlertCircle } from "lucide-react"
import { LedgerStatementView } from "./LedgerStatementView"

export function FixedAssetsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm bg-amber-50 border border-amber-200">
        <AlertCircle size={14} className="text-amber-600 shrink-0" />
        <span className="text-amber-800">
          Tally books fixed assets as ledger accounts, not individual asset records — there's no
          acquisition date, useful life, or per-asset tracking available, only ledger balances and movements.
        </span>
      </div>
      <LedgerStatementView scope="fixed_assets" placeholder="Search fixed asset ledgers…" />
    </div>
  )
}
