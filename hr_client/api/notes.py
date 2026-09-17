import frappe
from frappe.utils import now_datetime

from hr_client.api.utils import current_company, ALL_COMPANIES, scoped, require_company

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in", "amoghspace@gmail.com"}


def _emp_company(emp_name):
    return frappe.db.get_value("Employee", emp_name, "company") or current_company()


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

    # Multi-company: only expose notes for an employee in a company the admin can
    # access — raises PermissionError if the employee is out of scope.
    require_company(_emp_company(emp_name))

    notes = frappe.get_all(
        "Vera Employee Note",
        filters=scoped({"employee": emp_name}, _emp_company(emp_name)),
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
    doc.company = _emp_company(emp_name)
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
    _cc = current_company()
    if _cc != ALL_COMPANIES and doc.get("company") and doc.company != _cc:
        return {"success": False, "error": "Not permitted for this company"}

    doc.note_content = str(note_content).strip()
    doc.tag = tag
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True}


@frappe.whitelist(methods=["POST"])
def delete_note(note_id):
    _require_admin()

    _cc = current_company()
    if _cc != ALL_COMPANIES:
        _nc = frappe.db.get_value("Vera Employee Note", note_id, "company")
        if _nc and _nc != _cc:
            return {"success": False, "error": "Not permitted for this company"}
    try:
        frappe.delete_doc("Vera Employee Note", note_id, ignore_permissions=True)
        frappe.db.commit()
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Note not found"}

    return {"success": True}


# ── Notes system (company-wide feed) ─────────────────────────────────────────
@frappe.whitelist()
def get_all_notes():
    """Company-wide employee-notes feed as the uniform archetype envelope."""
    _require_admin()

    notes = frappe.get_all(
        "Vera Employee Note",
        filters=scoped({}),
        fields=["name", "employee", "employee_name", "note_content", "tag", "created_by_user", "created_on"],
        order_by="created_on desc",
        limit_page_length=300,
    )
    rows = []
    for n in notes:
        rows.append(
            {
                "id": n.name,
                "employee": n.employee_name or n.employee or "—",
                "note": (n.note_content or "").strip()[:160],
                "tag": n.tag or "Neutral",
                "author": n.created_by_user or "—",
                "created": str(n.created_on)[:16] if n.created_on else "—",
            }
        )

    good = len([r for r in rows if r["tag"] == "Good"])
    bad = len([r for r in rows if r["tag"] == "Bad"])
    kpis = [
        {"label": "Total Notes", "value": str(len(rows))},
        {"label": "Positive", "value": str(good), "tone": "good"},
        {"label": "Concerns", "value": str(bad), "tone": "bad" if bad else ""},
        {"label": "Employees Noted", "value": str(len({r["employee"] for r in rows}))},
    ]
    columns = [
        {"key": "employee", "header": "Employee"},
        {"key": "note", "header": "Note"},
        {"key": "tag", "header": "Tag", "align": "center", "kind": "status"},
        {"key": "author", "header": "By"},
        {"key": "created", "header": "When", "kind": "date"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Notes — a running log of observations on the team. Tag each note Good, Bad or Neutral; they surface on the employee's profile.",
    }


@frappe.whitelist(methods=["POST"])
def create_note(employee, note_content, tag):
    """Create an employee note directly by Employee id (covers staff without a login)."""
    _require_admin()

    if not note_content or not str(note_content).strip():
        frappe.throw("Note content is required")
    if tag not in ("Good", "Bad", "Neutral"):
        frappe.throw("Tag must be Good, Bad, or Neutral")
    if not frappe.db.exists("Employee", employee):
        frappe.throw("Unknown employee")

    doc = frappe.new_doc("Vera Employee Note")
    doc.company = _emp_company(employee)
    doc.employee = employee
    doc.note_content = str(note_content).strip()
    doc.tag = tag
    doc.created_by_user = frappe.session.user
    doc.created_on = now_datetime()
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist()
def get_employee_options():
    """All non-left employees as {value: id, label: name} for note/shift pickers."""
    _require_admin()
    _f = {"status": ["!=", "Left"]}
    _cc = current_company()
    if _cc != ALL_COMPANIES:
        _f["company"] = _cc
    rows = frappe.get_all(
        "Employee",
        filters=_f,
        fields=["name", "employee_name", "company"],
        order_by="employee_name asc",
    )
    return {"options": [{"value": r.name, "label": f"{r.employee_name}"} for r in rows]}
