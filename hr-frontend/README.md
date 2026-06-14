# Vera ERP — React Frontend

React + Vite + TypeScript frontend for the Vera Enterprises internal ERP system.
Wraps ERPNext/Frappe as a pure API backend — employees only ever see this interface, never the Frappe desk.

---

## Tech Stack

- React 18 + TypeScript
- Vite 5
- Tailwind CSS v3 + shadcn/ui
- React Query (TanStack Query v5)
- React Router v6
- Axios (with CSRF interceptor)
- Recharts (charts)
- Sonner (toasts)
- Lucide React (icons)

---

## Modules

| Route | Description | Access |
|---|---|---|
| `/` | Dashboard — stats, activity, AI health | All |
| `/recruitment` | Job openings + candidate pipeline | All (admin controls) |
| `/crm` | CRM lead pipeline with approval flow | All (admin approves) |
| `/my-profile` | Employee self-view/edit profile | All |
| `/leave` | Apply for leave + leave history | All |
| `/expenses` | Submit petrol/material expense claims | All |
| `/holidays` | 2026 holiday calendar + leave policy | All |
| `/admin/employees` | Team management grid | Admin |
| `/admin/attendance` | Jibble live attendance dashboard | Admin |
| `/admin/users` | User Management — create/disable/delete users | Admin |
| `/admin/permissions` | Module access control per employee | Admin |
| `/accounts` | Google Drive sync + structured ERP data | Admin |
| `/business` | Business intelligence dashboard | Admin |
| `/verify` | AI document verification / swipe review | Admin |
| `/ai-insights` | AI health + extraction stats | Admin |

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- Running ERPNext bench on `hrms.localhost:8001` (see backend repo)
- `/etc/hosts` entry: `127.0.0.1 hrms.localhost`

### 1. Install dependencies

```bash
cd hr-frontend
npm install
```

### 2. Create `.env.local`

Create `.env.local` in the project root with these values:

```env
# Leave empty for dev — Vite proxy forwards /api/* to ERPNext
VITE_API_BASE=

# Set to "false" to use real ERPNext backend (required for all real usage)
VITE_USE_MOCK=false

# OpenAI API key — only needed for AI Job Description Generator feature
# Get one at https://platform.openai.com/api-keys
# Leave blank to disable the AI JD generator (everything else still works)
VITE_OPENAI_API_KEY=sk-proj-...
```

> **Never commit `.env.local`** — it is gitignored. Rotate your OpenAI key immediately if accidentally exposed.

### 3. Start dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`. All `/api/*` calls proxy to `http://hrms.localhost:8001` automatically via `vite.config.ts`.

### 4. Build for production

```bash
npm run build
```

Output goes to `dist/`. Point nginx at this folder (see Deployment section below).

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE` | No | `""` | API base URL. **Empty in dev** (Vite proxy handles it). In production set to `http://your-server-ip` or your domain. |
| `VITE_USE_MOCK` | No | `"false"` | `"true"` = mock data, no backend needed. `"false"` = live ERPNext. Always `"false"` in production. |
| `VITE_OPENAI_API_KEY` | No | — | OpenAI key for AI Job Description Generator (`gpt-4o-mini`). Feature silently disabled if missing. Get at [platform.openai.com](https://platform.openai.com/api-keys). |

---

## Production Deployment (nginx)

nginx serves the `dist/` folder and proxies `/api/*` + `/assets/*` to ERPNext (port 8001) internally.
ERPNext desk is blocked from the public internet.

```nginx
server {
    listen 80;
    server_name _;   # replace with your domain

    root /home/amogh/hr-frontend/dist;
    index index.html;

    # React Router — serve index.html for all unknown paths
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to ERPNext (internal only)
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host hrms.localhost;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Frappe assets (needed for session handling)
    location /assets/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host hrms.localhost;
    }

    # Block ERPNext desk from outside — CRITICAL
    location /desk  { return 403; }
    location /app   { return 403; }
    location /login { return 403; }
}
```

After any `npm run build`, reload nginx: `sudo systemctl reload nginx`

---

## Architecture Notes

- **API layer:** `src/lib/api.ts` — Axios instance with `withCredentials: true` and automatic `X-Frappe-CSRF-Token` injection on all POST/PUT/DELETE
- **Auth:** Frappe session cookies (httpOnly) — no JWT. `localStorage` only stores `{name, full_name}` for UI display
- **Admin check:** `ADMIN_USERS = new Set(["Administrator", "owais@veraenterprises.in"])` — matches backend constant
- **Permissions:** `PermissionsContext` reads `User Module Permission` DocType on login to gate sidebar items

---

## Default Credentials (first-time setup only)

| Role | Email | Password |
|---|---|---|
| Admin | `owais@veraenterprises.in` | `Vera@2026` |
| All employees | see ERPNext user list | `Vera@2026` |

**Change all passwords immediately after setup.** Any user still on the default password sees a warning banner on the dashboard.
