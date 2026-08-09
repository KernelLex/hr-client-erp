# Vera ERP — Production Deployment Guide

How to host Vera ERP on a home Ubuntu PC and make it accessible on the internet
using Cloudflare Tunnel (no port forwarding required).

> **Note (2026-08-09):** This is the generic from-scratch guide. On the **actual live server** the
> Frappe site is **`vera.local`** (not `hrms.localhost`) and bench runs on **port 8000** (not 8001).
> Substitute those wherever the examples below say `hrms.localhost` / `8001`. The live nginx site file
> is `/etc/nginx/sites-available/hr-frontend` and the built frontend is served from `/var/www/hr-frontend/`.

---

## Architecture

```
Your Users (internet)
        ↓ HTTPS
   Cloudflare (free SSL + DDoS protection + hides your home IP)
        ↓ encrypted tunnel (outbound — no open ports needed)
   Ubuntu PC at home (192.168.1.x)
        ↓
      nginx (port 80)
      ├── /        → React frontend (hr-frontend/dist)
      └── /api/*   → ERPNext bench (port 8001, internal only)
```

**Why Cloudflare Tunnel instead of port forwarding:**
No ports need to be open on your router. Works even if your ISP uses CGNAT or blocks
ports 80/443. Automatic HTTPS. Free on Cloudflare's free plan.

---

## Prerequisites

- Ubuntu PC with internet access (native Ubuntu, not WSL2)
- Domain registered on Squarespace (or any registrar)
- Free Cloudflare account
- This repo cloned and ERPNext bench set up

---

## PHASE 1 — Cloudflare Account + Domain

### Step 1: Create a free Cloudflare account

Go to **cloudflare.com** → Sign up → Free plan.

### Step 2: Add your domain to Cloudflare

1. Cloudflare dashboard → **Add a Site**
2. Enter your domain (e.g. `veraenterprises.in`)
3. Select **Free plan**
4. Cloudflare scans your existing DNS records — keep MX records (email), delete the rest

### Step 3: Change nameservers in Squarespace

Cloudflare gives you two nameservers like:
```
aria.ns.cloudflare.com
bob.ns.cloudflare.com
```

In Squarespace:
1. **Domains** → click your domain → **DNS Settings** → **Nameservers**
2. Switch to **Custom nameservers**
3. Paste both Cloudflare nameservers → Save

> Takes 10 minutes to 24 hours to propagate. Cloudflare emails you when active.

### Step 4: Set SSL mode

Cloudflare dashboard → **SSL/TLS** → set mode to **Full**

---

## PHASE 2 — Ubuntu Server Setup

### Step 5: Install nginx

```bash
sudo apt update && sudo apt install -y nginx
```

### Step 6: Build the React frontend

```bash
cd /path/to/hr-client-erp/hr-frontend
npm install
npm run build
# Creates hr-frontend/dist/
```

### Step 7: Configure nginx

```bash
sudo nano /etc/nginx/sites-available/vera-erp
```

Paste (update `root` path to your actual dist folder):

```nginx
server {
    listen 80;
    server_name _;

    root /path/to/hr-client-erp/hr-frontend/dist;
    index index.html;

    # React Router — serve index.html for all unknown paths
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to ERPNext (internal only)
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host hrms.localhost;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Frappe assets (needed for session cookies)
    location /assets/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host hrms.localhost;
    }

    # Block ERPNext desk from internet — CRITICAL
    location /desk  { return 403; }
    location /app   { return 403; }
    location /login { return 403; }
}
```

Enable the config:

```bash
sudo ln -sf /etc/nginx/sites-available/vera-erp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                   # must print "syntax is ok"
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Step 8: Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw deny 8001/tcp          # ERPNext — internal only, never exposed
sudo ufw deny 11434/tcp         # Ollama — internal only, never exposed
sudo ufw --force enable
sudo ufw status
```

---

## PHASE 3 — ERPNext Auto-start on Boot

Right now bench only runs when started manually. Fix that with supervisor:

```bash
sudo apt install -y supervisor
cd ~/frappe-bench
bench setup supervisor
sudo cp config/supervisor.conf /etc/supervisor/conf.d/frappe.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start all
sudo systemctl enable supervisor
```

Verify:

```bash
sudo supervisorctl status
# frappe-web, frappe-worker, frappe-schedule should all show RUNNING
```

---

## PHASE 4 — Cloudflare Tunnel

This is the core step. Your PC makes an outbound connection to Cloudflare —
no router config, no port forwarding, works behind any ISP.

### Step 9: Install cloudflared

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg

echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt update && sudo apt install -y cloudflared
```

### Step 10: Authenticate with your Cloudflare account

```bash
cloudflared tunnel login
```

Opens a URL — visit it in your browser, log in to Cloudflare, select your domain.
A certificate is saved automatically to `~/.cloudflared/`.

### Step 11: Create the tunnel

```bash
cloudflared tunnel create vera-erp
```

Note the **Tunnel ID** it prints (looks like `abc123de-f456-...`). You need it in the next step.

```bash
cloudflared tunnel list    # confirms creation
```

### Step 12: Configure the tunnel

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Paste this (replace `YOUR-TUNNEL-ID` and `yourdomain.com`):

```yaml
tunnel: YOUR-TUNNEL-ID
credentials-file: /home/YOUR-USERNAME/.cloudflared/YOUR-TUNNEL-ID.json

ingress:
  - hostname: yourdomain.com
    service: http://localhost:80
  - hostname: www.yourdomain.com
    service: http://localhost:80
  - service: http_status:404
```

### Step 13: Create DNS records (via CLI)

```bash
cloudflared tunnel route dns vera-erp yourdomain.com
cloudflared tunnel route dns vera-erp www.yourdomain.com
```

This automatically adds CNAME records in your Cloudflare DNS pointing to the tunnel.
You can verify them in the Cloudflare dashboard under **DNS**.

### Step 14: Run tunnel as a system service

```bash
sudo cloudflared --config /home/YOUR-USERNAME/.cloudflared/config.yml service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared    # should show "active (running)"
```

---

## PHASE 5 — Update ERPNext for Production

```bash
# Tell ERPNext your real public domain
bench --site hrms.localhost set-config host_name "https://yourdomain.com"

# Disable developer mode (no stack traces in API responses)
bench --site hrms.localhost set-config developer_mode 0

# Restart everything
sudo supervisorctl restart all
```

Update `hr-frontend/.env.local` for future builds:

```env
VITE_API_BASE=https://yourdomain.com
VITE_USE_MOCK=false
VITE_OPENAI_API_KEY=sk-proj-...    # optional
```

Rebuild the frontend after any code changes:

```bash
cd hr-client-erp/hr-frontend
npm run build
sudo systemctl reload nginx
```

---

## PHASE 6 — Verify It Works

Test from a device on a different network (or your phone on mobile data):

```bash
# App loads?
curl -I https://yourdomain.com
# Expect: HTTP/2 200, content-type: text/html

# API proxy works?
curl https://yourdomain.com/api/method/frappe.auth.get_logged_user
# Expect: {"message":"Guest"}

# Desk blocked?
curl -I https://yourdomain.com/desk
# Expect: HTTP/1.1 403

# Cloudflare is in front? (check for cf-ray header)
curl -sI https://yourdomain.com | grep -i "cf-ray"
# Expect: cf-ray: xxxxxxxx-...
```

---

## What Each Service Does

| Service | Role | Where it runs |
|---|---|---|
| **Cloudflare** | SSL, DDoS protection, CDN, hides your home IP | Cloudflare's global network |
| **Cloudflare Tunnel** | Secure outbound connection — no open router ports | Your Ubuntu PC (`cloudflared` daemon) |
| **nginx** | Serves React app, proxies `/api/*` to ERPNext | Your Ubuntu PC, port 80 |
| **ERPNext / bench** | API backend + MariaDB database | Your Ubuntu PC, port 8001 (not exposed) |
| **supervisor** | Keeps bench running, auto-restarts on crash or reboot | Your Ubuntu PC |

---

## Ongoing Maintenance

### After any code change (backend)
```bash
cd ~/frappe-bench
bench --site hrms.localhost clear-cache
sudo supervisorctl restart frappe-web
```

### After any frontend change
```bash
cd hr-client-erp/hr-frontend
npm run build
# nginx picks up the new dist/ automatically — no reload needed
```

### Check if everything is running
```bash
sudo supervisorctl status        # ERPNext processes
sudo systemctl status nginx      # nginx
sudo systemctl status cloudflared  # tunnel
```

### Restart everything after a server reboot
Everything is set to auto-start. After a reboot, give it 30 seconds then visit your domain.
If something isn't up, check:
```bash
sudo systemctl start supervisor cloudflared nginx
```

---

## Troubleshooting

| Problem | Check |
|---|---|
| Site not loading | `sudo systemctl status cloudflared` — is the tunnel active? |
| 502 Bad Gateway | `sudo supervisorctl status` — is bench running? |
| API returns 403 | Check nginx config — is `/api/` proxy block present? |
| CSS/JS not loading | Did you run `npm run build` after pulling latest code? |
| Can't reach ERPNext desk | That's by design — `/desk` returns 403 |
| Cloudflare SSL error | Set SSL mode to **Full** in Cloudflare dashboard (not Flexible) |
