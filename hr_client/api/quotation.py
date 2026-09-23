"""
Quotation Studio — Customer Quotation + Commercial Approvals (Phase 2 spec
§4.5/§4.6), stage 4 of the six-stage chain, plus the gated conversion to a Sales
Order (§4.11).

Totals cascade Gross → less Discount % → ± Adjustment → Net → + GST → Grand.
Gross profit is live against the approved cost sheet's total cost, toned
red/amber/green by the cost sheet's min/target GP %. A commercial-approval
exception engine evaluates each quotation and routes it to the highest authority
any triggered rule demands. All maths + the engine run server-side. ERP-native.
"""

import frappe

from hr_client.api.utils import (
    require_login, handle_api_error, current_company, assert_doc_company, scoped,
)
from hr_client.api.cost_sheet import gp_tone

_HEADER_FIELDS = ("quotation_title", "opportunity", "company_name", "prepared_by",
                  "discount_percent", "adjustment", "gst_percent",
                  "place_of_supply", "is_interstate",
                  "credit_terms_standard", "credit_terms", "terms_template",
                  "terms_and_conditions", "assumptions", "notes",
                  # delivery & execution terms shown on the customer print (§29/§30/§35)
                  "validity_days", "delivery_period", "installation_period", "warranty_terms",
                  # commercial concessions the approval matrix evaluates (§36-43)
                  "advance_received", "foc_value", "installation_waiver",
                  "transport_waiver", "price_override_percent")

_LINE_FIELDS = ("line_type", "section", "specification", "measurement",
                "source_boq_line", "stock_or_lead", "quantity", "uom", "rate")

_EDITABLE_STATUSES = {"Draft", "Returned"}

# Exception-engine thresholds (§4.6 — "as implemented in the prototype, confirm
# with client"). Authority ranks: higher wins.
_DISC_MGR, _DISC_CFO = 3.0, 5.0
_RANK_LABEL = {0: "Sales Executive", 1: "Sales Manager", 2: "CFO", 3: "Director / CFO"}


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


def _rows_of(payload, key):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return payload if isinstance(payload, list) else payload.get(key, [])


def _flt(v):
    return frappe.utils.flt(v)


def _apply_maths(doc):
    gross = 0.0
    for ln in doc.lines:
        ln.gross_amount = round(_flt(ln.quantity) * _flt(ln.rate), 2)
        # Optional / alternate items (§23/§24) are priced but excluded from the
        # grand total — the customer sees them as add-ons, not part of the deal.
        if not ln.get("is_optional"):
            gross += ln.gross_amount
    doc.gross_total = round(gross, 2)
    doc.discount_amount = round(gross * _flt(doc.discount_percent) / 100.0, 2)
    doc.net_before_gst = round(gross - doc.discount_amount + _flt(doc.adjustment), 2)
    doc.gst_amount = round(doc.net_before_gst * _flt(doc.gst_percent) / 100.0, 2)
    doc.grand_total = round(doc.net_before_gst + doc.gst_amount, 2)
    doc.gross_profit = round(doc.net_before_gst - _flt(doc.cost_basis), 2)
    doc.gp_percent = round(doc.gross_profit / doc.net_before_gst * 100.0, 2) if doc.net_before_gst else 0.0


_LINE_TYPE_CATEGORY = {"Trading": None, "Project / Modular": "Modular", "Services": "Services"}


def compute_authority(doc):
    """The §4.6 exception engine — delegates to the configurable commercial-
    approval matrix (hr_client.api.commercial_approval), then adds the two
    signals the band matrix doesn't cover (non-standard credit, negotiated
    reduction). Returns (required_authority, [rule dicts]) — same contract as
    before so the submit/decide/serialize workflow is unchanged."""
    from hr_client.api import commercial_approval as ca

    cats = sorted({_LINE_TYPE_CATEGORY.get(ln.line_type) for ln in doc.lines},
                  key=lambda c: (c is None, c)) or [None]
    metrics = {
        "discount_pct": _flt(doc.discount_percent),
        "categories": list(cats),
        "value": _flt(doc.grand_total) or _flt(doc.net_before_gst),
        "gp_pct": _flt(doc.gp_percent),
        "target_gp": _flt(doc.target_gp_percent) or 30,
        "min_gp": _flt(doc.min_gp_percent) or 22,
        "advance_pct": _flt(getattr(doc, "advance_received", 0)) or None,
        "foc": _flt(getattr(doc, "foc_value", 0)),
        "installation_waiver": _flt(getattr(doc, "installation_waiver", 0)),
        "transport_waiver": _flt(getattr(doc, "transport_waiver", 0)),
        "price_override_pct": _flt(getattr(doc, "price_override_percent", 0)),
        "cost": _flt(doc.cost_basis),
        "selling": _flt(doc.net_before_gst),
    }
    try:
        res = ca.evaluate(metrics)
        rules = [{"rule": e["detail"], "routes_to": ca.role_of(e["required_level"]),
                  "rank": ca._rank(e["required_level"]), "severity": e["severity"]}
                 for e in res["exceptions"]]
    except Exception:
        frappe.log_error(frappe.get_traceback(), "compute_authority engine")
        rules = []

    if not doc.credit_terms_standard:
        rules.append({"rule": "Non-standard credit terms", "routes_to": "CFO", "rank": 3})
    if _flt(doc.adjustment) < 0:
        rules.append({"rule": "Negotiated reduction (negative adjustment)",
                      "routes_to": "Sales Manager", "rank": 1})

    top = max((r["rank"] for r in rules), default=0)
    authority = ca.role_of(ca.LEVELS[min(top, len(ca.LEVELS) - 1)])
    return authority, rules


def _refresh_engine(doc):
    _apply_maths(doc)
    authority, rules = compute_authority(doc)
    doc.required_authority = authority
    doc.triggered_rules = "; ".join(r["rule"] for r in rules) or "No exception — delegated authority"


def _assert_editable(doc):
    assert_doc_company(doc)
    if doc.status not in _EDITABLE_STATUSES:
        frappe.throw(
            f"This quotation is {doc.status} and can no longer be edited. "
            "Create a new revision to make changes."
        )


def _log(doc, action, authority=None, comment=None, conditions=None):
    doc.append("approval_log", {
        "action": action,
        "authority": authority or doc.required_authority,
        "acted_by": frappe.session.user,
        "acted_on": frappe.utils.now_datetime(),
        "comment": comment,
        "conditions": conditions,
    })


# ══════════════════════════════════════════════════════════════════════════════
# LIST / DETAIL
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_quotations_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera Sales Quotation",
        filters=scoped({}),
        fields=["name", "quotation_title", "company_name", "status", "revision",
                "grand_total", "gp_percent", "required_authority", "source"],
        order_by="modified desc",
    )
    by_status = {}
    for r in rows_raw:
        by_status[r.status] = by_status.get(r.status, 0) + 1

    def inr(v):
        return frappe.utils.fmt_money(_flt(v), currency="INR")

    rows = [{
        "name": r.name,
        "quotation_title": r.quotation_title,
        "company_name": r.company_name or "—",
        "revision": f"R{r.revision:02d}",
        "grand_total": inr(r.grand_total),
        "gp_percent": f"{_flt(r.gp_percent):.1f}%",
        "status": r.status,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Quotations", "value": str(len(rows_raw))},
            {"label": "Pending Approval", "value": str(by_status.get("Pending Approval", 0)), "tone": "warn"},
            {"label": "Approved", "value": str(by_status.get("Approved", 0)), "tone": "good"},
            {"label": "Converted", "value": str(by_status.get("Converted", 0)), "tone": "good"},
        ],
        "columns": [
            {"key": "name", "header": "No."},
            {"key": "quotation_title", "header": "Title"},
            {"key": "company_name", "header": "Client"},
            {"key": "revision", "header": "Rev"},
            {"key": "grand_total", "header": "Grand Total", "align": "right", "kind": "amount"},
            {"key": "gp_percent", "header": "GP %", "align": "right"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Stage 4. Built on an approved BOQ, priced against an approved "
                "cost sheet. Submitting runs the commercial-approval exception "
                "engine (§4.6).",
    }


def _serialize(doc):
    _, rules = compute_authority(doc)
    return {
        "name": doc.name,
        "quotation_title": doc.quotation_title,
        "opportunity": doc.opportunity,
        "boq": doc.boq,
        "cost_sheet": doc.cost_sheet,
        "company_name": doc.company_name,
        "stage": doc.stage,
        "status": doc.status,
        "revision": doc.revision,
        "prepared_by": doc.prepared_by,
        "supersedes": doc.supersedes,
        "sales_order": doc.sales_order,
        "gross_total": doc.gross_total,
        "discount_percent": doc.discount_percent,
        "discount_amount": doc.discount_amount,
        "adjustment": doc.adjustment,
        "net_before_gst": doc.net_before_gst,
        "gst_percent": doc.gst_percent,
        "gst_amount": doc.gst_amount,
        "grand_total": doc.grand_total,
        "place_of_supply": doc.place_of_supply,
        "is_interstate": doc.is_interstate,
        "credit_terms_standard": doc.credit_terms_standard,
        "credit_terms": doc.credit_terms,
        "cost_basis": doc.cost_basis,
        "gross_profit": doc.gross_profit,
        "gp_percent": doc.gp_percent,
        "target_gp_percent": doc.target_gp_percent,
        "min_gp_percent": doc.min_gp_percent,
        "gp_tone": gp_tone(doc.gp_percent, doc.target_gp_percent, doc.min_gp_percent),
        "required_authority": doc.required_authority,
        "triggered_rules_list": rules,
        "approved_by": doc.approved_by,
        "approved_on": doc.approved_on,
        "approved_with_conditions": doc.approved_with_conditions,
        "conditions": doc.conditions,
        "customer_acceptance": doc.customer_acceptance,
        "advance_received": doc.advance_received,
        # Commercial concessions the approval matrix evaluates (§36-43)
        "foc_value": doc.foc_value,
        "installation_waiver": doc.installation_waiver,
        "transport_waiver": doc.transport_waiver,
        "price_override_percent": doc.price_override_percent,
        "terms_template": doc.terms_template,
        "terms_and_conditions": doc.terms_and_conditions,
        "assumptions": doc.assumptions,
        "validity_days": doc.validity_days,
        "delivery_period": doc.delivery_period,
        "installation_period": doc.installation_period,
        "warranty_terms": doc.warranty_terms,
        "inclusions": [{"inclusion": r.inclusion, "text": r.text} for r in doc.inclusions],
        "exclusions": [{"exclusion": r.exclusion, "text": r.text} for r in doc.exclusions],
        "payment_schedule": [{"stage": r.stage, "percent": r.percent} for r in doc.payment_schedule],
        "notes": doc.notes,
        "source": doc.source,
        "editable": doc.status in _EDITABLE_STATUSES,
        "lines": [dict(ln.as_dict(), is_optional=("Optional" if ln.get("is_optional") else ""))
                  for ln in doc.lines],
        "approval_log": [r.as_dict() for r in doc.approval_log],
        "conversion_gate": _conversion_checks(doc),
    }


@frappe.whitelist()
@handle_api_error
def get_quotation(name: str):
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)
    return {"success": True, "quotation": _serialize(doc)}


# ══════════════════════════════════════════════════════════════════════════════
# CREATE / UPDATE
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_quotation(payload):
    """Build a quotation from an approved cost sheet: seeds Project/Modular lines
    from the BOQ and pulls the cost basis + GP targets from the cost sheet."""
    require_login()
    data = _clean(payload, _HEADER_FIELDS)
    if not data.get("quotation_title"):
        frappe.throw("A quotation title is required.")
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    cs_name = payload.get("cost_sheet")
    if not cs_name:
        frappe.throw("Select the approved cost sheet to build the quotation on.")
    cs = frappe.get_doc("Vera Cost Sheet", cs_name)
    assert_doc_company(cs)
    if cs.status != "Approved":
        frappe.throw("A quotation can only be built on an approved cost sheet.")
    boq = frappe.get_doc("Vera BOQ", cs.boq) if cs.boq else None

    doc = frappe.new_doc("Vera Sales Quotation")
    doc.update(data)
    doc.company = cs.get("company") or current_company()   # inherit the owning company
    doc.cost_sheet = cs.name
    doc.boq = cs.boq
    if not doc.company_name:
        doc.company_name = cs.company_name
    if not doc.opportunity:
        doc.opportunity = cs.opportunity
    doc.cost_basis = cs.total_cost
    doc.target_gp_percent = cs.target_gp_percent
    doc.min_gp_percent = cs.min_gp_percent
    if boq:
        for ln in boq.lines:
            doc.append("lines", {
                "line_type": "Project / Modular",
                "section": ln.area,
                "specification": ln.unit_name,
                "measurement": f"{_flt(ln.width):.0f}×{_flt(ln.height):.0f}" if ln.width else "",
                "source_boq_line": ln.name,
                "quantity": ln.calc_qty or ln.quantity or 1,
                "uom": ln.uom,
                "rate": ln.selling_rate,
            })
    _refresh_engine(doc)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_quotation(name: str, payload):
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    _assert_editable(doc)
    doc.update(_clean(payload, _HEADER_FIELDS))
    _refresh_engine(doc)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "grand_total": doc.grand_total,
            "gp_percent": doc.gp_percent, "required_authority": doc.required_authority}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_lines(name: str, lines):
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    _assert_editable(doc)
    doc.set("lines", [])
    for r in _rows_of(lines, "lines"):
        row = {k: r.get(k) for k in _LINE_FIELDS if r.get(k) is not None}
        row["is_optional"] = 1 if str(r.get("is_optional") or "").strip().lower() in ("optional", "yes", "1", "true") else 0
        doc.append("lines", row)
    _refresh_engine(doc)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "count": len(doc.lines), "grand_total": doc.grand_total,
            "gp_percent": doc.gp_percent, "required_authority": doc.required_authority}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_scope(name: str, inclusions=None, exclusions=None):
    """Replace the quotation's Inclusions / Exclusions (§31/§32). Each row may
    carry free text and/or a link to the Inclusion/Exclusion master (whose text
    is pulled in when the row has no text of its own). Draft/Returned only."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    _assert_editable(doc)

    def _fill(child_field, rows_key, rows, master_dt, link_field, text_field):
        doc.set(child_field, [])
        for r in _rows_of(rows, rows_key):
            link = r.get(link_field)
            txt = r.get("text")
            if link and not txt:
                txt = frappe.db.get_value(master_dt, link, text_field)
            if txt or link:
                doc.append(child_field, {link_field: link, "text": txt})

    if inclusions is not None:
        _fill("inclusions", "inclusions", inclusions, "Vera Inclusion", "inclusion", "inclusion_text")
    if exclusions is not None:
        _fill("exclusions", "exclusions", exclusions, "Vera Exclusion", "exclusion", "exclusion_text")
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "inclusions": len(doc.inclusions), "exclusions": len(doc.exclusions)}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_payment_schedule(name: str, stages=None):
    """Replace the quotation's stored payment schedule (§28). Each row is a
    {stage, percent} pair; the print derives the amount against the grand total
    at render time so it always tracks the current value. Passing an empty list
    clears the override → the print falls back to the standard stage template.
    Draft/Returned only."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    _assert_editable(doc)
    doc.set("payment_schedule", [])
    for r in _rows_of(stages, "stages"):
        stage = (r.get("stage") or "").strip()
        pct = _flt(r.get("percent"))
        if stage or pct:
            doc.append("payment_schedule", {"stage": stage, "percent": pct})
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "count": len(doc.payment_schedule)}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_negotiated_total(name: str, final_total):
    """§66 — sales negotiates a round final grand total. The gap becomes an
    `adjustment` (negotiated reduction if negative) that flows into the net →
    GP → approval engine, rather than silently altering the total."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    _assert_editable(doc)
    _apply_maths(doc)                                  # refresh gross + discount
    gst_factor = 1 + _flt(doc.gst_percent) / 100.0
    target_net = _flt(final_total) / gst_factor if gst_factor else _flt(final_total)
    base_net = _flt(doc.gross_total) - _flt(doc.discount_amount)
    doc.adjustment = round(target_net - base_net, 2)
    _refresh_engine(doc)                               # re-cascade maths + authority
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "grand_total": doc.grand_total, "adjustment": doc.adjustment,
            "gp_percent": doc.gp_percent, "required_authority": doc.required_authority}


# ══════════════════════════════════════════════════════════════════════════════
# TERMS & CONDITIONS
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def apply_terms_template(name: str, template: str = None):
    """Expand a coded Terms Template's clauses into the quotation's customer-
    facing terms_and_conditions text (numbered title + clause text)."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    _assert_editable(doc)
    tmpl_name = template or doc.terms_template
    if not tmpl_name:
        frappe.throw("Select a terms template first.")
    tmpl = frappe.get_doc("Vera Terms Template", tmpl_name)
    parts = [f"{i}. {row.title}\n{row.customer_text}" for i, row in enumerate(tmpl.clauses, 1)]
    doc.terms_template = tmpl_name
    doc.terms_and_conditions = "\n\n".join(parts)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "clauses": len(tmpl.clauses),
            "terms_and_conditions": doc.terms_and_conditions}


# ══════════════════════════════════════════════════════════════════════════════
# APPROVAL WORKFLOW (§4.6)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_for_approval(name: str):
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)
    if doc.status not in ("Draft", "Returned"):
        frappe.throw(f"Only a Draft/Returned quotation can be submitted (this is {doc.status}).")
    if not doc.lines:
        frappe.throw("Add at least one line before submitting.")
    _refresh_engine(doc)
    doc.status = "Pending Approval"
    _log(doc, "Submitted for Approval")
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status, "required_authority": doc.required_authority}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def decide(name: str, action: str, comment: str = None, conditions: str = None):
    """Approver decision (§4.6): Approve, Approve with Conditions, Return for
    Revision, or Reject. Every decision is logged."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)
    if doc.status != "Pending Approval":
        frappe.throw("Only a quotation pending approval can be decided on.")

    if action == "Approve":
        doc.status = "Approved"
        doc.approved_by = frappe.session.user
        doc.approved_on = frappe.utils.now_datetime()
        doc.approved_with_conditions = 0
        doc.conditions = None
    elif action == "Approve with Conditions":
        if not conditions:
            frappe.throw("Conditions are required for a conditional approval.")
        doc.status = "Approved"
        doc.approved_by = frappe.session.user
        doc.approved_on = frappe.utils.now_datetime()
        doc.approved_with_conditions = 1
        doc.conditions = conditions
    elif action == "Return for Revision":
        if not comment:
            frappe.throw("A comment is required when returning for revision.")
        doc.status = "Returned"
    elif action == "Reject":
        if not comment:
            frappe.throw("A comment is required to reject.")
        doc.status = "Rejected"
    else:
        frappe.throw(f"Unknown action: {action}")

    _log(doc, action, comment=comment, conditions=conditions)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_revision(name: str):
    """New revision — resets approval state (§4.6)."""
    require_login()
    src = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(src)
    new = frappe.copy_doc(src, ignore_no_copy=False)
    new.status = "Draft"
    new.revision = (src.revision or 1) + 1
    new.approved_by = None
    new.approved_on = None
    new.approved_with_conditions = 0
    new.conditions = None
    new.sales_order = None
    new.customer_acceptance = 0
    new.advance_received = 0
    new.set("approval_log", [])
    new.supersedes = src.name
    _refresh_engine(new)
    new.insert(ignore_permissions=True)
    if src.status in ("Approved", "Rejected"):
        src.status = "Superseded"
        src.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": new.name, "revision": new.revision}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_acceptance(name: str, customer_acceptance: int = None, advance_received: int = None):
    """Record the §4.11 conversion prerequisites captured outside the system."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)
    if customer_acceptance is not None:
        doc.customer_acceptance = frappe.utils.cint(customer_acceptance)
    if advance_received is not None:
        doc.advance_received = frappe.utils.cint(advance_received)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "conversion_gate": _conversion_checks(doc)}


# ══════════════════════════════════════════════════════════════════════════════
# CONVERSION TO SALES ORDER (§4.11)
# ══════════════════════════════════════════════════════════════════════════════

def _is_latest_approved_revision(doc):
    """True if no later revision of this quotation chain is Approved."""
    later = frappe.get_all("Vera Sales Quotation",
                           filters={"supersedes": doc.name}, pluck="name")
    return not later


def _conversion_checks(doc):
    """The six gate checks (§4.11). Returns a list of {label, ok}."""
    boq_ok = bool(doc.boq) and frappe.db.get_value("Vera BOQ", doc.boq, "status") == "Approved"
    cs_ok = bool(doc.cost_sheet) and frappe.db.get_value("Vera Cost Sheet", doc.cost_sheet, "status") == "Approved"
    checks = [
        {"label": "Commercial approval obtained", "ok": doc.status in ("Approved", "Converted")},
        {"label": "Customer acceptance recorded in writing", "ok": bool(doc.customer_acceptance)},
        {"label": "Required advance received and verified by Accounts", "ok": bool(doc.advance_received)},
        {"label": "BOQ revision approved", "ok": boq_ok},
        {"label": "Cost sheet revision approved", "ok": cs_ok},
        {"label": "This is the latest approved revision", "ok": _is_latest_approved_revision(doc)},
    ]
    return checks


@frappe.whitelist(methods=["POST"])
@handle_api_error
def convert_to_sales_order(name: str):
    """Gated conversion — all six checks must pass (§4.11)."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)
    if doc.sales_order:
        frappe.throw(f"Already converted to {doc.sales_order}.")
    checks = _conversion_checks(doc)
    failed = [c["label"] for c in checks if not c["ok"]]
    if failed:
        return {"success": False, "checks": checks,
                "error": "Conversion blocked — " + "; ".join(failed)}

    so = frappe.new_doc("Vera Sales Order")
    so.company = doc.get("company") or current_company()
    so.so_title = doc.quotation_title
    so.opportunity = doc.opportunity
    so.company_name = doc.company_name
    so.so_date = frappe.utils.today()
    so.quotation = doc.name
    so.quotation_revision = doc.revision
    so.boq = doc.boq
    so.boq_revision = frappe.db.get_value("Vera BOQ", doc.boq, "revision") if doc.boq else None
    so.cost_sheet = doc.cost_sheet
    so.cost_sheet_revision = frappe.db.get_value("Vera Cost Sheet", doc.cost_sheet, "revision") if doc.cost_sheet else None
    so.grand_total = doc.grand_total
    for ln in doc.lines:
        # Carry the BOQ line's supplying_company forward so SO confirmation (Phase 7
        # §3) can raise an internal PO to any sibling company that supplies a line.
        supplying = (
            frappe.db.get_value("Vera BOQ Line", ln.source_boq_line, "supplying_company")
            if ln.source_boq_line else None
        )
        so.append("lines", {
            "line_type": ln.line_type,
            "section": ln.section,
            "specification": ln.specification,
            "quantity": ln.quantity,
            "uom": ln.uom,
            "rate": ln.rate,
            "gross_amount": ln.gross_amount,
            "source_boq_line": ln.source_boq_line,
            "supplying_company": supplying,
        })
    so.insert(ignore_permissions=True)

    doc.sales_order = so.name
    doc.status = "Converted"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "sales_order": so.name}


# ══════════════════════════════════════════════════════════════════════════════
# PRINT FORMATS (§4.9)
# ══════════════════════════════════════════════════════════════════════════════

_FORMATS = {
    "summary": "Summary Quotation",
    "detailed": "Detailed Commercial",
    "technical": "Technical BOQ",
    "internal": "Internal Costing",
}
# Customer-facing formats must never show cost, GP, or supplier data (§4.9).
_CUSTOMER_FORMATS = {"summary", "detailed", "technical"}

# Standard payment stages (print spec §28). Derived on the print against the
# grand total; a configurable per-quotation schedule is a later refinement.
_PAYMENT_STAGES = (
    ("Booking / Confirmation", 10),
    ("Order Confirmation", 40),
    ("Before Dispatch", 40),
    ("Before Handover", 10),
)


def _company_info(company):
    """Letterhead details for a customer-facing print (§3). Read live from the
    ERPNext Company + its primary Address; every field is optional and defaults
    to None so a sparsely-configured Company simply prints fewer header lines."""
    if not company:
        return {}
    vals = frappe.db.get_value(
        "Company", company, ["company_name", "tax_id", "phone_no", "email", "website"],
        as_dict=True) or {}
    address = None
    try:
        links = frappe.get_all(
            "Dynamic Link",
            filters={"link_doctype": "Company", "link_name": company, "parenttype": "Address"},
            pluck="parent")
        if links:
            a = frappe.db.get_value(
                "Address", links[0],
                ["address_line1", "address_line2", "city", "state", "pincode"], as_dict=True) or {}
            address = ", ".join(x for x in [a.get("address_line1"), a.get("address_line2"),
                                            a.get("city"), a.get("state"), a.get("pincode")] if x)
    except Exception:
        pass
    return {
        "name": vals.get("company_name") or company,
        "gstin": vals.get("tax_id"),
        "phone": vals.get("phone_no"),
        "email": vals.get("email"),
        "website": vals.get("website"),
        "address": address,
    }


@frappe.whitelist()
@handle_api_error
def get_quotation_print(name: str, fmt: str = "summary"):
    require_login()
    if fmt not in _FORMATS:
        frappe.throw(f"Unknown print format: {fmt}")
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)
    customer_facing = fmt in _CUSTOMER_FORMATS

    lines, optional_lines = [], []
    for ln in doc.lines:
        row = {
            "line_type": ln.line_type,
            "section": ln.section,
            "specification": ln.specification,
            "measurement": ln.measurement,
            "quantity": ln.quantity,
            "uom": ln.uom,
        }
        if fmt != "technical":  # technical BOQ has no pricing
            row["rate"] = ln.rate
            row["gross_amount"] = ln.gross_amount
        # Optional / alternate items (§23/§24) print in their own table and never
        # roll into the section subtotals or the grand total.
        (optional_lines if ln.get("is_optional") else lines).append(row)

    # Group lines into sections with subtotals — the customer-facing hierarchy
    # the print spec mandates (§15/§25). Order is preserved as first-seen.
    sections, _idx = [], {}
    for row in lines:
        sec = row.get("section") or "Items"
        if sec not in _idx:
            _idx[sec] = len(sections)
            sections.append({"section": sec, "lines": [], "subtotal": 0.0})
        s = sections[_idx[sec]]
        s["lines"].append(row)
        if fmt != "technical":
            s["subtotal"] = round(s["subtotal"] + _flt(row.get("gross_amount")), 2)

    out = {
        "format": fmt,
        "format_label": _FORMATS[fmt],
        "customer_facing": customer_facing,
        "watermark": "SUPERSEDED" if doc.status == "Superseded" else None,
        "name": doc.name,
        "revision": doc.revision,
        "title": doc.quotation_title,
        "company_name": doc.company_name,
        "status": doc.status,
        "lines": lines,
        "sections": sections,
        "optional_lines": optional_lines,
        "terms_and_conditions": doc.terms_and_conditions,
        "assumptions": doc.assumptions if customer_facing else None,
        # Letterhead (§3) — only on customer-facing formats.
        "company_info": _company_info(doc.get("company")) if customer_facing else {},
        # Delivery & execution terms (§12/§29/§30/§35) — customer-facing.
        "validity_days": doc.validity_days if customer_facing else None,
        "delivery_period": doc.delivery_period if customer_facing else None,
        "installation_period": doc.installation_period if customer_facing else None,
        "warranty_terms": doc.warranty_terms if customer_facing else None,
        "inclusions": [r.text for r in doc.inclusions if r.text] if customer_facing else [],
        "exclusions": [r.text for r in doc.exclusions if r.text] if customer_facing else [],
    }
    # Commercial totals — shown on all except the pricing-free technical BOQ.
    if fmt != "technical":
        # §27/§68 — inter-state supply is taxed as a single IGST; intra-state
        # splits the GST into CGST + SGST (each half). Driven by is_interstate,
        # which the user sets alongside the place of supply.
        interstate = bool(doc.is_interstate)
        half = round(_flt(doc.gst_amount) / 2.0, 2)
        out.update({
            "gross_total": doc.gross_total, "discount_percent": doc.discount_percent,
            "discount_amount": doc.discount_amount, "adjustment": doc.adjustment,
            "net_before_gst": doc.net_before_gst, "gst_percent": doc.gst_percent,
            "gst_amount": doc.gst_amount, "grand_total": doc.grand_total,
            "place_of_supply": doc.place_of_supply, "interstate": interstate,
            "cgst_percent": None if interstate else round(_flt(doc.gst_percent) / 2.0, 2),
            "cgst_amount": None if interstate else half,
            "sgst_percent": None if interstate else round(_flt(doc.gst_percent) / 2.0, 2),
            "sgst_amount": None if interstate else round(_flt(doc.gst_amount) - half, 2),
            "igst_percent": _flt(doc.gst_percent) if interstate else None,
            "igst_amount": _flt(doc.gst_amount) if interstate else None,
            "amount_in_words": frappe.utils.money_in_words(doc.grand_total, "INR"),
            # Payment schedule (§28) — a per-quotation stored schedule when the
            # user has set one, else the standard stage template. Either way the
            # amount is derived from the grand total so it tracks the value.
            "payment_schedule": [
                {"stage": stage, "percent": pct,
                 "amount": round(_flt(doc.grand_total) * _flt(pct) / 100.0, 2)}
                for stage, pct in (
                    [(r.stage, r.percent) for r in doc.payment_schedule]
                    if doc.payment_schedule else _PAYMENT_STAGES
                )
            ],
        })
    # Internal Costing only — cost, GP, rate source. Marked confidential.
    if fmt == "internal":
        out.update({
            "confidential": True,
            "cost_basis": doc.cost_basis,
            "gross_profit": doc.gross_profit,
            "gp_percent": doc.gp_percent,
            "target_gp_percent": doc.target_gp_percent,
            "min_gp_percent": doc.min_gp_percent,
            "cost_sheet": doc.cost_sheet,
            "conditions": doc.conditions,
            # Approval routing + the concessions that drove it (§4.6/§36-43) — so
            # the approver's copy shows why it escalated and what was granted.
            "required_authority": doc.required_authority,
            "triggered_rules": doc.triggered_rules,
            "foc_value": doc.foc_value,
            "installation_waiver": doc.installation_waiver,
            "transport_waiver": doc.transport_waiver,
            "price_override_percent": doc.price_override_percent,
        })
    return out


@frappe.whitelist()
@handle_api_error
def get_document_chain(doctype: str, name: str):
    """Resolve the full six-stage document chain (§4 Document Link Bar) from any
    entry point: Opportunity → Measurement → BOQ → Cost Sheet → Quotation →
    Sales Order. Walks the back-links upward; returns the doc name at each stage
    (or None). Each stage is a link the UI renders as a clickable chip."""
    require_login()

    def gv(dt, nm, field):
        return frappe.db.get_value(dt, nm, field) if nm else None

    c = {"opportunity": None, "measurement": None, "boq": None,
         "cost_sheet": None, "quotation": None, "sales_order": None}

    if doctype == "Vera Measurement Sheet":
        c["measurement"] = name
        c["opportunity"] = gv(doctype, name, "opportunity")
    elif doctype == "Vera BOQ":
        c["boq"] = name
        c["measurement"] = gv(doctype, name, "measurement_sheet")
        c["opportunity"] = gv(doctype, name, "opportunity")
    elif doctype == "Vera Cost Sheet":
        c["cost_sheet"] = name
        c["boq"] = gv(doctype, name, "boq")
        c["opportunity"] = gv(doctype, name, "opportunity")
    elif doctype == "Vera Sales Quotation":
        c["quotation"] = name
        c["cost_sheet"] = gv(doctype, name, "cost_sheet")
        c["boq"] = gv(doctype, name, "boq")
        c["sales_order"] = gv(doctype, name, "sales_order")
        c["opportunity"] = gv(doctype, name, "opportunity")
    elif doctype == "Vera Sales Order":
        c["sales_order"] = name
        c["quotation"] = gv(doctype, name, "quotation")
        c["boq"] = gv(doctype, name, "boq")
        c["cost_sheet"] = gv(doctype, name, "cost_sheet")
        c["opportunity"] = gv(doctype, name, "opportunity")

    # Backfill gaps upward so the whole chain shows from any starting doc.
    if not c["boq"] and c["cost_sheet"]:
        c["boq"] = gv("Vera Cost Sheet", c["cost_sheet"], "boq")
    if not c["measurement"] and c["boq"]:
        c["measurement"] = gv("Vera BOQ", c["boq"], "measurement_sheet")
    if not c["opportunity"]:
        c["opportunity"] = (gv("Vera BOQ", c["boq"], "opportunity")
                            or gv("Vera Measurement Sheet", c["measurement"], "opportunity"))
    return c


@frappe.whitelist()
@handle_api_error
def get_revision_comparison(name: str):
    """Revision comparison (print spec §52) — walk this quotation's revision chain
    (via `supersedes`) and return each revision's per-section subtotals + grand
    total, so the UI can show R01 vs R02 vs … with the differences."""
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
    assert_doc_company(doc)

    # Walk back to the root revision, then forward through the chain.
    root, seen = doc, set()
    while root.supersedes and root.supersedes not in seen:
        seen.add(root.name)
        root = frappe.get_doc("Vera Sales Quotation", root.supersedes)
    order, cur = [root], root
    while True:
        nxt = frappe.get_all("Vera Sales Quotation", filters={"supersedes": cur.name}, pluck="name")
        if not nxt:
            break
        cur = frappe.get_doc("Vera Sales Quotation", nxt[0])
        order.append(cur)

    section_order, revisions = [], []
    for d in order:
        secs = {}
        for ln in d.lines:
            sec = ln.section or "Items"
            secs[sec] = round(secs.get(sec, 0.0) + _flt(ln.gross_amount), 2)
            if sec not in section_order:
                section_order.append(sec)
        revisions.append({
            "name": d.name, "revision": d.revision, "status": d.status,
            "grand_total": _flt(d.grand_total), "sections": secs,
        })
    return {"revisions": revisions, "section_order": section_order}


@frappe.whitelist()
@handle_api_error
def get_approved_quotations():
    require_login()
    return frappe.get_all(
        "Vera Sales Quotation",
        filters=scoped({"status": ["in", ["Approved", "Converted"]]}),
        fields=["name", "quotation_title", "company_name", "revision", "grand_total", "status"],
        order_by="modified desc",
    )
