# Multi-Company Build — Live State (resume doc)

> **AUTHORITATIVE HANDOFF: read `HANDOFF_MULTICOMPANY.md` first** — it is the self-contained
> resume guide (goal, kernel contracts, remaining module order, acceptance, ops facts, condensed
> Phase 3–8 spec). This file is the running progress log / detail annex.

_Last updated: 2026-09-15. Build in progress on LIVE site `vera.local`. NOT committed to git
(owner tests live first, then commit). Deploy = rsync source → bench, migrate, restart._

## Companies (live DB names — NOTE: no umlaut)
- `Vera Enterprises` (VE, abbr V) — has all financial data. `ve_login_enabled=1`, accent `#C6A15B` (gold).
- `Schones Leben` (SL) — exists; only org-hub + employee data. login disabled. accent NOT set yet.
- `Hagan Modular` (HM) — exists; only org-hub + employee data. login disabled. accent NOT set yet.
- Employees already span all 3 (HM 18 / SL 13 / VE 10). Employee.company is native+reqd, no nulls.

## Role tiers (hr_client/api/utils.py)
- GROUP_OWNER = {owais@veraenterprises.in} + Administrator break-glass.
- PLATFORM_ADMIN = {amoghspace@gmail.com} (all companies, NO grant rights, decided by owner).
- is_group_owner / is_platform_admin / can_grant_access (owner only). Grant + __ALL__ gate on
  is_group_owner, NEVER require_admin.
- Kernel: ALL_COMPANIES="__ALL__", GLOBAL_DOCTYPES, allowed_companies, current_company,
  require_company, scoped(filters), company_sql(company,alias), @company_scoped decorator.

## DONE + verified live
- **Phase 0**: hr_client/api/company.py (get_login_companies guest / get_my_companies /
  set_active_company / resolve before_request / on_login for phase3). User Company Access child
  DocType (double-nested path). Company custom fields (ve_login_enabled/accent_hex/short_label/
  tally_company_name/tally_upload_path/drive_root_id). Patch phase0_company_dimension backfilled
  29 VE access rows. hooks before_request = [twofa.enforce, company.resolve].
- **Phase 1**: Patch phase1_company_dimension added `company` (reqd) to 55 siloed DocTypes via
  create_custom_fields, backfilled all rows→VE, intercompany fields (is_intercompany +
  counterparty_company) on VE Tally Voucher / Vera Sales Order / Vera Sales Quotation,
  supplying_company on Vera BOQ Line, composite indexes. DocType RENAME ("VE "→"") DEFERRED
  (cosmetic, high risk, no multi-co benefit).

## Phase 2 — progress log
- ✅ `finance_core.py` FULLY scoped + verified live: every fn takes `company=None`
  (defaults to `current_company()`), raw SQL uses `_co_clause()`. Group console passes
  `ALL_COMPANIES`. Verified VE == __ALL__ (identical, since only VE data exists), plain user →
  403 on __ALL__. Baseline VE figures: sales 564,895,013.05/7345, purchase 542,038,371.78/4562,
  GST out 81,349,673.93 / in 80,489,069.52, funds_grand -4,605,496.65, cashflow_net 5,300,861.75.
- RELIABLE VERIFY HARNESS (bench console heredoc is FLAKY — do not use). Use a script:
  `frappe.init(site="vera.local", sites_path="/home/frappe/frappe-bench/sites"); frappe.connect()`
  then run `sudo -u frappe /home/frappe/frappe-bench/env/bin/python /tmp/x.py`.
- ✅ operations.py (29 endpoints/~51 queries) + accounting.py (9) scoped + verified VE==__ALL__.
- ⏳ NEXT: accounts_dashboard, profitability, graphs, tally_enrich; then tally_import_job/transformer/
  accounts_tally_import (add company param + scoped DELETE + company-scoped row names for
  ledger/stock to fix the field:name collision); then quotation chain, crm*, erp_entries,
  expenses, org_hub, notes, ai/company_brain, drive.
- Pattern for each module: add `_co`/`_co_clause` (or import from finance_core), inject company
  into every get_all(filters=...) and db.sql WHERE; verify VE numbers == pre-change (compare
  scoped-VE vs __ALL__ — must be identical while only VE data exists).

## Phase 2 — remaining, NOT GREEN (the gate for everything after)
- Implemented hr_client/api/scoping.py + permission_query_conditions hook for 56 siloed DocTypes.
- **KEY FINDING: this codebase uses `frappe.get_all` (ignore_permissions=True) which BYPASSES
  permission_query_conditions.** So the central net only helps get_list/desk — NOT the endpoints.
  Correct scoping MUST be per-endpoint: add explicit `company` filter to every get_all/db.sql in
  siloed modules (@company_scoped + scoped()/company_sql()). The net stays as get_list defense.
- TODO order (highest leak risk first): finance_core, operations, accounting, accounts_dashboard,
  profitability, graphs → tally_transformer/import_job/enrich/accounts_tally_import →
  quotation/boq/cost_sheet/measurement/sales_order/terms/quotation_masters → crm/crm_pipeline/
  crm_directory → erp_entries/expenses/approvals → employee/payroll/leave/recruitment/jibble/
  org_hub → company_brain/ai/dashboard/drive.
- CI guard test still TODO (walk api/*, assert each whitelisted fn is @company_scoped or in
  GLOBAL_ENDPOINTS). 383 whitelisted decorators total.
- Acceptance: non-admin calling accounting endpoint with company="Schones Leben" → 403 (not empty);
  every VE dashboard number identical pre/post (diff them).

## Environment / ops facts
- sudo password `vera`. NOPASSWD: /usr/bin/rsync, /usr/bin/supervisorctl. Run bench as:
  `echo vera | sudo -S -u frappe bash -lc 'cd /home/frappe/frappe-bench && bench --site vera.local ...'`
- Deploy: `sudo -n /usr/bin/rsync -a --chown=frappe:frappe --exclude=__pycache__ --exclude='*.pyc'
  /home/vera/vera-erp/hr-client-erp/hr_client/ /home/frappe/frappe-bench/apps/hr_client/hr_client/`
  then migrate + clear-cache + `sudo -n /usr/bin/supervisorctl restart frappe-bench-web: frappe-bench-workers:`.
- bench console: `bench --site vera.local console < script.py` (write results to a file; frappe user).
- **frappe.db.table_exists() takes the DocType NAME, not "tab..." in v15** (CLAUDE.md gotcha is stale).
- Frontend source: hr-frontend/ → build → rsync dist/ → /var/www/hr-frontend/.
- DB backup taken before Phase 1: sites/vera.local/private/backups/ (20260915_1222).

## Blockers needing the owner
- SL & HM Tally XML files are NOT on the box, and their exact `ve_tally_company_name` (the
  <SVCURRENTCOMPANY> string in each XML) is unknown. VE's is "VERA ENTERPRISES". Needed for 6A import.
- Per-company dashboard accents: VE gold set. SL/HM accents + the group/"All companies" accent still
  to set (owner asked for visibly distinct colours per company AND a distinct internal/group colour).
  Planned: SL plum #6B3F58, HM steel-blue #2F4858 (amber #C77D23 actions), group = distinct 4th.

## Data facts (live)
- VE Tally Voucher 26,373 · Ledger 2,005 · Stock Item 4,773 · Group 86 · Drive File 7,049 ·
  Sales Register 7,270 · Cash Flow 11,716. CRM/Quotation/Expense/Leave = 0 (no ERP-native data yet).
- Only 3 System Manager holders: Administrator, owais@, amoghspace@ (no rogue holders).
