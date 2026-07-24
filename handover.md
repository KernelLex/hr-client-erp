# Handover — Accounting Dashboard: 17 remaining tabs

_Session date: 2026-07-24_

## Why this work happened

The `/accounting` page has an 18-tab bar (Chart of Accounts → Financial Statements). Chart of
Accounts was supposedly built in the previous session; the other 17 tabs showed "Coming soon".
On inspection, **two bugs meant even Chart of Accounts was broken**, plus a known data-completeness
gap the user had already diagnosed themselves:

1. **`Accounting/index.tsx` never rendered any tab component.** The tab-content block always
   rendered `<ComingSoon />` regardless of which tab was selected — so Chart of Accounts was
   invisible even though `ChartOfAccountsTab.tsx` existed and worked.
2. **Chart of Accounts read the wrong data source.** It queried native ERPNext `Account` +
   `GL Entry` — but this app never posts to `GL Entry`. All Tally data lives in custom DocTypes
   (`VE Tally Voucher`, `VE Tally Ledger`, and derived tables). So even once wired up, COA would
   have shown a near-empty tree with ₹0 balances.
3. **The live Tally import only reads `Transactions.xml`** (1,098 vouchers, current FY only)
   instead of `All Transactions.xml` (25,066 vouchers, full history) — the exact gap the user's
   own Tally-file-inventory analysis flagged before this session started.

## What changed

### Backend — data foundation (`hr_client/api/tally_import_job.py`)

- Added `PRIMARY_GROUP_ROOT_MAP`: Tally's ~15 fixed primary groups (Sales Accounts, Fixed Assets,
  Indirect Expenses, etc.) mapped to accounting root type (Asset/Liability/Equity/Income/Expense).
- Added `_root_type_for_group()`: walks a ledger/group's parent chain up to its ultimate primary
  group and returns the mapped root type.
- **`VE Tally Ledger.root_group`** (column already existed, was always written as `''`) is now
  actually populated during import.
- **New DocType `VE Tally Group`** (`hr_client/hr_client/doctype/ve_tally_group/`) — persists the
  full Tally GROUP hierarchy (name, parent, root_group, is_primary). Previously this was parsed
  into a transient `group_parents` dict and discarded at the end of every import. This is what
  lets Chart of Accounts render a real nested tree instead of a flat ledger list.
- Note: the DocType lives at `hr_client/hr_client/doctype/ve_tally_group/` (**double**-nested).
  `CLAUDE.md` claims DocTypes must be **triple**-nested
  (`hr_client/hr_client/hr_client/doctype/...`) — that guardrail is stale. Every existing DocType
  in this repo (ve_tally_ledger, ve_tally_voucher, vera_expense_claim, etc.) is double-nested.
  Worth fixing that CLAUDE.md line so future sessions don't get misled by it.

### Backend — full history import (`hr_client/api/accounts_dashboard.py`, `tally_transformer.py`)

- `TRANSACTIONS_PATH` changed from `/home/vera/Transactions.xml` → `/home/vera/All Transactions.xml`.
- **Action required before triggering an import:** SSH into the server and run
  `ls /home/vera/` to confirm the file is actually named exactly `All Transactions.xml`
  (case/spacing must match — I could not verify this from this session, no server access).
  If it's named differently, update the constant in `accounts_dashboard.py` before deploying.
- This file is ~1.5GB vs. the old 131MB file — the import will take noticeably longer. The
  existing streaming parser (2MB chunks) and `timeout=7200` (2hr) should still be enough, but
  watch the first run.

### Backend — new/changed API endpoints

**`hr_client/api/accounting.py`** (rewrote; dropped the old native-ERPNext `get_chart_of_accounts`,
`get_account_groups`, `create_account` — Tally is a one-way, read-only import, so "create account"
against it never made sense):

| Endpoint | Purpose |
|---|---|
| `get_tally_chart_of_accounts()` | Real nested COA tree from `VE Tally Group` + `VE Tally Ledger` |
| `get_sales_invoices(fy, search, page, page_size, sort)` | From `VE Sales Register Entry` |
| `get_purchase_bills(fy, search, page, page_size, sort)` | From `VE Purchase Register Entry` |
| `search_ledgers(search, scope, limit)` | Ledger picker; `scope`: none / `bank_cash` / `fixed_assets` |
| `get_profit_and_loss(from_date, to_date)` | Period P&L from actual voucher ledger-entry movement (not static balance) |
| `get_balance_sheet()` | Current-snapshot BS from `VE Tally Ledger.closing_balance`, grouped by root type |
| `get_depreciation_entries(fy, page, page_size)` | Journal vouchers mentioning "depreciation" (best-effort) |
| `resolve_voucher_by_guid(guid)` | Drill-down: strips `SR-`/`PR-` register prefix, finds source `VE Tally Voucher`, returns full detail |

**`hr_client/api/operations.py`**: `get_bank_statement` refactored — its SQL was never actually
bank-specific (`WHERE debit_ledger = %s OR credit_ledger = %s`). Extracted the shared query into
`_ledger_txn_query()`; `get_bank_statement` now delegates to it (unchanged response shape, still
used by the existing `AccountingOverview.tsx` bank-statement viewer — verified no breakage). Added
`get_ledger_statement(ledger_name, ...)` as the properly-named generic version, used by the new
General Ledger and Bank & Cash Book tabs.

No changes needed to `accounts_dashboard.py`'s existing AR/AP/Cash-Flow endpoints
(`get_receivables_payables_summary`, `get_debtors_report`, `get_creditors_report`, `+ advance
variants`, `get_cash_flow_statement`) — reused as-is.

### Frontend — `hr-frontend/src/pages/Accounting/`

| File | What it is |
|---|---|
| `index.tsx` | **The core fix** — now actually renders the selected tab's component instead of always showing "Coming soon" |
| `api.ts` | Shared fetch helpers (CSRF header, GET/POST, Frappe error unwrapping) for `accounting` / `operations` / `accounts_dashboard` Python modules |
| `ChartOfAccountsTab.tsx` | Repointed to `get_tally_chart_of_accounts`; dropped the "New Account" create modal |
| `VoucherListTab.tsx` | Generic — powers Journal Entries, Payment Entries, Receipts, Credit Notes, Debit Notes (parameterized by `voucherType`) |
| `RegisterListTab.tsx` | Generic — powers Sales Invoices, Purchase Bills |
| `VoucherDetailDrawer.tsx` | Shared side-panel voucher detail, opens by `name` (direct) or `guid` (register-prefixed, resolved server-side) |
| `LedgerStatementView.tsx` | Ledger picker + statement, shared by General Ledger and Bank & Cash Book (`scope` prop narrows the picker) |
| `GeneralLedgerTab.tsx` | Thin wrapper: `LedgerStatementView` with no scope |
| `BankReconciliationTab.tsx` | `LedgerStatementView` scoped to bank/cash ledgers + limitation banner |
| `FixedAssetsTab.tsx` | `LedgerStatementView` scoped to Fixed Assets ledgers + limitation banner |
| `DepreciationTab.tsx` | Filtered journal-entry list + limitation banner |
| `ReceivablePayableTab.tsx` | Accounts Receivable / Accounts Payable (`kind` prop) |
| `CashFlowTab.tsx` | Cash Flow statement, period filter, CSS-only monthly trend bars (no chart lib needed) |
| `FinancialStatementsTab.tsx` | P&L + Balance Sheet sub-tabs, collapsible group→ledger breakdown |

**Shared components added:**
- `hr-frontend/src/components/dashboard/PeriodFilter.tsx` — Today/MTD/YTD/Last FY/Custom picker
  (extracted from inline code duplicated in `AccountingOverview.tsx`), + `periodParams()` helper.
  Exported from the `components/dashboard` barrel.
- `hr-frontend/src/lib/csv.ts` — `exportCsv(filename, headers, rows)`, extracted from a
  duplicated inline `Blob` pattern.
- `hr-frontend/src/components/ui/data-table.tsx` — added an optional `onRowClick` prop
  (backward-compatible, every other usage of `DataTable` is unaffected).

## Scope disposition (all 18 tabs)

| Tab | Outcome |
|---|---|
| Chart of Accounts | Rebuilt on real Tally Group/Ledger tree |
| Journal Entries, Payment Entries, Receipts, Credit Notes, Debit Notes | Full |
| Sales Invoices, Purchase Bills | Full |
| General Ledger | Full |
| Accounts Receivable, Accounts Payable | Full |
| Cash Flow | Full |
| Financial Statements (P&L + Balance Sheet) | Full |
| Bank Reconciliation | Best-effort "Bank & Cash Book" — labeled: no external bank statement import exists to reconcile against |
| Fixed Assets | Best-effort ledger register — labeled: Tally books these as ledger accounts, not per-asset records |
| Depreciation | Best-effort — labeled: filtered journal entries, not a computed schedule |
| **Cost Centers** | **Left "Coming soon"** — Tally never exports `COSTCENTRE` or per-voucher `CATEGORYALLOCATIONS`; needs its own pipeline follow-up |
| **Budgeting** | **Left "Coming soon"** — no existing data source; needs a net-new manual-entry feature, not a dashboard on existing data |

## Known caveats to be aware of

- **Balance Sheet is a live snapshot only** — Tally only gives us current closing balances, not
  historical point-in-time ones, so there's no "as of [past date]" picker.
- **Balance Sheet may show a non-zero `balance_check`** — this most likely reflects current-year
  profit/retained earnings not yet posted to an Equity ledger in Tally, not a data bug. Shown as
  an amber banner in the UI, not hidden.
- **P&L/Balance Sheet root classification depends on Tally's group names staying close to
  defaults.** If Owais renamed a primary group in Tally (e.g. renamed "Indirect Expenses" to
  something else), that subtree won't classify and its ledgers will simply be excluded from P&L/BS
  totals — no crash, but a silent gap. Worth spot-checking `VE Tally Group` after the first import
  for any `root_group = ''` rows.
- **Depreciation / Fixed Assets / Bank Reconciliation are intentionally approximate** — the UI
  says so in each tab; don't present these as authoritative without reading the banner text.

## Deploy checklist (none of this was run — no server access from this session)

1. `git pull` on the server (after merging/deploying this branch).
2. **Confirm `/home/vera/All Transactions.xml` exists with that exact name** — `ls /home/vera/`.
   If different, fix `TRANSACTIONS_PATH` in `hr_client/api/accounts_dashboard.py` first.
3. `bench --site hrms.localhost migrate` (new `VE Tally Group` DocType + new `root_group` data).
4. `bench --site hrms.localhost clear-cache`.
5. Trigger "Import from Tally" from the UI (admin-only, in the Accounting page) — expect this run
   to take longer than usual given the ~11x larger transactions file.
6. Check `GET /api/method/hr_client.api.accounts_dashboard.get_reconciliation_report` for errors.
7. Spot-check `VE Tally Group` for any rows with empty `root_group` (see caveat above).
8. Click through all 16 built tabs on `/accounting`.
9. `cd hr-frontend && npm install && npm run build` on the server if the deploy pipeline doesn't
   already do this — confirmed clean locally in this session.

## What's next (not done, needs its own scoping)

- **Cost Centers**: add `COSTCENTRE` master parsing + per-voucher `CATEGORYALLOCATIONS.LIST`
  parsing to `tally_import_job.py` to get real financials per cost centre, not just a name list.
- **Budgeting**: new manual-entry DocType (per account/period budget figures) + variance-vs-actual
  UI, once the reporting tabs above have been used enough to know which accounts matter.
