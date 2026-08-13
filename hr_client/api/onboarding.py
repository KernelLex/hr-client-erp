# hr_client/api/onboarding.py
# ---------------------------------------------------------------------------
# Onboarding system — the admin onboards a new hire end-to-end. Native Employee
# Onboarding is anchored to the recruitment chain (Job Applicant → Job Offer),
# so a single "Onboard New Hire" action provisions those precursor records and
# the onboarding checklist, then tracks it Pending → In Process → Completed.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import getdate, nowdate

from hr_client.api.utils import require_admin, handle_api_error, COMPANY_NAME

BOARDING_STATUS = ["Pending", "In Process", "Completed"]


@frappe.whitelist()
@handle_api_error
def get_onboardings():
    require_admin()
    obs = frappe.get_all(
        "Employee Onboarding",
        filters={"docstatus": ["<", 2]},
        fields=["name", "employee_name", "designation", "department", "date_of_joining", "boarding_status"],
        order_by="date_of_joining desc",
        limit_page_length=200,
    )
    rows = []
    for o in obs:
        dept = (o.department or "").replace(" - V", "").replace(" - SL", "").replace(" - HM", "")
        rows.append(
            {
                "id": o.name,
                "new_hire": o.employee_name or "—",
                "designation": o.designation or "—",
                "department": dept or "—",
                "joining": str(o.date_of_joining) if o.date_of_joining else "—",
                "status": o.boarding_status or "Pending",
            }
        )
    in_process = len([r for r in rows if r["status"] == "In Process"])
    completed = len([r for r in rows if r["status"] == "Completed"])
    kpis = [
        {"label": "Onboardings", "value": str(len(rows))},
        {"label": "In Process", "value": str(in_process), "tone": "warn" if in_process else ""},
        {"label": "Completed", "value": str(completed), "tone": "good"},
        {"label": "Pending", "value": str(len([r for r in rows if r["status"] == "Pending"])), "tone": "bad"},
    ]
    columns = [
        {"key": "new_hire", "header": "New Hire"},
        {"key": "designation", "header": "Designation"},
        {"key": "department", "header": "Department"},
        {"key": "joining", "header": "Joining", "kind": "date"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Onboarding — bring new hires on board. Each onboarding runs a checklist from offer to first day; track it through to completion.",
    }


@frappe.whitelist()
@handle_api_error
def get_designation_options():
    require_admin()
    rows = frappe.get_all("Designation", fields=["name"], order_by="name asc")
    return {"options": [{"value": r.name, "label": r.name} for r in rows]}


@frappe.whitelist()
@handle_api_error
def get_department_options():
    require_admin()
    rows = frappe.get_all("Department", filters={"company": COMPANY_NAME, "is_group": 0}, fields=["name", "department_name"], order_by="department_name asc")
    return {"options": [{"value": r.name, "label": r.department_name or r.name} for r in rows]}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def onboard_new_hire(applicant_name, email, designation, date_of_joining, department=None):
    """Provision Job Applicant + Job Offer + Employee Onboarding for a new hire."""
    require_admin()
    if not (applicant_name and email and designation and date_of_joining):
        frappe.throw("Name, email, designation and joining date are required")

    company = COMPANY_NAME
    doj = getdate(date_of_joining)

    # Recruitment / onboarding DocTypes require HR create rights; the caller is
    # already gated by require_admin(), so elevate to Administrator for the chain.
    original_user = frappe.session.user
    frappe.set_user("Administrator")
    try:
        return _create_onboarding_chain(applicant_name, email, designation, department, company, doj)
    finally:
        frappe.set_user(original_user)


def _create_onboarding_chain(applicant_name, email, designation, department, company, doj):
    # 1. Job Applicant
    ja = frappe.get_doc(
        {
            "doctype": "Job Applicant",
            "applicant_name": applicant_name,
            "email_id": email,
            "designation": designation,
            "status": "Accepted",
        }
    )
    ja.insert(ignore_permissions=True)

    # 2. Job Offer
    jo = frappe.get_doc(
        {
            "doctype": "Job Offer",
            "job_applicant": ja.name,
            "applicant_name": applicant_name,
            "offer_date": nowdate(),
            "designation": designation,
            "company": company,
            "status": "Accepted",
        }
    )
    jo.insert(ignore_permissions=True)

    # 3. Employee Onboarding
    ob = frappe.get_doc(
        {
            "doctype": "Employee Onboarding",
            "job_applicant": ja.name,
            "job_offer": jo.name,
            "company": company,
            "employee_name": applicant_name,
            "designation": designation,
            "department": department or None,
            "date_of_joining": doj,
            "boarding_begins_on": doj,
            "boarding_status": "Pending",
        }
    )
    ob.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": ob.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_status(name, status):
    require_admin()
    if status not in BOARDING_STATUS:
        frappe.throw("Invalid status")
    frappe.db.set_value("Employee Onboarding", name, "boarding_status", status)
    frappe.db.commit()
    return {"success": True}
