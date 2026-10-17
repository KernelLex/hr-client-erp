# Vera Tally Sync Agent

A small, **optional** program that runs on the accountants' **Tally PC** and keeps
the Vera ERP's Tally data fresh **without anyone uploading files by hand**. It uses
Tally's **free built-in XML gateway** (`localhost:9000`) — no paid Tally API, no
cloud service.

The manual upload flow in the ERP is **unchanged** and remains available as a
fallback. This agent is purely additive and does nothing until you (a) set a token
on the server and (b) switch the feature **ON** in the ERP.

---

## How it fits together

```
Tally PC (Windows)                              Vera server (Tailscale)
┌───────────────────────────┐                  ┌──────────────────────────────┐
│ Task Scheduler (every 5m)  │                  │ VE Tally Sync Settings        │
│   └─ agent.py (one tick)   │                  │   enabled / interval / Sync-Now│
│        │ 1. GET command ───┼──── Tailscale ──▶│ get_tally_sync_command        │
│        │ 2. export XML from │                  │                               │
│        │    Tally :9000     │                  │                               │
│        │ 3. hash: changed?  │                  │                               │
│        │ 4. scp files ──────┼──── Tailscale ──▶│ /home/vera/tally_uploads      │
│        │    report result ──┼──── Tailscale ──▶│ report_tally_sync_result      │
│        └────────────────────┘                  │   └─ runs the SAME full import │
└───────────────────────────┘                  │      pipeline as manual upload │
                                                └──────────────────────────────┘
```

**The ERP decides the cadence** (VE Tally Sync Settings → *Sync Every*). The agent
just asks "should I sync now?" on each tick. A false "no change" is impossible —
change detection is an exact SHA-256 of the exported files.

---

## One-time setup

### On the Vera server
1. Pick a long random token and set it in the site config (never commit it):
   ```bash
   bench --site vera.local set-config tally_agent_token "<long-random-string>"
   bench --site vera.local clear-cache
   ```
2. Make sure the company's Tally name is confirmed (already done for VE):
   `Company.ve_tally_company_name` must equal the exact `<SVCURRENTCOMPANY>` string
   Tally stamps in exports (for VE: `VERA ENTERPRISES`). The import refuses files
   that don't match — this is the guard that stops cross-company mixups.
3. Leave the feature OFF for now (default). You'll turn it on after the dry-run.

### On the Tally PC
1. **TallyPrime → F1 (Help) → Settings → Connectivity → Client/Server config →**
   set *TallyPrime acts as* = **Both** (or Server), **Port = 9000**. Keep this on
   `localhost` — do not expose 9000 to the internet.
2. Install **Tailscale** and join the same tailnet as the server (node `vera`,
   `100.83.174.36`). Confirm `ssh vera@100.83.174.36` works from this PC
   (Tailscale SSH needs no key).
3. Install **Python 3.8+**. (`scp` ships with Windows 10+.)
4. Copy this `tally_sync_agent/` folder to the PC. Copy `config.example.json` →
   `config.json` and fill in `agent_token` (same token as step 1) and, if your
   Tailscale IP/paths differ, the `erp_base_url` / `scp_target`.

### Verify before trusting it
```bash
python agent.py --dry-run
```
This only exports from Tally and leaves two files in your temp folder. Open them
and confirm they contain `<SVCURRENTCOMPANY>` and `<VOUCHER>` tags and look like
your normal manual exports. If a report name is wrong, edit `masters_report` /
`transactions_report` in `config.json` (common alternatives: `Masters`,
`Trial Balance` for masters; `Voucher Register` for transactions) — no code change.

### Go live
1. In the ERP, open **Tally Continuous Sync** settings, set *Sync Every* (e.g. 60
   minutes), tick **Enabled**, Save.
2. Create a Windows **Task Scheduler** task: *Start a program* → `python` →
   arguments `"C:\path\to\agent.py"` → trigger *every 5 minutes*. (The 5-minute
   tick is just how often it checks; the actual sync honours *Sync Every*.)
3. Press **Sync Now** in the ERP to test the full round-trip once.

---

## Files
| File | Purpose |
|---|---|
| `agent.py` | The agent (one run = one tick). Standard-library only. |
| `config.example.json` | Copy to `config.json` and fill in. |
| `state.json` | Written by the agent — last successful file hash (for change detection). |

## Safety notes
- The agent has **no login** to the ERP; it authenticates with the shared
  `tally_agent_token` and can only read the sync command or hand over an already
  validated Tally export for import.
- The server **re-validates** every pushed file's `<SVCURRENTCOMPANY>` before
  importing and refuses mismatches.
- If anything fails (Tally off, company closed, network down), the agent reports
  an error and the ERP simply keeps the previous data — nothing is wiped.
- Keep `config.json` (it holds the token) out of git. Only `config.example.json`
  is committed.
