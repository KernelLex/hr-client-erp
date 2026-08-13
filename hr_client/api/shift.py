# hr_client/api/shift.py
# ---------------------------------------------------------------------------
# Shift Management — a real operational system. The admin defines Shift Types
# (working windows) and assigns employees to them via Shift Assignments. Two
# archetype screens: Shift Types (definitions) and Shift Assignments (roster).
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import getdate

from hr_client.api.utils import require_admin, handle_api_error, COMPANY_NAME


# ── Shift Types ──────────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_shift_types():
    """All shift definitions with a live count of active assignments."""
    require_admin()

    shifts = frappe.get_all(
        "Shift Type",
        fields=["name", "start_time", "end_time", "color", "enable_auto_attendance"],
        order_by="name asc",
    )
    rows = []
    for s in shifts:
        assigned = frappe.db.count("Shift Assignment", {"shift_type": s.name, "docstatus": 1, "status": "Active"})
        rows.append(
            {
                "shift": s.name,
                "start": _fmt_time(s.start_time),
                "end": _fmt_time(s.end_time),
                "assigned": assigned,
                "auto_attendance": "On" if s.enable_auto_attendance else "Off",
                "status": "Active",
            }
        )

    total_assigned = sum(r["assigned"] for r in rows)
    kpis = [
        {"label": "Shift Types", "value": str(len(rows))},
        {"label": "Employees Assigned", "value": str(total_assigned)},
        {"label": "Company", "value": COMPANY_NAME},
        {"label": "Auto-Attendance", "value": str(len([r for r in rows if r["auto_attendance"] == "On"]))},
    ]
    columns = [
        {"key": "shift", "header": "Shift"},
        {"key": "start", "header": "Start", "align": "center"},
        {"key": "end", "header": "End", "align": "center"},
        {"key": "assigned", "header": "Assigned", "align": "right", "kind": "number"},
        {"key": "auto_attendance", "header": "Auto Attd.", "align": "center"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Shift Types — the working windows staff are rostered into. Assign employees on the Shift Assignments screen.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_shift_type(shift_name, start_time, end_time, color=None):
    """Create a new Shift Type (name is prompt-based)."""
    require_admin()
    if not shift_name or not str(shift_name).strip():
        frappe.throw("Shift name is required")
    if not start_time or not end_time:
        frappe.throw("Start and end time are required")

    name = str(shift_name).strip()
    if frappe.db.exists("Shift Type", name):
        frappe.throw(f"Shift '{name}' already exists")

    doc = frappe.get_doc(
        {
            "doctype": "Shift Type",
            "__newname": name,
            "start_time": start_time,
            "end_time": end_time,
            "color": color or "Blue",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── Shift Assignments ────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_shift_assignments():
    """The roster — which employee is on which shift, from when."""
    require_admin()

    rows_raw = frappe.get_all(
        "Shift Assignment",
        filters={"docstatus": ["<", 2]},
        fields=["name", "employee_name", "shift_type", "start_date", "end_date", "status", "company"],
        order_by="start_date desc",
        limit_page_length=300,
    )
    rows = []
    for a in rows_raw:
        rows.append(
            {
                "id": a.name,
                "employee": a.employee_name or "—",
                "shift": a.shift_type or "—",
                "from": str(a.start_date) if a.start_date else "—",
                "to": str(a.end_date) if a.end_date else "Ongoing",
                "status": a.status or "Active",
            }
        )

    active = len([r for r in rows if r["status"] == "Active"])
    kpis = [
        {"label": "Assignments", "value": str(len(rows))},
        {"label": "Active", "value": str(active), "tone": "good"},
        {"label": "Shifts Used", "value": str(len({r["shift"] for r in rows}))},
        {"label": "Employees", "value": str(len({r["employee"] for r in rows}))},
    ]
    columns = [
        {"key": "employee", "header": "Employee"},
        {"key": "shift", "header": "Shift"},
        {"key": "from", "header": "From", "kind": "date"},
        {"key": "to", "header": "To"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Shift Assignments — the live roster. Assign an employee to a shift with a start date; leave the end date open for a standing assignment.",
    }


@frappe.whitelist()
@handle_api_error
def get_shift_type_options():
    """Shift types for the assignment dropdown."""
    require_admin()
    rows = frappe.get_all("Shift Type", fields=["name"], order_by="name asc")
    return {"options": [{"value": r.name, "label": r.name} for r in rows]}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def assign_shift(employee, shift_type, start_date, end_date=None):
    """Create + submit a Shift Assignment for an employee."""
    require_admin()
    if not (employee and shift_type and start_date):
        frappe.throw("Employee, shift and start date are required")
    if not frappe.db.exists("Employee", employee):
        frappe.throw("Unknown employee")

    company = frappe.db.get_value("Employee", employee, "company") or COMPANY_NAME
    doc = frappe.get_doc(
        {
            "doctype": "Shift Assignment",
            "employee": employee,
            "company": company,
            "shift_type": shift_type,
            "start_date": getdate(start_date),
            "end_date": getdate(end_date) if end_date else None,
            "status": "Active",
        }
    )
    doc.insert(ignore_permissions=True)
    try:
        doc.submit()
    except Exception:
        # Overlap or validation issues surface as a clean message.
        frappe.log_error(frappe.get_traceback(), "assign_shift.submit")
        frappe.throw("Could not activate the assignment — it may overlap an existing one for this employee.")
    frappe.db.commit()
    return {"success": True, "name": doc.name}


def _fmt_time(t):
    """timedelta / str time -> HH:MM."""
    if not t:
        return "—"
    s = str(t)
    parts = s.split(":")
    if len(parts) >= 2:
        return f"{int(parts[0]):02d}:{parts[1][:2]}"
    return s
