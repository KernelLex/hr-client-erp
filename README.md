# Vera ERP

A full-stack, **multi-company ERP** built on ERPNext v15 + Frappe HRMS with a React SPA front end.
It runs three companies on a single site/database — **Vera Enterprises (VE)**, **Schönes Leben (SL)**,
and **Hagan Modular (HM)** — with every record company-scoped. Employees interact *only* with the
React app; the Frappe/ERPNext desk is blocked from public access.

**Live at: https://veraenterprises.in**

> Repository: `KernelLex/hr-client-erp` — single branch **`main`** (the sole source of truth as of
> 2026-10-08; all prior feature/develop branches were consolidated into `main`).

---

## What it is

Vera ERP started as an HR tool and grew into the operating system for a modular-interiors business:
hire and manage people, run the sales → quotation → project-execution pipeline, track finances from
imported Tally data, and surface it all through a local-AI assistant. It covers three legal entities
at once, so the same screens serve VE, SL, and HM with a company switcher.

The whole product is a **monochrome React SPA** (Inter font, density + light/dark toggles, a global
`⌘K` command palette) organised into **7 areas** in the sidebar. ERPNext is a headless backend —
users never see the Frappe desk.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend framework | ERPNext v15 + Frappe HRMS (Python) |
| Custom backend app | `hr_client` (this repo) — extends HRMS, never modifies core |
| Database | MariaDB (one DB, all 3 companies, company-scoped) |
| Cache / queue | Redis (Frappe bench) |
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS v3 + shadcn/ui, monochrome design tokens, Inter |
| Data fetching | TanStack Query (React Query) |
| HTTP | Axios (CSRF interceptor) + native `fetch` for file uploads |
| Charts | Recharts |
| Local AI | Ollama — company assistant, insights, Tally/document enrichment, JD generation (no external API) |
| Attendance | Jibble API (OAuth2 client credentials) |
| Documents | Google Drive (service-account sync) |
| Serving | nginx serves the SPA from `/var/www/hr-frontend` and proxies `/api/` to gunicorn |
| Public access | Cloudflare Tunnel → nginx → ERPNext (`vera.local`, gunicorn :8000) |
| Server | Ubuntu bare metal, static IP `192.168.1.16`; Supervisor-managed Frappe processes |

---

## The 7 areas & key features

Everything below is **deployed live** on veraenterprises.in. Each feature lists a rough workflow.

### 1. Home / Overview
Landing dashboard per company: KPI stat cards, recent activity, quick actions, and an admin-only
**AI Health** widget (Ollama status, extraction/sync freshness, data-quality score).
*Workflow:* log in → land on company dashboard → jump to any area via cards or `⌘K`.

### 2. People & Work (HR)
The HRMS surface, built as functional systems (not read-only views):

- **Employee Master & profiles** (`/my-profile`, `/admin/employees`) — self-edit personal/bank/skills;
  admins edit role, department, documents. *Workflow:* employee edits own profile → admin manages the team grid and per-employee detail tabs (Profile / Leave / Attendance / Permissions).
- **Leave** (`/leave`, `/holidays`) — apply → admin approves/rejects; holiday calendar + leave policy.
- **Expense claims** (`/expenses`) — petrol/material claim → admin approves → flows to Accounts opex.
  Admins can also file leave/claims on behalf of any employee.
- **Attendance** (`/admin/attendance`) — live Jibble dashboard (who's in, late, absent, overtime, weekly/monthly).
- **Recruitment** (`/recruitment`) — job openings → candidate kanban pipeline → interviews → offer → employee; local-AI job-description generator grounded in the company's own Org Hub role data.
- **Payroll, Shifts, Training, Exit, Tasks, Approvals, Calendar, Notes, Onboarding, Appraisal** — archetype-driven CRUD systems under People & Work.

### 3. Sales & CRM
- **CRM lead pipeline** (`/crm`) — any employee creates leads; stage advances (Lead → Discussion →
  Quotation → Order → Delivery → Success/Failed) go through an **admin approval flow**.
  *Workflow:* create lead → request next stage → admin approves → stage advances.
- **Pre-Quote** → convert a qualified lead into an Opportunity that feeds the Quotation Studio.

### 4. Quotation Studio (modular-interiors)
The commercial core — turn a site into a priced, branded quotation:

- **Measurements** — per-area capture using 7 product-type templates, with site-photo capture per area.
- **BOQ editor** — line items pull from the studio master catalogue (materials / finishes / hardware /
  units) and a **Vendor MRP** price list (7,000+ SKUs incl. Blum, Kesseböhmer, Hettich).
- **Cost sheet** — auto-pulls dealer cost (MRP × brand discount), computes GP vs target/min.
- **Quotation document** — discounts, CGST/SGST/IGST by place-of-supply, optional/alternate lines,
  assumptions, inclusions/exclusions, payment schedule, delivery/warranty terms, cover page,
  hide-prices mode, company letterhead, print/PDF.
- **Reclaimed materials** — returned/surplus stock inventory with a reuse matcher that suggests open
  BOQs a salvaged piece can be cut down for (cost-savings dashboard).
  *Workflow:* Opportunity → measure → BOQ → cost sheet → quotation → approval → PDF to client.

### 5. Projects & Execution
Delivery lifecycle once a quote is won:

- **Vera Project** with milestones, stages, site logs, and a work card.
- **Procurement** — Material Requisition → Vendor-Offer/Quote → Purchase Order (auto vendor-suggest),
  then **Goods Receipt → Site Inventory**; per-SFT finish/material rate master; starter hardware packages.
- **Service & Warranty** (`/service`) — post-delivery tickets.
- **Vendor Payments & Supplier Ledger** (`/admin/vendor-payments`).
  *Workflow:* win quote → create project → raise MRS → PO → receive goods → track stages/payments → service.

### 6. Finance & Accounts (Tally-powered)
- **Operations / Accounts dashboard** — bank balance, debtors/creditors with aging, FY totals, cashflow,
  GST summary, inventory, profitability — all from imported Tally data, company-scoped.
- **Tally XML import** — upload Masters + Transactions (gzip, up to ~1.5 GB) → background job ingests
  ledgers, stock items, and vouchers (25,000+); reconciles against client figures within ~1%.
- **ERP Entries** — request → approve flow for manual accounting entries.
- **Drive documents & AI verification** (`/accounts`, `/verify`, `/business`) — 7,000+ Drive files synced;
  PDF/Excel extracted to structured records, confidence-scored, with swipe/auto verification.
  *Workflow:* import Tally → review dashboards → ingest Drive docs → AI extracts → verify → KPIs update.

### 7. AI & Insights
- **AI Insights** (`/ai-insights`) — instant deterministic health score, alerts, and executive summary;
  AI narrative is cached and refreshed hourly in the background (no blocking LLM calls).
- **Company AI assistant** (in-app chat) — admin-only; an **intent router** answers ~15 preset,
  safe, company-scoped queries directly from the live DB (no LLM-written SQL), falling back to a
  retrieval-augmented local-model chat over people, roles, Org Hub policies/SOPs, and finances.
- **Graphs** (`/graphs`) — 15 financial chart presets plus a no-LLM query layer for common requests.

### Cross-cutting
- **Chat** — polling-based chatroom: general room, DMs, group rooms, file attachments, @mentions, search.
- **Group Console / Group Dashboard** (`/admin/group-dashboard`) — consolidated VE + SL + HM view.
- **2FA** — mandatory TOTP (Google Authenticator), server-enforced, with an Administrator break-glass.
- **Granular permissions** (`/admin/permissions`) — registry-driven, per-module + per-subsection access
  control; new modules auto-appear in the Role-Control screen.
- **User management** (`/admin/users`) — create/disable/delete users, role assignment, protected admin.

---

## Repository structure

```
hr-client-erp/
├── hr_client/                 ← Frappe custom app (Python backend)
│   ├── api/                   ← ~70 whitelisted endpoint modules, grouped by domain
│   │   ├── utils.py           ← shared auth/constants (admin check, current FY, company scope)
│   │   ├── ai.py, ai_intents.py, company_brain.py, graphs.py   ← local-AI layer
│   │   ├── crm*.py, quotation*.py, boq.py, cost_sheet.py, measurement*.py   ← Sales + Studio
│   │   ├── project_execution.py, project_procurement.py, service.py, vendor_*.py   ← Execution
│   │   ├── operations.py, finance_core.py, accounts_*.py, tally_*.py   ← Finance / Tally
│   │   ├── hrms_*.py, employee*.py, leave.py, expenses.py, payroll.py, recruitment.py, jibble.py
│   │   ├── group_dashboard.py, intercompany.py, company*.py   ← multi-company
│   │   └── permissions.py, twofa.py, user_management.py   ← access control
│   ├── hr_client/doctype/     ← 130+ custom DocType definitions
│   ├── drive_sync/            ← Google Drive sync (full + delta + extractor + webhook)
│   ├── pricelist_import/      ← vendor price-list parsers (Blum / Kesseböhmer / Hettich)
│   └── fixtures/, patches/, templates/, tests/
├── hr-frontend/               ← React + Vite SPA (monochrome)
│   └── src/
│       ├── api/               ← typed fetch functions per module
│       ├── components/        ← shared UI + layout (sidebar, TopBar, CommandPalette)
│       ├── context/           ← Auth, Permissions
│       ├── lib/               ← axios instance (CSRF), constants, utils
│       └── pages/             ← one folder per area/route
├── mcp-brain/                 ← MCP server for project status/decisions
├── ARCHITECTURE.md            ← system architecture + diagrams
├── CLAUDE.md                  ← full build context / ERPNext rules / API contract
└── README.md
```

---

## Deployment (production)

The server is the live box; deploys are by **rsync into the bench**, not `git pull`.

**Backend:**
```bash
sudo rsync -av /home/vera/vera-erp/hr-client-erp/hr_client/ \
    /home/frappe/frappe-bench/apps/hr_client/hr_client/ \
    --exclude __pycache__ --exclude "*.pyc"
sudo -u frappe bash -c "cd /home/frappe/frappe-bench && \
    bench --site vera.local migrate && bench --site vera.local clear-cache"
sudo supervisorctl restart frappe-bench-workers: frappe-bench-web:
```

**Frontend:**
```bash
cd /home/vera/vera-erp/hr-client-erp/hr-frontend
npm run build
sudo rsync -a --delete dist/ /var/www/hr-frontend/
```

**Local dev:** `bench start` (gunicorn :8000) + `npm run dev` (Vite :5173, proxies `/api/`).
Leave `VITE_API_BASE=` empty in dev so calls go through the Vite proxy; `VITE_USE_MOCK=false`.

### Required configuration (never in git — set per server)
- **Jibble:** `bench --site vera.local set-config jibble_client_id/secret …`
- **Google Drive:** service-account JSON at `sites/vera.local/private/vera_drive_service_account.json` (gitignored); set root folder ID + `ve_drive_channel_token`.
- **Ollama:** `ollama serve` + pulled models (fast 3B for routing/reports). AI features degrade gracefully if offline.
- No external LLM API key is required — all AI is local.

---

## Security
- **Server-side admin checks** (`_require_admin()` / role check) on every privileged endpoint — not email comparison alone.
- **Company scoping** enforced in queries so VE/SL/HM data never leaks across entities.
- **Mandatory 2FA** (server-enforced TOTP) for all accounts; protected admin can't be disabled/deleted.
- **DocType whitelist** on write endpoints; **parameterized SQL** everywhere (no f-string injection).
- **CORS** restricted to `veraenterprises.in` + dev origins; CSRF token on all state-changing calls.
- **Secrets** (Jibble, Drive, webhook token) live only in `site_config.json`; service-account JSON is gitignored.
- **Frappe desk** blocked at nginx (`/app`, `/desk` → 403); `developer_mode: 0`; 6-hour web session expiry.

---

## Companies & team

Three companies on one instance: **Vera Enterprises**, **Schönes Leben**, **Hagan Modular**.
VE is fully populated (live Tally data to 2026-09-05); SL/HM masters exist, transaction data pending.
The core team (owner + project/accounts/logistics managers) operates all three via the company switcher.
