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

from hr_client.api.utils import require_login, handle_api_error
from hr_client.api.cost_sheet import gp_tone

_HEADER_FIELDS = ("quotation_title", "opportunity", "company_name", "prepared_by",
                  "discount_percent", "adjustment", "gst_percent",
                  "credit_terms_standard", "credit_terms", "terms_template",
                  "terms_and_conditions", "notes")

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
        gross += ln.gross_amount
    doc.gross_total = round(gross, 2)
    doc.discount_amount = round(gross * _flt(doc.discount_percent) / 100.0, 2)
    doc.net_before_gst = round(gross - doc.discount_amount + _flt(doc.adjustment), 2)
    doc.gst_amount = round(doc.net_before_gst * _flt(doc.gst_percent) / 100.0, 2)
    doc.grand_total = round(doc.net_before_gst + doc.gst_amount, 2)
    doc.gross_profit = round(doc.net_before_gst - _flt(doc.cost_basis), 2)
    doc.gp_percent = round(doc.gross_profit / doc.net_before_gst * 100.0, 2) if doc.net_before_gst else 0.0


def compute_authority(doc):
    """The §4.6 exception engine. Returns (required_authority, [rule dicts])."""
    rules = []
    disc = _flt(doc.discount_percent)
    gp = _flt(doc.gp_percent)
    target = _flt(doc.target_gp_percent)
    minimum = _flt(doc.min_gp_percent)

    if disc > _DISC_CFO:
        rules.append({"rule": f"Discount above {_DISC_CFO:.0f}%", "routes_to": "CFO", "rank": 2})
    elif disc > _DISC_MGR:
        rules.append({"rule": f"Discount above {_DISC_MGR:.0f}%", "routes_to": "Sales Manager", "rank": 1})

    if minimum and gp < minimum:
        rules.append({"rule": "Gross profit below minimum", "routes_to": "Director / CFO", "rank": 3})
    elif target and gp < target:
        rules.append({"rule": "Gross profit below target", "routes_to": "Sales Manager", "rank": 1})

    if not doc.credit_terms_standard:
        rules.append({"rule": "Non-standard credit terms", "routes_to": "CFO", "rank": 2})

    if _flt(doc.adjustment) < 0:
        rules.append({"rule": "Negative adjustment (negotiated reduction)", "routes_to": "Sales Manager", "rank": 1})

    top = max((r["rank"] for r in rules), default=0)
    return _RANK_LABEL[top], rules


def _refresh_engine(doc):
    _apply_maths(doc)
    authority, rules = compute_authority(doc)
    doc.required_authority = authority
    doc.triggered_rules = "; ".join(r["rule"] for r in rules) or "No exception — delegated authority"


def _assert_editable(doc):
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
        "terms_template": doc.terms_template,
        "terms_and_conditions": doc.terms_and_conditions,
        "notes": doc.notes,
        "source": doc.source,
        "editable": doc.status in _EDITABLE_STATUSES,
        "lines": [ln.as_dict() for ln in doc.lines],
        "approval_log": [r.as_dict() for r in doc.approval_log],
        "conversion_gate": _conversion_checks(doc),
    }


@frappe.whitelist()
@handle_api_error
def get_quotation(name: str):
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
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
    if cs.status != "Approved":
        frappe.throw("A quotation can only be built on an approved cost sheet.")
    boq = frappe.get_doc("Vera BOQ", cs.boq) if cs.boq else None

    doc = frappe.new_doc("Vera Sales Quotation")
    doc.update(data)
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
        doc.append("lines", {k: r.get(k) for k in _LINE_FIELDS if r.get(k) is not None})
    _refresh_engine(doc)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "count": len(doc.lines), "grand_total": doc.grand_total,
            "gp_percent": doc.gp_percent, "required_authority": doc.required_authority}


# ══════════════════════════════════════════════════════════════════════════════
# APPROVAL WORKFLOW (§4.6)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_for_approval(name: str):
    require_login()
    doc = frappe.get_doc("Vera Sales Quotation", name)
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
    if doc.sales_order:
        frappe.throw(f"Already converted to {doc.sales_order}.")
    checks = _conversion_checks(doc)
    failed = [c["label"] for c in checks if not c["ok"]]
    if failed:
        return {"success": False, "checks": checks,
                "error": "Conversion blocked — " + "; ".join(failed)}

    so = frappe.new_doc("Vera Sales Order")
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
        so.append("lines", {
            "line_type": ln.line_type,
            "section": ln.section,
            "specification": ln.specification,
            "quantity": ln.quantity,
            "uom": ln.uom,
            "rate": ln.rate,
            "gross_amount": ln.gross_amount,
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


@frappe.whitelist()
@handle_api_error
def get_quotation_print(name: str, fmt: str = "summary"):
    require_login()
    if fmt not in _FORMATS:
        frappe.throw(f"Unknown print format: {fmt}")
    doc = frappe.get_doc("Vera Sales Quotation", name)
    customer_facing = fmt in _CUSTOMER_FORMATS

    lines = []
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
        lines.append(row)

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
        "terms_and_conditions": doc.terms_and_conditions,
    }
    # Commercial totals — shown on all except the pricing-free technical BOQ.
    if fmt != "technical":
        out.update({
            "gross_total": doc.gross_total, "discount_percent": doc.discount_percent,
            "discount_amount": doc.discount_amount, "adjustment": doc.adjustment,
            "net_before_gst": doc.net_before_gst, "gst_percent": doc.gst_percent,
            "gst_amount": doc.gst_amount, "grand_total": doc.grand_total,
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
        })
    return out


@frappe.whitelist()
@handle_api_error
def get_approved_quotations():
    require_login()
    return frappe.get_all(
        "Vera Sales Quotation",
        filters={"status": ["in", ["Approved", "Converted"]]},
        fields=["name", "quotation_title", "company_name", "revision", "grand_total", "status"],
        order_by="modified desc",
    )
