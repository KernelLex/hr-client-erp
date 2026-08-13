# hr_client/api/training.py
# ---------------------------------------------------------------------------
# Training system — the admin defines Training Programs (courses) and schedules
# Training Events (sessions), then drives them to completion. Built on the native
# Frappe-HRMS Training Program / Training Event DocTypes.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import get_datetime, strip_html

from hr_client.api.utils import require_admin, handle_api_error, COMPANY_NAME

PROGRAM_STATUS = ["Scheduled", "Completed", "Cancelled"]
EVENT_TYPES = ["Seminar", "Theory", "Workshop", "Conference", "Exam", "Internet", "Self-Study"]


# ── Training Programs ────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_programs():
    require_admin()
    progs = frappe.get_all(
        "Training Program",
        filters={"docstatus": ["<", 2]},
        fields=["name", "training_program", "trainer_name", "status", "company"],
        order_by="modified desc",
        limit_page_length=200,
    )
    rows = []
    for p in progs:
        events = frappe.db.count("Training Event", {"training_program": p.name})
        rows.append(
            {
                "id": p.name,
                "program": p.training_program or p.name,
                "trainer": p.trainer_name or "—",
                "events": events,
                "status": p.status or "Scheduled",
            }
        )
    done = len([r for r in rows if r["status"] == "Completed"])
    kpis = [
        {"label": "Programs", "value": str(len(rows))},
        {"label": "Scheduled", "value": str(len([r for r in rows if r["status"] == "Scheduled"])), "tone": "warn"},
        {"label": "Completed", "value": str(done), "tone": "good"},
        {"label": "Total Sessions", "value": str(sum(r["events"] for r in rows))},
    ]
    columns = [
        {"key": "program", "header": "Program"},
        {"key": "trainer", "header": "Trainer"},
        {"key": "events", "header": "Sessions", "align": "right", "kind": "number"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Training Programs — the courses you run for the team. Schedule sessions against each program and mark them complete.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_program(program_name, description, trainer_name=None):
    require_admin()
    if not program_name or not str(program_name).strip():
        frappe.throw("Program name is required")
    doc = frappe.get_doc(
        {
            "doctype": "Training Program",
            "training_program": str(program_name).strip(),
            "company": COMPANY_NAME,
            "description": description or program_name,
            "trainer_name": trainer_name or None,
            "status": "Scheduled",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_program_status(name, status):
    require_admin()
    if status not in PROGRAM_STATUS:
        frappe.throw("Invalid status")
    frappe.db.set_value("Training Program", name, "status", status)
    frappe.db.commit()
    return {"success": True}


# ── Training Events ──────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_events():
    require_admin()
    events = frappe.get_all(
        "Training Event",
        filters={"docstatus": ["<", 2]},
        fields=["name", "event_name", "training_program", "type", "level", "location", "start_time", "event_status", "trainer_name"],
        order_by="start_time desc",
        limit_page_length=200,
    )
    rows = []
    for e in events:
        rows.append(
            {
                "id": e.name,
                "event": e.event_name or e.name,
                "program": e.training_program or "—",
                "type": e.type or "—",
                "when": str(e.start_time)[:16] if e.start_time else "—",
                "location": e.location or "—",
                "status": e.event_status or "Scheduled",
            }
        )
    kpis = [
        {"label": "Sessions", "value": str(len(rows))},
        {"label": "Scheduled", "value": str(len([r for r in rows if r["status"] == "Scheduled"])), "tone": "warn"},
        {"label": "Completed", "value": str(len([r for r in rows if r["status"] == "Completed"])), "tone": "good"},
        {"label": "This Month", "value": str(len([r for r in rows if r["when"] != "—"]))},
    ]
    columns = [
        {"key": "event", "header": "Session"},
        {"key": "program", "header": "Program"},
        {"key": "type", "header": "Type", "align": "center"},
        {"key": "when", "header": "When", "kind": "date"},
        {"key": "location", "header": "Location"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Training Sessions — scheduled workshops, seminars and exams. Record attendance and close each session out.",
    }


@frappe.whitelist()
@handle_api_error
def get_program_options():
    require_admin()
    rows = frappe.get_all("Training Program", filters={"docstatus": ["<", 2]}, fields=["name", "training_program"], order_by="training_program asc")
    return {"options": [{"value": r.name, "label": r.training_program or r.name} for r in rows]}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def schedule_event(event_name, event_type, location, start_time, end_time, introduction=None, training_program=None, trainer_name=None):
    require_admin()
    if not (event_name and location and start_time and end_time):
        frappe.throw("Session name, location, start and end time are required")
    if event_type not in EVENT_TYPES:
        event_type = "Workshop"
    doc = frappe.get_doc(
        {
            "doctype": "Training Event",
            "event_name": str(event_name).strip(),
            "training_program": training_program or None,
            "event_status": "Scheduled",
            "type": event_type,
            "company": COMPANY_NAME,
            "location": location,
            "start_time": get_datetime(start_time),
            "end_time": get_datetime(end_time),
            "introduction": strip_html(introduction or event_name) or event_name,
            "trainer_name": trainer_name or None,
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_event_status(name, status):
    require_admin()
    if status not in PROGRAM_STATUS:
        frappe.throw("Invalid status")
    frappe.db.set_value("Training Event", name, "event_status", status)
    frappe.db.commit()
    return {"success": True}
