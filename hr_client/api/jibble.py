import re
import frappe
import requests
from datetime import date, datetime, timedelta, timezone
from collections import defaultdict

JIBBLE_BASE = "https://time-tracking.prod.jibble.io"
JIBBLE_TOKEN_URL = "https://identity.prod.jibble.io/connect/token"
TOKEN_CACHE_KEY = "jibble_bearer_token"
PEOPLE_CACHE_KEY = "jibble_people_map"
TOKEN_TTL = 3500
PEOPLE_TTL = 300
TODAY_TS_TTL = 300     # 5 min for today's entries
PAST_TS_TTL = 3600     # 1 hr for past days
ADMIN_USERS = {"owais@veraenterprises.in", "Administrator"}
IST = timezone(timedelta(hours=5, minutes=30))
LATE_THRESHOLD_MINUTES = 9 * 60 + 30  # 09:30 AM IST
OVERTIME_THRESHOLD_HOURS = 9
MAX_RANGE_DAYS = 30


def _check_admin():
	if frappe.session.user not in ADMIN_USERS:
		frappe.throw("Not authorized", frappe.PermissionError)


def _get_token():
	token = frappe.cache().get_value(TOKEN_CACHE_KEY)
	if token:
		return token
	client_id = frappe.conf.get("jibble_client_id")
	client_secret = frappe.conf.get("jibble_client_secret")
	if not client_id or not client_secret:
		frappe.throw("Jibble credentials not configured in site config")
	resp = requests.post(
		JIBBLE_TOKEN_URL,
		data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
		timeout=15,
	)
	resp.raise_for_status()
	token = resp.json().get("access_token")
	frappe.cache().set_value(TOKEN_CACHE_KEY, token, expires_in_sec=TOKEN_TTL)
	return token


def _jibble_get(path, params=None, _retry=True):
	token = _get_token()
	resp = requests.get(
		f"{JIBBLE_BASE}{path}",
		headers={"Authorization": f"Bearer {token}"},
		params=params,
		timeout=20,
	)
	if resp.status_code == 401 and _retry:
		frappe.cache().delete_value(TOKEN_CACHE_KEY)
		return _jibble_get(path, params, _retry=False)
	resp.raise_for_status()
	return resp.json()


def _parse_iso(s):
	"""Parse Jibble ISO timestamps — normalises 4-digit fractional seconds (Python 3.10 compat)."""
	if not s:
		return None
	try:
		s = re.sub(r"\.(\d+)([\+\-Z])", lambda m: "." + m.group(1)[:6].ljust(6, "0") + m.group(2), s)
		s = re.sub(r"\.(\d+)$", lambda m: "." + m.group(1)[:6].ljust(6, "0"), s)
		return datetime.fromisoformat(s.replace("Z", "+00:00"))
	except Exception:
		return None


def _to_ist(s):
	"""Parse ISO string and return datetime in IST. Returns None on failure."""
	dt = _parse_iso(s)
	return dt.astimezone(IST) if dt else None


def _today():
	return date.today().isoformat()


def _week_start():
	today = date.today()
	return (today - timedelta(days=today.weekday())).isoformat()


def _month_start():
	return date.today().replace(day=1).isoformat()


def _date_label(date_str):
	"""Format 'Thursday, 15 May 2026' from 'YYYY-MM-DD'."""
	try:
		d = date.fromisoformat(date_str)
		return d.strftime("%A, %d %B %Y")
	except Exception:
		return date_str


# ── People helpers ──────────────────────────────────────────────────────────

def _get_people_map():
	"""Returns (id_to_name dict, all_person_ids set). Cached 5 min."""
	cached = frappe.cache().get_value(PEOPLE_CACHE_KEY)
	if cached:
		return cached["id_to_name"], cached["all_ids"]
	data = _jibble_get("/v1/People")
	people = data.get("value", [])
	id_to_name = {p["id"]: p.get("fullName") or "Unknown" for p in people}
	all_ids = {p["id"] for p in people}
	frappe.cache().set_value(PEOPLE_CACHE_KEY, {"id_to_name": id_to_name, "all_ids": all_ids}, expires_in_sec=PEOPLE_TTL)
	return id_to_name, all_ids


# ── TimeEntries helpers ─────────────────────────────────────────────────────

def _ts_cache_key(date_str):
	return f"jibble_ts_{date_str}"


def _get_time_entries_for_date(date_str):
	"""Fetch and cache TimeEntries for a single date. TTL=5min today, 1hr past."""
	cache_key = _ts_cache_key(date_str)
	cached = frappe.cache().get_value(cache_key)
	if cached is not None:
		return cached
	# OData Edm.Date — no quotes around date literal
	data = _jibble_get("/v1/TimeEntries", params={"$filter": f"belongsToDate eq {date_str}"})
	entries = data.get("value", [])
	ttl = TODAY_TS_TTL if date_str == _today() else PAST_TS_TTL
	frappe.cache().set_value(cache_key, entries, expires_in_sec=ttl)
	return entries


def _get_time_entries_for_range(date_from, date_to):
	"""Fetch TimeEntries for a date range, using per-day cache where available."""
	from_d = date.fromisoformat(date_from)
	to_d = date.fromisoformat(date_to)
	today = date.today()

	# Collect dates that need a fresh API call
	uncached_dates = []
	cached_by_date = {}
	d = from_d
	while d <= to_d:
		ds = d.isoformat()
		c = frappe.cache().get_value(_ts_cache_key(ds))
		if c is not None:
			cached_by_date[ds] = c
		else:
			uncached_dates.append(ds)
		d += timedelta(days=1)

	# Fetch uncached dates in a single API call when possible
	if uncached_dates:
		unc_from = uncached_dates[0]
		unc_to = uncached_dates[-1]
		data = _jibble_get("/v1/TimeEntries", params={
			"$filter": f"belongsToDate ge {unc_from} and belongsToDate le {unc_to}"
		})
		all_entries = data.get("value", [])
		# Split and cache per day
		by_date = defaultdict(list)
		for e in all_entries:
			by_date[e["belongsToDate"]].append(e)
		for ds in uncached_dates:
			day_entries = by_date.get(ds, [])
			ttl = TODAY_TS_TTL if ds == today.isoformat() else PAST_TS_TTL
			frappe.cache().set_value(_ts_cache_key(ds), day_entries, expires_in_sec=ttl)
			cached_by_date[ds] = day_entries

	return cached_by_date


def _compute_day_attendance(date_str, entries, id_to_name, all_ids):
	"""
	Given TimeEntries for one date, compute per-person attendance.
	Includes absent rows for people with no entries.
	"""
	by_person = defaultdict(list)
	for e in entries:
		by_person[e["personId"]].append(e)

	# Only include people who appear in today's entries + all known people
	person_ids = all_ids | set(by_person.keys())
	result = []
	for pid in person_ids:
		name = id_to_name.get(pid, "Unknown")
		evts = sorted(by_person.get(pid, []), key=lambda x: x.get("localTime", ""))

		if not evts:
			result.append({
				"person_id": pid,
				"person_name": name,
				"date": date_str,
				"clock_in": None,
				"clock_out": None,
				"hours": 0,
				"break_minutes": 0,
				"status": "absent",
			})
			continue

		in_evts = [e for e in evts if e["type"] == "In"]
		out_evts = [e for e in evts if e["type"] == "Out"]
		first_in_dt = _to_ist(in_evts[0]["localTime"]) if in_evts else None
		last_out_dt = _to_ist(out_evts[-1]["localTime"]) if out_evts else None

		# Pair In/Out to compute total hours + break
		total_work_secs = 0
		cur_in = None
		for ev in evts:
			if ev["type"] == "In":
				cur_in = _to_ist(ev["localTime"])
			elif ev["type"] == "Out" and cur_in:
				cur_out = _to_ist(ev["localTime"])
				if cur_out and cur_in:
					total_work_secs += (cur_out - cur_in).total_seconds()
				cur_in = None

		total_hours = total_work_secs / 3600
		clock_in_str = first_in_dt.strftime("%H:%M") if first_in_dt else None
		clock_out_str = last_out_dt.strftime("%H:%M") if last_out_dt else None

		# Break = elapsed - work
		break_minutes = 0
		if first_in_dt and last_out_dt:
			elapsed = (last_out_dt - first_in_dt).total_seconds()
			break_secs = max(0, elapsed - total_work_secs)
			break_minutes = round(break_secs / 60)

		# Status
		if not clock_in_str:
			status = "absent"
		elif not clock_out_str:
			status = "working"
		else:
			h, m = map(int, clock_in_str.split(":"))
			status = "late" if (h * 60 + m) > LATE_THRESHOLD_MINUTES else "on_time"

		result.append({
			"person_id": pid,
			"person_name": name,
			"date": date_str,
			"clock_in": clock_in_str,
			"clock_out": clock_out_str,
			"hours": round(total_hours, 2),
			"break_minutes": break_minutes,
			"status": status,
		})

	# Sort: present first (by clock_in asc), absent last
	result.sort(key=lambda x: (x["status"] == "absent", x["clock_in"] or "99:99"))
	return result


# ── Public endpoints ────────────────────────────────────────────────────────

@frappe.whitelist()
def get_people():
	_check_admin()
	try:
		data = _jibble_get("/v1/People")
		return {"success": True, "data": data}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_people")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_whos_in():
	_check_admin()
	try:
		# Use WhoIsWorkingNow — correct live endpoint
		data = _jibble_get("/v1/WhoIsWorkingNow")
		return {"success": True, "data": data}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_whos_in")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_attendance_today():
	_check_admin()
	try:
		today = _today()
		id_to_name, all_ids = _get_people_map()
		entries = _get_time_entries_for_date(today)
		result = _compute_day_attendance(today, entries, id_to_name, all_ids)
		last_synced = datetime.now(IST).isoformat()
		return {"success": True, "data": result, "date": today, "last_synced": last_synced}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_attendance_today")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_attendance_range(date_from=None, date_to=None):
	"""Returns attendance grouped by date, most recent first. Max 30-day range."""
	_check_admin()
	try:
		today = _today()
		date_from = date_from or today
		date_to = date_to or today

		# Validate range
		from_d = date.fromisoformat(date_from)
		to_d = date.fromisoformat(date_to)
		if (to_d - from_d).days > MAX_RANGE_DAYS:
			return {"success": False, "error": f"Date range exceeds {MAX_RANGE_DAYS} days"}
		if from_d > to_d:
			return {"success": False, "error": "date_from must be before date_to"}

		id_to_name, all_ids = _get_people_map()
		entries_by_date = _get_time_entries_for_range(date_from, date_to)

		groups = []
		d = to_d
		while d >= from_d:
			ds = d.isoformat()
			day_entries = entries_by_date.get(ds, [])
			day_attendance = _compute_day_attendance(ds, day_entries, id_to_name, all_ids)
			groups.append({
				"date": ds,
				"date_label": _date_label(ds),
				"entries": day_attendance,
			})
			d -= timedelta(days=1)

		return {
			"success": True,
			"data": groups,
			"date_from": date_from,
			"date_to": date_to,
			"last_synced": datetime.now(IST).isoformat(),
		}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_attendance_range")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_absent_by_date(date_str=None):
	"""Cross-check all People vs timesheets for a specific date."""
	_check_admin()
	try:
		target = date_str or _today()
		id_to_name, all_ids = _get_people_map()
		entries = _get_time_entries_for_date(target)
		clocked_ids = {e["personId"] for e in entries if e.get("type") == "In"}
		absent = [
			{"person_id": pid, "person_name": id_to_name.get(pid, "Unknown")}
			for pid in all_ids if pid not in clocked_ids
		]
		return {"success": True, "data": absent, "date": target}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_absent_by_date")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def bust_cache(date_from=None, date_to=None):
	"""Bust per-day cache for a date range, forcing fresh fetch on next request."""
	_check_admin()
	try:
		today = _today()
		date_from = date_from or today
		date_to = date_to or today
		from_d = date.fromisoformat(date_from)
		to_d = date.fromisoformat(date_to)
		d = from_d
		while d <= to_d:
			frappe.cache().delete_value(_ts_cache_key(d.isoformat()))
			d += timedelta(days=1)
		frappe.cache().delete_value(PEOPLE_CACHE_KEY)
		return {"success": True, "busted_from": date_from, "busted_to": date_to}
	except Exception as e:
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_weekly_summary():
	_check_admin()
	try:
		today = _today()
		week_start = _week_start()
		id_to_name, _ = _get_people_map()
		entries_by_date = _get_time_entries_for_range(week_start, today)

		totals = defaultdict(lambda: {"hours": 0.0, "days": set(), "name": ""})
		for ds, entries in entries_by_date.items():
			by_person = defaultdict(list)
			for e in entries:
				by_person[e["personId"]].append(e)
			for pid, evts in by_person.items():
				totals[pid]["name"] = id_to_name.get(pid, "Unknown")
				# Sum In→Out sessions
				cur_in = None
				work_secs = 0
				for ev in sorted(evts, key=lambda x: x.get("localTime", "")):
					if ev["type"] == "In":
						cur_in = _to_ist(ev["localTime"])
					elif ev["type"] == "Out" and cur_in:
						cur_out = _to_ist(ev["localTime"])
						if cur_out:
							work_secs += (cur_out - cur_in).total_seconds()
						cur_in = None
				totals[pid]["hours"] += work_secs / 3600
				totals[pid]["days"].add(ds)

		result = [
			{"person_id": pid, "person_name": v["name"], "total_hours": round(v["hours"], 2), "days_worked": len(v["days"])}
			for pid, v in totals.items() if v["hours"] > 0
		]
		return {"success": True, "data": result, "week_start": week_start, "week_end": today}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_weekly_summary")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_monthly_summary():
	_check_admin()
	try:
		today = _today()
		month_start = _month_start()
		id_to_name, _ = _get_people_map()
		entries_by_date = _get_time_entries_for_range(month_start, today)

		totals = defaultdict(lambda: {"hours": 0.0, "days": set(), "overtime_days": 0, "name": ""})
		for ds, entries in entries_by_date.items():
			by_person = defaultdict(list)
			for e in entries:
				by_person[e["personId"]].append(e)
			for pid, evts in by_person.items():
				totals[pid]["name"] = id_to_name.get(pid, "Unknown")
				cur_in = None
				day_secs = 0
				for ev in sorted(evts, key=lambda x: x.get("localTime", "")):
					if ev["type"] == "In":
						cur_in = _to_ist(ev["localTime"])
					elif ev["type"] == "Out" and cur_in:
						cur_out = _to_ist(ev["localTime"])
						if cur_out:
							day_secs += (cur_out - cur_in).total_seconds()
						cur_in = None
				day_hours = day_secs / 3600
				totals[pid]["hours"] += day_hours
				if day_hours > 0:
					totals[pid]["days"].add(ds)
				if day_hours > OVERTIME_THRESHOLD_HOURS:
					totals[pid]["overtime_days"] += 1

		result = []
		for pid, v in totals.items():
			if v["hours"] <= 0:
				continue
			days = len(v["days"])
			result.append({
				"person_id": pid,
				"person_name": v["name"],
				"total_hours": round(v["hours"], 2),
				"working_days": days,
				"avg_hours_per_day": round(v["hours"] / days, 2) if days > 0 else 0,
				"overtime_days": v["overtime_days"],
			})
		return {"success": True, "data": result, "month_start": month_start, "month_end": today}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_monthly_summary")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_tracked_time_report():
	_check_admin()
	try:
		data = _jibble_get("/v1/TrackedTimeReport")
		return {"success": True, "data": data}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_tracked_time_report")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_activities():
	_check_admin()
	try:
		data = _jibble_get("/v1/Activities")
		return {"success": True, "data": data}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_activities")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_projects():
	_check_admin()
	try:
		data = _jibble_get("/v1/Projects")
		return {"success": True, "data": data}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_projects")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_late_today():
	_check_admin()
	try:
		today = _today()
		id_to_name, _ = _get_people_map()
		entries = _get_time_entries_for_date(today)
		by_person = defaultdict(list)
		for e in entries:
			by_person[e["personId"]].append(e)

		late = []
		for pid, evts in by_person.items():
			in_evts = [e for e in sorted(evts, key=lambda x: x.get("localTime", "")) if e["type"] == "In"]
			if not in_evts:
				continue
			dt = _to_ist(in_evts[0]["localTime"])
			if not dt:
				continue
			total_mins = dt.hour * 60 + dt.minute
			if total_mins > LATE_THRESHOLD_MINUTES:
				late.append({
					"person_id": pid,
					"person_name": id_to_name.get(pid, "Unknown"),
					"clock_in": dt.strftime("%H:%M"),
					"minutes_late": total_mins - LATE_THRESHOLD_MINUTES,
				})
		return {"success": True, "data": late, "date": today}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_late_today")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_absent_today():
	_check_admin()
	try:
		today = _today()
		id_to_name, all_ids = _get_people_map()
		entries = _get_time_entries_for_date(today)
		clocked_ids = {e["personId"] for e in entries if e.get("type") == "In"}
		absent = [
			{"person_id": pid, "person_name": id_to_name.get(pid, "Unknown")}
			for pid in all_ids if pid not in clocked_ids
		]
		return {"success": True, "data": absent, "date": today}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_absent_today")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_overtime():
	_check_admin()
	try:
		today = _today()
		month_start = _month_start()
		id_to_name, _ = _get_people_map()
		entries_by_date = _get_time_entries_for_range(month_start, today)

		person_days = defaultdict(lambda: defaultdict(float))
		person_names = {}
		for ds, entries in entries_by_date.items():
			by_person = defaultdict(list)
			for e in entries:
				by_person[e["personId"]].append(e)
			for pid, evts in by_person.items():
				person_names[pid] = id_to_name.get(pid, "Unknown")
				cur_in = None
				day_secs = 0
				for ev in sorted(evts, key=lambda x: x.get("localTime", "")):
					if ev["type"] == "In":
						cur_in = _to_ist(ev["localTime"])
					elif ev["type"] == "Out" and cur_in:
						cur_out = _to_ist(ev["localTime"])
						if cur_out:
							day_secs += (cur_out - cur_in).total_seconds()
						cur_in = None
				person_days[pid][ds] = day_secs / 3600

		result = []
		for pid, days in person_days.items():
			ot_days = []
			total_ot = 0
			for d, hours in days.items():
				if hours > OVERTIME_THRESHOLD_HOURS:
					ot = hours - OVERTIME_THRESHOLD_HOURS
					ot_days.append({"date": d, "hours": round(hours, 2), "overtime_hours": round(ot, 2)})
					total_ot += ot
			if ot_days:
				result.append({
					"person_id": pid,
					"person_name": person_names[pid],
					"overtime_days": sorted(ot_days, key=lambda x: x["date"]),
					"total_overtime_hours": round(total_ot, 2),
				})
		return {"success": True, "data": result}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "Jibble get_overtime")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def test_connection():
	_check_admin()
	try:
		frappe.cache().delete_value(TOKEN_CACHE_KEY)
		_get_token()
		# Minimal check — just fetch 1 person
		data = _jibble_get("/v1/People", params={"$top": 1})
		people = data.get("value", [])
		org_name = people[0].get("organizationId") if people else None
		return {"success": True, "connected": True, "organization": org_name}
	except Exception as e:
		return {"success": True, "connected": False, "error": str(e)}
