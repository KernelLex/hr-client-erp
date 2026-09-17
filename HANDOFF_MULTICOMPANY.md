# HANDOFF — Vera ERP 3-Company Build (READ THIS FIRST)

_A fresh Claude can resume the multi-company build from this single file. Last updated 2026-09-15._

---

## 0. TL;DR — CURRENT STATUS (updated 2026-09-15, end of session 2)

**Phases 0,1,2,3,4,5,6 = DONE + deployed + verified LIVE. Phase 6A safety controls + auto-detect
DONE+verified. Phase 7 backend core DONE+verified. Phase 8 group console DONE (backend+frontend)
+verified.** CI scoping guard GREEN (393 endpoints, 0 offenders, 53 tracked PENDING debt).
**2026-09-17: the whole multi-company build is now COMMITTED to git** — `develop` commit `d5b30ea`
("feat: multi-company platform (VE/SL/HM) — Phases 0-8", 71 files). The per-company Tally Import UI
page (item 1 below) was added right after and is NOT yet committed.

⚠️ DO NOT blind-scope the 53 PENDING native-HR endpoints: some doctypes (Shift Type, Training Program,
Appraisal Template) are GLOBAL masters with NO `company` field — scoping them adds `AND company=…` on
a non-existent column and breaks the page. Verify each doctype has a company field first (Shift
Assignment / Training Event / Employee Onboarding / Employee Separation / Appraisal Cycle / Appraisal /
Employee DO; the *Type/Template/Program masters do NOT). Only urgent before multi-company HR data exists.

**AUTO-DETECT (Tally company) DONE:** `operations.detect_tally_file_company(path)` returns the
<SVCURRENTCOMPANY> read from an uploaded file + whether it matches the active company;
`operations.confirm_tally_company_name(company, name)` (owner) saves the confirmed string to
ve_tally_company_name. So the upload UI can show "Detected: XYZ — confirm?" and the owner never needs
to know the exact string in advance. Verified on the real VE file.

**PHASE 8 GROUP CONSOLE DONE (backend+frontend, deployed+verified):** `company.group_summary` (owner
wrapper over finance_core.group_summary), `src/api/company.ts::getGroupSummary`, `src/pages/
GroupConsole.tsx`, mounted in Dashboard when activeCompany===__ALL__ (group headline + per-company
cards in each accent, click→setCompany). Verified endpoint returns per-company + consolidated.

**What's LEFT for a fresh session (in priority order):**
1. **Owner inputs (blocking data load):** SL/HM Masters+Transactions Tally XML — will be uploaded via
   the UI at the very end. When they upload, the auto-detect flow captures each company's real Tally
   name (owner confirms on screen). Then run the import per §6A. ✅ DONE (2026-09-17): the per-company
   Tally UPLOAD UI page is now built — `src/pages/TallyUpload/index.tsx`, route `/tally-upload`,
   sidebar "Tally Import" under Accounting (admin). 3-step wizard (choose files → verify company →
   import) tinted to the active company's accent; wires the existing chunked-upload endpoints +
   `detect_tally_file_company` + `confirm_tally_company_name` (owner-only confirm) + `run_tally_import`
   + `get_import_status` polling. Blocks import unless the file's `<SVCURRENTCOMPANY>` matches the
   active company. `__ALL__` group scope shows a "pick a company first" guard. Frontend `tsc` clean.
   NOT yet browser-verified live (no SL/HM data to import against yet).
2. **Phase 7 finish:** owner seeds ~6 `Intercompany Ledger Map` rows (via intercompany.add_ledger_map);
   wire quotation supplying_company→internal PO on SO confirm; call `intercompany.tag_intercompany()`
   post-import (needs data).
3. **Phase 5 frontend:** full user×company GRID on Role-Control page (hooks ready in usePermissions.ts).
4. **Scope the ~54 PENDING_SCOPE native-HR endpoints** (payroll/shift/onboarding/separation/training/
   appraisal/recruitment/employee_lifecycle + ai verification) BEFORE multi-company HR go-live. Run
   `bench --site vera.local execute hr_client.tests.verify_company_scoping.run` to see the live list.
5. **6A transport optimisations** (gzip/resumable chunks, Tally Upload Session DocType, lxml iterparse
   for the 1.6GB file, nginx proxy_request_buffering off) — not safety, but needed for big SL/HM loads.
6. Verify VE dashboards visually in the browser. **Core build already committed** (`d5b30ea` on
   `develop`); still to commit: the new Tally Import UI page. Push to origin when owner says so.

Full per-phase detail is in §5–§7 below. Deploy/verify mechanics in §6/§10.

## 0b. Original TL;DR (historical — the build is now well past this)

1. Read this whole file, then `CLAUDE.md` + `CURRENT_STATE.md` for base ERP context.
5. **DO NOT commit to git.** The owner tests everything live first, then tells you to commit.
6. When a session is about to end, update this file + `MULTICOMPANY_BUILD_STATE.md` + memory so the
   next Claude can resume. (The plan also says "update the MCP brain server" — if the MCP brain
   tools are available to you, do so; otherwise these markdown files are the source of truth.)

---

## 1. Goal

One site, one DB, three companies: **Vera Enterprises (VE)**, **Schones Leben (SL)**,
**Hagan Modular (HM)** — note the live DB names have **no umlaut** ("Schones Leben"). Flow:
company picker → login → 2FA → app scoped to that company. Owais = group owner (sees all 3,
grants access, gets a consolidated `__ALL__` group console). Amogh = platform admin (all 3, no
grant rights). Companies invoice each other, so inter-company transactions + elimination are live.
Full original 9-phase spec was provided by the owner (Phases 0,1,2,3,4,5,6,6A,7,8); condensed in §7.

## 2. Role model (implemented in `hr_client/api/utils.py`)

| Tier | Who | Can |
|---|---|---|
| Group owner | owais@veraenterprises.in (+ Administrator break-glass) | all 3, `__ALL__` console, grant/revoke |
| Platform admin | amoghspace@gmail.com | all 3, NO grant rights |
| Company admin | granted per company | full modules within granted companies |
| Employee | granted per company | module-gated within granted companies |

- `GROUP_OWNER`, `PLATFORM_ADMIN` frozensets; `ADMIN_USERS = {Administrator} | both` (back-compat).
- `is_group_owner()`, `is_platform_admin()`, `can_grant_access()` (owner only).
- **Grant rights + `__ALL__` gate on `is_group_owner()`, NEVER `require_admin()`** (require_admin
  passes on the System Manager role — a System Manager must not grant themselves other books).
- Employee.company (native, reqd) = payroll company. Access (ve_company_access rows) = visibility.
  They are SEPARATE — never conflate.

## 3. Scoping kernel (in `hr_client/api/utils.py`) — the contract

- `ALL_COMPANIES = "__ALL__"` (group console sentinel; owner only).
- `GLOBAL_DOCTYPES` — shared, never scoped (User, Role, ToDo, Chat*, UoM, Item, Item Group, Company,
  User Company Access, Company Access Log).
- `allowed_companies(user)` — owner/platform → all Companies; else their `ve_company_access` rows.
- `current_company()` — resolves active company: form_dict → session → user default → is_default
  row → first allowed. Always validated via `require_company()`.
- `require_company(c)` — PermissionError unless allowed; `__ALL__` only for owner.
- `scoped(filters, company=None)` — adds `company` to a get_all/get_list filters dict (no-op __ALL__).
- `company_sql(company=None, alias="")` — returns ` AND \`alias\`.company = %(company)s ` (empty __ALL__).
- `@company_scoped` decorator — resolves+validates company, injects as kwarg `company`.

**Scoping pattern to apply per endpoint:**
```python
@frappe.whitelist()
@handle_api_error
@company_scoped
def some_endpoint(company, ...):
    require_login()
    rows = frappe.get_all("Vera CRM Lead", filters=scoped({...}, company), ...)   # ORM
    # raw SQL:  ... WHERE ... {company_sql(company, alias='v')}  with params {"company": company}
```
Library functions (like `finance_core`) instead take `company=None` and default to
`current_company()` internally, so callers need no change and Phase 8 passes `ALL_COMPANIES`.

## 4. ⚠️ LOAD-BEARING GOTCHA — why there is no hook shortcut

This codebase uses **`frappe.get_all` everywhere**, which defaults to `ignore_permissions=True` and
therefore **BYPASSES `permission_query_conditions`**. A central query-condition hook does NOT scope
these endpoints. **Scoping MUST be per-endpoint** (explicit `company` filter in every get_all/db.sql).
- `hr_client/api/scoping.py` + the `permission_query_conditions` hook ARE deployed, but only as
  defense-in-depth for `frappe.get_list`/desk. They are NOT sufficient on their own. Keep them.
- Other v15 gotcha: **`frappe.db.table_exists()` takes the DocType NAME**, not "tab..".

## 5. Phase 2 — remaining modules, in leak-risk order (DO IN THIS ORDER)

Done: ✅ `finance_core.py` (verified). ✅ `operations.py` (all 29 endpoints / ~51 Tally queries
scoped + verified VE==__ALL__, non-admin 403). Pattern used: module-level `_cc/_cco/_cwhere/
_cfilters` helpers (inline `frappe.db.escape` fragments; company is validated so safe); aliased
JOINs get a `v.company = l.company` correlation (ledger names repeat across companies). ✅ `accounting.py` (9 endpoints scoped + verified VE==__ALL__: COA/balance-sheet/registers/P&L/
depreciation/guid-resolve). Remaining:
1. ~~operations~~ · ~~accounting~~ · ~~profitability~~ · ~~accounts_dashboard~~ · ~~graphs~~ · ~~tally_enrich~~ ALL DONE+verified
   (graphs.py: `_fetch_gst_analysis` reads the single VE `tally_snapshot.json` — a KNOWN VE-only
   limitation; multi-company needs per-company snapshots. Flag, not yet fixed. tally_enrich:
   run_enrichment now takes `company`, tags each row with the voucher's own company.)
2. ✅ DONE + verified: **import pipeline (write side)** — `tally_transformer.run(…, company)` →
   `tally_import_job.run(…, company)` + `accounts_tally_import.run(company)` + `reconcile(company)`.
   DELETE scoped by company; every inserted row tagged; name-collision fixed by company-prefixing
   the primary `name` (`{abbr}-{ledger_name}`, `{abbr}-VTV-#####`, `{abbr}-{item}`, SM key
   `SM-{company}-{item}`); aliased join correlations added. accounts_tally_import uses a run-scoped
   `_RUN_CO` global so `_upsert` auto-tags + scopes. Callers (operations.run_tally_import,
   accounts_dashboard.trigger_tally_import/get_reconciliation_report) pass `company=_cc()`.
   NOT full-re-imported (heavy 1.6GB rebuild; reads use fields not names, so VE stays stable until a
   real re-import). KNOWN: `tally_snapshot.json` is still a single global VE file (per-company
   snapshots TODO — low priority, primary reads use finance_core).
3. ✅ DONE + deployed + smoke-tested (all return 0 rows, no data yet): **quotation chain** —
   quotation, measurement, boq, cost_sheet, terms, sales_order, quotation_masters. ✅ **expenses**.
   ✅ **crm_pipeline**, **crm_directory**.
   Pattern for all: list get_all → `filters=scoped({})`; create `new_doc` → `doc.company =
   current_company()` (or inherit parent's company: cost_sheet from boq, quotation from cost_sheet,
   SO from quotation, opportunity from enquiry); by-name get_doc mutations → `assert_doc_company(doc)`
   (added to utils.py) or via each module's `_assert_editable(doc)` guard hub.
   ⚠️ KNOWN Phase-6 issue: quotation masters (Vera Quotation Unit/Material/Finish/Hardware/Pricing
   Method/Template) + Vera Terms Clause/Template autoname `field:code`/`field:name` → codes COLLIDE
   across companies. provision_company must either make these GLOBAL (shared, drop the scoped filter)
   or company-prefix codes. Pricing methods (RFT/SFT/…) are universal → lean global. Decide in Phase 6.

4. ✅ DONE + deployed + smoke-tested: **crm.py** (leads/approvals/quotation — scoped + company on
   new_doc + assert_doc_company guards), **erp_entries.py** (entries + data-entry-requests, 9 guards
   + scoped lists + pending-count scope + approved-entry inherits request company), **notes.py**
   (feed scoped, notes tagged with employee's company, update/delete guarded, emp options scoped),
   **approvals.py** (3 aggregator queues scoped; act() dispatches to already-guarded endpoints),
   **leave.py** (admin lists + summary scoped, creates tagged from employee.company, approve/reject
   guarded; holidays/leave-policy stay GLOBAL = public calendar data), **company_brain.py** +
   **ai.chat** (build_company_context(question, company) — roster/jobs/org-docs scoped; VERIFIED VE
   context excludes Hagan/Schones, owner __ALL__ includes them → the flagged AI leak is CLOSED).

   ⚠️ ai.py REMAINING (lower risk — read the global VE tally_snapshot or raw vouchers, admin-only,
   and no SL/HM tally data exists yet): _build_rich_context/_build_fast_context/get_business_snapshot/
   compare_periods/generate_report/get_ai_health + the verification-queue fns (get_verification_queue
   etc.) do unscoped voucher/enrichment SQL. Scope these when convenient (add company_sql filters);
   they only matter once SL/HM Tally data is imported. company_brain._financial_line still reads the
   global VE snapshot (per-company snapshots TODO).

5. ✅ DONE + deployed + VERIFIED against real SL/HM data: **org_hub.py** — all 9 getters default to
   active company via `_scope_co()` (validates a passed company, returns None for owner __ALL__);
   create stamps/validates company; update/delete/get_all_for_company guard company; summary limited
   to allowed_companies. Verified: plain VE user sees 12 VE JDs (not all 30), owner __ALL__ sees 30
   across 3 companies, cross-company request → HTTP 403 / 0 rows leaked.

6. ✅ DONE + deployed: **dashboard.py** (Employee + Job Opening counts scoped to active company —
   VE dashboard now shows 10 VE staff not all 41; Job Applicant/Interview have no company field so
   their recent-activity lists stay unscoped), **employee.py** get_all_employees (scoped by company),
   **recruitment.py** (get_job_openings scoped; create_job_opening company = current_company() not
   the frappe user default). Verified VE: 10 employees, dashboard headcount 10.

7. ✅ CI GUARD TEST WRITTEN + GREEN: `hr_client/tests/verify_company_scoping.py`. Run:
   `bench --site vera.local execute hr_client.tests.verify_company_scoping.run`
   Result: 383 whitelisted endpoints → 314 scoped/non-siloed, 15 GLOBAL_ENDPOINTS, 54 PENDING_SCOPE
   (tracked debt), **0 unscoped offenders → PASS**. Also guarded boq/cost_sheet/quotation/measurement
   workflow endpoints (submit/approve/reopen/revision) + crm.get_quotation + erp_entries page wrappers.

   ⚠️ REMAINING SCOPE DEBT (54 endpoints in PENDING_SCOPE — guard warns, doesn't fail; all are
   native-HR doctypes with ZERO data today, or the AI/Tally-verification suite). MUST be scoped
   before SL/HM HR go-live: payroll.*, shift.*, training.*, onboarding.*, separation.*, appraisal.*,
   recruitment.* (pipeline — Job Applicant has no company field), hrms_people.get_employee_master,
   leave.get_employee_leave_history, notes.get_notes, employee_lifecycle.*, ai.* verification/snapshot
   fns (many read the global VE tally_snapshot or the retired Drive-extraction doctypes). Pattern:
   scope list filters by Employee.company / the doc's company; payroll+attendance MUST match
   Employee.company. To clear an item: scope it, then remove its line from PENDING_SCOPE — guard
   still passes.

   ⇒ **Phase 2 is effectively GREEN for all modules that hold data today** (finance, Tally, quotation
   chain, CRM, expenses, leave, org-hub, AI chat, dashboard). SL/HM data may now be created/imported
   safely (the plan's hard gate). Remaining PENDING items only matter once multi-company HR data exists.

✅ PHASE 3 DONE + verified LIVE: `on_session_creation = ["hr_client.api.company.on_login"]` wired in
hooks.py. on_login binds the picker's company to the session, or rejects with the GENERIC "Invalid
login credentials" (no company enumeration) if not in allowed_companies. Verified: plain VE user
picking Hagan → rejected; picking VE → ok + active company set; owner → any. 2FA unchanged (still
runs via before_request after login).

✅ PHASE 4 DONE + built + deployed LIVE (frontend tsc clean, vite build ok, rsync→/var/www/hr-frontend):
 - `src/api/company.ts` — getLoginCompanies/getMyCompanies/setActiveCompany.
 - `lib/api.ts` — getActiveCompany/setActiveCompanyCache + request interceptor appends `company` to
   params + POST body (server always re-validates; localStorage is cache only).
 - `context/CompanyContext.tsx` — activeCompany/availableCompanies/isGroupOwner/setCompany/accentOf;
   revalidates via getMyCompanies() on mount; **setCompany() calls queryClient.clear()** so no stale
   other-company rows survive a switch (this is the robust fix for the "query-key" leak — chose
   clear() over editing hundreds of useQuery keys; documented in the file). Sets `--company-accent`
   CSS var. Wired in App.tsx inside AuthProvider (needs useAuth) + QueryClientProvider (useQueryClient).
 - `pages/Login.tsx` — pre-login company picker (cards from getLoginCompanies, each in its accent);
   picking one reveals the branded login form in that accent; "← Change company" link; single-company
   auto-skips the picker. login(email,pwd,company) threads company to the /api/method/login POST.
 - `components/layout/CompanySwitcher.tsx` — always-visible top-bar switcher (mounted in TopBar before
   ViewAsSwitcher); lists availableCompanies; owner also gets "All companies" (__ALL__).
 - Accents set on Company records: VE gold #C6A15B, SL plum #6B3F58, HM steel-blue #2F4858; group/
   __ALL__ = slate #334155 (in CompanyContext GROUP_ACCENT). All 4 distinct per owner's ask.
 - Guest picker currently returns VE only (SL/HM ve_login_enabled=0 until Phase 6) → auto-skips to VE
   login; SL/HM cards appear automatically once provisioned.
 - NOT YET DONE in P4 (do in Phase 5): sidebar `can(key, company)` per-company gating — Permissions
   context `can(key)` is still global; wire per-company when Phase 5 lands per-company permissions_json.

✅ PHASE 5 DONE (backend + enforcement) + verified LIVE + frontend API wired:
 - permissions_json is now PER-COMPANY: {company: {key: False}} (sparse negative, allow-by-default
   within a granted company). Legacy flat {key: False} still honoured (applies to all companies);
   auto-migrates to per-company form on first per-company save. `_denied_set(name, company)` +
   `_resolve_perms(name, company)`.
 - `get_my_permissions()` resolves for the ACTIVE company (current_company()); returns active_company
   + companies + is_group_owner. Frontend can(key) is therefore per-company automatically (Phase 4
   sends company + clears cache on switch — no can(key,company) signature change needed).
 - Company access = POSITIVE allowlist via User Company Access rows. New endpoints:
   `get_user_company_access(email)` (admin-read) + `update_user_company_access(user, rows)` — BOTH
   MUTATIONS GATE ON can_grant_access() (Owais only, NOT require_admin). `update_user_permissions`
   also gates on can_grant_access + takes a `company` param + syncs roles from the cross-company union.
 - `Company Access Log` DocType (double-nested) + `_log_access()` audit every grant/perm change.
 - get_all_users_with_permissions now returns per-user company_access + employed_by (separate from
   can-access) + all_companies + can_grant.
 - VERIFIED LIVE: non-owner blocked from grant + perms; owner granted test user VE+Hagan; per-company
   isolation (deny crm.pipeline in Hagan → still allowed in VE); audit rows written. tsc+build clean, deployed.
 - Frontend hooks added (usePermissions.ts): useUserCompanyAccess, useUpdateCompanyAccess,
   useUpdatePermissions now takes optional company.
 - ⚠️ REMAINING P5 (frontend UI only — backend enforces correctly regardless): the full user×company
   GRID on the Role-Control page (per-cell No access/Read-only/Full/Company-admin, expand module tree
   per company, "Employed by" vs "Can access", bulk copy). The existing flat permissions page still
   works (writes to the active company). Build the grid using the new hooks when ready.
 - NOTE/DEVIATION: get_all_users_with_permissions stays admin-READABLE (not owner-only) because the
   TopBar "View as user" switcher depends on it; only the MUTATIONS are owner-gated (matches the
   security intent — only Owais can grant).

✅ PHASE 6 DONE + verified LIVE: `hr_client.api.company.provision_company(name, abbr, source_company,
enable_login)` — idempotent. KEY FINDING: ERPNext already auto-created COA (81 accounts), cost centres
(2), warehouses (5) for SL/HM when their Company records were made, so provisioning only handles the
APP's per-company reference data: seeds the 5 universal pricing methods (company-prefixed codes e.g.
SL-RFT — autoname is field:code so prefixing avoids collision), clones any VE quotation/terms masters
(company-prefixed), ensures "Due from/to Related Party" accounts (Phase 7), sets Company custom fields
(tally_upload_path, tally_company_name placeholder=UPPERCASE name, short_label), flips ve_login_enabled=1.
Items stay GLOBAL (not cloned). Ran for SL+HM (idempotent verified). Owner-only whitelisted wrapper
`provision_company_api`. VERIFIED: picker now shows all 3; owner in SL/HM sees empty states (sales 0,
COA 0) not errors; pricing 5 each; VE untouched.
⚠️ OWNER ACTION before 6A import: confirm exact `ve_tally_company_name` (<SVCURRENTCOMPANY> string) for
SL ("SCHONES LEBEN" placeholder) + HM ("HAGAN MODULAR" placeholder) — 6A content-verify rejects a
mismatch so a wrong value fails safe.
⚠️ quotation-masters/terms code-collision DECISION resolved: cloned per-company with `{abbr}-` prefixed
codes (each company gets its own editable copy). Pricing-method `method` field stays universal (RFT/…).

✅ PHASE 6A — SAFETY CONTROLS DONE + verified LIVE (the decisive anti-leak pieces):
 - `operations._xml_company_name(path)` reads the XML envelope head (first 256KB, UTF-16) →
   <SVCURRENTCOMPANY>. `operations._verify_tally_company(path, company, label)` REJECTS a misfiled
   export: the file's own company must equal the active company's ve_tally_company_name, else throws
   naming BOTH ("This masters file belongs to 'VERA ENTERPRISES', but you are importing into
   'Schones Leben'"). Wired into run_tally_import (checks both files before enqueue). VERIFIED against
   the real 125MB VE Master.xml: VE→VE ok, VE→SL rejected.
 - `tally_transformer.run` now snapshots OTHER companies' voucher+ledger counts before Stage 1 and
   re-checks after Stage 2 — any movement → abort + log "CROSS-COMPANY LEAK" (belt-and-braces over
   the Phase 1 name-scoping). finance_core.reconcile(company) + accounts_tally_import.reconcile(company)
   both company-scoped.
 - Company is bound from the session (_cc()) into the import job (Phase 2); per-company storage paths
   (/home/vera/tally_uploads/<ABBR>/) set on Company records by provision_company.
 ⚠️ REMAINING 6A (transport/UX OPTIMISATIONS — not safety; existing chunked upload in operations.py
   already handles large files): client-side gzip, 25MB resumable chunks w/ 3-way concurrency + LAN
   fast path, a `Tally Upload Session` DocType binding company at start_upload, quarantine dir,
   nginx `proxy_request_buffering off` location, lxml iterparse streaming (check if transformer is
   already iterparse — reported earlier as using regex .finditer over the whole file, which risks
   OOM on the 1.6GB transactions file → convert to streaming before loading SL/HM's full history).
 ⚠️ CANNOT load SL/HM books yet — owner must (a) drop their Masters+Transactions XML on the box and
   (b) confirm exact ve_tally_company_name (<SVCURRENTCOMPANY>) for each; content-verify then guards it.

🟡 PHASE 7 (inter-company) — BACKEND CORE DONE + verified; flow + data pending. ARCHITECTURE NOTE:
   this app is Tally-shadow accounting — it does NOT post to native ERPNext Sales/Purchase Invoices,
   so the plan's "native SI→PI mirroring" does not apply. The correct mechanism = `Intercompany Ledger
   Map` DocType (company, tally_ledger_name, counterparty_company) + `api/intercompany.py`:
   get_ledger_map / add_ledger_map / tag_intercompany(company) [stamps is_intercompany +
   counterparty_company on VE Tally Vouchers whose party is a mapped ledger] / reconciliation_report()
   [per ordered pair, SHOWS differences, doesn't assert equality]. DocType migrated live; CI guard
   still green (390 endpoints). "Due from/to Related Party" accounts created by provision_company.
   REMAINING P7: (a) owner seeds the ~6 ledger-map rows (which Tally ledgers are the sibling
   companies) — needs data; (b) quotation `supplying_company` on BOQ line → generate an internal PO
   (Vera Sales Order) per supplying company on SO confirm, routed through §4.6 authority (build in
   quotation.convert_to_sales_order); (c) run tag_intercompany after each Tally import (wire into
   tally_transformer.run once maps exist).

🟡 PHASE 8 (group console, owner only) — BACKEND DONE + verified; frontend UI pending. `finance_core.
   group_summary(start,end)` returns per_company + group_raw + eliminations + group_consolidated;
   gated on require_company(__ALL__) → non-owner 403 (verified). __ALL__ works across finance_core/
   operations/graphs/accounting from Phase 0. Group accent = slate #334155 (CompanyContext).
   REMAINING P8 (frontend): a Dashboard __ALL__ mode that calls group_summary — group headline + 3-way
   per-company split in each company's accent, click a company segment → setCompany(that company).
   Deeper elimination (receivables/payables matched pairs, unrealised margin on internal stock) is a
   later refinement; group_summary already eliminates inter-company sales/purchase value and keeps
   unmatched differences visible via intercompany.reconciliation_report.

(reference spec:) Phase 6A
(provision SL+HM — resolve the quotation-masters/terms code-collision decision; flip ve_login_enabled),
Phase 6A (chunked Tally upload — needs SL/HM XML + <SVCURRENTCOMPANY> strings from owner), Phase 7
(inter-company), Phase 8 (group console — __ALL__ dashboards, elimination). Also clear the 54
PENDING_SCOPE endpoints before multi-co HR go-live.

(historical detail on earlier clusters below:)
   remaining HR/ops modules, most read NATIVE ERPNext HR doctypes (Employee,
   Salary Slip, Attendance, Job Opening, Interview, Job Applicant, Appraisal) that carry their own
   `company` field — **employee.py, payroll.py, recruitment.py, jibble.py, shift.py, training.py,
   onboarding.py, separation.py, appraisal.py, hrms_people.py, hrms_masters.py, todo.py, calendar.py,
   dashboard.py**, drive/accounts backend. Scope Employee-derived + HR-doctype lists by company where
   a company view is expected; **payroll/attendance MUST filter on Employee.company** (invariant).
   chat.py stays GLOBAL (in GLOBAL_DOCTYPES). Then the **CI guard test** → Phase 2 green.
   Pattern reminder: `filters=scoped({...})` for ORM lists; `doc.company=current_company()` (or inherit
   from the linked Employee/parent) on new_doc; `assert_doc_company(doc)` after by-name get_doc.
   (historical note:) crm.py scope pattern was: add
   `from hr_client.api.utils import current_company, assert_doc_company, scoped` (crm.py currently
   imports only frappe/json); get_all_leads(31)+get_pending_approvals(267) → scoped; create_lead(100)
   new_doc → doc.company=current_company(); get_lead/update_lead/request_next_stage/mark_failed
   get_doc → assert_doc_company; approve_stage/reject_stage → guard the fetched approval + lead;
   the Approval Request + CRM Quotation new_doc → set company = lead's company.
   Then: erp_entries, approvals, notes; employee/payroll/leave/recruitment/jibble/org_hub;
   company_brain+ai (MUST scope retrieval — a VE user's AI chat must not surface HM's P&L);
   dashboard; drive/accounts. Then the CI guard test → Phase 2 green.
   NOTE: a fast batch method works for regular modules — a python script doing str.replace on the
   `"Vera X",\n        fields=` → insert `filters=scoped({}),` and `new_doc("Vera X")\n    doc.update(data)`
   → append `doc.company = current_company()` (see how crm_directory.py was done). Always py_compile
   + deploy + smoke-test after each module or small batch.

**HELPER SEMANTICS (important):** `_cco(company, alias="")` returns ` AND <alias>.company = '<co>' `
(or ` AND company = ... ` when no alias) — pass the TABLE ALIAS ('l','v','s'), NOT the column.
Early bug: passing 'l' as a column produced `AND l = ...` (SQL error) — fixed in operations.py +
profitability.py. LESSON: test EVERY endpoint incl. aliased-join ones (get_debtor_aging,
get_creditor_list, get_advance_*, inventory joins) — a top-level dashboard test won't touch them.
Note accounting.py's local `_cco(company, col=...)` is the OLD col-based form but is only ever
called with the default, so it's fine; don't pass an alias to it.
3. `tally_transformer.py` / `tally_import_job.py` / `accounts_tally_import.py` — add `company` param;
   scope the DELETE-and-reinsert by company; **fix ledger/stock name collision**: `VE Tally Ledger`
   autoname is `field:ledger_name` and `VE Tally Stock Item` is `field:item_name` → names repeat
   across companies. Importer must write company-scoped `name` (e.g. `{abbr}-{ledger_name}`) and
   DELETE only WHERE company=X. Voucher autoname is a series (`VTV-.YYYY.-.#####`) → no collision.
4. `quotation.py`, `quotation_masters.py`, `measurement.py`, `boq.py`, `cost_sheet.py`,
   `terms.py`, `sales_order.py`
5. `crm.py`, `crm_pipeline.py`, `crm_directory.py`
6. `erp_entries.py`, `expenses.py`, `approvals.py`, `inventory`/`purchasing`/`logistics`/`returns`
   (these live inside `operations.py`/frontend), `notes.py`
7. `employee.py`, `payroll.py`, `leave.py`, `recruitment.py`, `jibble.py`, `org_hub.py`
   (payroll/attendance must filter on Employee.company AND active company — both must match)
8. `company_brain.py` + `ai.py` (MUST scope retrieval or a VE user's AI chat surfaces HM's P&L),
   `dashboard.py`, `drive`/`accounts.ts` backend.

Then write the **CI guard test** (`hr_client/tests/`): walk `hr_client/api/*`, collect every
`@frappe.whitelist` fn, assert each is either `@company_scoped` or in an explicit `GLOBAL_ENDPOINTS`
allowlist (no unexplained entries). 383 whitelisted decorators total. Let it fail first, then green.

**Global endpoints (allowlist, do NOT scope):** company.py (get_login_companies etc.), twofa.py,
permissions.py, user_management.py, chat.py, dashboard self, employee self-profile, holidays/leave
policy, hrms_masters, calendar personal. Justify each.

**Acceptance (Phase 2 green):** non-admin calling a financial endpoint with company="Schones Leben"
gets **403** (not empty); every VE dashboard number **identical** pre/post (diff vs §8 baseline);
guard test green. Only then may SL/HM data be imported.

## 6. Verification harness (RELIABLE — bench console heredoc is FLAKY, avoid it)

Write a script and run it with the bench venv python:
```bash
cat > /tmp/v.py <<'PYEOF'
import frappe, json
frappe.init(site="vera.local", sites_path="/home/frappe/frappe-bench/sites"); frappe.connect()
frappe.set_user("owais@veraenterprises.in")   # or a plain user to test 403
# ... call scoped fns with company="Vera Enterprises" and ALL_COMPANIES, assert identical ...
print("RESULT="+json.dumps(res, default=str))
PYEOF
chmod 644 /tmp/v.py
echo vera | sudo -S -u frappe bash -lc 'cd /home/frappe/frappe-bench && ./env/bin/python /tmp/v.py' 2>&1 | grep RESULT= | sed 's/RESULT=//' | python3 -m json.tool
rm -f /tmp/v.py
```
Equivalence check while only VE data exists: **scoped-to-VE result MUST equal `__ALL__` result.**

## 7. Phases 3–8 (condensed spec — build after Phase 2 is green)

- **P3 Auth**: picker→login→2FA. `on_session_creation = hr_client.api.company.on_login` (already
  written in company.py, just wire the hook). Validate chosen company ∈ allowed_companies; on
  failure `logout()` + **GENERIC** "Invalid login credentials" (byte-identical to wrong password —
  no company enumeration). Keep standard `/api/method/login`. Set session active_company + user default.
- **P4 Frontend** (`hr-frontend/`): pre-login `CompanySelect` (cards from `get_login_companies`,
  per-company accent); `CompanyContext` (revalidated on mount, localStorage is cache only);
  `lib/api.ts` appends `company` param to every request; **EVERY TanStack queryKey gains company**
  (`['x']`→`['x',company]`) + `queryClient.clear()` on switch (missing one = looks like a leak);
  top-bar switcher always visible (owner also gets "All companies"); theme from `ve_accent_hex`;
  sidebar `can(key, company)`. Build → rsync `dist/` → `/var/www/hr-frontend/`.
- **P5 Access panel**: two axes — company access = POSITIVE allowlist (deny-by-default); module
  access = sparse NEGATIVE per company (`permissions_json` becomes `{company: {key: false}}`).
  Gate all mutations on `can_grant_access()`. Extend Role-Control page: user×company grid, per-company
  module tree, "Employed by" (read-only) vs "Can access". `Company Access Log` DocType (audit).
  `update_user_company_access(user, rows)` rewrites ve_company_access. `can(key, company)` frontend.
- **P6 Provision SL+HM**: `provision_company(name, abbr, source="Vera Enterprises")` idempotent —
  clone COA (+ "Due from/to related party" accounts), cost centres, warehouses, naming series, item
  groups/UoM/tax/terms templates, quotation masters, §4.6 approval authority table, drive/tally
  paths. **Items stay GLOBAL** (shared Item namespace; per-company pricing in Item Price). NOTE:
  SL/HM Company records ALREADY EXIST (login-disabled) — make provisioning idempotent over them.
  Set `ve_login_enabled=1`, fill `ve_tally_company_name` (see §9). Set distinct accents (§9).
- **P6A Tally upload+import**: per-company storage `/home/vera/tally_uploads/<ABBR>/` (realpath-guard,
  OUTSIDE public/files). `Tally Upload Session` DocType, company bound at start (never resent).
  Client-side gzip + 25MB chunks (200MB on LAN 192.168.1.16) as raw octet-stream via `fetch` (axios
  corrupts multipart). nginx location for push_chunk: `proxy_request_buffering off`,
  `client_max_body_size 64M`. Content-verify `<SVCURRENTCOMPANY>` vs `ve_tally_company_name` →
  quarantine mismatch, name BOTH companies in error. Pair masters+transactions. long-worker + redis
  lock per company. lxml iterparse + batch INSERT. **Cross-company leak assertion**: snapshot other
  companies' voucher/ledger counts before+after; any change → rollback + fail. Cloudflare caps bodies
  at 100MB (why chunking). Keep RSS < 2Gi (~7.9Gi free w/ Ollama).
- **P7 Inter-company**: internal Customer/Supplier per company (`allowed_to_transact_with`). Use
  ERPNext NATIVE intercompany mirroring (SI→PI, SO→PO) — test a real round trip first, then a hook
  stamps `is_intercompany`+`counterparty_company` both sides (fields already added in Phase 1).
  `supplying_company` on BOQ line (added) → internal PO per supplying company on SO confirm, routed
  through §4.6 authority. `Intercompany Ledger Map` DocType (seed 6 rows by hand) + tally_enrich tags.
  Reconciliation report per ordered pair (show differences, don't assert equality).
- **P8 Group console (owner only)**: `__ALL__` gates on `is_group_owner()` (explicit 403 test for a
  crafted non-owner `company=__ALL__`). `finance_core.get_pnl(companies:list)` per-company+group;
  graphs keyed by company. Dashboard `__ALL__` mode: group headline + 3-way split, per-company
  accent, click segment → switch into that company. LIVE ELIMINATION: intercompany revenue/COGS,
  receivables/payables (remove matched pairs); unmatched diffs shown as a visible reconciling line;
  unrealised margin on internal stock. Owner-only view.

## 8. VE baseline figures (must stay identical through Phase 2)

- Counts: Tally Voucher 26,373 · Ledger 2,005 · Stock Item 4,773 · Group 86 · Drive File 7,049 ·
  Sales Register 7,270 · Cash Flow 11,716. CRM/Quotation/Expense/Leave = 0.
- finance_core (owner, company=VE == __ALL__): sales 564,895,013.05 / 7345, purchase
  542,038,371.78 / 4562, GST out 81,349,673.93, GST in 80,489,069.52, funds_grand -4,605,496.65,
  cashflow net 5,300,861.75.
- Employees: HM 18 / SL 13 / VE 10 (already multi-company; Employee.company reqd, no nulls).
- Only 3 System Manager holders: Administrator, owais@, amoghspace@ (no rogue holders).

## 9. Blockers / owner inputs still needed

- **SL/HM Tally XML files** are NOT on the box; owner will provide later. Needed for the P6A import.
  Also need each company's exact `<SVCURRENTCOMPANY>` string for `ve_tally_company_name`
  (VE's is `VERA ENTERPRISES`). Owner chose: build 6A now, load SL/HM books when files arrive.
- **Dashboard accents** (owner wants each company visibly distinct + a distinct group/"internal"
  accent): VE = gold `#C6A15B` (set). Planned: SL plum `#6B3F58`, HM steel-blue `#2F4858` (amber
  `#C77D23` actions), group/`__ALL__` = a distinct 4th (e.g. slate/indigo). Set on Company
  `ve_accent_hex` in P6 + theme in P4.

## 10. Ops / deploy facts

- sudo password `vera`. NOPASSWD only: `/usr/bin/rsync`, `/usr/bin/supervisorctl`.
- Source: `/home/vera/vera-erp/hr-client-erp/` (branch develop). Live app: `/home/frappe/frappe-bench/apps/hr_client/` (also a git checkout; deploy is rsync INTO it, never git).
- Deploy backend:
  `sudo -n /usr/bin/rsync -a --chown=frappe:frappe --exclude=__pycache__ --exclude='*.pyc' /home/vera/vera-erp/hr-client-erp/hr_client/ /home/frappe/frappe-bench/apps/hr_client/hr_client/`
  then `echo vera | sudo -S -u frappe bash -lc 'cd /home/frappe/frappe-bench && bench --site vera.local migrate && bench --site vera.local clear-cache'`
  then `sudo -n /usr/bin/supervisorctl restart frappe-bench-web: frappe-bench-workers:`.
- Run patch again after fixing it: delete its `tabPatch Log` row then migrate.
- Frontend: `cd hr-frontend && npm run build` → rsync `dist/` → `/var/www/hr-frontend/`.
- DB backup before risky work: `bench --site vera.local backup`. One was taken 20260915_1222.
- **NOT committed to git** (owner instruction). Owner tests live, then says to commit.

## 11. Decisions & deviations from the original plan (deliberate)

- **DocType rename "VE …"→"…" DEFERRED** — cosmetic, high blast-radius (35+ refs), zero
  multi-company benefit (the `company` field is the gate). Keeps TALLY_DOCTYPES/write-guard stable.
- **SL/HM Company records NOT created in Phase 0** — they already existed; provisioning (P6) owns
  their COA to avoid ERPNext default-COA cruft.
- **Custom fields via patches, not fixtures JSON** — matches CLAUDE.md guardrail; idempotent.
- **DocTypes double-nested** (`hr_client/hr_client/doctype/`) — matches the 74 live ones (the plan's
  "triple-nested" is the exact rule CLAUDE.md corrected 2026-08-09).
- **Amogh = platform admin** (all 3, no grants) — owner's choice.

## 12. Files created/changed so far (all in source, deployed, NOT committed)

- `hr_client/api/utils.py` — tiers + scoping kernel.
- `hr_client/api/company.py` — NEW (picker/my-companies/set-active/resolve/on_login).
- `hr_client/api/scoping.py` — NEW (permission_query_conditions net; defense-in-depth only).
- `hr_client/api/finance_core.py` — fully company-scoped (verified).
- `hr_client/hr_client/doctype/user_company_access/` — NEW child DocType.
- `hr_client/patches/phase0_company_dimension.py`, `phase1_company_dimension.py` — NEW (+patches.txt).
- `hr_client/hooks.py` — before_request += company.resolve; permission_query_conditions built from
  scoping.SILOED_QC.
- Docs: this file, `MULTICOMPANY_BUILD_STATE.md`.
