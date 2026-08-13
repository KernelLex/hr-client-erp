# hr_client/api/appraisal.py
# ---------------------------------------------------------------------------
# Performance Appraisal system — the admin runs appraisal cycles and appraises
# employees against a standard KRA template, recording a final score. Native
# Appraisal needs an Appraisal Cycle + Template + KRAs, so those are provisioned
# automatically the first time.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import getdate, flt

from hr_client.api.utils import require_admin, handle_api_error, COMPANY_NAME

STD_TEMPLATE = "Vera Standard Appraisal"
STD_KRAS = [
    ("Quality of Work", 25),
    ("Productivity & Output", 25),
    ("Teamwork & Collaboration", 25),
    ("Punctuality & Discipline", 25),
]


def _ensure_kra(title):
    if frappe.db.exists("KRA", title):
        return title
    doc = frappe.get_doc({"doctype": "KRA", "title": title})
    doc.insert(ignore_permissions=True)
    return doc.name


def _ensure_template():
    if frappe.db.exists("Appraisal Template", STD_TEMPLATE):
        return STD_TEMPLATE
    goals = []
    for title, wt in STD_KRAS:
        _ensure_kra(title)
        goals.append({"key_result_area": title, "per_weightage": wt})
    doc = frappe.get_doc({"doctype": "Appraisal Template", "template_title": STD_TEMPLATE, "goals": goals})
    doc.insert(ignore_permissions=True)
    return doc.name


# ── Appraisal Cycles ─────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_cycles():
    require_admin()
    cycles = frappe.get_all(
        "Appraisal Cycle",
        fields=["name", "cycle_name", "start_date", "end_date", "status"],
        order_by="start_date desc",
        limit_page_length=100,
    )
    rows = []
    for c in cycles:
        n = frappe.db.count("Appraisal", {"appraisal_cycle": c.name})
        rows.append(
            {
                "id": c.name,
                "cycle": c.cycle_name or c.name,
                "period": f"{c.start_date} → {c.end_date}",
                "appraisals": n,
                "status": c.status or "Not Started",
            }
        )
    kpis = [
        {"label": "Cycles", "value": str(len(rows))},
        {"label": "In Progress", "value": str(len([r for r in rows if r["status"] == "In Progress"])), "tone": "warn"},
        {"label": "Completed", "value": str(len([r for r in rows if r["status"] == "Completed"])), "tone": "good"},
        {"label": "Appraisals", "value": str(sum(r["appraisals"] for r in rows))},
    ]
    columns = [
        {"key": "cycle", "header": "Cycle"},
        {"key": "period", "header": "Period"},
        {"key": "appraisals", "header": "Appraisals", "align": "right", "kind": "number"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Appraisal Cycles — the review periods you run (e.g. annual, half-yearly). Create a cycle, then appraise employees within it.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_cycle(cycle_name, start_date, end_date):
    require_admin()
    if not (cycle_name and start_date and end_date):
        frappe.throw("Cycle name and period are required")
    doc = frappe.get_doc(
        {
            "doctype": "Appraisal Cycle",
            "cycle_name": str(cycle_name).strip(),
            "company": COMPANY_NAME,
            "start_date": getdate(start_date),
            "end_date": getdate(end_date),
            "kra_evaluation_method": "Manual Rating",
            "status": "In Progress",
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist()
@handle_api_error
def get_cycle_options():
    require_admin()
    rows = frappe.get_all("Appraisal Cycle", fields=["name", "cycle_name"], order_by="start_date desc")
    return {"options": [{"value": r.name, "label": r.cycle_name or r.name} for r in rows]}


# ── Appraisals ───────────────────────────────────────────────────────────────
@frappe.whitelist()
@handle_api_error
def get_appraisals():
    require_admin()
    apps = frappe.get_all(
        "Appraisal",
        filters={"docstatus": ["<", 2]},
        fields=["name", "employee_name", "designation", "appraisal_cycle", "final_score", "docstatus"],
        order_by="modified desc",
        limit_page_length=300,
    )
    rows = []
    for a in apps:
        rows.append(
            {
                "id": a.name,
                "employee": a.employee_name or "—",
                "designation": a.designation or "—",
                "cycle": a.appraisal_cycle or "—",
                "score": f"{flt(a.final_score):g} / 5" if a.final_score else "—",
                "status": "Finalised" if a.docstatus == 1 else "Draft",
            }
        )
    scored = [a for a in apps if a.final_score]
    avg = round(sum(flt(a.final_score) for a in scored) / len(scored), 1) if scored else 0
    kpis = [
        {"label": "Appraisals", "value": str(len(rows))},
        {"label": "Scored", "value": str(len(scored)), "tone": "good"},
        {"label": "Pending", "value": str(len(rows) - len(scored)), "tone": "warn" if (len(rows) - len(scored)) else ""},
        {"label": "Avg Score", "value": f"{avg} / 5"},
    ]
    columns = [
        {"key": "employee", "header": "Employee"},
        {"key": "designation", "header": "Designation"},
        {"key": "cycle", "header": "Cycle"},
        {"key": "score", "header": "Score", "align": "right"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Performance Appraisals — appraise each employee against the standard KRAs (Quality, Productivity, Teamwork, Discipline) and record a score out of 5.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_appraisal(employee, appraisal_cycle):
    require_admin()
    if not (employee and appraisal_cycle):
        frappe.throw("Employee and cycle are required")
    if not frappe.db.exists("Employee", employee):
        frappe.throw("Unknown employee")
    if frappe.db.exists("Appraisal", {"employee": employee, "appraisal_cycle": appraisal_cycle, "docstatus": ["<", 2]}):
        frappe.throw("This employee already has an appraisal in that cycle")

    template = _ensure_template()
    cyc = frappe.db.get_value("Appraisal Cycle", appraisal_cycle, ["start_date", "end_date"], as_dict=True)
    doc = frappe.get_doc(
        {
            "doctype": "Appraisal",
            "employee": employee,
            "company": frappe.db.get_value("Employee", employee, "company") or COMPANY_NAME,
            "appraisal_cycle": appraisal_cycle,
            "appraisal_template": template,
            "rate_goals_manually": 1,
            "start_date": cyc.start_date if cyc else None,
            "end_date": cyc.end_date if cyc else None,
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_score(name, score):
    require_admin()
    s = flt(score)
    if s < 0 or s > 5:
        frappe.throw("Score must be between 0 and 5")
    frappe.db.set_value("Appraisal", name, "final_score", s)
    frappe.db.commit()
    return {"success": True}
