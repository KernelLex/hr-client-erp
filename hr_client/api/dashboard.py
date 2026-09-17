import frappe
from frappe.utils import today, get_first_day, pretty_date

from hr_client.api.utils import current_company, ALL_COMPANIES


@frappe.whitelist()
def get_dashboard_stats():
    """
    Returns live stats and recent activity for the dashboard.
    """
    frappe.has_permission("Job Opening", ptype="read", throw=True)

    first_day_of_month = get_first_day(today())

    # Scope the company-bearing HR counts to the active company (Employee and Job
    # Opening carry a native `company` field). Job Applicant/Interview have no
    # company field in HRMS, so their recent-activity lists are left unscoped.
    _co = current_company()
    _emp_f = {"status": "Active"}
    _job_f = {"status": "Open"}
    if _co != ALL_COMPANIES:
        _emp_f["company"] = _co
        _job_f["company"] = _co

    total_employees = frappe.db.count("Employee", _emp_f)
    open_positions = frappe.db.count("Job Opening", _job_f)
    candidates_this_month = frappe.db.count(
        "Job Applicant", {"creation": [">=", first_day_of_month]}
    )
    interviews_today = frappe.db.count("Interview", {"scheduled_on": today()})

    # Recent activity — latest Job Applicants + Interviews
    recent = []

    applicants = frappe.get_all(
        "Job Applicant",
        fields=["applicant_name", "job_title", "creation"],
        order_by="creation desc",
        limit=5,
    )
    for a in applicants:
        recent.append({
            "type": "candidate",
            "action": "New candidate added",
            "detail": f"{a.applicant_name} applied for {a.job_title}",
            "time": str(a.creation),
            "dot": "blue",
        })

    interviews = frappe.get_all(
        "Interview",
        fields=["job_applicant", "interview_round", "creation"],
        order_by="creation desc",
        limit=5,
    )
    for i in interviews:
        recent.append({
            "type": "interview",
            "action": "Interview scheduled",
            "detail": f"{i.job_applicant} — {i.interview_round}",
            "time": str(i.creation),
            "dot": "violet",
        })

    offers = frappe.get_all(
        "Job Offer",
        fields=["job_applicant", "designation", "status", "creation"],
        order_by="creation desc",
        limit=3,
    )
    for o in offers:
        recent.append({
            "type": "offer",
            "action": f"Offer {o.status.lower()}",
            "detail": f"{o.job_applicant} — {o.designation}",
            "time": str(o.creation),
            "dot": "emerald" if o.status == "Accepted" else "gray",
        })

    recent.sort(key=lambda x: x["time"], reverse=True)

    for r in recent[:8]:
        r["time"] = pretty_date(r["time"])

    return {
        "stats": {
            "total_employees": total_employees,
            "open_positions": open_positions,
            "candidates_this_month": candidates_this_month,
            "interviews_today": interviews_today,
        },
        "recent_activity": recent[:8],
    }
