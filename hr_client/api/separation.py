# hr_client/api/separation.py
# ---------------------------------------------------------------------------
# Exit Management system — the admin initiates an employee separation, tracks its
# progress (Pending → In Process → Completed) and records the exit interview.
# Built on the native Frappe-HRMS Employee Separation DocType.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import getdate, strip_html

from hr_client.api.utils import require_admin, handle_api_error

BOARDING_STATUS = ["Pending", "In Process", "Completed"]


@frappe.whitelist()
@handle_api_error
def get_separations():
    require_admin()
    seps = frappe.get_all(
        "Employee Separation",
        filters={"docstatus": ["<", 2]},
        fields=["name", "employee_name", "department", "designation", "boarding_begins_on", "boarding_status", "resignation_letter_date"],
        order_by="boarding_begins_on desc",
        limit_page_length=200,
    )
    rows = []
    for s in seps:
        dept = (s.department or "").replace(" - V", "").replace(" - SL", "").replace(" - HM", "")
        rows.append(
            {
                "id": s.name,
                "employee": s.employee_name or "—",
                "department": dept or "—",
                "designation": s.designation or "—",
                "exit_date": str(s.boarding_begins_on) if s.boarding_begins_on else "—",
                "status": s.boarding_status or "Pending",
            }
        )
    in_process = len([r for r in rows if r["status"] == "In Process"])
    completed = len([r for r in rows if r["status"] == "Completed"])
    kpis = [
        {"label": "Separations", "value": str(len(rows))},
        {"label": "In Process", "value": str(in_process), "tone": "warn" if in_process else ""},
        {"label": "Completed", "value": str(completed), "tone": "good"},
        {"label": "Pending", "value": str(len([r for r in rows if r["status"] == "Pending"])), "tone": "bad"},
    ]
    columns = [
        {"key": "employee", "header": "Employee"},
        {"key": "department", "header": "Department"},
        {"key": "designation", "header": "Designation"},
        {"key": "exit_date", "header": "Exit Date", "kind": "date"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Exit Management — initiate and track employee separations through clearance to final settlement. Record the exit interview on each.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def initiate_separation(employee, exit_date, resignation_letter_date=None):
    require_admin()
    if not employee or not frappe.db.exists("Employee", employee):
        frappe.throw("Select a valid employee")
    if not exit_date:
        frappe.throw("Exit date is required")

    emp = frappe.db.get_value(
        "Employee", employee, ["company", "department", "designation", "employee_name"], as_dict=True
    )
    doc = frappe.get_doc(
        {
            "doctype": "Employee Separation",
            "employee": employee,
            "employee_name": emp.employee_name,
            "company": emp.company,
            "department": emp.department,
            "designation": emp.designation,
            "boarding_begins_on": getdate(exit_date),
            "resignation_letter_date": getdate(resignation_letter_date) if resignation_letter_date else None,
            "boarding_status": "Pending",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_status(name, status):
    require_admin()
    if status not in BOARDING_STATUS:
        frappe.throw("Invalid status")
    frappe.db.set_value("Employee Separation", name, "boarding_status", status)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def record_exit_interview(name, notes):
    require_admin()
    if not notes or not str(notes).strip():
        frappe.throw("Interview notes are required")
    frappe.db.set_value("Employee Separation", name, "exit_interview", strip_html(str(notes)))
    frappe.db.commit()
    return {"success": True}
