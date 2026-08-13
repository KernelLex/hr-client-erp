# hr_client/api/hrms_masters.py
# ---------------------------------------------------------------------------
# HRMS master-data screens (Departments, Designations) for the People & Work
# workspace. Reads native ERPNext / Frappe-HRMS master DocTypes and returns a
# uniform "archetype envelope" — { kpis, columns, rows, note } — so a single
# generic React page can render every HRMS screen the same way the reference
# mockup (SL_ERP_UI_v2.html) does.
# ---------------------------------------------------------------------------
import frappe

from hr_client.api.utils import require_login, handle_api_error, COMPANY_NAME


def _envelope(kpis, columns, rows, note):
    """Uniform payload consumed by the frontend ArchetypePage."""
    return {"kpis": kpis, "columns": columns, "rows": rows, "note": note}


@frappe.whitelist()
@handle_api_error
def get_departments():
    """Departments master — one row per (non-group) department with live headcount."""
    require_login()

    depts = frappe.get_all(
        "Department",
        filters={"company": COMPANY_NAME, "is_group": 0},
        fields=["name", "department_name", "parent_department"],
        order_by="department_name asc",
    )

    rows = []
    for d in depts:
        headcount = frappe.db.count(
            "Employee", {"department": d.name, "status": "Active"}
        )
        rows.append(
            {
                "code": d.name,
                "department": d.department_name or d.name,
                "parent": d.parent_department or "—",
                "headcount": headcount,
                "status": "Active",
            }
        )

    total = sum(r["headcount"] for r in rows)
    largest = max(rows, key=lambda r: r["headcount"])["department"] if rows else "—"

    kpis = [
        {"label": "Departments", "value": str(len(rows))},
        {"label": "Total Headcount", "value": str(total)},
        {"label": "Company", "value": COMPANY_NAME},
        {"label": "Largest", "value": largest},
    ]
    columns = [
        {"key": "code", "header": "Code"},
        {"key": "department", "header": "Department"},
        {"key": "parent", "header": "Parent"},
        {"key": "headcount", "header": "Headcount", "align": "right", "kind": "number"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    note = (
        "Departments — the single source of truth. Editing a department here "
        "updates every employee, payroll and approval that references it."
    )
    return _envelope(kpis, columns, rows, note)


@frappe.whitelist()
@handle_api_error
def get_designations():
    """Designations master — one row per designation with live headcount."""
    require_login()

    desigs = frappe.get_all(
        "Designation",
        fields=["name", "designation_name"],
        order_by="designation_name asc",
    )

    rows = []
    for d in desigs:
        headcount = frappe.db.count(
            "Employee", {"designation": d.name, "status": "Active"}
        )
        # Only surface designations that are actually in use, plus the curated
        # Vera roles (which always have headcount ≥ 0). Skip the long tail of
        # unused ERPNext defaults so the screen stays relevant.
        rows.append(
            {
                "code": d.name,
                "designation": d.designation_name or d.name,
                "headcount": headcount,
                "status": "Active",
            }
        )

    # Sort in-use designations first, then alphabetical.
    rows.sort(key=lambda r: (-r["headcount"], r["designation"].lower()))
    in_use = [r for r in rows if r["headcount"] > 0]

    kpis = [
        {"label": "Designations", "value": str(len(rows))},
        {"label": "In Use", "value": str(len(in_use)), "tone": "good"},
        {"label": "Assigned Staff", "value": str(sum(r["headcount"] for r in rows))},
        {"label": "Company", "value": COMPANY_NAME},
    ]
    columns = [
        {"key": "code", "header": "Code"},
        {"key": "designation", "header": "Designation"},
        {"key": "headcount", "header": "Headcount", "align": "right", "kind": "number"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    note = (
        "Designations — the roles staff are hired into. Referenced by recruitment, "
        "payroll salary structures and the org chart."
    )
    return _envelope(kpis, columns, rows, note)
