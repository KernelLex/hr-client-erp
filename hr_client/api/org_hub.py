"""
Org Hub API — whitelisted endpoints for the Organisation Hub React page.
Includes get_* endpoints for admin and employee views, plus CRUD for admin.
"""
import frappe
from hr_client.api.utils import handle_api_error

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}

_ALLOWED_DOCTYPES = {
    "VE Job Description", "VE KRA", "VE KPI", "VE SOP", "VE Policy",
    "VE Employee Handbook", "VE Operations Manual", "VE Department Process",
    "VE Forms Checklist"
}


def _require_admin():
    if frappe.session.user not in _ADMIN_USERS:
        frappe.throw("Admin access required", frappe.PermissionError)


# ─── Admin read endpoints ─────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_job_descriptions(company=None, department=None, designation=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    if designation:
        filters["designation"] = designation
    return frappe.get_all(
        "VE Job Description",
        filters=filters,
        fields=["name", "company", "department", "designation", "reports_to",
                "purpose", "responsibilities", "qualifications", "competencies", "effective_date"],
        order_by="company asc, department asc, designation asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_kras(company=None, department=None, designation=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    if designation:
        filters["designation"] = designation
    return frappe.get_all(
        "VE KRA",
        filters=filters,
        fields=["name", "company", "department", "designation", "kra_title",
                "description", "weightage", "measurement_criteria", "target", "frequency"],
        order_by="company asc, department asc, designation asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_kpis(company=None, department=None, designation=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    if designation:
        filters["designation"] = designation
    return frappe.get_all(
        "VE KPI",
        filters=filters,
        fields=["name", "company", "department", "designation", "kpi_name",
                "unit", "target_value", "frequency", "data_source"],
        order_by="company asc, department asc, designation asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_sops(company=None, department=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    return frappe.get_all(
        "VE SOP",
        filters=filters,
        fields=["name", "company", "department", "sop_code", "sop_title",
                "purpose", "scope", "procedure", "responsible_role", "version", "effective_date"],
        order_by="company asc, sop_code asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_policies(company=None):
    filters = {}
    if company:
        filters["company"] = company
    return frappe.get_all(
        "VE Policy",
        filters=filters,
        fields=["name", "company", "policy_name", "policy_category", "content", "version", "effective_date"],
        order_by="company asc, policy_category asc, policy_name asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_handbook(company=None):
    filters = {}
    if company:
        filters["company"] = company
    return frappe.get_all(
        "VE Employee Handbook",
        filters=filters,
        fields=["name", "company", "section_order", "section_title", "content"],
        order_by="company asc, section_order asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_operations_manual(company=None, department=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    return frappe.get_all(
        "VE Operations Manual",
        filters=filters,
        fields=["name", "company", "department", "section_title", "content"],
        order_by="company asc, department asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_processes(company=None, department=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    return frappe.get_all(
        "VE Department Process",
        filters=filters,
        fields=["name", "company", "department", "process_name", "trigger_event",
                "steps", "responsible_roles", "tools_used"],
        order_by="company asc, department asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_forms_checklists(company=None, department=None):
    filters = {}
    if company:
        filters["company"] = company
    if department:
        filters["department"] = department
    return frappe.get_all(
        "VE Forms Checklist",
        filters=filters,
        fields=["name", "company", "department", "form_title", "form_type", "instructions", "items"],
        order_by="company asc, department asc, form_type asc",
        ignore_permissions=True,
    )


@frappe.whitelist()
@handle_api_error
def get_org_hub_summary():
    """Returns counts of all org hub documents grouped by company."""
    _require_admin()
    result = {}
    doctypes = {
        "job_descriptions": "VE Job Description",
        "kras": "VE KRA",
        "kpis": "VE KPI",
        "sops": "VE SOP",
        "policies": "VE Policy",
        "handbook": "VE Employee Handbook",
        "operations_manual": "VE Operations Manual",
        "processes": "VE Department Process",
        "forms_checklists": "VE Forms Checklist",
    }
    companies = ["Vera Enterprises", "Schones Leben", "Hagan Modular"]
    for co in companies:
        result[co] = {}
        for key, dt in doctypes.items():
            try:
                count = frappe.db.count(dt, filters={"company": co})
            except Exception:
                count = 0
            result[co][key] = count
    return result


# ─── Admin CRUD endpoints ─────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_org_doc(doctype, fields_json):
    _require_admin()
    import json
    if doctype not in _ALLOWED_DOCTYPES:
        frappe.throw("Invalid doctype")
    fields = json.loads(fields_json) if isinstance(fields_json, str) else fields_json
    doc = frappe.new_doc(doctype)
    for k, v in fields.items():
        if hasattr(doc, k):
            setattr(doc, k, v)
    doc.flags.ignore_mandatory = True
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_org_doc(doctype, name, fields_json):
    _require_admin()
    import json
    if doctype not in _ALLOWED_DOCTYPES:
        frappe.throw("Invalid doctype")
    fields = json.loads(fields_json) if isinstance(fields_json, str) else fields_json
    doc = frappe.get_doc(doctype, name)
    for k, v in fields.items():
        if hasattr(doc, k):
            setattr(doc, k, v)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_org_doc(doctype, name):
    _require_admin()
    if doctype not in _ALLOWED_DOCTYPES:
        frappe.throw("Invalid doctype")
    frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
    frappe.db.commit()
    return {"success": True}


# ─── Employee-facing endpoint ─────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_my_org_docs():
    """Employee-facing: returns Org Hub docs relevant to calling user's company/dept/designation."""
    user = frappe.session.user
    is_admin = user in _ADMIN_USERS

    emp = (
        frappe.db.get_value("Employee", {"user_id": user, "status": "Active"},
            ["company", "department", "designation"], as_dict=True) or
        frappe.db.get_value("Employee", {"company_email": user, "status": "Active"},
            ["company", "department", "designation"], as_dict=True)
    )

    if not emp and not is_admin:
        return {"error": "No active employee record found"}

    company = emp.get("company") if emp else "Vera Enterprises"
    department = emp.get("department") if emp else None
    designation = emp.get("designation") if emp else None

    def fetch(doctype, extra_filter=None):
        filters = {}
        if not is_admin and company:
            filters["company"] = company
        meta = frappe.get_meta(doctype)
        if not is_admin and department and meta.has_field("department"):
            filters["department"] = department
        if extra_filter:
            filters.update(extra_filter)
        try:
            return frappe.get_all(doctype, filters=filters, fields=["*"],
                order_by="creation asc", ignore_permissions=True)
        except Exception:
            return []

    desig_filter = {"designation": designation} if designation else {}

    return {
        "employee": {"company": company, "department": department, "designation": designation},
        "job_descriptions": fetch("VE Job Description", desig_filter),
        "kras": fetch("VE KRA", desig_filter),
        "kpis": fetch("VE KPI", desig_filter),
        "sops": fetch("VE SOP"),
        "policies": fetch("VE Policy"),
        "handbook": fetch("VE Employee Handbook"),
        "operations_manual": fetch("VE Operations Manual"),
        "processes": fetch("VE Department Process"),
        "forms_checklists": fetch("VE Forms Checklist"),
    }


@frappe.whitelist()
@handle_api_error
def get_all_for_company(company):
    """Admin: get all Org Hub docs for a specific company across all departments."""
    _require_admin()
    result = {}
    for dt in _ALLOWED_DOCTYPES:
        meta = frappe.get_meta(dt)
        filters = {"company": company} if meta.has_field("company") else {}
        try:
            result[dt] = frappe.get_all(dt, filters=filters, fields=["*"],
                order_by="creation asc", ignore_permissions=True)
        except Exception:
            result[dt] = []
    return result
