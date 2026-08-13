# hr_client/api/calendar.py
# ---------------------------------------------------------------------------
# Scheduling system — Calendar, Meetings and Reminders, all backed by the Frappe
# core Event DocType. The admin/team create events, meetings and reminders and
# work them to completion. One create endpoint powers all three screens.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import get_datetime, now_datetime, strip_html

from hr_client.api.utils import require_login, handle_api_error

EVENT_LANES = ["Open", "Completed", "Closed", "Cancelled"]


def _rows_for(filters, extra_cols=None):
    events = frappe.get_all(
        "Event",
        filters=filters,
        fields=["name", "subject", "event_category", "starts_on", "ends_on", "status", "all_day", "description", "send_reminder"],
        order_by="starts_on desc",
        limit_page_length=300,
    )
    rows = []
    for e in events:
        rows.append(
            {
                "id": e.name,
                "subject": e.subject or "(untitled)",
                "category": e.event_category or "Event",
                "when": _fmt_dt(e.starts_on, e.all_day),
                "status": e.status or "Open",
                "details": strip_html(e.description or "").strip()[:120],
            }
        )
    return rows


def _kpis(rows, label):
    upcoming = len([r for r in rows if r["status"] == "Open"])
    done = len([r for r in rows if r["status"] == "Completed"])
    return [
        {"label": label, "value": str(len(rows))},
        {"label": "Upcoming", "value": str(upcoming), "tone": "warn" if upcoming else ""},
        {"label": "Completed", "value": str(done), "tone": "good"},
        {"label": "This Month", "value": str(len([r for r in rows if _this_month(r["when"])]))},
    ]


_COLUMNS = [
    {"key": "subject", "header": "Title"},
    {"key": "category", "header": "Type", "align": "center"},
    {"key": "when", "header": "When", "kind": "date"},
    {"key": "details", "header": "Details"},
    {"key": "status", "header": "Status", "align": "center", "kind": "status"},
]


@frappe.whitelist()
@handle_api_error
def get_calendar():
    require_login()
    rows = _rows_for({})
    return {
        "kpis": _kpis(rows, "Events"),
        "columns": _COLUMNS,
        "rows": rows,
        "note": "Calendar — every scheduled event, meeting and reminder across the workspace. Create entries and mark them done as they pass.",
    }


@frappe.whitelist()
@handle_api_error
def get_meetings():
    require_login()
    rows = _rows_for({"event_category": "Meeting"})
    return {
        "kpis": _kpis(rows, "Meetings"),
        "columns": _COLUMNS,
        "rows": rows,
        "note": "Meetings — scheduled meetings with the team, clients and vendors. Track outcomes by closing each one out.",
    }


@frappe.whitelist()
@handle_api_error
def get_reminders():
    require_login()
    rows = _rows_for({"send_reminder": 1})
    return {
        "kpis": _kpis(rows, "Reminders"),
        "columns": _COLUMNS,
        "rows": rows,
        "note": "Reminders — time-based nudges for deadlines and follow-ups. Each fires a reminder before it is due.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_event(subject, starts_on, category="Event", ends_on=None, description=None, all_day=0, send_reminder=0):
    """Create an Event / Meeting / Reminder."""
    require_login()
    if not subject or not str(subject).strip():
        frappe.throw("Title is required")
    if not starts_on:
        frappe.throw("Start date/time is required")

    doc = frappe.get_doc(
        {
            "doctype": "Event",
            "subject": str(subject).strip(),
            "event_category": category if category in ("Event", "Meeting", "Call", "Other") else "Event",
            "event_type": "Public",
            "starts_on": get_datetime(starts_on),
            "ends_on": get_datetime(ends_on) if ends_on else None,
            "all_day": 1 if str(all_day) in ("1", "true", "True", "on") else 0,
            "send_reminder": 1 if str(send_reminder) in ("1", "true", "True", "on") else 0,
            "description": description or None,
            "status": "Open",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_event_status(name, status):
    require_login()
    if status not in EVENT_LANES:
        frappe.throw("Invalid status")
    doc = frappe.get_doc("Event", name)
    doc.status = status
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


# ── helpers ──────────────────────────────────────────────────────────────────
def _fmt_dt(dt, all_day):
    if not dt:
        return "—"
    s = str(dt)
    return s[:10] if all_day else s[:16]


def _this_month(when):
    if not when or when == "—":
        return False
    return when[:7] == str(now_datetime())[:7]
