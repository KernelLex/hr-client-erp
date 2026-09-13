# Vera ERP — Architecture

_Verified live against the running server on 2026-09-13. Site `vera.local`, public `https://veraenterprises.in`._

A full-stack, multi-company ERP (HR + Accounts + Sales) for Vera Enterprises. ERPNext runs as a **shadow backend** — employees never touch the Frappe desk (`/app` and `/desk` are `403`-blocked at nginx); all UX is a custom **React SPA**. Serves three companies: Vera Enterprises (VE), Schönes Leben (SL), Hagan Modular (HM).

---

## 1. The mental model

Three codebases in one repo, joined only over HTTP:

```
React SPA  ──HTTP /api/method/*──►  Frappe whitelisted Python fns  ──►  MariaDB
(TypeScript)     (JSON-RPC style)        (hr_client custom app)         (DocType tables)
```

There is **no shared type contract**. The frontend re-declares TypeScript interfaces mirroring what each Python endpoint returns. The "API" is literally: *call a dotted Python path, read `res.data.message`*.

---

## 2. Infrastructure & request flow

```
Home PC — Ubuntu (native), static LAN 192.168.1.16, RAM 15Gi, disk 216G
│
Browser → Cloudflare (TLS "Full", tunnel a46a274e…) → cloudflared (outbound QUIC) → nginx :80
   ├─ location /            → /var/www/hr-frontend        (React build; index.html no-cache)
   ├─ location /api/        → 127.0.0.1:8000              (ERPNext gunicorn; Host→vera.local)
   ├─ location /files/      → bench public/files          (static, 1d cache)
   ├─ location /private/    → :8000                       (auth'd file proxy)
   ├─ /desk, /app           → 403                          (desk hidden)
   └─ *.js/css/img          → 1y immutable                (hashed assets)
```

nginx: `client_max_body_size 2G`, `proxy_read_timeout 600s` (long AI/import calls). Config at `/etc/nginx/sites-available/hr-frontend`.

**Runtime (supervisor keeps 7 processes alive):** `frappe-web` (gunicorn), `node-socketio`, `schedule`, `short-worker`, `long-worker`, `redis-cache`, `redis-queue`. Plus system services: MariaDB 11.8.6, nginx, cloudflared, ollama.

**Stack:** frappe 15.109.0 · erpnext 15.109.2 · hrms 15.60.3 · hr_client 0.0.1 (develop). Node 20. DB `_e504aad80b21f3d5`.

---

## 3. Backend internals (`hr_client` Frappe app)

`hr_client` is a custom Frappe app sitting alongside frappe/erpnext/hrms in the bench. It reuses their DocTypes (Employee, Job Applicant…) and adds ~90 of its own (`VE *` for accounts/Tally, `Vera *` for HR/CRM/quotation).

### 3.1 `hooks.py` — the wiring spine
Everything the app hooks into the framework lives here:

```python
app_name = "hr_client"
allow_cors = [veraenterprises.in, localhost:5173, 192.168.1.16:5173]
fixtures   = [Custom Field …]                              # recruitment pipeline fields
doc_events = {
   "Job Applicant"/"Interview"/"Job Offer" → recruitment.on_*     # recruitment automation
   + 14 "VE Tally*" DocTypes → data_source.guard_tally_write       # read-only enforcement
}
scheduler_events = {
   daily:        drive_sync.watch_manager.renew_watches
   "*/10 * * * *": drive_sync.delta_sync.run_delta_sync
}
before_request = ["hr_client.api.twofa.enforce"]           # GLOBAL 2FA gate on every request
```

Three cross-cutting concerns are enforced here, not per-endpoint: **2FA** (before every request), **Tally immutability** (doc_events), **recruitment automation** (ERPNext HR doc_events).

### 3.2 The API module pattern (`hr_client/api/*.py`)
~50 flat modules, one per domain. No classes, no REST controllers — each is a file of functions decorated with `@frappe.whitelist()`, which exposes them at `/api/method/hr_client.api.<module>.<fn>`. Skeleton:

```python
@frappe.whitelist()
@handle_api_error
def some_endpoint(arg1, arg2=None):
    require_login()            # or require_admin()
    ...                        # frappe.get_all / frappe.db.sql / frappe.get_doc
    return {"success": True, "data": [...]}
```

### 3.3 `api/utils.py` — the shared kernel
- **`ADMIN_USERS`** = `{Administrator, owais@…, amoghspace@…}` — hardcoded admin allowlist (mirrored in frontend `lib/constants.ts`).
- **`require_login()` / `require_admin()`** — the two auth primitives. `require_admin` passes if user ∈ ADMIN_USERS **or** has role `System Manager`.
- **`current_fy()` / `*_label()`** — Indian FY math; rolls over April 1 (no hardcoded years).
- **`handle_api_error(fn)`** — decorator mapping exceptions to clean JSON + status: `ValidationError→400, PermissionError→403, DoesNotExist→404, else→500` (+ logs traceback via `frappe.log_error`). This is why the SPA gets `{success:false,error:…}` instead of Frappe HTML tracebacks.

### 3.4 Data-source separation (`api/data_source.py`) — the most important rule
Two permanent classes of record, **derived from DocType, never stored** (so it can't drift):
- **Class A — TALLY**: the closed `TALLY_DOCTYPES` frozenset (14 DocTypes). Read-only for everyone incl. admin; corrected in Tally and re-synced.
- **Class B — ERP**: everything else, by definition (created inside the ERP). Editable per permission matrix; voided, never hard-deleted.

`classify(doctype)` is the single decision point; badges (grey TALLY / gold ERP), read-only rules, and reporting all read from it. The write-guard (`guard_tally_write`, wired in hooks) blocks interactive ORM writes but lets the importer through via `frappe.flags.in_tally_sync = True` (and the importer's raw-SQL writes bypass ORM hooks anyway).

### 3.5 Permission system (`api/permissions.py`) — registry-driven, stored sparse
- **`PERMISSION_REGISTRY`** — one Python list-of-groups is the single source of truth for every grantable module/subsection, each with a stable dotted `key` (e.g. `quotation.cost_sheets`, `hrms.payroll`). Add an entry → it appears in the admin Role-Control page *and* is gated in the sidebar automatically. `admin:True` = admin-only regardless of grant.
- **Storage is sparse & negative**: a user's `permissions_json` stores only the set of **denied** keys (`{k: False}`). Absence = allowed → a new module is visible by default until explicitly denied (no migration needed).
- **Resolution**: `get_my_permissions()` returns the module map; `update_user_permissions` also **syncs Frappe roles** (`_sync_user_roles`) so backend role checks stay consistent with UI grants.

---

## 4. Frontend internals (`hr-frontend`, React 18 + Vite 5 + TS 5.6)

### 4.1 Transport (`lib/api.ts`)
A single axios instance is the whole transport layer:
- `baseURL = VITE_API_BASE` (`https://veraenterprises.in`), **`withCredentials: true`** (Frappe session cookies).
- A **request interceptor** injects `X-Frappe-CSRF-Token` (read from `csrf_token` cookie) on all POST/PUT/PATCH/DELETE — Frappe rejects state changes without it.
- `apiUrl(m)` → `/api/method/<dotted.path>`. Every call reads `res.data.message` (Frappe wraps whitelisted returns in `{message: …}`).
- ⚠️ **File uploads must use `fetch`, not axios** — axios corrupts the multipart boundary.

`src/api/*.ts` are thin typed wrappers grouped by domain, mirroring the backend modules.

### 4.2 Two Contexts do all the gating

**`AuthContext`** — dual identity:
- `realUser` = actual session; `effectiveUser` = who the UI renders *as*.
- **View-as impersonation (Option-1)**: an admin can preview the app *as* another user — **UI/permissions only; the backend session stays the real admin**. `viewAs` lives in `sessionStorage`, restored only for real admins.

**`PermissionsContext`** — the `can(key)` gate used everywhere:
- Fetches `get_my_permissions` + `get_permission_registry` via TanStack Query (5-/30-min stale).
- `can(key)` walks the key **up its ancestor chain** in the registry — any explicit `false` on the key *or its parent group* denies it (disabling a module hides all subsections).
- Short-circuits: admins → always `true`; impersonating → uses `viewAs.permissions`; optimistic `true` while loading (no nav flicker).

### 4.3 Pages
`src/pages/*` = one folder per module (crm, quotation, accounting, peoplework, recruitment, leave, expenses, chat, drive, admin, erp_entries…). `components/` holds the registry-driven Sidebar, Ctrl+K CommandPalette, TwoFactorGate.

---

## 5. Subsystem deep-dive: Quotation Studio

The flagship Phase 2 build (spec §4). A five-stage, revision-controlled document chain with a server-side commercial-approval engine. All maths and rules run server-side; everything here is ERP-native (Class B).

### 5.1 The document chain
```
Vera CRM Opportunity                        (the deal — CRM subsystem)
      │  (every doc links back to opportunity)
      ▼
Vera Measurement Sheet   VMS-.YYYY.-.####    site/final/production measurements
      │   child tables: Measurement Row (dims), Service (plumbing/elec/data/gas),
      │                 Obstruction (column/window/beam/switchboard/duct)
      ▼
Vera BOQ                 VBOQ-.YYYY.-.####    bill of quantities / configuration
      │   child: BOQ Line — carcass/shutter materials, finishes, edge banding,
      │          hardware pkg, calc_qty, selling_rate + cost_rate → totals
      ▼
Vera Cost Sheet          VCS-.YYYY.-.####     cost build-up + GP targets
      │   base_cost, overhead_percent, total_cost, selling_total,
      │   projected_gp(_percent), target_gp_percent, min_gp_percent
      ▼
Vera Sales Quotation     VSQ-.YYYY.-.####     the customer quotation (§4.5/4.6)
      │   child: Quotation Line + Approval log (append-only audit)
      │   pulls cost_basis + GP targets from the cost sheet
      ▼
Vera Sales Order         VSO-.YYYY.-.####     created on quotation acceptance
          snapshots quotation/boq/cost_sheet + their revision numbers
```

Each stage carries `status` (Draft → Submitted → Approved → Superseded), `revision` (Int), a `supersedes` self-link, and `source` (badge). Revisions are immutable-forward: an approved doc is never edited — you create a new revision that supersedes it.

### 5.2 The commercial-approval exception engine (`quotation.py:compute_authority`, §4.6)
The heart of the module. On every save/submit, `_refresh_engine(doc)` runs `_apply_maths` then `compute_authority`, which evaluates rules and routes the quotation to the **highest authority any triggered rule demands** (rank-based):

| Trigger | Routes to | Rank |
|---|---|---|
| Discount > CFO threshold | CFO | 2 |
| Discount > Manager threshold | Sales Manager | 1 |
| GP below **minimum** (`min_gp_percent`) | Director / CFO | 3 |
| GP below **target** (`target_gp_percent`) | Sales Manager | 1 |
| Non-standard credit terms | CFO | 2 |
| Negative adjustment (negotiated reduction) | Sales Manager | 1 |

`required_authority = _RANK_LABEL[max(rank)]`; `triggered_rules` is stored as text ("No exception — delegated authority" when clean).

**Maths (`_apply_maths`)** — server-authoritative:
```
gross_total   = Σ(line.qty × line.rate)
discount_amount = gross × discount_percent/100
net_before_gst  = gross − discount_amount + adjustment
gst_amount    = net_before_gst × gst_percent/100
grand_total   = net_before_gst + gst_amount
gross_profit  = net_before_gst − cost_basis        # cost_basis pulled from cost sheet
gp_percent    = gross_profit / net_before_gst × 100
```

### 5.3 Lifecycle endpoints & guards
`create_quotation` (seeds lines from the BOQ, pulls GP targets from the cost sheet) → `update_quotation` / `save_lines` → `submit_for_approval` (status → **Pending Approval**) → `decide(action, comment, conditions)` (approve/return/reject, appends to `approval_log`) → `set_acceptance` → `convert_to_sales_order`.

Guards: `_assert_editable` blocks edits once status leaves the editable set ("create a new revision"); `_conversion_checks` + `_is_latest_approved_revision` ensure only the latest approved revision converts to an SO. `create_revision` clones a superseded doc forward. GP colour tone (red/amber/green) is computed from min/target GP for the UI.

---

## 6. Subsystem deep-dive: CRM

Two generations coexist:

### 6.1 Phase 2 pipeline (`crm_pipeline.py`, `crm_directory.py`) — current
A clean linear funnel feeding the Quotation Studio:
```
Vera CRM Lead  VCL-   (raw inbound)
      ▼ (qualify)
Vera CRM Enquiry  VCE-   status: Open→Qualified→Converted→Dropped
      │  convert_enquiry_to_opportunity()  — one-shot, guarded against double-convert;
      │  sets enquiry.created_opportunity + opportunity.source_enquiry (bidirectional link)
      ▼
Vera CRM Opportunity  VCO-   stage: Qualification→Proposal→Negotiation→Won/Lost
      │  set_opportunity_stage(stage, loss_reason)  — validated against _OPP_STAGES
      ▼
  (feeds Quotation Studio: every measurement/BOQ/quotation links to the opportunity)
```
Supporting entities: **Vera CRM Contact** (VCC-, customer contacts + preferred channel), **Vera CRM Follow-up** (VCF-, polymorphic `linked_type`/`linked_name` against Lead/Enquiry/Opportunity), **Vera Sales Team Member** (VSTM-, territory + `approval_authority` = None/Sales Executive/Sales Manager/CFO/Director — the authority ladder the quotation engine routes to).

### 6.2 Legacy stage-approval flow (`crm.py`) — retained
The original per-employee lead board with an admin approval gate. `STAGE_ORDER = [Lead, Discussion, Quotation, Order, Delivery, Success]`. **Invariant:** a lead's `status` is never written directly — every advance goes through a `Vera CRM Approval Request` (VCAR-): `request_next_stage` (auto-computes next stage, blocks if one is already pending, snapshots lead fields) → admin-only `approve_stage` / `reject_stage` (gated on `OWAIS_USERS`). Only `approve_stage` may write `lead.status`.

---

## 7. Subsystem deep-dive: Tally ingestion

The heaviest and most defensive subsystem — it turns 100 MB–1.6 GB Tally XML exports into queryable financials, and everything it writes is **Class A / read-only** in the ERP.

### 7.1 The 4-stage pipeline (`tally_transformer.run`)
Entry point (run via `bench execute … tally_transformer.run` or the admin trigger). It sets `frappe.flags.in_tally_sync = True` up front to exempt itself from the §2.2 read-only guard, then reports progress via `_set(status, progress, message)` (polled by `get_status`):

```
Stage 1 (0–55%)   tally_import_job.run(masters_path, transactions_path)
                  parse masters + transactions XML → VE Tally Voucher/Ledger/Group/Stock Item
                  · revenue parsed from nested <ACCOUNTINGALLOCATIONS.LIST> (ISDEEMEDPOSITIVE=Yes ⇒ Dr)
                  · stock valued at latest transaction line <RATE> (no closing-stock snapshot in export)
                  · debtor/creditor classified by walking full group hierarchy (_has_ancestor)
Stage 2 (55–95%)  accounts_tally_import.run()
                  VE Tally tables → dashboard registers: Sales/Purchase/GST/Creditor/Debtor/
                  Cash Flow/Stock Movement (idempotent via tally_guid unique key)
Stage 3 (95%)     reconcile — accounts_tally_import.reconcile() + finance_core.reconcile()
                  compares source vs derived counts/values per section; drift → Error Log
Stage 4 (100%)    frappe.clear_cache()
```

Sign convention throughout: **negative = Dr = asset balance**.

### 7.2 `finance_core.py` — the canonical read layer
Dashboards, graphs, and profitability never read Tally tables directly — they read `finance_core`, which is the single source of truth for financial reads over `VE Tally Ledger`/`VE Tally Voucher`:
- `funds_summary()` — bank/OD/virtual balances (negative totals here are deliberate Tally-parity; do **not** "fix" the sign).
- `txn_summary(kind)` / `monthly_series(kind)` — sales/purchase aggregates + trends.
- `accounts_summary()`, `gst_summary()`, `cash_flow_statement()` — the dashboard sections.
- `period_bounds()` / `period_options()` — FY-aware period math.
- `reconcile()` — cross-check used in Stage 3.

---

## 8. End-to-end request lifecycle

```
1. Browser → Cloudflare (TLS) → cloudflared tunnel → nginx :80
2. nginx routes /api/method/* → gunicorn 127.0.0.1:8000 (Host → vera.local)
3. before_request twofa.enforce → route to the whitelisted fn
4. fn: require_login/require_admin → frappe ORM/SQL → MariaDB
5. return dict → Frappe wraps as {message: …} → axios reads res.data.message
Background: 'schedule' fires drive delta-sync every 10 min; 'short/long-worker' run queued jobs via redis-queue; redis-cache backs frappe cache.
```

---

## 9. Invariants (the rules of the codebase)

| Invariant | Enforced at |
|---|---|
| Employees never see the Frappe desk | nginx `403` on `/desk`, `/app` |
| Every request is 2FA-gated | `hooks.before_request → twofa.enforce` |
| Tally records are immutable in the ERP | `hooks.doc_events → data_source.guard_tally_write` + `classify()` |
| One admin allowlist, mirrored both sides | `api/utils.ADMIN_USERS` ↔ `lib/constants.ADMIN_USERS` |
| One registry drives nav + admin UI + gating | `api/permissions.PERMISSION_REGISTRY` ↔ `PermissionsContext.can()` |
| Permissions stored as denials, allow-by-default | `permissions_json = {denied_key: False}` |
| Errors return JSON, not tracebacks | `api/utils.handle_api_error` |
| Financials come from finance_core, not raw Tally | `api/finance_core.py` |
| Approved quotations are never edited — only revised | `quotation._assert_editable` + `create_revision` |
| Commercial approval routes to highest triggered authority | `quotation.compute_authority` (§4.6) |
| CRM lead status only changes via approval | `crm.approve_stage` (legacy) / staged transitions (Phase 2) |
| Tally sync bypasses the read-only guard via a flag | `frappe.flags.in_tally_sync = True` |
| Deploy is rsync, never git-reset | manual rsync source → bench |

---

## 10. Deploy

Source repo `/home/vera/vera-erp/hr-client-erp`, remote `KernelLex/hr-client-erp`, branch `develop`. **Deploy is manual rsync** (the GitHub Actions SSH deploy can't reach this home box):
- **Backend**: rsync source → `/home/frappe/frappe-bench/apps/hr_client/` → `bench --site vera.local migrate` + `clear-cache` → `supervisorctl restart`.
- **Frontend**: `npm run build` in `hr-frontend/` → rsync `dist/` → `/var/www/hr-frontend/`.

sudo password is `vera`; `sudo /usr/bin/rsync` + `sudo /usr/bin/supervisorctl` are NOPASSWD for the `vera` user.
