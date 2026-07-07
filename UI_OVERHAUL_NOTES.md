# UI Overhaul — Handoff Notes (for the server-side Claude instance)

_Started 2026-07-07. This file is a working log for the frontend UI overhaul happening on branch
`feature/ui-overhaul`. It is separate from `CLAUDE.md` (the permanent master context file — do not
duplicate content into it until this branch merges; then fold the relevant bits in and delete this file)._

**Read this if:** you are asked to deploy this branch, continue the UI overhaul, or debug something
that looks new/unfamiliar in `hr-frontend/src/pages/Operations/`, `hr-frontend/src/components/dashboard/`,
or the sidebar.

---

## What this branch is

A full frontend visual overhaul modeled on a reference HTML mockup the user provided (`SL_Dashboard_UI.html`,
a fictional "Schönes Leben" interiors company dashboard) — gold/forest-green design system, serif headings,
card/modal/data-table patterns. The mockup's sidebar showed a full ERP information architecture (~15 modules);
the only page it fully populated with sample data was an **Accounts Dashboard**.

**Guiding rule the user set (important — do not violate it):** only build real pages for modules where
real data exists or can be derived from the existing Tally import. Do not add "coming soon" placeholder
pages or nav items for modules with no data path (Manufacturing, Company Audit, Projects/PMS, To-Do System,
Integrations were all dropped from the sidebar entirely for this reason — see below).

Three phases were planned; see `Phase 3 — what's left` at the bottom for what's still open.

---

## Phase 1 — Design system + navigation shell (done)

- **Design tokens** (`hr-frontend/src/index.css`, `hr-frontend/tailwind.config.js`): replaced the old
  indigo/slate palette with gold/forest-green (`--brand-primary: #1e3a2f`, `--gold: #c8a45c`,
  `--cream: #f5efe4`, etc). Added Playfair Display as `font-heading` (now a real Tailwind
  `fontFamily.heading` mapping — previously `--font-heading` was a dead CSS variable that Tailwind v3
  never picked up, so `font-heading` classes on `Card`/`Dialog` titles rendered as the default sans font).
- **Fixed a pre-existing bug:** `tailwind.config.js` mapped `bg-card`/`bg-popover` to `hsl(var(--card))`,
  but `index.css` defined those vars as `oklch(...)` — invalid inside `hsl()`, silently rendering
  transparent. All shadcn color tokens are now plain `H S% L%` triplets so `hsl(var(--x))` resolves
  correctly. (Old workaround of hardcoding `bg-white` in individual components — e.g. `select.tsx`,
  `dialog.tsx` — is now unnecessary but was left in place; harmless.)
- **New reusable component library** at `hr-frontend/src/components/dashboard/`: `StatCard`, `BalanceCard`,
  `ChartCard`, `NetHighlightCard`, `AgingPill`/`AgingPillMonths`/`AgingLegend`, `SectionHeader`/
  `SectionSubHeader`, `PageHeader`/`HeaderPill`, `DeptTabs`, `DrillDownModal`/`SummaryStat`. Plus a new
  generic `DataTable` at `hr-frontend/src/components/ui/data-table.tsx` (sortable, searchable, exportable
  affordance) — there was no shared table component before this; every page hand-rolled `<table>`.
- **Sidebar rebuilt** (`hr-frontend/src/components/layout/Sidebar.tsx`) into 5 section groups (Overview /
  Operations / Finance & Governance / People & Work / Platform), matching the reference's IA but trimmed
  to only real/derivable modules. New admin-only nav items: Inventory, Purchasing, Logistics, Returns,
  Accounting (renamed from "Operations"), Sales Register (under the Sales/CRM group).
- **`useAdminGuard()` hook** added (`hr-frontend/src/lib/useAdminGuard.tsx`) — redirects non-admins away
  from admin-only pages at the component level, not just the nav link, per the existing CLAUDE.md guardrail
  ("DO NOT put admin-only routes behind only a nav guard"). Applied to all 5 new pages plus the Accounting page.
- **Five new pages**, all thin wrappers reusing existing `hr_client.api.operations` endpoints —
  **no new backend was needed for these**:
  - `hr-frontend/src/pages/Inventory/index.tsx` — item master via `get_tally_stock_items`
  - `hr-frontend/src/pages/Purchasing/index.tsx` — Purchase Bills / Purchase Orders
  - `hr-frontend/src/pages/SalesRegister/index.tsx` — Sales Invoices / Sales Orders / Performa Invoices
  - `hr-frontend/src/pages/Logistics/index.tsx` — Delivery Notes
  - `hr-frontend/src/pages/Returns/index.tsx` — Credit Notes (sales returns) / Debit Notes (purchase returns)

  These reuse `VoucherListView` and `VoucherDocument`, which were exported from
  `hr-frontend/src/pages/Operations/VoucherBrowser.tsx` (previously private to that file) so the voucher
  list/detail UI didn't need to be rebuilt per page.
- **Dashboard** (`hr-frontend/src/pages/Dashboard.tsx`) re-skinned with the new `PageHeader`/`StatCard`
  components as a proof of concept — logic untouched, presentation only.
- **Routes added** in `hr-frontend/src/App.tsx`: `/accounting` (new canonical route, was `/operations`,
  which now redirects), `/inventory`, `/purchasing`, `/sales-register`, `/logistics`, `/returns`.

## Phase 2 — Accounting dashboard rebuild (done)

Rebuilt the Accounting page (`hr-frontend/src/pages/Operations/index.tsx` +
new `hr-frontend/src/pages/Operations/AccountingOverview.tsx`) to match the reference's section layout:
Available Funds → Accounts Details → Statutory Compliance → Receivables & Payables → Cash & Fund Flow →
Inventory, each with real drill-down modals (search/sort/export via `DataTable`).

**Backend: 2 new whitelisted endpoints added** to `hr_client/api/operations.py` (no DocType/schema changes,
so **no `bench migrate` needed** — a code reload / `bench restart` is enough to pick them up):

```python
get_advance_from_debtors()   # debtor ledgers with closing_balance < 0 (customers who prepaid us)
get_advance_to_creditors()   # creditor ledgers with closing_balance > 0 (vendors we prepaid)
```

Both follow the exact pattern of the pre-existing `get_debtor_aging()` / `get_creditor_list()` (same SQL
join shape, same `_require_admin()` gate) but with the balance-sign filter flipped, aged in months instead
of days to match the reference's "Advance to Creditors" / "Advance from Debtors" cards.

**Every card on the new Accounting page is backed by real data — nothing is mocked.** Where the reference
mockup showed something we cannot derive from the current data model, the card was either adapted to what's
real or dropped entirely (see the data-gap list below). Notable adaptations:

| Reference card | What we actually show | Why |
|---|---|---|
| Virtual Account Balance (Razorpay/PhonePe) | **Dropped entirely** | No payment gateway integration exists; no data source at all |
| Overdraft (OD) Account: Available / Limit / Utilised | Single "Bank Overdraft Utilised" stat (Utilised only) | `VE Tally Ledger` has no credit-limit field — "Limit" isn't derivable, so we don't fabricate it |
| Net Cash Flow: Operating / Investing / Financing breakdown | Simple "Receipts − Payments" net, plus a monthly trend | Tally vouchers aren't tagged with cash-flow-statement activity categories in our schema — only a receipts-vs-payments net is honest |
| Materials Flow: Fast/Mid/Slow Moving, Dead Stock, Low Stock, Re-order Stock, Negative Stock, Stock Value | **Dropped entirely**, replaced with SKU count + brand groups + a note explaining why | `VE Tally Stock Item` has no quantity-on-hand or stock-movement field — only item master (name, HSN, GST%, standard rate). There is literally no quantity data anywhere in the schema to compute any of this. |
| GSTIN header pill | **Dropped** | No company GSTIN master field exposed via any endpoint |
| Sales/Purchase YoY % | Real — computed client-side from two `get_financial_summary(fy=...)` calls (current FY vs previous FY) | |
| Debtors/Creditors aging buckets | Real — `get_debtor_aging()` already buckets server-side; creditors bucketed client-side using the same day thresholds since `get_creditor_list()` only returns raw `days` | |
| TDS Payable | Added as a bonus 4th Statutory Compliance card (not in the reference, but real data exists via `finance.kpis` "TDS Payable") | |

**Files changed in Phase 2:**
- `hr_client/api/operations.py` — 2 new endpoints (`get_advance_from_debtors`, `get_advance_to_creditors`)
- `hr-frontend/src/pages/Operations/AccountingOverview.tsx` — **new file**, the whole reference-style dashboard
- `hr-frontend/src/pages/Operations/index.tsx` — gutted from an 8-tab layout (Overview/Cashflow/Receivables/
  Payables/Search/Ledger/Inventory/Import) down to 4 tabs (Dashboard/Search/Ledger/Import & AI). Cashflow,
  Receivables, Payables and Inventory tabs were removed because their content now lives in
  `AccountingOverview` as sections + drill-down modals — nothing was lost, it was restructured.
- `hr-frontend/src/pages/Operations/VoucherBrowser.tsx` — `VoucherListView` exported (was private)

---

## Deploying this branch

No DocType/schema changes were made in Phase 1 or Phase 2 — **`bench migrate` is not required.**

1. `git pull` / merge `feature/ui-overhaul` on the server.
2. Backend: the 2 new Python functions in `hr_client/api/operations.py` need the bench process reloaded
   to be picked up — `bench restart` (or wait for the nightly 2 AM auto-deploy cron, which already does
   `migrate` + `restart`). `bench --site hrms.localhost clear-cache` is harmless but not required since
   no fixtures/Custom Fields changed.
3. Frontend: `cd hr-frontend && npm install && npm run build` (only needed if `node_modules` isn't already
   present with the current `package.json` — no new dependencies were added this session, only source
   files changed). nginx already serves the built `dist/` per the existing setup.
4. Sanity check after deploy: hit `/api/method/hr_client.api.operations.get_advance_from_debtors` and
   `/api/method/hr_client.api.operations.get_advance_to_creditors` directly (logged in as admin) — both
   should return a JSON array, not a 404.

**Not yet done:** this was all built and verified locally via `tsc -b`, `vite build`, and `eslint` (all
clean) but **never click-tested against a live backend** — the dev sandbox this was built in had no bench
instance reachable. Whoever deploys this should click through the new `/accounting`, `/inventory`,
`/purchasing`, `/sales-register`, `/logistics`, `/returns` pages with real data before calling it done.

---

## Tally-extraction data gaps — what to add if full reference parity is wanted later

These are things the reference mockup showed that we currently **cannot** show with real data, because the
Tally XML import pipeline (`hr_client/api/tally_import_job.py`, `hr_client/api/tally_enrich.py`, and the
`VE Tally Ledger` / `VE Tally Voucher` / `VE Tally Stock Item` DocTypes) doesn't capture the underlying
fields. If someone wants to close these gaps, here's what each would need:

1. **Stock quantity/valuation** (blocks the whole "Materials Flow" section: Stock Value, Fast/Mid/Slow
   Moving, Dead Stock, Low Stock, Re-order Stock, Negative Stock). `VE Tally Stock Item` currently only
   stores `item_name, stock_group, hsn_code, gst_rate, unit, standard_rate` — no opening/closing quantity,
   no per-period movement. Tally XML exports *do* contain stock item opening/closing balances and stock
   voucher (Stock Journal) quantity movements — this would need: (a) new fields on `VE Tally Stock Item`
   (opening_qty, closing_qty, last_movement_date), (b) a re-order/safety-level concept (Tally doesn't track
   this natively unless configured per-item — may need to be a manually-maintained field instead), (c) a
   turnover-days calculation from voucher-level stock movement, which would require inventory entries on
   `VE Tally Voucher` (there's already an `inventory_entries` JSON blob referenced in
   `get_voucher_detail` — check whether it already has qty data before adding new extraction logic).

2. **Bank ledger credit limit** (blocks the "Limit" field on the Overdraft Balance card — we can only show
   "Utilised" today, derived from negative bank ledger balances). Tally ledger masters can have a credit
   limit field configured; would need a new `credit_limit` field on `VE Tally Ledger` and an extractor
   update to pull it from the Tally XML if present.

3. **Cash-flow activity classification** (blocks a full Operating/Investing/Financing cash flow statement
   — today we only show a simple receipts-minus-payments net). Would need ledger-group-to-activity mapping
   (e.g. "Fixed Assets" group → Investing, "Loans" group → Financing, everything else → Operating) applied
   during import or at query time using `VE Tally Ledger.parent_group`.

4. **Company GSTIN** (blocks a header GSTIN pill like the reference has). Only per-party GSTIN is currently
   imported (on `VE Tally Ledger.gstin` for ledgers that are parties). The company's own GSTIN isn't stored
   anywhere — would need to come from Tally's company master data in the XML export, or just be a manually
   configured site setting since it changes rarely.

5. **Virtual/payment-gateway accounts** (Razorpay, PhonePe, etc.) — not a Tally concern at all, would need
   a real integration with those providers' APIs if this is ever wanted. Not recommended unless Vera
   actually uses a payment gateway.

None of these are urgent — the current Accounting page is fully honest about what's real, and the missing
sections were either dropped or clearly labeled as unavailable rather than faked.

---

## Phase 3 — full re-skin + gap pass (done)

Goal: every remaining page still on the old indigo/violet/slate palette gets moved onto the gold/forest
system, plus a pass looking for and fixing any real bugs or inconsistencies found along the way. No data,
features, or pages were removed — this was a presentation-layer pass plus a couple of genuine bug fixes.

### Design system: full palette swap

- **`hr-frontend/tailwind.config.js`**: added full `forest` (50–900, replaces Tailwind's `indigo` scale)
  and `gold` (50–900, replaces `violet`/`purple`) color scales, keyed to the same hex values as the
  `--brand-primary`/`--gold` CSS variables from Phase 1, so Tailwind utility classes and CSS-variable-based
  inline styles now agree.
- **Batch-swapped every old-brand color reference** across ~45 files: Tailwind class tokens
  (`indigo-*` → `forest-*`, `violet-*`/`purple-*` → `gold-*`, and primary-action `blue-600`/`blue-500` →
  `forest-*` where it was clearly a brand touchpoint — buttons, active tabs/steps, focus rings, progress
  bars) plus every hardcoded indigo/violet hex code (`#4F46E5`, `#7C3AED`, `#6D28D9`, `#3730A3`, `#EEF2FF`,
  `#F5F3FF`, `#C7D2FE`, `#A5B4FC`, `#4338CA`, `#312e81`, `#818CF8`, `#6366F1`, `#0B2545`) mapped to their
  forest/gold equivalents. This touched essentially every page in the app: HR (Employees, Attendance,
  Leave, Holidays, Expenses, Recruitment + all its sub-components), CRM (Pipeline board), Admin (User
  Management, Permissions), Drive/Document pages, Chat (all 7 components), My Profile (including its
  gradient header banner, now forest→gold instead of indigo→violet), Verification, AI Insights, Graphs,
  the shared `AIChat` widget, `ErrorBoundary`, and the Accounting sub-components (`VoucherBrowser`,
  `SearchTab`, `TallyUpload`, `PartyDrawer`) that Phase 2 had left on the old palette.
- **Deliberately left alone:** categorical/semantic color coding that isn't a brand touchpoint — e.g.
  `PermissionsPage.tsx`'s `DEPT_STYLES` map (Admin=gold, Project=blue, Accounts=amber, Logistics=green —
  blue here is one of four distinct category colors, not the app's primary color), voucher-type badge
  colors in `Operations/index.tsx` (Sales Order=blue is one of ~10 distinct type colors), file-type icons,
  and status/rating badges (Good/Fair/Poor etc). Swapping these would have removed meaningful
  differentiation, not improved brand consistency.
- **Login page** (`hr-frontend/src/pages/Login.tsx`) — full reskin, not just a color swap: replaced the
  stale "ClientERP" branding text and slate-900 panel with the same gold "V" mark + "Vera Enterprises"
  branding used in the sidebar, forest-green gradient left panel, gold accent checkmarks and primary
  button. This was the most out-of-brand page in the app (first thing every user sees) and easy to miss
  since it doesn't sit inside the authenticated `Layout` shell.
- **Shared components**: `components/ui/switch.tsx` (the toggle used throughout Permissions/Admin —
  "on" state is now `forest-700` not `blue-600`), `components/layout/TopBar.tsx` (avatar fallback),
  `components/auth/ProtectedRoute.tsx` (the loading spinner shown on every auth check, app-wide).

### Real bugs found and fixed (not just cosmetic)

While reviewing files for the color pass, found two genuine **React Rules of Hooks violations** — both
had an early `return` (an admin-only redirect) placed *before* some of the component's hooks were called,
which is a real bug (not just a lint nitpick): if the guard condition ever differs between renders without
a full remount, React throws "Rendered more hooks than during the previous render" or silently corrupts
state.
- **`hr-frontend/src/pages/admin/UserManagement.tsx`** — had its own hand-rolled admin guard
  (`if (user && !ADMIN_USERS.has(user.name)) { navigate("/", {replace:true}); return null }`) sitting
  before `useUsers()`, `useAvailableRoles()`, several `useState`, `useMemo`, and two `useMutation` calls.
  Replaced with the `useAdminGuard()` hook (introduced in Phase 1) used correctly — called first, but the
  actual `if (guard) return guard` moved to after every hook. Also dropped the now-redundant `ADMIN_USERS`/
  `useAuth`/`useNavigate` imports.
- **`hr-frontend/src/pages/expenses/MyClaimsDashboard.tsx`** — same shape:
  `if (isOwais) return <AdminClaimsView />` was placed before `useState`/`useMyClaims`/
  `useMonthlyExpenseSummary`. Fixed by moving the early return after all hooks.
- Also cleaned up two pre-existing lint errors in `UserManagement.tsx` while in there (unnecessary regex
  escapes in the password-strength checker, and two `cond ? a() : b()` statements used only for their side
  effects, which is technically-working-but-lint-flagged style — converted to `if/else`). Fully lint-clean
  now.
- **These were pre-existing bugs, not something introduced by this branch** — confirmed by checking they
  existed before any Phase 3 edit touched those files.

### Gaps found and closed

- **Dead double-redirect**: `pages/BusinessDashboard/index.tsx` (the retired `/business` page) redirected
  to `/operations`, which itself now redirects to `/accounting` (Phase 2 rename) — an unnecessary extra
  hop. Now redirects straight to `/accounting`.
- **No print stylesheet existed** despite a "Print" button already being present on the voucher detail
  view (`VoucherDocument` in `Operations/VoucherBrowser.tsx`) — clicking it printed the entire app chrome
  (sidebar, top bar, modal close button, table filter bar) along with the content, unlike the reference
  mockup which explicitly hides all of that via `@media print`. Added the same pattern: a `.no-print`
  utility class in `index.css` (`@media print { .no-print { display: none !important } body { background:
  #fff !important } }`) applied to the sidebar's two root divs, `TopBar`, `DrillDownModal`'s close button,
  and `DataTable`'s search/export/print bar.
- **Corrected a mistake in this document**: Phase 1/2 notes above claimed the `crm`/`chat` permission
  module keys weren't defined on the backend's `User Module Permission` DocType. That was wrong — checked
  `hr_client/hr_client/doctype/user_module_permission/user_module_permission.json` directly and both
  `crm` and `chat` (plus `leave`, also referenced by the sidebar) are real fields, and
  `hr_client/api/permissions.py`'s `PERMISSION_MODULES`/`MODULE_ROLE_MAP` already lists all of them
  correctly. **No fix was needed here — the frontend and backend already agree.** Leaving this paragraph
  in as a correction rather than silently deleting the earlier wrong claim.

### Verification

`tsc -b`, `vite build`, and `eslint .` all run clean-to-baseline after every change in this phase.
`eslint .` error count went from 43 (pre-existing, unrelated to this branch) down to 24 by fixing the two
hook-order bugs above; the remaining 24 errors + 9 warnings are all pre-existing issues in files this
branch didn't otherwise touch (`any` types in `VeDrivePage.tsx`/`tally_enrich.ts`/`Graphs/index.tsx`,
unused vars, a couple of empty catch blocks, missing `useEffect` deps) — out of scope for a UI overhaul,
left as-is.

**Still not done: a live click-through against a running backend.** This sandbox has no reachable bench
instance and no headless-browser tooling available without adding a new dev dependency (checked for
`chromium-cli` and a pre-installed Playwright — neither present; declined to install Playwright + download
a Chromium binary just for one screenshot, since that would add an unrequested dependency to the project).
Whoever deploys this should still click through the full app — especially the Accounting page's drill-down
modals, the 5 new Tally-derived pages, and the Login page — before calling it fully verified.

### Files touched in Phase 3 (approximate — the color sweep hit ~45 files)

Full list via `git diff --stat feature/ui-overhaul` against the base branch once committed. Notable ones
beyond the mechanical color swap: `hr-frontend/tailwind.config.js`, `hr-frontend/src/index.css` (print
styles), `hr-frontend/src/pages/Login.tsx` (full reskin), `hr-frontend/src/pages/admin/UserManagement.tsx`
(bug fix + lint cleanup), `hr-frontend/src/pages/expenses/MyClaimsDashboard.tsx` (bug fix),
`hr-frontend/src/pages/BusinessDashboard/index.tsx` (redirect fix), `hr-frontend/src/components/ui/
switch.tsx`, `hr-frontend/src/components/layout/TopBar.tsx`, `hr-frontend/src/components/auth/
ProtectedRoute.tsx`, `hr-frontend/src/components/dashboard/DrillDownModal.tsx`,
`hr-frontend/src/components/ui/data-table.tsx`.

---

## What's left after Phase 3

- **Live QA against a running backend** (see above) — the one thing that couldn't be done in this sandbox.
- Possible follow-up polish, not required: code-splitting the frontend bundle (Vite warns the main chunk
  is ~2.1 MB / 604 KB gzipped — pre-existing, not caused by this branch, but the branch didn't shrink it
  either); wiring up the Tally-extraction data gaps listed above if full reference parity is ever wanted.
