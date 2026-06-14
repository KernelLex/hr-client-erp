# Vera ERP — Monorepo

Full ERP system for Vera Enterprises built on ERPNext v15 + Frappe HRMS.
This repo contains both the **backend** (Frappe custom app) and the **React frontend** in one place.

```
hr-client-erp/
├── hr_client/        ← Frappe custom app (Python backend)
├── hr-frontend/      ← React + Vite frontend
├── mcp-brain/        ← MCP server for Claude Code context
└── README.md
```

Employees only ever see the React app — the ERPNext/Frappe desk is completely hidden.

---

## Quick Start (Development)

```bash
# 1. Start ERPNext bench (port 8001)
cd ~/frappe-bench
bench start

# 2. Start React dev server (port 5173)
cd hr-client-erp/hr-frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

> Port 8001, not 8000 — Windows Hyper-V reserves 8000 on WSL2. Bench Procfile is already set to 8001.

---

## Repository Structure

### `hr_client/` — Backend (Frappe custom app)

| Module | File | Description |
|---|---|---|
| Dashboard | `api/dashboard.py` | Live stats for React dashboard |
| Employee | `api/employee.py` | Profile view/edit, default-password check |
| Employee Lifecycle | `api/employee_lifecycle.py` | Onboarding, offboarding, exit interview |
| Recruitment | `api/recruitment.py` | Job openings, candidate pipeline |
| CRM | `api/crm.py` | Lead pipeline with approval flow |
| Attendance | `api/jibble.py` | Jibble time-tracking integration |
| Leave | `api/leave.py` | Leave applications + admin approval |
| Expenses | `api/expenses.py` | Expense claims + admin approval |
| Permissions | `api/permissions.py` | Per-user module access control |
| User Management | `api/user_management.py` | Create/disable/delete users (admin only) |
| AI / Drive | `api/ai.py` | Document extraction, verification, AI health |
| Notes | `api/notes.py` | Internal employee notes |
| Utils | `api/utils.py` | `handle_api_error` decorator |

### `hr-frontend/` — Frontend (React + Vite)

| Route | Description | Access |
|---|---|---|
| `/` | Dashboard — stats, activity, AI health | All |
| `/recruitment` | Job openings + candidate pipeline | All |
| `/crm` | CRM lead pipeline with approval flow | All |
| `/my-profile` | Employee self-view/edit profile | All |
| `/leave` | Leave applications + history | All |
| `/expenses` | Expense claims | All |
| `/holidays` | 2026 holiday calendar + leave policy | All |
| `/admin/employees` | Team management | Admin |
| `/admin/attendance` | Live Jibble attendance dashboard | Admin |
| `/admin/users` | User Management panel | Admin |
| `/admin/permissions` | Module access control | Admin |
| `/accounts` | Google Drive sync + structured data | Admin |
| `/business` | Business intelligence dashboard | Admin |
| `/verify` | AI document verification | Admin |
| `/ai-insights` | AI health dashboard | Admin |

---

## Required Configuration

These secrets are **not in git** — you must set them up manually on each machine.

### 1. Jibble Attendance API

Get from: **Jibble Dashboard → Settings → Integrations → API** (OAuth2 client credentials)

```bash
bench --site hrms.localhost set-config jibble_client_id "YOUR_JIBBLE_CLIENT_ID"
bench --site hrms.localhost set-config jibble_client_secret "YOUR_JIBBLE_CLIENT_SECRET"
```

### 2. Google Drive Integration

Place the Google service account JSON key at:
```
frappe-bench/apps/vera_drive/vera_drive/service_account.json
```

**This file is gitignored — never commit it.**

To generate it:
1. [Google Cloud Console](https://console.cloud.google.com) → Enable **Google Drive API**
2. Create a **Service Account** → Keys → Add Key → JSON → download
3. Share your Drive root folder with the service account email (Viewer permission)
4. Update `ROOT_FOLDER_ID` in `vera_drive/vera_drive/google_drive.py` with your folder's ID (from the URL when you open it in Drive)

Also update `VERA_EMPLOYEES` and `FOLDER_OWNER_MAP` in `google_drive.py` to match your team.

### 3. OpenAI (AI Job Description Generator — optional)

```env
# hr-frontend/.env.local
VITE_OPENAI_API_KEY=sk-proj-...
```

Used client-side for the AI JD generator only. Everything else works without it.
Model: `gpt-4o-mini`. Get a key at [platform.openai.com](https://platform.openai.com/api-keys).

### 4. Ollama (local AI for document extraction — optional)

```bash
ollama serve          # runs on localhost:11434
ollama pull mistral   # or whichever model is set in hr_client/api/ai.py
```

Document extraction falls back to regex rules if Ollama is offline.

---

## Frontend Setup (`hr-frontend/`)

```bash
cd hr-frontend
npm install
```

Create `hr-frontend/.env.local`:

```env
# Empty = Vite proxy handles /api/* → ERPNext in dev
VITE_API_BASE=

# Always false in real usage
VITE_USE_MOCK=false

# Optional — only for AI Job Description Generator
VITE_OPENAI_API_KEY=sk-proj-...
```

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE` | No | Empty in dev. Set to server IP/domain in production. |
| `VITE_USE_MOCK` | No | `"false"` for real backend. `"true"` for UI development without ERPNext. |
| `VITE_OPENAI_API_KEY` | No | OpenAI key for AI JD generator. Feature disabled if missing. |

---

## Backend Setup (`hr_client/`)

### Install the Frappe app

```bash
cd ~/frappe-bench
bench get-app https://github.com/KernelLex/hr-client-erp.git
bench install-app hr_client
bench --site hrms.localhost migrate
bench --site hrms.localhost clear-cache
```

### `site_config.json` reference

`~/frappe-bench/sites/hrms.localhost/site_config.json`:

```json
{
  "db_name": "_auto_generated_by_bench",
  "db_password": "_auto_generated_by_bench",
  "db_type": "mariadb",
  "developer_mode": 0,
  "host_name": "http://hrms.localhost:8001",
  "jibble_client_id": "YOUR_JIBBLE_CLIENT_ID",
  "jibble_client_secret": "YOUR_JIBBLE_CLIENT_SECRET",
  "session_expiry": "06:00:00",
  "session_expiry_mobile": "720:00:00"
}
```

### Seed initial users

```bash
bench --site hrms.localhost execute hr_client.patches.create_all_users
bench --site hrms.localhost execute hr_client.patches.create_owais_user
```

Default password for all users: **`Vera@2026`** — change immediately after first login.
Any user still on the default password sees a warning banner on the dashboard.

---

## Production Deployment

### nginx config

```nginx
server {
    listen 80;
    server_name _;   # replace with your domain

    root /path/to/hr-client-erp/hr-frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host hrms.localhost;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /assets/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host hrms.localhost;
    }

    # Block Frappe desk from public internet — CRITICAL
    location /desk  { return 403; }
    location /app   { return 403; }
    location /login { return 403; }
}
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8001/tcp    # ERPNext — internal only
sudo ufw deny 11434/tcp   # Ollama — internal only
sudo ufw --force enable
```

### Build frontend for production

```bash
cd hr-frontend
npm run build
# output → hr-frontend/dist/
sudo systemctl reload nginx
```

---

## Security Model

- All API endpoints: `@frappe.whitelist()` + `@handle_api_error` — unauthenticated requests rejected, errors return clean JSON
- Admin-only endpoints: `_require_admin()` checks `frappe.session.user`
- `owais@veraenterprises.in` is a protected superuser — cannot be disabled, deleted, or have password changed via admin panel
- All user management actions logged to Frappe Activity Log
- Password policy enforced server-side: 8+ chars, uppercase, number, special character
- No secrets in any tracked file — Jibble creds in `site_config.json`, Drive key in gitignored file
- `developer_mode: 0` in production — no stack traces in API responses
- Session expiry: 6 hours (web), 30 days (mobile)
