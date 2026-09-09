"""
CRM pipeline — Enquiries and Opportunities (Phase 2 spec §3).

The full chain is Lead → Enquiry → Opportunity → Quotation → Won/Lost. Leads
and Quotations already exist (hr_client.api.crm); this module adds the two
middle stages as functional systems and the conversions that link them, so the
chain is traceable end to end. Every record here is ERP-native.

List endpoints return the ModulePayload envelope the SystemPage archetype
renders (kpis / columns / rows / note).
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

_ENQUIRY_FIELDS = (
    "enquiry_title", "company_name", "contact_person", "phone", "email",
    "scope", "rooms", "budget_band", "timeline", "site_address",
    "assigned_to", "notes",
)
_OPPORTUNITY_FIELDS = (
    "opportunity_title", "company_name", "contact_person", "phone", "email",
    "stage", "estimated_value", "probability", "expected_close", "competitor",
    "assigned_to", "notes", "quotation",
)

_OPP_STAGES = ["Qualification", "Proposal", "Negotiation", "Won", "Lost"]


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


def _inr(amount) -> str:
    n = frappe.utils.flt(amount)
    whole, frac = f"{abs(n):.2f}".split(".")
    if len(whole) > 3:
        import re as _re
        head, tail = whole[:-3], whole[-3:]
        head = _re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        whole = f"{head},{tail}"
    return f"{'-' if n < 0 else ''}₹{whole}.{frac}"


# ══════════════════════════════════════════════════════════════════════════════
# ENQUIRIES
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_enquiries_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera CRM Enquiry",
        fields=[
            "name", "enquiry_title", "company_name", "budget_band", "timeline",
            "status", "created_opportunity", "source",
        ],
        order_by="modified desc",
    )
    by_status = {}
    for r in rows_raw:
        by_status[r.status] = by_status.get(r.status, 0) + 1

    rows = [{
        "name": r.name,
        "enquiry_title": r.enquiry_title,
        "company_name": r.company_name or "—",
        "budget_band": r.budget_band or "—",
        "status": r.status,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Enquiries", "value": str(len(rows_raw))},
            {"label": "Open", "value": str(by_status.get("Open", 0)), "tone": "warn"},
            {"label": "Qualified", "value": str(by_status.get("Qualified", 0)), "tone": "good"},
            {"label": "Converted", "value": str(by_status.get("Converted", 0)), "tone": "good"},
        ],
        "columns": [
            {"key": "enquiry_title", "header": "Enquiry"},
            {"key": "company_name", "header": "Client"},
            {"key": "budget_band", "header": "Budget"},
            {"key": "source", "header": "Source", "kind": "status"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Qualified requirements. Convert an enquiry to an opportunity "
                "to move it into the pipeline.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_enquiry(payload, source_lead: str = None):
    require_login()
    data = _clean(payload, _ENQUIRY_FIELDS)
    if not data.get("enquiry_title"):
        frappe.throw("An enquiry title is required.")
    doc = frappe.new_doc("Vera CRM Enquiry")
    doc.update(data)
    if source_lead:
        doc.source_lead = source_lead
    if not doc.assigned_to:
        doc.assigned_to = frappe.session.user
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def convert_enquiry_to_opportunity(name: str):
    """Create an Opportunity from an Enquiry and link them permanently."""
    require_login()
    enq = frappe.get_doc("Vera CRM Enquiry", name)
    if enq.created_opportunity:
        frappe.throw("This enquiry has already been converted.")

    opp = frappe.new_doc("Vera CRM Opportunity")
    opp.opportunity_title = enq.enquiry_title
    opp.company_name = enq.company_name
    opp.contact_person = enq.contact_person
    opp.phone = enq.phone
    opp.email = enq.email
    opp.assigned_to = enq.assigned_to or frappe.session.user
    opp.source_enquiry = enq.name
    opp.stage = "Qualification"
    opp.notes = enq.scope
    opp.insert(ignore_permissions=True)

    enq.created_opportunity = opp.name
    enq.status = "Converted"
    enq.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "opportunity": opp.name}


# ══════════════════════════════════════════════════════════════════════════════
# OPPORTUNITIES
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_opportunities_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera CRM Opportunity",
        fields=[
            "name", "opportunity_title", "company_name", "stage",
            "estimated_value", "probability", "expected_close", "source",
        ],
        order_by="modified desc",
    )
    open_stages = {"Qualification", "Proposal", "Negotiation"}
    open_rows = [r for r in rows_raw if r.stage in open_stages]
    won = [r for r in rows_raw if r.stage == "Won"]
    pipeline_value = sum(frappe.utils.flt(r.estimated_value) for r in open_rows)
    won_value = sum(frappe.utils.flt(r.estimated_value) for r in won)

    rows = [{
        "name": r.name,
        "opportunity_title": r.opportunity_title,
        "company_name": r.company_name or "—",
        "stage": r.stage,
        "estimated_value": _inr(r.estimated_value),
        "probability": f"{frappe.utils.flt(r.probability):.0f}%",
        "expected_close": r.expected_close,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Open", "value": str(len(open_rows))},
            {"label": "Pipeline Value", "value": _inr(pipeline_value)},
            {"label": "Won", "value": str(len(won)), "tone": "good"},
            {"label": "Won Value", "value": _inr(won_value), "tone": "good"},
        ],
        "columns": [
            {"key": "opportunity_title", "header": "Opportunity"},
            {"key": "company_name", "header": "Client"},
            {"key": "stage", "header": "Stage", "kind": "status"},
            {"key": "estimated_value", "header": "Est. Value", "align": "right", "kind": "amount"},
            {"key": "probability", "header": "Prob.", "align": "right"},
            {"key": "expected_close", "header": "Expected Close", "kind": "date"},
        ],
        "rows": rows,
        "note": "The pipeline. Marking an opportunity Won triggers the project "
                "handover (spec §5, coming next).",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_opportunity(payload):
    require_login()
    data = _clean(payload, _OPPORTUNITY_FIELDS)
    if not data.get("opportunity_title"):
        frappe.throw("An opportunity title is required.")
    doc = frappe.new_doc("Vera CRM Opportunity")
    doc.update(data)
    if not doc.assigned_to:
        doc.assigned_to = frappe.session.user
    if not doc.stage:
        doc.stage = "Qualification"
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_opportunity_stage(name: str, stage: str, loss_reason: str = None):
    """Move an opportunity's stage. Lost requires a reason; Won is the §5
    handover trigger (handover build is a later increment)."""
    require_login()
    if stage not in _OPP_STAGES:
        frappe.throw(f"Unknown stage: {stage}")
    if stage == "Lost" and not loss_reason:
        frappe.throw("A loss reason is required to mark an opportunity Lost.")
    doc = frappe.get_doc("Vera CRM Opportunity", name)
    doc.stage = stage
    if stage == "Lost":
        doc.loss_reason = loss_reason
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "stage": doc.stage}
