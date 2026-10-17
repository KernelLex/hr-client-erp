"""
Continuous Tally Sync — control plane
=====================================
A small OPTIONAL agent runs on the accountants' Tally PC (see repo
``tally_sync_agent/``). On a cadence driven by Windows Task Scheduler it polls
``get_tally_sync_command`` here; when this server says "sync now" the agent asks
Tally (via its free built-in XML gateway on localhost:9000) whether anything has
changed since the last sync (AlterID high-water mark). If so it re-exports the
full VE Masters + Transactions XML, pushes the files into
``/home/vera/tally_uploads`` over Tailscale, and calls
``report_tally_sync_result`` — which runs the SAME, already-tested full-import
pipeline (``tally_transformer.run``) that the manual upload uses.

DESIGN GUARANTEES (why this can't break what already works)
-----------------------------------------------------------
* Feature is OFF by default. ``VE Tally Sync Settings.enabled`` defaults to 0 and
  the agent endpoints are disabled entirely unless ``tally_agent_token`` is set in
  site_config. With both unset, this module is inert.
* The ingest path is byte-identical to the manual flow: same file location, same
  ``_verify_tally_company`` guard (a file's <SVCURRENTCOMPANY> must match the
  company), same ``tally_transformer.run`` full pipeline + reconcile. No change to
  how any financial figure is computed.
* The agent never gets a login session. The two agent endpoints are guarded by a
  shared secret token (site_config ``tally_agent_token``) and only ever (a) read
  settings or (b) import files already validated to be that company's Tally export
  sitting in the allowed upload folder.
* Per-voucher incremental merge is deliberately NOT attempted — ledger closing
  balances / GST / debtor-creditor totals are summed across the WHOLE transaction
  file, so a partial file would corrupt them. We re-run the full (correct) import
  and only trigger it when Tally actually changed.
"""

import os

import frappe
from frappe.utils import now_datetime, get_datetime

_SETTINGS = "VE Tally Sync Settings"
_UPLOAD_DIR = "/home/vera/tally_uploads"
_ALLOWED_INTERVALS = {"15", "30", "60", "180", "360", "720", "1440"}


# ── Auth ─────────────────────────────────────────────────────────────────────
def _agent_token() -> str:
	return (frappe.conf.get("tally_agent_token") or "").strip()


def _check_agent():
	"""Gate the guest-callable agent endpoints behind a shared secret. If no token
	is configured on the server the whole feature is considered disabled."""
	expected = _agent_token()
	if not expected:
		frappe.throw("Tally sync agent is not configured on this server.", frappe.PermissionError)
	got = (frappe.get_request_header("X-Tally-Agent-Token")
	       or frappe.form_dict.get("token") or "").strip()
	if not got or got != expected:
		frappe.throw("Invalid Tally sync agent token.", frappe.PermissionError)


def _settings():
	return frappe.get_single(_SETTINGS)


def _as_dict(s):
	return {
		"enabled": bool(s.enabled),
		"company": s.company,
		"interval_minutes": s.interval_minutes or "60",
		"only_when_changed": bool(s.only_when_changed),
		"sync_now": bool(s.sync_now),
		"last_status": s.last_status,
		"last_message": s.last_message,
		"last_alterid": s.last_alterid,
		"last_sync_start": str(s.last_sync_start) if s.last_sync_start else None,
		"last_sync_end": str(s.last_sync_end) if s.last_sync_end else None,
		"agent_last_seen": str(s.agent_last_seen) if s.agent_last_seen else None,
	}


# ── Agent endpoints (token-authenticated, no login session) ───────────────────
@frappe.whitelist(allow_guest=True)
def get_tally_sync_command():
	"""The agent polls this every Task-Scheduler tick. Returns whether it should
	run a sync now, and the parameters it needs. Also records a heartbeat."""
	_check_agent()
	s = _settings()
	# heartbeat (db_set on a Single doc; no hooks, cheap)
	s.db_set("agent_last_seen", now_datetime(), update_modified=False)

	should, reason = False, "disabled"
	if s.enabled:
		if s.sync_now:
			should, reason = True, "manual (Sync Now)"
		elif not s.last_sync_end:
			should, reason = True, "first run"
		else:
			elapsed_min = (now_datetime() - get_datetime(s.last_sync_end)).total_seconds() / 60.0
			interval = int(s.interval_minutes or 60)
			if elapsed_min >= interval:
				should, reason = True, f"interval elapsed ({int(elapsed_min)}m >= {interval}m)"
			else:
				should, reason = False, f"waiting ({int(elapsed_min)}m < {interval}m)"

	return {
		"enabled": bool(s.enabled),
		"should_sync": should,
		"reason": reason,
		"company": s.company,
		"only_when_changed": bool(s.only_when_changed),
		"last_alterid": s.last_alterid or "0",
		"interval_minutes": s.interval_minutes or "60",
		"upload_dir": _UPLOAD_DIR,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def report_tally_sync_result(status, message="", alterid=None,
                             masters_filename=None, transactions_filename=None):
	"""The agent calls this after a poll said "sync now":
	  status = "uploaded"  → files are in the upload dir; trigger the full import
	  status = "no_change" → AlterID unchanged; nothing to do, just record it
	  status = "error"     → agent-side failure; record the message
	Clears the one-shot Sync Now flag either way."""
	_check_agent()
	s = _settings()
	s.db_set("sync_now", 0, update_modified=False)
	if alterid is not None:
		s.db_set("last_alterid", str(alterid), update_modified=False)
	s.db_set("last_message", (message or "")[:500], update_modified=False)

	if status == "uploaded":
		s.db_set("last_sync_start", now_datetime(), update_modified=False)
		s.db_set("last_status", "importing", update_modified=False)
		res = _trigger_import(masters_filename, transactions_filename, s.company)
		frappe.db.commit()
		return {"ok": True, "import": res}

	# no_change / error — record and stop
	s.db_set("last_status", status, update_modified=False)
	s.db_set("last_sync_end", now_datetime(), update_modified=False)
	frappe.db.commit()
	return {"ok": True, "import": None}


def _trigger_import(masters_filename, transactions_filename, company):
	"""Validate the agent-pushed files exactly like the manual importer, then
	enqueue the unchanged full pipeline. Reuses operations.py guards verbatim."""
	from hr_client.api import operations as ops
	from hr_client.api import tally_transformer as tt

	paths = {}
	for label, fn in (("masters", masters_filename), ("transactions", transactions_filename)):
		if not fn:
			frappe.throw(f"Missing {label} filename from agent.", frappe.ValidationError)
		safe = os.path.basename(fn)  # never trust a path from the agent
		real = os.path.realpath(os.path.join(_UPLOAD_DIR, safe))
		if not ops._allowed_root(real):
			frappe.throw(f"{label} path is outside the allowed Tally folder.", frappe.PermissionError)
		if not os.path.isfile(real):
			frappe.throw(f"{label} file not found in upload folder: {safe}", frappe.ValidationError)
		# THE control that stops one company's books importing into another's.
		ops._verify_tally_company(real, company, label)
		paths[label] = real

	# Idempotency — never stack a second import on a running one.
	cur = tt.get_status()
	if cur.get("status") == "running":
		return {"queued": False, "already_running": True}

	tt._set("running", 1, "Import queued by Tally sync agent…")
	frappe.enqueue(
		"hr_client.api.tally_transformer.run",
		queue="long",
		timeout=7200,
		masters_path=paths["masters"],
		transactions_path=paths["transactions"],
		company=company,
	)
	return {"queued": True}


# ── Admin endpoints (session, admin-only) — for the ERP UI ────────────────────
def _require_admin():
	from hr_client.api import operations as ops
	ops._require_admin()


@frappe.whitelist()
def get_tally_sync_status():
	"""Everything the admin UI needs: settings + live import status + whether the
	server-side agent token has been configured yet."""
	_require_admin()
	from hr_client.api import tally_transformer as tt
	s = _settings()
	return {
		"settings": _as_dict(s),
		"import_status": tt.get_status(),
		"agent_configured": bool(_agent_token()),
		"allowed_intervals": sorted(_ALLOWED_INTERVALS, key=lambda x: int(x)),
	}


@frappe.whitelist(methods=["POST"])
def update_tally_sync_settings(enabled=None, interval_minutes=None,
                               only_when_changed=None, company=None):
	"""Admin sets the schedule from the ERP. All fields optional — only provided
	ones change."""
	_require_admin()
	s = _settings()
	if enabled is not None:
		s.enabled = 1 if str(enabled) in ("1", "true", "True", "on") else 0
	if interval_minutes is not None:
		iv = str(interval_minutes).strip()
		if iv not in _ALLOWED_INTERVALS:
			frappe.throw(f"interval_minutes must be one of {sorted(_ALLOWED_INTERVALS, key=int)}",
			             frappe.ValidationError)
		s.interval_minutes = iv
	if only_when_changed is not None:
		s.only_when_changed = 1 if str(only_when_changed) in ("1", "true", "True", "on") else 0
	if company is not None:
		s.company = company
	s.save(ignore_permissions=True)
	frappe.db.commit()
	return {"success": True, "settings": _as_dict(s)}


@frappe.whitelist(methods=["POST"])
def trigger_sync_now():
	"""Admin presses 'Sync Now' — the next agent poll will sync regardless of
	interval. Harmless if the agent isn't running (flag just waits)."""
	_require_admin()
	s = _settings()
	s.db_set("sync_now", 1)
	frappe.db.commit()
	return {"success": True}
