"""
Service & Warranty tickets (post-handover).

Interiors work doesn't end at handover — customers report hinge adjustments,
panel swaps, warranty claims and AMC visits. This module logs those tickets
against a project/customer and tracks them through Open → In Progress →
Resolved → Closed. Company-scoped so each brand (VE / SL / HM) sees its own.
"""

import frappe

from hr_client.api.utils import (
    require_login, handle_api_error, current_company, allowed_companies, scoped,
)

_DT = "Vera Service Ticket"
_FIELDS = ["ticket_title", "customer", "project", "company", "category", "priority",
           "status", "reported_on", "assigned_to", "description", "resolution", "resolved_on"]


def _serialize(doc):
    return {f: doc.get(f) for f in ["name"] + _FIELDS}


@frappe.whitelist()
@handle_api_error
def list_tickets(status: str = None):
    require_login()
    filters = scoped({})
    if status:
        filters["status"] = status
    rows = frappe.get_all(
        _DT, filters=filters,
        fields=["name", "ticket_title", "customer", "project", "company", "category",
                "priority", "status", "reported_on", "assigned_to"],
        order_by="reported_on desc, creation desc")
    all_rows = frappe.get_all(_DT, filters=scoped({}), fields=["status", "priority"])
    kpis = {
        "total": len(all_rows),
        "open": sum(1 for r in all_rows if r["status"] == "Open"),
        "in_progress": sum(1 for r in all_rows if r["status"] == "In Progress"),
        "resolved": sum(1 for r in all_rows if r["status"] in ("Resolved", "Closed")),
        "urgent": sum(1 for r in all_rows if r["priority"] == "Urgent" and r["status"] not in ("Resolved", "Closed")),
    }
    return {"tickets": rows, "kpis": kpis}


@frappe.whitelist()
@handle_api_error
def get_ticket(name: str):
    require_login()
    return _serialize(frappe.get_doc(_DT, name))


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_ticket(payload: str = None, **kwargs):
    require_login()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    name = data.get("name")
    if name and frappe.db.exists(_DT, name):
        doc = frappe.get_doc(_DT, name)
    else:
        doc = frappe.new_doc(_DT)
        doc.company = data.get("company") or current_company()
    for f in _FIELDS:
        if f in data:
            doc.set(f, data.get(f))
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_ticket(name: str):
    require_login()
    frappe.delete_doc(_DT, name, ignore_permissions=True)
    frappe.db.commit()
    return {"deleted": name}
