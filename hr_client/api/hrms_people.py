# hr_client/api/hrms_people.py
# ---------------------------------------------------------------------------
# HRMS "people" screens — the Employee Master roster for the People & Work
# workspace. Returns the uniform archetype envelope so the generic React page
# renders it like every other screen. Rows carry a `_email` so the frontend can
# deep-link into the existing admin employee detail page.
# ---------------------------------------------------------------------------
import frappe

from hr_client.api.utils import require_admin, handle_api_error


@frappe.whitelist()
@handle_api_error
def get_employee_master():
    """Full active-employee roster across all group companies."""
    require_admin()

    emps = frappe.get_all(
        "Employee",
        filters={"status": ["!=", "Left"]},
        fields=[
            "name",
            "employee_name",
            "designation",
            "department",
            "company",
            "employment_type",
            "company_email",
            "personal_email",
            "user_id",
            "status",
        ],
        order_by="company asc, employee_name asc",
    )

    rows = []
    companies = set()
    for e in emps:
        companies.add(e.company or "—")
        dept = (e.department or "").replace(" - V", "").replace(" - SL", "").replace(" - HM", "")
        rows.append(
            {
                "emp_id": e.name,
                "name": e.employee_name or e.name,
                "department": dept or "—",
                "designation": e.designation or "—",
                "type": e.employment_type or "—",
                "status": e.status or "Active",
                # navigation hint (not shown as a column)
                "_email": e.company_email or e.user_id or e.personal_email or "",
            }
        )

    active = [r for r in rows if r["status"] == "Active"]
    kpis = [
        {"label": "Headcount", "value": str(len(rows))},
        {"label": "Active", "value": str(len(active)), "tone": "good"},
        {"label": "Companies", "value": str(len(companies))},
        {"label": "Departments", "value": str(len({r["department"] for r in rows}))},
    ]
    columns = [
        {"key": "emp_id", "header": "Emp ID"},
        {"key": "name", "header": "Name"},
        {"key": "department", "header": "Department"},
        {"key": "designation", "header": "Designation"},
        {"key": "type", "header": "Type"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    note = (
        "Employee Master — the roster all HRMS modules read from. Attendance syncs "
        "from Jibble; payroll, leave and statutory dues flow from these records. "
        "Click a row to open the full profile."
    )
    return {"kpis": kpis, "columns": columns, "rows": rows, "note": note}
