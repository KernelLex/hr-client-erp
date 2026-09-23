"""
Project Execution module (improves `projects idea.txt`).

Runs a job after its quotation is accepted: a gated lifecycle (Design → … →
Handover → Closed), first-class payment milestones (received vs outstanding),
mid-project variations, a site log (discrepancy/alteration/snag), and schedulable
work cards for PMs/carpenters. See PROJECT_EXECUTION_PLAN.md for the design.

Company-aware throughout (VE / Schönes Leben / Hagan Modular).
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company,
    allowed_companies, scoped,
)

PROJECT = "Vera Project"
WORKCARD = "Vera Project Work Card"

# Ordered lifecycle per project type (the last entry is terminal).
STAGES = {
    "Interior": ["Design", "Detailing (3D)", "Production Planning", "Procurement",
                 "Manufacturing & Dispatch", "Installation", "Appliances & Finishing",
                 "Handover", "Closed"],
    "Trading": ["Confirmed", "Supplied", "Closed"],
}

# Exit criteria shown in the stage tracker (guidance, not hard gates).
EXIT_CRITERIA = {
    "Design": "2D concept approved by customer",
    "Detailing (3D)": "3D + final finishes signed off",
    "Production Planning": "Production drawings + BOQ + material sheet frozen",
    "Procurement": "VOQ raised, vendors selected, POs placed",
    "Manufacturing & Dispatch": "Goods produced + dispatched to site",
    "Installation": "Carpentry done, snags cleared, alterations done",
    "Appliances & Finishing": "Appliances fitted, final finishing done",
    "Handover": "Handover form signed, balance collected",
    "Confirmed": "Order confirmed + advance received",
    "Supplied": "Material supplied to customer",
}

# Default payment templates (percent of contract value). Overridable per project.
PAYMENT_TEMPLATES = {
    "Interior": [
        {"label": "Booking Advance", "stage": "Design", "percent": 10, "trigger": "On booking"},
        {"label": "Design / 3D Advance", "stage": "Detailing (3D)", "percent": 10, "trigger": "On 3D signoff"},
        {"label": "Order Confirmation", "stage": "Procurement", "percent": 30, "trigger": "On order confirmation"},
        {"label": "Before Dispatch", "stage": "Manufacturing & Dispatch", "percent": 40, "trigger": "Before dispatch"},
        {"label": "On Handover", "stage": "Handover", "percent": 10, "trigger": "On handover"},
    ],
    "Trading": [
        {"label": "Advance", "stage": "Confirmed", "percent": 50, "trigger": "On order"},
        {"label": "Before Supply", "stage": "Supplied", "percent": 50, "trigger": "Before dispatch"},
    ],
}


def _flt(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _seed_milestones(doc):
    tmpl = PAYMENT_TEMPLATES.get(doc.project_type, [])
    cv = _flt(doc.contract_value)
    doc.set("payment_milestones", [])
    for m in tmpl:
        doc.append("payment_milestones", {
            "label": m["label"], "stage": m["stage"], "percent": m["percent"],
            "trigger": m["trigger"], "amount": round(cv * m["percent"] / 100.0, 2),
            "status": "Pending",
        })


def _percent_complete(doc):
    order = STAGES.get(doc.project_type, STAGES["Interior"])
    try:
        idx = order.index(doc.stage)
    except ValueError:
        return 0
    return round(idx / (len(order) - 1) * 100) if len(order) > 1 else 0


def _stamp_stage(doc, stage, note=None):
    now = frappe.utils.now()
    # close the currently-open stage log
    for r in doc.get("stage_logs") or []:
        if not r.completed_on:
            r.completed_on = now
    doc.append("stage_logs", {
        "stage": stage, "entered_on": now, "entered_by": frappe.session.user,
        "notes": note or "",
    })


# ------------------------------------------------------------------ create

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_from_quotation(quotation: str):
    """Spin up a project from an accepted quotation, copying customer/company/value
    and seeding the payment milestones + first stage."""
    require_login()
    q = frappe.get_doc("Vera Sales Quotation", quotation)
    ptype = "Trading" if (q.get("quotation_type") == "Trading") else "Interior"
    doc = frappe.new_doc(PROJECT)
    doc.project_title = q.get("project_name") or q.get("customer_name") or quotation
    doc.project_type = ptype
    doc.stage = STAGES[ptype][0]
    doc.company = q.get("company") or current_company()
    doc.customer_name = q.get("customer_name")
    doc.opportunity = q.get("opportunity")
    doc.quotation = quotation
    doc.contract_value = _flt(q.get("grand_total"))
    doc.start_date = frappe.utils.today()
    _seed_milestones(doc)
    _stamp_stage(doc, doc.stage, "Project created from quotation")
    doc.percent_complete = _percent_complete(doc)
    doc.flags.ignore_permissions = True
    doc.insert()
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_project(payload: str = None, **kwargs):
    require_login()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    doc = frappe.new_doc(PROJECT)
    for f in ("project_title", "project_type", "company", "customer_name",
              "site_address", "project_manager", "ops_manager", "start_date",
              "target_completion", "contract_value", "quotation", "opportunity"):
        if f in data:
            doc.set(f, data.get(f))
    doc.project_type = doc.project_type or "Interior"
    doc.company = doc.company or current_company()
    doc.stage = STAGES[doc.project_type][0]
    _seed_milestones(doc)
    _stamp_stage(doc, doc.stage, "Project created")
    doc.percent_complete = _percent_complete(doc)
    doc.flags.ignore_permissions = True
    doc.insert()
    frappe.db.commit()
    return {"name": doc.name}


# ------------------------------------------------------------------ read

def _serialize(doc):
    order = STAGES.get(doc.project_type, STAGES["Interior"])
    try:
        idx = order.index(doc.stage)
    except ValueError:
        idx = 0
    next_stage = order[idx + 1] if idx + 1 < len(order) else None
    milestones = [{"idx": i, "label": r.label, "stage": r.stage, "percent": r.percent,
                   "amount": r.amount, "trigger": r.trigger, "status": r.status,
                   "received_amount": r.received_amount, "received_on": str(r.received_on) if r.received_on else None}
                  for i, r in enumerate(doc.get("payment_milestones") or [])]
    return {
        "name": doc.name, "project_title": doc.project_title, "project_type": doc.project_type,
        "stage": doc.stage, "status": doc.status, "company": doc.company,
        "customer_name": doc.customer_name, "opportunity": doc.opportunity,
        "quotation": doc.quotation, "sales_order": doc.sales_order,
        "site_address": doc.site_address, "project_manager": doc.project_manager,
        "ops_manager": doc.ops_manager, "start_date": str(doc.start_date) if doc.start_date else None,
        "target_completion": str(doc.target_completion) if doc.target_completion else None,
        "contract_value": doc.contract_value, "advance_received": doc.advance_received,
        "outstanding": doc.outstanding, "percent_complete": doc.percent_complete,
        "stage_order": order, "stage_index": idx, "next_stage": next_stage,
        "exit_criteria": EXIT_CRITERIA.get(doc.stage, ""),
        "payment_milestones": milestones,
        "stage_logs": [{"stage": r.stage, "entered_on": str(r.entered_on) if r.entered_on else None,
                        "completed_on": str(r.completed_on) if r.completed_on else None,
                        "entered_by": r.entered_by, "notes": r.notes}
                       for r in doc.get("stage_logs") or []],
        "site_logs": [{"idx": i, "log_date": str(r.log_date) if r.log_date else None, "log_type": r.log_type,
                       "description": r.description, "raised_by": r.raised_by,
                       "status": r.status, "resolved_on": str(r.resolved_on) if r.resolved_on else None}
                      for i, r in enumerate(doc.get("site_logs") or [])],
        "feedback_rating": doc.feedback_rating, "feedback_notes": doc.feedback_notes,
    }


@frappe.whitelist()
@handle_api_error
def get_project(name: str):
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    data = _serialize(doc)
    data["work_cards"] = frappe.get_all(
        WORKCARD, filters={"project": name},
        fields=["name", "title", "stage", "assigned_to", "scheduled_date",
                "priority", "status", "instructions", "completed_on"],
        order_by="scheduled_date asc, creation asc")
    return data


@frappe.whitelist()
@handle_api_error
def list_projects():
    require_login()
    comps = allowed_companies() or frappe.get_all("Company", pluck="name")
    rows = frappe.get_all(
        PROJECT, filters={"company": ["in", comps]},
        fields=["name", "project_title", "project_type", "stage", "status", "company",
                "customer_name", "contract_value", "advance_received", "outstanding",
                "percent_complete", "target_completion"],
        order_by="modified desc")
    active = [r for r in rows if r["status"] == "Active"]
    kpis = {
        "active": len(active),
        "pipeline_value": round(sum(_flt(r["contract_value"]) for r in active)),
        "collected": round(sum(_flt(r["advance_received"]) for r in rows)),
        "outstanding": round(sum(_flt(r["outstanding"]) for r in active)),
    }
    return {"projects": rows, "kpis": kpis}


# ------------------------------------------------------------------ workflow

@frappe.whitelist(methods=["POST"])
@handle_api_error
def advance_stage(name: str, notes: str = None):
    """Move the project to the next lifecycle stage; log it, recompute % complete,
    and mark the milestone tied to the new stage as Due."""
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    order = STAGES.get(doc.project_type, STAGES["Interior"])
    idx = order.index(doc.stage) if doc.stage in order else 0
    if idx + 1 >= len(order):
        frappe.throw("Project is already at the final stage.")
    new_stage = order[idx + 1]
    doc.stage = new_stage
    _stamp_stage(doc, new_stage, notes)
    doc.percent_complete = _percent_complete(doc)
    if new_stage == "Closed":
        doc.status = "Closed"
    for m in doc.get("payment_milestones") or []:
        if m.stage == new_stage and m.status == "Pending":
            m.status = "Due"
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_stage(name: str, stage: str, notes: str = None):
    require_admin()
    doc = frappe.get_doc(PROJECT, name)
    order = STAGES.get(doc.project_type, STAGES["Interior"])
    if stage not in order:
        frappe.throw(f"'{stage}' is not a valid stage for a {doc.project_type} project.")
    doc.stage = stage
    _stamp_stage(doc, stage, notes or "Stage set manually")
    doc.percent_complete = _percent_complete(doc)
    doc.status = "Closed" if stage == "Closed" else doc.status
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def record_payment(name: str, idx: int, amount=None, received_on: str = None):
    """Mark a payment milestone received (amount defaults to its scheduled amount)."""
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    rows = doc.get("payment_milestones") or []
    i = int(idx)
    if i < 0 or i >= len(rows):
        frappe.throw("Invalid milestone.")
    m = rows[i]
    m.received_amount = _flt(amount) if amount not in (None, "") else _flt(m.amount)
    m.received_on = received_on or frappe.utils.today()
    m.status = "Received"
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_milestones(name: str, milestones: str = None):
    """Overwrite the payment schedule (admin edits the milestone grid)."""
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    rows = frappe.parse_json(milestones) if milestones else []
    cv = _flt(doc.contract_value)
    doc.set("payment_milestones", [])
    for m in rows:
        pct = _flt(m.get("percent"))
        doc.append("payment_milestones", {
            "label": m.get("label"), "stage": m.get("stage"), "percent": pct,
            "trigger": m.get("trigger"),
            "amount": _flt(m.get("amount")) or round(cv * pct / 100.0, 2),
            "status": m.get("status") or "Pending",
            "received_amount": _flt(m.get("received_amount")),
            "received_on": m.get("received_on") or None,
        })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def raise_variation(name: str, amount, reason: str = None):
    """Adjust the contract value mid-project (+/-), log it, and re-derive the
    amounts on milestones that haven't been received yet."""
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    delta = _flt(amount)
    doc.contract_value = _flt(doc.contract_value) + delta
    cv = _flt(doc.contract_value)
    for m in doc.get("payment_milestones") or []:
        if m.status != "Received":
            m.amount = round(cv * _flt(m.percent) / 100.0, 2)
    doc.append("site_logs", {
        "log_date": frappe.utils.today(), "log_type": "Alteration",
        "description": f"Variation {'+' if delta >= 0 else ''}{delta:,.0f}: {reason or ''}",
        "raised_by": frappe.session.user, "status": "Resolved",
        "resolved_on": frappe.utils.today(),
    })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def add_site_log(name: str, log_type: str, description: str, log_date: str = None):
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    doc.append("site_logs", {
        "log_date": log_date or frappe.utils.today(), "log_type": log_type,
        "description": description, "raised_by": frappe.session.user, "status": "Open",
    })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def resolve_site_log(name: str, idx: int):
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    rows = doc.get("site_logs") or []
    i = int(idx)
    if 0 <= i < len(rows):
        rows[i].status = "Resolved"
        rows[i].resolved_on = frappe.utils.today()
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_feedback(name: str, rating=None, notes: str = None):
    require_login()
    doc = frappe.get_doc(PROJECT, name)
    if rating is not None:
        doc.feedback_rating = _flt(rating)
    if notes is not None:
        doc.feedback_notes = notes
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize(doc)


# ------------------------------------------------------------------ work cards

@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_work_card(payload: str = None, **kwargs):
    require_login()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    name = data.get("name")
    doc = frappe.get_doc(WORKCARD, name) if (name and frappe.db.exists(WORKCARD, name)) else frappe.new_doc(WORKCARD)
    for f in ("title", "project", "stage", "assigned_to", "scheduled_date",
              "priority", "status", "instructions", "update_notes", "company"):
        if f in data:
            doc.set(f, data.get(f))
    if not doc.company:
        doc.company = current_company()
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_work_card_status(name: str, status: str, update_notes: str = None):
    require_login()
    doc = frappe.get_doc(WORKCARD, name)
    doc.status = status
    if update_notes is not None:
        doc.update_notes = update_notes
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "status": doc.status, "completed_on": str(doc.completed_on) if doc.completed_on else None}


@frappe.whitelist()
@handle_api_error
def schedule(date_from: str = None, date_to: str = None, assigned_to: str = None):
    """Work-card board for daily scheduling/analysis (Project Ops Manager view)."""
    require_login()
    comps = allowed_companies() or frappe.get_all("Company", pluck="name")
    filters = {"company": ["in", comps]}
    if date_from and date_to:
        filters["scheduled_date"] = ["between", [date_from, date_to]]
    if assigned_to:
        filters["assigned_to"] = assigned_to
    cards = frappe.get_all(
        WORKCARD, filters=filters,
        fields=["name", "title", "project", "stage", "assigned_to", "scheduled_date",
                "priority", "status"],
        order_by="scheduled_date asc, assigned_to asc")
    kpis = {
        "total": len(cards),
        "todo": sum(1 for c in cards if c["status"] == "To Do"),
        "in_progress": sum(1 for c in cards if c["status"] == "In Progress"),
        "done": sum(1 for c in cards if c["status"] == "Done"),
        "blocked": sum(1 for c in cards if c["status"] == "Blocked"),
    }
    return {"cards": cards, "kpis": kpis}
