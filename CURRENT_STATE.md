# Vera ERP — Current State
_Last updated: 2026-08-09 (session: AI company brain + qwen2.5)_

> ⚠️ **Two current-state corrections since this doc was first written:**
> 1. **Server IP is `192.168.1.16`** (static), not `192.168.1.32`. Site `vera.local`, bench port 8000.
> 2. **Tally data is currently PARTIAL** — 1,414 vouchers, latest `2026-03-31` (a partial current-FY
>    `Transactions.xml` was imported instead of full-history `All Transactions.xml`). Voucher-count
>    figures below (~23k) reflect the earlier full-history import and are stale until a full re-import.

## What this is

A full ERP system for **Vera Enterprises** (interior design / hardware company, Bangalore).  
Built on **ERPNext v15 + Frappe HRMS** as the backend, with a completely custom **React SPA** as the UI.  
Users never see the ERPNext desk — they only use the React frontend.

---

## Infrastructure

| Item | Value |
|------|-------|
| Server | Ubuntu at `192.168.1.16` (static) / `veraenterprises.in` |
| Frappe bench | `/home/frappe/frappe-bench/` |
| Site name | `vera.local` |
| Frontend (built) | `/var/www/hr-frontend/` |
| Frontend (source) | `/home/vera/vera-erp/hr-client-erp/hr-frontend/` |
| Backend app source | `/home/vera/vera-erp/hr-client-erp/hr_client/` |
| Backend app (live) | `/home/frappe/frappe-bench/apps/hr_client/` |
| Tally snapshot | `/home/frappe/frappe-bench/apps/hr_client/hr_client/tally_snapshot.json` |
| Ollama | Running locally at `http://localhost:11434`, model **`qwen2.5:7b`** (llama3.1 kept as fallback) |
| Frontend API base | `https://veraenterprises.in` (set in `.env.local`) |

**To deploy backend changes:** `rsync` source → bench app, then `bench --site vera.local migrate && bench --site vera.local clear-cache`, then `supervisorctl restart frappe-bench-web: frappe-bench-workers:`

**To deploy frontend changes:** `npm run build` in `hr-frontend/`, then `rsync dist/ → /var/www/hr-frontend/`

---

## Tech stack

- **Backend:** ERPNext v15 + Frappe HRMS + custom `hr_client` Frappe app
- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui + React Query
- **Database:** MariaDB (via Frappe ORM)
- **AI/LLM:** Ollama (local, **`qwen2.5:7b`**) — Tally enrichment + the whole-company assistant (see "AI Company Brain" below) + Recruitment JD generation
- **Attendance:** Jibble API (time tracking)
- **File storage:** Google Drive (file browsing only — no AI extraction anymore)

---

## Team (Vera Enterprises)

| Name | Email | Role | Employee ID |
|------|-------|------|-------------|
| Owais Ahmed Khan | `owais@veraenterprises.in` | Admin / Manager | HR-EMP-00001 |
| Maaz | `maazdgr8.mma@gmail.com` | Project Manager | HR-EMP-00002 |
| Manjunath M N | `manju.veraaccnts@outlook.com` | Accounts Manager | HR-EMP-00003 |
| Lookman | `lookman.vera@outlook.com` | Accounts Executive | HR-EMP-00004 |
| Bhagya Shree | `bhagyashree.veraenterprises@outlook.com` | Logistics Manager | HR-EMP-00005 |

Owais logs in as `Administrator`. All passwords: `Vera@2026`.

---

## Frontend — Pages & Routes

| Route | Component | Who sees it |
|-------|-----------|-------------|
| `/` | Dashboard — stats, quick actions, AI health | All |
| `/login` | Login page | Unauthenticated |
| `/my-profile` | Employee profile (self-edit) | All |
| `/employee/profile/:id` | Employee profile (admin view) | All |
| `/admin/employees` | Team grid (all employees) | Admin only |
| `/admin/employees/:email` | Employee detail — 4 tabs | Admin only |
| `/admin/permissions` | Module permission toggles | Admin only |
| `/admin/users` | User management panel | Admin only |
| `/admin/attendance` | Jibble attendance + leave requests | Admin only |
| `/leave` | Leave application (self) | All |
| `/holidays` | 2026 holiday calendar + leave policy | All |
| `/recruitment` | Job card listing | Permission-gated |
| `/recruitment/pipeline/:id` | Kanban pipeline for a job opening | Permission-gated |
| `/expenses` | My expense claims | All |
| `/expenses/new` | Submit new claim | All |
| `/expenses/admin` | Admin claims view | Admin only |
| `/crm` | CRM pipeline board (all employees can view/create) | Permission-gated |
| `/crm/new` | Create new CRM lead | Permission-gated |
| `/crm/:id` | CRM lead detail + approval flow | Permission-gated |
| `/chat` | Polling chatroom | Permission-gated |
| `/accounts` | Google Drive file browser | Permission-gated |
| `/drive` | VE Drive file list | Permission-gated |
| `/operations` | **Main financial dashboard** (Tally data) | Admin only |
| `/verify` | **Tally data verification + Ollama enrichment** | Admin only |
| `/ai-insights` | AI Insights page (legacy, still accessible) | Admin only |
| `/business` | Redirects → `/operations` | All |

---

## Sidebar Navigation

```
Dashboard
My Profile
─────────
HR (group, collapsible)
  ├── Attendance (admin)
  │     └── Holidays (sub-item)
  ├── Leave
  ├── Expenses
  └── Team (admin)
─────────
Recruitment (permission-gated)
─────────
Accounts (group, permission-gated, collapsible)
  ├── Drive Documents
  ├── Upload Status
  ├── Verify Data (admin) ← NEW: Tally verification
  └── AI Insights (admin)
─────────
Operations (admin only) ← Main financial dashboard
CRM (permission-gated)
Chat (permission-gated)
Performance (disabled, greyed out)
```

---

## Operations Page — The Main Financial Dashboard

Route: `/operations` — admin only.

**Data source:** Tally XML files imported via the Import & AI tab. Data lives in:
- `tabVE Tally Voucher` — 23,609 individual vouchers
- `tabVE Tally Ledger` — 1,911 ledger accounts
- `tabVE Tally Stock Item` — 4,538 SKUs
- `tally_snapshot.json` — pre-computed aggregate totals (most accurate financial figures)

**8 tabs:**

| Tab | What it shows |
|-----|---------------|
| **Overview** | Year filter, Transaction Volume (4 KPI cards: Sales/Purchases/Collections/Payments), 6-month cashflow chart, Bank/GST/HR detail cards, quick navigation chips |
| **Cashflow** | Monthly cashflow trend, cash vs bank balance |
| **Receivables** | Debtor aging, top debtors, party statement drawer |
| **Payables** | Creditor list, payables breakdown |
| **Search** | Full-text search across all 23,609 vouchers |
| **Ledger** | **Voucher Browser** — folder-style view of all voucher types |
| **Inventory** | Stock items, HSN codes, standard rates |
| **Import & AI** | Upload Tally XML files (Masters + Transactions), import progress |

### Year filter
- Pill buttons: All Time · 2026-27 · 2025-26 · 2024-25 · [older dropdown]
- Affects Transaction Volume cards and Ledger browser default

### Current financial data (from snapshot, as of last import ~Apr 2026)
| Metric | Value |
|--------|-------|
| Sundry Debtors | ₹13.23 Cr |
| Sundry Creditors | ₹3.68 Cr |
| GST Payable (Output) | ₹4.60 Cr |
| Input GST Credit | ₹3.51 Cr |
| FY 2025-26 Sales | ₹13.39 Cr |
| FY 2025-26 Purchases | ₹11.06 Cr |
| All-time Sales | ₹57.72 Cr |
| Cash in Hand | ₹1.75 L |

**Note:** Tally data is missing Apr 17 – Jun 27, 2026 (~450 sales txns ≈ ₹4.7 Cr, ~290 purchases). Once the user uploads the complete XML, the totals will reach ~Purchase ₹50 Cr / Sales ₹53 Cr.

---

## Voucher Browser (Ledger tab inside Operations)

A file/folder-style browser for individual Tally vouchers.

**3 navigation levels:**

1. **Folder grid** — 14 voucher type cards (Sales, Purchase, Receipt, Payment, Journal, Contra, Performa Invoice, Credit Note, Debit Note, Sales Order, Purchase Order, Delivery Note, Stock Journal, Other). Each shows count + total, colour-coded by type.

2. **Voucher list** — click a folder → paginated table (50/page, server-side). Filters: FY, text search (party/narration/number), sort (date, amount). Breadcrumb navigation.

3. **Voucher document overlay** — click a row → full-screen modal that looks like a real printed invoice/receipt. Shows: company header, voucher type icon, number, date, party name, DR/CR ledger entries table, narration, total. Has "View full statement for [party]" link.

**Component:** `src/pages/Operations/VoucherBrowser.tsx`  
`VoucherDocument` and `VoucherRow` are exported for reuse in the Verify page.

---

## Verify Page — Tally Data Verification

Route: `/verify` — admin only. Completely rewritten in 2026-06-27 session.

**Purpose:** Manage Ollama-powered enrichment of Tally voucher data. Replaces the old Drive document verification system.

**3 tabs:**

| Tab | What it shows |
|-----|---------------|
| **Overview** | Start/stop enrichment button, real-time progress bar (polls every 2s when running), transaction category breakdown bar chart |
| **Anomalies** | Paginated list of vouchers flagged by Ollama (zero amounts, suspicious patterns, etc.). Click row → opens VoucherDocument overlay. Per-row thumbs-up/down, bulk dismiss |
| **Normalizations** | Table of original → AI-normalized party name pairs with affected voucher counts |

**Stats strip (always visible):** Total Vouchers · Enriched by AI · Pending · Anomalies · Human Verified

---

## AI Company Brain — the whole-company assistant (2026-08-09)

The Vera AI bot (`ai.chat`, admin-only, surfaced by the `AIChat` widget) is no longer finance-only.
On every question it rebuilds a fresh knowledge digest from the **live DB** via
`hr_client/api/company_brain.py`, so newly uploaded data is known on the next query — there is no
fine-tuning/retraining step (Ollama models can't be fine-tuned; this is retrieval-augmented context).

**What the bot knows:** financial snapshot (Tally) · full active-employee roster across all 3 companies
(designation/department/reporting) · open Job Openings · the entire Org Hub knowledge base (Job
Descriptions, KRAs, KPIs, SOPs, Policies, Handbook, Ops Manual, Processes, Forms). When a question
names a specific person, role or document, its full text is retrieved into the answer.

**Recruitment link:** `recruitment.generate_job_description()` now runs on the local model
(`qwen2.5:7b`) grounded in `build_jd_context()` (existing JD + KRAs + KPIs for that designation) —
no OpenAI/API key. Same JSON contract, so the New Job Opening JD generator UI is unchanged.

**Model:** `qwen2.5:7b`, `num_ctx=4096`, pinned in RAM (`keep_alive=-1`). Only one model pinned at a
time on the 15GB CPU-only box; `ollama stop llama3.1` frees the old model's ~5GB.

## Ollama Enrichment System

**DocType:** `VE Tally Enrichment` — one record per voucher, keyed by `tally_guid` (stable across re-imports).

**Fields per enriched voucher:**
- `party_norm` — cleaned party name (fixes HTML entities, normalizes casing)
- `tx_category` — B2B Sales | B2C Sales | B2B Purchase | Project | Stock Movement | Collection | Payment | Journal/Contra | Other
- `gst_type` — Intrastate | Interstate | Exempt | None
- `anomaly` + `anomaly_reason` — flagged issues
- `confidence` — 0-100
- `human_reviewed` + `human_note` — manual review status
- `status` — Pending | Enriched | Needs Review | Verified

**Processing:** 8 vouchers per Ollama prompt, ~4s per batch → ~3 hours for all 23,609 vouchers. Start from `/verify` Overview tab.

**Current state:** 0 enrichments (not yet run — enrichment job needs to be started).

**Backend:** `hr_client/api/tally_enrich.py`  
**Frontend API:** `src/api/tally_enrich.ts`

---

## Tally Import Pipeline

**How Tally data gets into the system:**

1. User exports from Tally: `All Masters_DD.MM.YYYY.xml` + `Transactions Masters_DD.MM.YYYY.xml` (large, ~1.5 GB)
2. User uploads both files in Operations → Import & AI tab
3. Files are saved to the server
4. Background job runs `tally_import_job.py`:
   - Parses Masters XML → populates `tabVE Tally Ledger` + `tabVE Tally Stock Item`
   - Parses Transactions XML → populates `tabVE Tally Voucher` (DELETE + re-INSERT all)
   - Computes `tally_snapshot.json` (aggregate financial totals)
5. Import takes ~2-5 minutes, progress shown live via polling

**Parser fix (2026-06-27):** The import now uses the **party-ledger amount** (`ISPARTYLEDGER=Yes`) as the voucher amount instead of the max-ledger amount.

**Major enrichment (2026-06-27 session 2):** Import now extracts from both XML files and cross-references them:
- **Masters XML (All Masters)** → Ledger enrichment: GSTIN, mailing name, full address, state, pincode, phone, PAN, GST registration type for every customer/vendor
- **Masters XML** → Stock item enrichment: HSN code fixed (was reading wrong XML tag — now reads `HSNCLASSIFICATIONNAME`), GST rate now populated from GSTDETAILS/RATEDETAILS, standard price from STANDARDPRICE.LIST
- **Transactions XML** → Voucher detail: `all_ledger_entries` (JSON) + `inventory_entries` (JSON) now stored per voucher — enables full invoice view with line items, quantities, rates, HSN, CGST/SGST breakdown
- **`get_voucher_detail` endpoint** JOINs with VE Tally Ledger to add party GSTIN + address to every invoice view
- When user uploads new Tally XML files and re-imports, all connections are rebuilt automatically from the two source files

**After re-import:** Enrichments are keyed by `tally_guid` so they survive re-imports. New vouchers (new GUIDs) get queued for Ollama enrichment.

**Current import stats (2026-06-27 session 2):** 1,911 ledgers · 4,538 SKUs · 23,719 vouchers · completed in 20s

---

## Database — Active Tables

### Tally data
| Table | Rows | Purpose |
|-------|------|---------|
| `tabVE Tally Voucher` | 23,719 | Individual accounting entries (with `all_ledger_entries` + `inventory_entries` JSON) |
| `tabVE Tally Ledger` | 1,911 | Chart of accounts + closing balances + GSTIN, address, phone, state, PAN |
| `tabVE Tally Stock Item` | 4,538 | Inventory items with fixed HSN codes + GST rates |
| `tabVE Tally Enrichment` | 0 | Ollama enrichment (not yet run) |

### Google Drive
| Table | Rows | Purpose |
|-------|------|---------|
| `tabVE Drive File` | 7,049 | Drive file metadata (for browsing only) |

### HR / Operations custom DocTypes
| Table | Purpose |
|-------|---------|
| `tabVera CRM Lead` | CRM pipeline leads |
| `tabVera CRM Approval Request` | Stage advance approvals |
| `tabVera CRM Quotation` | Quotation records |
| `tabVera Expense Claim` | Employee expense claims |
| `tabVera Leave Application` | Leave requests |
| `tabVera Chat Message` | Chat messages (11 so far) |
| `tabVera Chat Room` | Chat rooms |
| `tabUser Module Permission` | Per-user module visibility |
| `tabVE Drive Settings` | Google Drive API config |

### AI extraction tables — REMOVED
As of 2026-06-27, all 14 AI extraction tables were dropped:
`tabVE Sales Invoice`, `tabVE Purchase Invoice`, `tabVE Purchase Order`, `tabVE Quotation`, `tabVE GRN`, `tabVE Financial Report`, `tabVE Salary Record`, `tabVE Attendance Record`, `tabVE Payment Record`, `tabVE Credit Note`, `tabVE Debit Note`, `tabVE Sales Order`, `tabVE Stock Record`, `tabVE Receipt`

These were from the old Drive AI extraction pipeline (Google Drive documents → AI extraction → structured DocTypes). That pipeline has been fully retired. Google Drive is now used for **file browsing only** — no AI extraction from Drive files.

---

## Backend API Files

All in `hr_client/api/`:

| File | Purpose |
|------|---------|
| `operations.py` | Main financial data — 18 endpoints (Tally vouchers, ledgers, party statements, cashflow, financial summary, voucher list, FY filter, `get_voucher_detail`, `get_ledger_profile`) |
| `tally_import_job.py` | Tally XML import pipeline (background job) |
| `tally_enrich.py` | Ollama enrichment pipeline — 8 endpoints |
| `ai.py` | Ollama health check, AI chat (whole-company, admin-only), insights |
| `company_brain.py` | Retrieval-augmented company context: roster + org structure + open jobs + Org Hub + finances, rebuilt live per question. Feeds `ai.chat()` and JD generation |
| `org_hub.py` | Org Hub knowledge CRUD — 9 DocTypes (JD, KRA, KPI, SOP, Policy, Handbook, Ops Manual, Process, Forms) across 3 companies |
| `chat.py` | Chatroom CRUD + messaging |
| `crm.py` | CRM leads, approvals, quotations |
| `dashboard.py` | Dashboard stats |
| `employee.py` | Employee profiles, photo upload |
| `employee_lifecycle.py` | Onboarding/offboarding |
| `expenses.py` | Expense claims |
| `jibble.py` | Jibble attendance API (12 endpoints) |
| `leave.py` | Leave applications + holidays |
| `permissions.py` | Module permissions per user |
| `recruitment.py` | Job openings, pipeline, candidates |
| `user_management.py` | Admin user CRUD |
| `notes.py` | Employee notes |
| `utils.py` | `handle_api_error` decorator |

---

## Key Operations Endpoints

Base: `/api/method/hr_client.api.operations.<endpoint>`

| Endpoint | Purpose |
|----------|---------|
| `get_operations_data()` | Full dashboard data from snapshot |
| `get_financial_summary(fy)` | Per-type counts/totals by FY (used by folder cards in Ledger browser) |
| `get_available_financial_years()` | List of FYs with data (newest first) |
| `get_voucher_list(voucher_type, fy, search, page, sort)` | Paginated voucher list for Ledger browser |
| `get_party_statement(party_name)` | All transactions for a party |
| `get_cashflow_trend()` | Monthly sales/purchase/receipt trend |
| `get_debtor_aging()` | Receivables aging buckets |
| `get_creditor_list()` | Payables list |
| `search_tally(query, ...)` | Full-text search |
| `get_tally_stock_items(...)` | Stock items with filters |
| `upload_tally_file()` | Upload XML file (multipart) |
| `run_tally_import(masters_path, transactions_path)` | Start import background job |
| `get_import_status()` | Poll import progress |

## Key Tally Enrichment Endpoints

Base: `/api/method/hr_client.api.tally_enrich.<endpoint>`

| Endpoint | Purpose |
|----------|---------|
| `get_enrichment_stats()` | Total/enriched/pending/anomalies/verified counts + category breakdown |
| `get_enrichment_status()` | Poll enrichment job progress |
| `start_enrichment()` | Kick off background Ollama enrichment |
| `stop_enrichment()` | Stop running enrichment |
| `get_anomaly_queue(page)` | Paginated list of flagged vouchers |
| `get_normalization_queue(page)` | Paginated party name normalization diffs |
| `mark_anomaly_reviewed(tally_guid, confirmed, note)` | Human review of anomaly |
| `bulk_dismiss_anomalies(tally_guids_json)` | Bulk dismiss as OK |

---

## Google Drive Integration (browsing only)

- 7,049 Drive files synced to `tabVE Drive File`
- Files browsable at `/accounts` and `/drive`
- Drive API still fetches file metadata (owner, last modifier, folder path)
- **No AI extraction from Drive files** — that entire pipeline was retired
- The folder structure (Sales / Purchase / Accounts / HR / Logistics) is for file organization, not data extraction

---

## Things intentionally removed / retired

| What | Why removed |
|------|-------------|
| Drive AI extraction (all 14 DocTypes) | All financial data comes from Tally XML now — more accurate and complete |
| `ProcessFilesPanel` component | No longer extracting from Drive |
| `BusinessDocsContent` component | Was the folder view for AI-extracted records |
| "Business Docs" tab in Operations | Showed AI-extracted Drive data |
| `/business` route | Merged into Operations — now redirects there |
| Old Verify page (swipe cards for Drive docs) | Replaced with Tally verification |
| `api/business.ts` functions | Still in file but unused; BusinessDashboard is now just a redirect |

---

## Voucher Invoice View (VoucherDocument)

When clicking any voucher in the Ledger browser (Operations → Ledger tab), the overlay now shows a **full Tally-style tax invoice**:

- **Company header**: VERA ENTERPRISES, address, GSTIN: 29AAFPV9778F1ZZ
- **Invoice details**: voucher number, date, type label
- **Bill To section**: party mailing name, full address, state, pincode, phone, GSTIN (from ledger master), GST registration type
- **Items table**: product name, HSN code, qty (with unit), rate (per unit), discount %, amount — for Sales/Purchase/Performa vouchers with inventory entries
- **Tax/ledger breakdown**: all individual DR/CR ledger entries with amounts (CGST, SGST, round-off etc.)
- **Amount in words**: e.g. "INR One Lakh Three Thousand Sixteen Only"
- **Bank details**: ICICI Bank, A/C: 419705500695, IFSC: ICIC0004197
- **Party statement link**: "View full statement for [party]"
- Falls back gracefully for vouchers without line items (Receipt/Payment/Journal) — shows ledger entries only

**Endpoint:** `get_voucher_detail(name)` in `operations.py` — JOINs VE Tally Ledger for party profile

---

## AI Insights Page (repurposed 2026-06-27 session 2)

Route: `/ai-insights` — repurposed from dead Drive AI DocTypes to live Tally data.

**8 KPI cards**: FY 2025-26 Sales, FY 2025-26 Purchases, Sundry Debtors, Sundry Creditors, GST Payable, Cash+Bank, FY Collections, Total Vouchers

**Top Debtors + Creditors cards**: pulled from tally_snapshot.json `top_debtors`/`top_creditors` (top 50 each)

**AI Health Score** (Ollama): uses Tally context — snapshot totals, monthly trend, top customers/vendors, voucher breakdown. Runs via `get_dashboard_insights`.

**Period Comparison** (Ollama): compares two YYYY-MM months using live `tabVE Tally Voucher` queries (Sales/Purchase/Receipt/Payment counts + amounts per month). Shows bar charts, trend, AI analysis.

**Report Generator** (Ollama): Executive Summary, Cash Flow, Sales Analysis, Vendor Analysis, Risk Report — all generated from Tally context via `_build_rich_context()`.

**`_build_rich_context()`**: now reads tally_snapshot.json + live voucher queries for top customers/vendors + monthly cashflow — replaces old Drive AI DocType queries.

---

## Financial Graphs Page (added 2026-06-27 session 3)

Route: `/graphs` — admin only. Accessible from sidebar under Accounts group.

**3 tabs:**

| Tab | What it shows |
|-----|---------------|
| **Generate** | AI natural-language query input, chart type selector, date/FY filter, example queries, chart preview with save/export |
| **Presets** | 15 preset charts grouped by category (Sales/Purchase/Finance/Inventory), click to load instantly |
| **Saved** | Gallery of all saved graphs — grid or list view, search, category filter, stats strip, open/delete/CSV export |

**15 presets available:**
Monthly Sales vs Purchases, Top Customers, Top Vendors, Transaction Distribution (pie), Monthly Cashflow, FY Comparison, Collections Trend, GST Analysis, Top Debtors, Top Creditors, Sales Growth Rate, Stock Value, Payments vs Receipts, Credit/Debit Notes, State-wise Sales

**Chart types:** Bar, Horizontal Bar, Line, Area, Pie, Donut, Composed (bar+line)

**Export options per chart:** PNG (html2canvas), CSV (raw data), JSON (data dump), Save (persists to DB with thumbnail)

**Backend:** `hr_client/api/graphs.py` — 8 endpoints
**Frontend API:** `src/api/graphs.ts`
**DocType:** `VE Saved Graph` (autoname `VEG-.YYYY.-.####`) — stores title, chart_type, category, data_json, config_json, query_text, thumbnail_data

**Key endpoints:**
- `get_available_presets()` — returns all 15 preset definitions
- `get_preset_graph(preset_id, params_json)` — executes preset data query, returns chart-ready JSON
- `generate_graph_data(query, chart_type_hint, date_from, date_to, fy)` — AI interprets query → executes SQL → returns chart data
- `save_graph(...)` — saves to VE Saved Graph DocType with thumbnail
- `get_saved_graphs(category, page)` — paginated list
- `delete_graph(name)` — hard delete
- `get_graph_csv_data(name)` — returns CSV string for download
- `get_graph_stats()` — counts by category and chart type

---

## AI Insights Fixes (2026-06-27 session 3)

1. **React Error #31 fix:** `getDashboardInsights` auto-fires when Ollama is running; llama3.1 was returning `insights`/`alerts`/`recommendations` as arrays of objects `[{type, vendor_name, amount}]` instead of strings. Fixed in both backend (normalize array fields after LLM call) and frontend (defensive `typeof` check before render).

2. **Health Score speed fix:** Replaced `_build_rich_context()` (multiple live DB queries + long prompt) with `_build_fast_context()` that reads only from tally_snapshot.json. Prompt now fits well within 2048 token window. `num_predict` reduced from 512 → 400, `num_ctx` from 2048 → 1024. Expected time reduction: ~50%.

---

## Pending / Known Issues

1. **Missing Tally data (Apr 17 – Jun 27, 2026):** User hasn't uploaded the complete latest Tally export yet. When uploaded and re-imported, Sales should reach ~₹53 Cr and Purchases ~₹50 Cr all-time.

2. **Ollama enrichment not yet run:** 0 of 23,719 vouchers enriched. Start from `/verify` → Overview → "Enrich N pending". Takes ~3 hours in background.

3. **Verify page**: Padding fixed (added `p-6`). Enrichment flow is functional.

---

## Tally DocType Fields (enriched — 2026-06-27 session 2)

### VE Tally Ledger (new fields added)
| Field | Source in XML | Purpose |
|-------|---------------|---------|
| `mailing_name` | `LEDMAILINGDETAILS.LIST/MAILINGNAME` | Official billing name (may differ from ledger name) |
| `address` | `LEDMAILINGDETAILS.LIST/ADDRESS.LIST` | Full street address (multi-line joined with `, `) |
| `state` | `LEDMAILINGDETAILS.LIST/STATE` or `PRIORSTATENAME` | State for GST place-of-supply |
| `pincode` | `LEDMAILINGDETAILS.LIST/PINCODE` | Postal code |
| `gstin` | `LEDGSTREGDETAILS.LIST/GSTIN` or `PARTYGSTIN` | Party's GST registration number |
| `pan_number` | `INCOMETAXNUMBER` | PAN |
| `gst_registration_type` | `GSTREGISTRATIONTYPE` | Regular / Unregistered / Consumer etc. |
| `phone` | `CONTACTDETAILS.LIST/PHONENUMBER` or `LEDGERMOBILE` | Mobile/phone number |

### VE Tally Stock Item (fixed fields)
| Field | Old behaviour | New behaviour |
|-------|--------------|---------------|
| `hsn_code` | Empty (wrong XML tag `<HSNCODE>`) | Reads `HSNCLASSIFICATIONNAME` → extracts leading digits |
| `gst_rate` | Never populated | Reads `GSTDETAILS/RATEDETAILS` CGST rate × 2 |
| `standard_rate` | Only from STANDARDCOST (often empty) | Tries STANDARDPRICE first, fallback STANDARDCOST |

### VE Tally Voucher (new fields added)
| Field | Content |
|-------|---------|
| `all_ledger_entries` | JSON array: `[{ledger, amount, is_dr, is_party}, ...]` — all DR/CR entries with individual amounts |
| `inventory_entries` | JSON array: `[{name, hsn, rate, rate_unit, discount, amount, qty, qty_unit}, ...]` — line items |

## Key Tally API Endpoints (new — 2026-06-27 session 2)

| Endpoint | Purpose |
|----------|---------|
| `hr_client.api.operations.get_voucher_detail` | Full voucher: inventory + all ledgers + party profile (JOIN with VE Tally Ledger) |
| `hr_client.api.operations.get_ledger_profile` | Full party profile: GSTIN, address, phone, PAN, balance, debtor/creditor flag |

---

## Design System

- **No emojis anywhere** in the UI (removed as of this session)
- Colors use inline `style={{ color: "..." }}` with hex values, not Tailwind CSS variables (CSS variables resolve as `oklch(...)` inside `hsl()` → transparent)
- All icons from `lucide-react`
- Cards: `bg-white rounded-2xl border border-gray-100 shadow-sm`
- Tables: `bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm`
- Type-color scheme for vouchers: Sales=green, Purchase=red, Receipt=emerald, Payment=orange, Journal=purple, etc.
- Global styles in `index.css`, design tokens in `--bg-app`, `--bg-sidebar`, `--brand-primary` (#4F46E5)

---

## Critical Rules (do not break these)

- **Never modify Frappe/ERPNext/HRMS core files** — only extend via `hr_client`
- **Always `bench migrate` after DocType changes**, then `clear-cache`
- **Tally data is the single source of truth** for financial figures — don't pull from ERPNext financial DocTypes
- **Snapshot** (`tally_snapshot.json`) holds the most accurate aggregate totals — use it for dashboard KPIs, not raw DB sums
- **`tally_guid` is the stable identifier** for enrichments across re-imports — never use `name` (VTV-XXXXX) as a cross-import reference
- **Drive files are for browsing/reference only** — no AI extraction, no structured data from Drive
- **Owais's account** (`owais@veraenterprises.in` or `Administrator`) cannot be deleted, disabled, or have its password changed via the admin panel
- `VITE_API_BASE=https://veraenterprises.in` in `.env.local` — leave empty for local dev (Vite proxy), set full URL for production
- **All POST requests need `X-Frappe-CSRF-Token` header** — read from `csrf_token` cookie
- Use `frappe.db.sql()` with `%s` params — never f-string with user input
- `bg-popover`, `bg-card`, `bg-accent` Tailwind classes are broken (oklch/hsl mismatch) — always use explicit colors like `bg-white`, `bg-gray-100`
