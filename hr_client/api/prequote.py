"""Pre-Quote API (spec "ERP Pre-Quote Form — Modular Interiors").

Quick requirement capture with a budgetary estimate, then one-click conversion
into a Vera CRM Opportunity that feeds the Measurement → BOQ → Cost Sheet →
Quotation chain. Company-scoped via the utils kernel.
"""

import frappe

from hr_client.api.utils import (
    company_scoped, current_company, handle_api_error, require_login, scoped,
)

_FIELDS = (
    "customer_name", "contact_person", "mobile", "email", "quotation_type",
    "project_name", "site_location", "salesperson", "architect_designer",
    "requirement_source", "product_scope", "requirement_summary",
    "finish_level", "hardware_level", "expected_budget_min", "expected_budget_max",
    "estimated_range_min", "estimated_range_max", "expected_completion", "notes",
)


def _clean(payload):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in _FIELDS if payload.get(k) is not None}


@frappe.whitelist(methods=["POST"])
@handle_api_error
@company_scoped
def create_prequote(company, payload=None, **kw):
    require_login()
    data = _clean(payload or kw)
    if not data.get("customer_name") or not data.get("mobile"):
        frappe.throw("Customer and mobile are required.")
    doc = frappe.new_doc("Vera Pre Quote")
    doc.update(data)
    doc.company = company
    doc.status = "Draft"
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "status": doc.status}


@frappe.whitelist()
@handle_api_error
@company_scoped
def get_prequotes(company, status=None):
    require_login()
    filters = scoped({}, company)
    if status:
        filters["status"] = status
    rows = frappe.get_all(
        "Vera Pre Quote", filters=filters, order_by="creation desc", limit_page_length=0,
        fields=["name", "customer_name", "quotation_type", "project_name", "mobile",
                "requirement_source", "status", "opportunity", "creation"])
    return {"prequotes": rows, "count": len(rows)}


@frappe.whitelist()
@handle_api_error
def get_prequote(name):
    require_login()
    doc = frappe.get_doc("Vera Pre Quote", name)
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
@handle_api_error
def convert_to_opportunity(name):
    """Spawn a Vera CRM Opportunity from the pre-quote and link it back."""
    require_login()
    doc = frappe.get_doc("Vera Pre Quote", name)
    if doc.opportunity:
        return {"success": True, "opportunity": doc.opportunity, "already": True}
    est = doc.estimated_range_max or doc.expected_budget_max or doc.estimated_range_min or 0
    opp = frappe.new_doc("Vera CRM Opportunity")
    opp.update({
        "opportunity_title": doc.project_name or doc.customer_name,
        "company_name": doc.customer_name,
        "contact_person": doc.contact_person,
        "phone": doc.mobile,
        "email": doc.email,
        "estimated_value": est,
        "assigned_to": doc.salesperson,
        "notes": doc.requirement_summary or doc.product_scope,
    })
    if hasattr(opp, "company"):
        opp.company = doc.company
    opp.insert(ignore_permissions=True)
    doc.db_set("opportunity", opp.name)
    doc.db_set("status", "Converted")
    frappe.db.commit()
    return {"success": True, "opportunity": opp.name, "status": "Converted"}
