import frappe
from frappe.utils import now_datetime

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}


def _require_admin():
    u = frappe.session.user
    if u in _ADMIN_USERS:
        return
    if "System Manager" in frappe.get_roles(u) or "HR Manager" in frappe.get_roles(u):
        return
    frappe.throw("Admin access required", frappe.PermissionError)


def _get_employee_by_email(email):
    return (
        frappe.db.get_value("Employee", {"user_id": email, "status": "Active"}, "name")
        or frappe.db.get_value("Employee", {"company_email": email, "status": "Active"}, "name")
        or frappe.db.get_value("Employee", {"personal_email": email, "status": "Active"}, "name")
    )


@frappe.whitelist()
def get_notes(employee_email):
    _require_admin()

    emp_name = _get_employee_by_email(employee_email)
    if not emp_name:
        return {"success": False, "error": f"No active employee found for {employee_email}"}

    notes = frappe.get_all(
        "Vera Employee Note",
        filters={"employee": emp_name},
        fields=["name", "note_content", "tag", "created_by_user", "created_on"],
        order_by="created_on desc",
    )
    for n in notes:
        n["created_on"] = str(n.get("created_on") or "")
    return {"success": True, "notes": notes}


@frappe.whitelist(methods=["POST"])
def add_note(employee_email, note_content, tag):
    _require_admin()

    if not note_content or not str(note_content).strip():
        return {"success": False, "error": "Note content is required"}
    if tag not in ("Good", "Bad", "Neutral"):
        return {"success": False, "error": "Tag must be Good, Bad, or Neutral"}

    emp_name = _get_employee_by_email(employee_email)
    if not emp_name:
        return {"success": False, "error": f"No active employee found for {employee_email}"}

    doc = frappe.new_doc("Vera Employee Note")
    doc.employee = emp_name
    doc.note_content = str(note_content).strip()
    doc.tag = tag
    doc.created_by_user = frappe.session.user
    doc.created_on = now_datetime()
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return {
        "success": True,
        "note": {
            "name": doc.name,
            "note_content": doc.note_content,
            "tag": doc.tag,
            "created_by_user": doc.created_by_user,
            "created_on": str(doc.created_on),
        },
    }


@frappe.whitelist(methods=["POST"])
def update_note(note_id, note_content, tag):
    _require_admin()

    if not note_content or not str(note_content).strip():
        return {"success": False, "error": "Note content is required"}
    if tag not in ("Good", "Bad", "Neutral"):
        return {"success": False, "error": "Tag must be Good, Bad, or Neutral"}

    try:
        doc = frappe.get_doc("Vera Employee Note", note_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Note not found"}

    doc.note_content = str(note_content).strip()
    doc.tag = tag
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True}


@frappe.whitelist(methods=["POST"])
def delete_note(note_id):
    _require_admin()

    try:
        frappe.delete_doc("Vera Employee Note", note_id, ignore_permissions=True)
        frappe.db.commit()
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Note not found"}

    return {"success": True}
