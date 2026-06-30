# Vera ERP

Full-stack ERP system for **Vera Enterprises** built on ERPNext v15 + Frappe HRMS with a React SPA frontend.  
Employees interact exclusively with the React app — the Frappe/ERPNext desk is blocked from public access.

Live at: **https://veraenterprises.in**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | ERPNext v15 + Frappe HRMS (Python) |
| Custom backend app | `hr_client` (this repo) |
| Database | MariaDB (managed by Frappe bench) |
| Cache / queue | Redis (managed by Frappe bench) |
| Frontend | React 18 + Vite + TypeScript |
| UI components | Tailwind CSS v3 + shadcn/ui |
| Data fetching | TanStack Query (React Query) |
| HTTP client | Axios (with CSRF interceptor) + native fetch for file uploads |
| Charts | Recharts |
| Local AI | Ollama (llama3.1 / mistral) — optional, for AI features |
| Tunnelling | Cloudflare Tunnel → nginx → ERPNext |
| Attendance sync | Jibble API (OAuth2 client credentials) |
| Document storage | Google Drive (service account sync) |
| Server OS | Ubuntu (bare metal, static IP via nmcli) |
| Process manager | Supervisor (7 ERPNext processes) |
| Web server | nginx (serves React SPA + proxies /api/ to gunicorn) |

---

## Repository Structure

```
hr-client-erp/
├── hr_client/              ← Frappe custom app (Python backend)
│   ├── api/                ← Whitelisted API endpoints
│   │   ├── utils.py        ← Shared constants (ADMIN_USERS, current_fy(), etc.)
│   │   ├── ai.py           ← Document AI, extraction, verification
│   │   ├── chat.py         ← Real-time chat (polling-based)
│   │   ├── crm.py          ← Lead pipeline with Owais approval flow
│   │   ├── dashboard.py    ← Dashboard stats
│   │   ├── employee.py     ← Employee profiles
│   │   ├── employee_lifecycle.py
│   │   ├── expenses.py     ← Expense claims
│   │   ├── graphs.py       ← Financial chart data (preset + AI-generated)
│   │   ├── jibble.py       ← Jibble attendance integration
│   │   ├── leave.py        ← Leave applications + holidays
│   │   ├── operations.py   ← Tally financial operations dashboard
│   │   ├── permissions.py  ← Per-user module access control
│   │   ├── recruitment.py  ← Job openings + candidate pipeline
│   │   ├── tally_enrich.py ← Tally voucher enrichment (Ollama)
│   │   ├── tally_import_job.py ← Background Tally XML import worker
│   │   └── user_management.py ← Admin user CRUD
│   ├── drive_sync/         ← Google Drive sync module
│   │   ├── api.py          ← Drive file listing, processing, extraction
│   │   ├── full_sync.py    ← BFS walk from Drive root folder
│   │   ├── delta_sync.py   ← Incremental sync via Drive changes API
│   │   ├── extractor.py    ← PDF/Excel text extraction + AI parsing
│   │   ├── parser.py       ← Filename → metadata parsing
│   │   ├── watch_manager.py ← Drive push notification channels
│   │   └── webhook.py      ← Google Drive push notification receiver
│   └── hr_client/
│       └── doctype/        ← Custom DocType definitions
├── hr-frontend/            ← React + Vite SPA
│   └── src/
│       ├── api/            ← Typed fetch functions per module
│       ├── components/     ← Shared UI components + layout
│       ├── context/        ← Auth, Permissions React contexts
│       ├── lib/
│       │   ├── api.ts      ← Axios instance with CSRF interceptor
│       │   ├── constants.ts ← ADMIN_USERS, currentFYLabel(), etc.
│       │   └── utils.ts
│       └── pages/          ← One folder per route
└── README.md
```

---

## Features

### HR & People
| Feature | Route | Access |
|---|---|---|
| Employee profiles — view/edit personal info, bank details, skills | `/my-profile` | All |
| Admin team management — full employee detail, leave history, permissions | `/admin/employees` | Admin |
| Leave applications + history, policy, holiday calendar | `/leave`, `/holidays` | All |
| Expense claims (Petrol/Material) with admin approval | `/expenses` | All |
| Recruitment pipeline — job openings, kanban stages, AI JD generator | `/recruitment` | All |
| Jibble live attendance dashboard (who's in, late, absent, overtime) | `/admin/attendance` | Admin |
| User management — create/disable/delete users, role assignment | `/admin/users` | Admin |
| Module-level permission control per employee | `/admin/permissions` | Admin |
| CRM lead pipeline with stage-advance approval flow | `/crm` | All |

### Finance & Accounting (Tally-powered)
| Feature | Route | Notes |
|---|---|---|
| Operations dashboard — bank balance, debtors, creditors, FY totals | `/operations` | Reads from imported Tally data |
| Debtor aging buckets, creditor list, party statement | `/operations` | Live DB queries |
| Full voucher browser — paginated, filterable by type/date/party | `/operations` | 25,000+ vouchers |
| Tally XML import (Masters + Transactions, up to 1.5 GB) | `/operations → Import & AI` | Background job |
| Tally data enrichment via Ollama (party normalisation, anomaly detection) | `/operations → Import & AI` | Requires Ollama |
| Financial year cashflow trend (12-month area chart) | `/operations` | Dynamic current FY |

### AI & Drive Documents
| Feature | Route | Notes |
|---|---|---|
| Google Drive document management (7,000+ files synced) | `/accounts` | Service account sync |
| Document extraction pipeline — PDF/Excel → structured ERP records | `/accounts`, `/verify` | Regex + Ollama |
| AI verification — confidence scoring, auto-verify, swipe review | `/verify` | Admin only |
| Business dashboard — KPI cards over extracted VE DocTypes | `/business` | Admin only |
| Financial preset charts (15 presets) + natural language chart generation | `/graphs` | Requires Ollama for NL |
| AI insights — health score, alerts, executive summary, period compare | `/ai-insights` | Requires Ollama |
| AI JD generator — generates job descriptions via OpenAI (proxied) | `/recruitment` | Requires OpenAI key in site_config |

### Chat
| Feature | Notes |
|---|---|
| Polling-based chatroom (no WebSocket required) | General room + direct messages + group rooms |
| File attachments (images, PDFs, docs) | Stored in Frappe file system |
| @mention notifications + unread badge | Active room: 3s poll; sidebar: 10s poll |
| Soft delete (tombstone), message search, media gallery | All via REST API |

---

## Custom DocTypes

| DocType | Purpose |
|---|---|
| `VE Tally Ledger` | Party/account master from Tally (1,924 records) |
| `VE Tally Stock Item` | Inventory master from Tally (4,559 records) |
| `VE Tally Voucher` | All transactions from Tally (25,000+ records) |
| `VE Tally Enrichment` | Per-voucher AI enrichment (category, party norm, anomaly) |
| `VE Drive File` | Google Drive file index (7,000+ records) |
| `VE Drive Settings` | Single — root folder ID, delta page token, watch channels |
| `VE Sales Invoice`, `VE Purchase Invoice`, `VE Purchase Order` | Extracted structured data |
| `VE Quotation`, `VE Credit Note`, `VE Debit Note` | Extracted structured data |
| `VE GRN`, `VE Financial Report`, `VE Payment Record` | Extracted structured data |
| `VE Sales Order`, `VE Stock Record`, `VE Salary Record` | Extracted structured data |
| `VE Attendance Record`, `VE Receipt` | Extracted structured data |
| `VE Saved Graph` | Saved chart configs from the Graphs page |
| `Vera Chat Room`, `Vera Chat Room Member`, `Vera Chat Message` | Chat system |
| `Vera Leave Application` | Custom leave (simpler than HRMS default) |
| `Vera Expense Claim` | Petrol + material expense claims |
| `Vera CRM Lead`, `Vera CRM Quotation`, `Vera CRM Approval Request` | CRM pipeline |
| `User Module Permission` | Per-user module access flags |

---

## Required Configuration

None of these are in git. Set them up on each server.

### 1. Jibble Attendance

```bash
bench --site vera.local set-config jibble_client_id "YOUR_CLIENT_ID"
bench --site vera.local set-config jibble_client_secret "YOUR_CLIENT_SECRET"
```

Get from: Jibble Dashboard → Settings → Integrations → API (OAuth2 credentials).

### 2. Google Drive Service Account

Place the service account JSON at:
```
/home/frappe/frappe-bench/sites/vera.local/private/vera_drive_service_account.json
```
This path is **gitignored and never committed**.

Set the root folder ID and credentials path in `drive_sync/utils.py` and `drive_sync/full_sync.py`.

### 3. OpenAI (AI Job Description Generator — optional)

```bash
bench --site vera.local set-config openai_api_key "sk-..."
```

The frontend calls a backend proxy (`hr_client.api.recruitment.generate_job_description`) — the key is never sent to the browser. Feature is disabled if the key is not set.

### 4. Drive Webhook Token (optional but recommended)

```bash
bench --site vera.local set-config ve_drive_channel_token "$(openssl rand -hex 32)"
```

Used to validate Google Drive push notifications. The webhook fails closed (403) if not configured.

### 5. Ollama (local AI — optional)

```bash
ollama serve
ollama pull mistral    # or llama3.1
```

Used for: AI JD generator fallback, Tally enrichment, document cross-check, financial chat.  
All AI features gracefully degrade to rule-based or disabled if Ollama is offline.

---

## `site_config.json` reference

`/home/frappe/frappe-bench/sites/vera.local/site_config.json`:

```json
{
  "db_name": "...",
  "db_password": "...",
  "developer_mode": 0,
  "host_name": "https://veraenterprises.in",
  "jibble_client_id": "...",
  "jibble_client_secret": "...",
  "openai_api_key": "sk-...",
  "ve_drive_channel_token": "...",
  "session_expiry": "06:00:00",
  "session_expiry_mobile": "720:00:00"
}
```

---

## Development Setup

```bash
# 1. Start ERPNext bench (gunicorn on 127.0.0.1:8000)
cd /home/frappe/frappe-bench
bench start

# 2. Start React dev server (port 5173, proxies /api/ to bench)
cd /home/vera/vera-erp/hr-client-erp/hr-frontend
npm install
npm run dev
```

`hr-frontend/.env.local`:
```env
VITE_API_BASE=
VITE_USE_MOCK=false
```

---

## Production Deployment

### Deploy backend changes

```bash
sudo rsync -av /home/vera/vera-erp/hr-client-erp/hr_client/ \
    /home/frappe/frappe-bench/apps/hr_client/hr_client/ \
    --exclude __pycache__ --exclude "*.pyc"

sudo -u frappe bash -c "cd /home/frappe/frappe-bench && \
    bench --site vera.local migrate && bench --site vera.local clear-cache"

sudo supervisorctl restart frappe-bench-workers: frappe-bench-web:
```

### Deploy frontend changes

```bash
cd /home/vera/vera-erp/hr-client-erp/hr-frontend
npm run build
sudo rsync -a --delete dist/ /var/www/hr-frontend/
```

### Tally XML Import

Upload XML files to `/home/vera/tally_uploads/` (or use the import UI at `/operations → Import & AI`),
then run:
```bash
cd /home/frappe/frappe-bench
env/bin/python3 /home/vera/tally_import.py
```
Runtime ~20 seconds for a full re-import (DELETE + INSERT). Masters file ~120 MB, Transactions ~1.5 GB.

---

## Security

- **Server-side admin check**: `_require_admin()` in `hr_client/api/utils.py` verifies `System Manager` role — not just email comparison. Shared across all API modules.
- **DocType whitelist**: `verify_record` / `quick_action` validate `doctype` against `_ALLOWED_DOCTYPES` to prevent writing to arbitrary Frappe documents.
- **CORS**: Restricted to `veraenterprises.in`, `localhost:5173`, and LAN dev IP. No wildcard `*`.
- **File uploads**: Extension and MIME type validated on profile photos; path traversal guarded via `os.path.realpath()` on Tally XML uploads; chat attachments must be Frappe-hosted (`/files/` or `/private/files/`).
- **SQL injection**: All user-supplied values use `%s` parameterized queries. No f-string injection.
- **Secrets**: Never in code or git. All credentials in `site_config.json` (Jibble, OpenAI, Drive webhook token). Drive service account JSON is gitignored.
- **OpenAI key**: Routed through backend proxy — never compiled into the browser JS bundle.
- **Session**: 6-hour expiry (web), 30-day (mobile). `developer_mode: 0` in production.
- **Frappe desk**: Blocked at nginx level (`/desk`, `/app` → 403).
- **Password policy**: 8+ chars, uppercase, number, special character — enforced server-side on create/change.
- **Protected admin**: `owais@veraenterprises.in` cannot be disabled, deleted, or have password changed via admin panel.
- **Drive webhook**: Fails closed — rejects all requests if `ve_drive_channel_token` is not configured.
- **Prompt injection**: `source_content` in `ai_crosscheck` sanitized before passing to LLM.

---

## Team (Vera Enterprises)

| Name | Email | Role |
|---|---|---|
| Owais Ahmed Khan | owais@veraenterprises.in | Administrator |
| Maaz | maazdgr8.mma@gmail.com | Project Manager |
| Manjunath M N | manju.veraaccnts@outlook.com | Accounts Manager |
| Lookman | lookman.vera@outlook.com | Accounts Executive |
| Bhagya Shree | Bhagyashree.veraenterprises@outlook.com | Logistics Manager |
