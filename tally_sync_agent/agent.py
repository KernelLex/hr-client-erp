#!/usr/bin/env python3
"""
Vera Tally Sync Agent  (runs ON the accountants' Tally PC — OPTIONAL)
====================================================================
One run = one tick. Point Windows Task Scheduler at this script on a short
interval (e.g. every 5 minutes). The *real* cadence is decided in the ERP
(VE Tally Sync Settings → "Sync Every"); this agent just asks the ERP whether it
should act right now.

What one tick does
------------------
1. Ask the ERP:  GET  tally_sync.get_tally_sync_command
   - If the feature is disabled or the interval hasn't elapsed → do nothing.
2. Export the company's full Masters + Transactions XML from Tally's FREE
   built-in gateway (http://localhost:9000). No paid API, no cloud.
3. If "only when changed" is on: hash the exported files; if identical to the
   last successful sync → report "no_change" and stop (skips the big transfer +
   the ~5-min server import entirely). Exact hash → never a false "no change".
4. Otherwise copy both files to the server's upload folder over Tailscale (scp)
   and call  POST tally_sync.report_tally_sync_result(status="uploaded", …).
   The server then runs the SAME full import pipeline the manual upload uses.

Dependencies: Python 3.8+ and the OpenSSH `scp` client (built into Windows 10+).
No pip packages required (uses only the standard library).

IMPORTANT — verify once before trusting it
-------------------------------------------
Tally report names vary slightly by version/config. After first install, run the
agent once with --dry-run, open the two exported files it leaves in the temp
folder, and confirm they look like your normal manual "All Masters" / "All
Transactions" exports (they must contain <SVCURRENTCOMPANY> and <VOUCHER> tags).
If not, tweak "masters_report" / "transactions_report" in config.json — no code
change needed.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))


def log(msg):
	print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def load_config(path):
	with open(path, "r", encoding="utf-8") as f:
		return json.load(f)


# ── ERP calls (token-authenticated, no login) ─────────────────────────────────
def erp_call(cfg, method, data=None):
	url = cfg["erp_base_url"].rstrip("/") + "/api/method/hr_client.api.tally_sync." + method
	headers = {"X-Tally-Agent-Token": cfg["agent_token"], "Content-Type": "application/json"}
	body = json.dumps(data).encode("utf-8") if data is not None else None
	req = urllib.request.Request(url, data=body, headers=headers,
	                             method="POST" if data is not None else "GET")
	with urllib.request.urlopen(req, timeout=60) as resp:
		payload = json.loads(resp.read().decode("utf-8"))
	return payload.get("message", payload)


# ── Tally gateway export (free, local) ────────────────────────────────────────
_EXPORT_TEMPLATE = """<ENVELOPE>
 <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
 <BODY><EXPORTDATA><REQUESTDESC>
  <REPORTNAME>{report}</REPORTNAME>
  <STATICVARIABLES>
   <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   <SVCURRENTCOMPANY>{company}</SVCURRENTCOMPANY>
   {dates}
  </STATICVARIABLES>
 </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>"""


def tally_export(cfg, report, out_path, with_dates=False):
	dates = ""
	if with_dates:
		from_date = cfg.get("from_date") or "20000401"
		to_date = cfg.get("to_date") or datetime.now().strftime("%Y%m%d")
		dates = f"<SVFROMDATE>{from_date}</SVFROMDATE><SVTODATE>{to_date}</SVTODATE>"
	xml = _EXPORT_TEMPLATE.format(report=report, company=cfg["tally_company_name"], dates=dates)
	req = urllib.request.Request(cfg.get("tally_url", "http://localhost:9000"),
	                             data=xml.encode("utf-8"),
	                             headers={"Content-Type": "application/xml"}, method="POST")
	with urllib.request.urlopen(req, timeout=cfg.get("tally_timeout", 1800)) as resp:
		content = resp.read()  # Tally returns UTF-16 XML
	with open(out_path, "wb") as f:
		f.write(content)
	return len(content)


def sha256(path):
	h = hashlib.sha256()
	with open(path, "rb") as f:
		for chunk in iter(lambda: f.read(1 << 20), b""):
			h.update(chunk)
	return h.hexdigest()


def scp(cfg, local_path, remote_name):
	target = cfg["scp_target"].rstrip("/") + "/" + remote_name
	cmd = ["scp"] + cfg.get("scp_extra_args", []) + [local_path, target]
	log(f"scp → {target}")
	subprocess.run(cmd, check=True)


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
	ap.add_argument("--dry-run", action="store_true",
	                help="Export from Tally only; do not push or import. Leaves files for inspection.")
	args = ap.parse_args()
	cfg = load_config(args.config)
	state_path = cfg.get("state_file", os.path.join(HERE, "state.json"))

	# 1) Ask the ERP whether to act
	try:
		cmd = erp_call(cfg, "get_tally_sync_command")
	except Exception as exc:
		log(f"ERROR talking to ERP: {exc}")
		return 1
	if not args.dry_run and not cmd.get("should_sync"):
		log(f"Nothing to do — {cmd.get('reason')}")
		return 0
	log(f"Proceeding — {cmd.get('reason', 'dry-run')}")

	tmp = tempfile.gettempdir()
	masters_path = os.path.join(tmp, "VEMaster_agent.xml")
	trans_path = os.path.join(tmp, "Transactions_agent.xml")

	# 2) Export from Tally
	try:
		mb = tally_export(cfg, cfg.get("masters_report", "List of Accounts"), masters_path)
		tb = tally_export(cfg, cfg.get("transactions_report", "Day Book"), trans_path, with_dates=True)
	except Exception as exc:
		log(f"ERROR exporting from Tally: {exc}")
		if not args.dry_run:
			erp_call(cfg, "report_tally_sync_result",
			         {"status": "error", "message": f"Tally export failed: {exc}"})
		return 1
	log(f"Exported masters={mb:,}B transactions={tb:,}B")

	if args.dry_run:
		log(f"DRY RUN — inspect:\n  {masters_path}\n  {trans_path}")
		return 0

	# 3) Change detection (exact file hash; a false "no change" is impossible)
	digest = sha256(masters_path) + ":" + sha256(trans_path)
	last = {}
	if os.path.isfile(state_path):
		try:
			last = json.load(open(state_path, encoding="utf-8"))
		except Exception:
			last = {}
	if cmd.get("only_when_changed") and last.get("hash") == digest:
		log("No change since last sync (hashes match) — skipping import.")
		erp_call(cfg, "report_tally_sync_result",
		         {"status": "no_change", "alterid": digest[:32],
		          "message": "Tally data unchanged since last sync."})
		return 0

	# 4) Push + ask the ERP to run the full (unchanged) import pipeline
	masters_remote = cfg.get("masters_remote_name", "VEMaster_agent.xml")
	trans_remote = cfg.get("transactions_remote_name", "Transactions_agent.xml")
	try:
		scp(cfg, masters_path, masters_remote)
		scp(cfg, trans_path, trans_remote)
	except subprocess.CalledProcessError as exc:
		log(f"ERROR scp failed: {exc}")
		erp_call(cfg, "report_tally_sync_result",
		         {"status": "error", "message": f"scp to server failed: {exc}"})
		return 1

	res = erp_call(cfg, "report_tally_sync_result", {
		"status": "uploaded",
		"alterid": digest[:32],
		"message": f"Pushed masters={mb:,}B transactions={tb:,}B",
		"masters_filename": masters_remote,
		"transactions_filename": trans_remote,
	})
	json.dump({"hash": digest, "at": datetime.now().isoformat()},
	          open(state_path, "w", encoding="utf-8"))
	log(f"Done — server import: {res.get('import')}")
	return 0


if __name__ == "__main__":
	sys.exit(main())
