"""
Project Control Screen (UI spec §5) — a single management view that ties a
customer project together, anchored on the Vera CRM Opportunity. For a given
opportunity it rolls up the latest revision + status + value of each document in
the six-stage chain (Measurement → BOQ → Cost Sheet → Quotation → Sales Order),
so the team sees where the project stands without opening five docs.

Read-only aggregation over existing data — no new DocType, no schema change. All
queries are company-scoped through the same kernel the rest of the studio uses.
"""

import frappe

from hr_client.api.utils import (
    require_login, handle_api_error, current_company, scoped, ALL_COMPANIES,
)


def _flt(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _latest(doctype: str, opp: str, extra_fields: list, value_field: str = None,
            revisioned: bool = True):
    """Return the head-of-chain (latest, non-superseded) doc linked to `opp`,
    plus how many revisions exist. `None` when the stage hasn't started."""
    base = ["name", "status", "creation"]
    if revisioned:
        base += ["revision", "supersedes"]
    fields = base + [f for f in extra_fields if f not in base]
    order = "revision desc, creation desc" if revisioned else "creation desc"
    rows = frappe.get_all(doctype, filters=scoped({"opportunity": opp}),
                          fields=fields, order_by=order)
    if not rows:
        return None
    if revisioned:
        superseded = {r.get("supersedes") for r in rows if r.get("supersedes")}
        head = next((r for r in rows if r.name not in superseded), rows[0])
    else:
        head = rows[0]
    out = {
        "name": head.name,
        "status": head.get("status"),
        "revision": head.get("revision"),
        "count": len(rows),
        "value": _flt(head.get(value_field)) if value_field else None,
    }
    for f in extra_fields:
        if f not in out:
            out[f] = head.get(f)
    return out


@frappe.whitelist()
@handle_api_error
def get_project_overview(opportunity: str):
    """Roll up the full document chain for one opportunity (§5)."""
    require_login()
    opp = frappe.get_doc("Vera CRM Opportunity", opportunity)
    # Company scope: an opportunity outside the active company is not visible.
    company = current_company()
    if company != ALL_COMPANIES and (opp.get("company") or company) != company:
        frappe.throw("This project belongs to another company.")

    stages = {
        "measurement": _latest("Vera Measurement Sheet", opportunity, []),
        "boq": _latest("Vera BOQ", opportunity, [], "total_selling"),
        "cost_sheet": _latest("Vera Cost Sheet", opportunity,
                              ["projected_gp_percent"], "selling_total"),
        "quotation": _latest("Vera Sales Quotation", opportunity,
                             ["required_authority", "sales_order"], "grand_total"),
        "sales_order": _latest("Vera Sales Order", opportunity, [], "grand_total",
                               revisioned=False),
    }
    # Confirmed value = the sales order's grand total; else the latest quotation's.
    confirmed = (stages["sales_order"] or {}).get("value")
    quoted = (stages["quotation"] or {}).get("value")
    return {
        "opportunity": {
            "name": opp.name,
            "title": opp.opportunity_title,
            "customer": opp.company_name,
            "contact_person": opp.contact_person,
            "phone": opp.phone,
            "email": opp.email,
            "stage": opp.stage,
            "estimated_value": _flt(opp.estimated_value),
            "assigned_to": opp.assigned_to,
        },
        "stages": stages,
        "quoted_value": quoted,
        "confirmed_value": confirmed,
    }


def _inr(v):
    return "₹" + frappe.utils.fmt_money(_flt(v), currency="INR")


@frappe.whitelist()
@handle_api_error
def list_projects():
    """List opportunities as project rows for the control-screen picker (§5),
    newest first — returns the studio ArchetypePage payload (kpis/columns/rows)."""
    require_login()
    rows_raw = frappe.get_all(
        "Vera CRM Opportunity", filters=scoped({}),
        fields=["name", "opportunity_title", "company_name", "stage",
                "estimated_value", "quotation", "expected_close"],
        order_by="modified desc", limit_page_length=200)
    open_stages = {"Qualification", "Proposal", "Negotiation"}
    won = [r for r in rows_raw if r.stage == "Won"]
    won_value = sum(_flt(r.estimated_value) for r in won)
    rows = [{
        "name": r.name,
        "opportunity_title": r.opportunity_title,
        "company_name": r.company_name or "—",
        "stage": r.stage,
        "estimated_value": _inr(r.estimated_value),
        "has_quotation": "Yes" if r.quotation else "—",
        "expected_close": r.expected_close,
    } for r in rows_raw]
    return {
        "kpis": [
            {"label": "Projects", "value": str(len(rows_raw))},
            {"label": "Active", "value": str(len([r for r in rows_raw if r.stage in open_stages]))},
            {"label": "Won", "value": str(len(won)), "tone": "good"},
            {"label": "Won Value", "value": _inr(won_value), "tone": "good"},
        ],
        "columns": [
            {"key": "opportunity_title", "header": "Project"},
            {"key": "company_name", "header": "Client"},
            {"key": "stage", "header": "Stage", "kind": "status"},
            {"key": "estimated_value", "header": "Est. Value", "align": "right", "kind": "amount"},
            {"key": "has_quotation", "header": "Quoted"},
            {"key": "expected_close", "header": "Expected Close", "kind": "date"},
        ],
        "rows": rows,
        "note": "Every project, anchored on its opportunity. Open one to see the "
                "Measurement → BOQ → Cost Sheet → Quotation → Sales Order chain.",
    }
