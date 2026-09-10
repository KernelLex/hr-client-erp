"""
Quotation Studio — Cost Sheet (Phase 2 spec §4.4), stage 3 of the six-stage
chain.

Base cost is the sum of (cost rate × calculated quantity) across the approved
BOQ's lines; an overhead % on top gives total cost. Target and minimum GP %
recorded here drive the §4.6 commercial-approval engine, and the approved cost
sheet revision is stamped onto the sales order (§4.11).

Cost lines are snapshotted from the BOQ at build time so the sheet stays stable
across later BOQ revisions. All maths run server-side. ERP-native.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

# Header fields a user may edit (lines are a frozen snapshot).
_HEADER_FIELDS = ("cost_title", "opportunity", "company_name", "prepared_by",
                  "overhead_percent", "target_gp_percent", "min_gp_percent", "notes")

_EDITABLE_STATUSES = {"Draft"}


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


def _flt(v):
    return frappe.utils.flt(v)


def gp_tone(gp_pct, target, minimum):
    """Red below minimum, amber below target, green at/above target (§4.5)."""
    gp_pct, target, minimum = _flt(gp_pct), _flt(target), _flt(minimum)
    if minimum and gp_pct < minimum:
        return "red"
    if target and gp_pct < target:
        return "amber"
    return "green"


def _apply_maths(doc):
    base = sum(_flt(ln.cost_amount) for ln in doc.lines)
    doc.base_cost = round(base, 2)
    doc.total_cost = round(base * (1 + _flt(doc.overhead_percent) / 100.0), 2)
    sell = _flt(doc.selling_total)
    doc.projected_gp = round(sell - doc.total_cost, 2)
    doc.projected_gp_percent = round((doc.projected_gp / sell * 100.0), 2) if sell else 0.0


def _assert_editable(doc):
    if doc.status not in _EDITABLE_STATUSES:
        frappe.throw(
            f"This cost sheet is {doc.status} and can no longer be edited. "
            "Create a new revision to make changes."
        )


# ══════════════════════════════════════════════════════════════════════════════
# LIST / DETAIL
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_cost_sheets_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera Cost Sheet",
        fields=["name", "cost_title", "company_name", "status", "revision",
                "total_cost", "projected_gp_percent", "source"],
        order_by="modified desc",
    )
    by_status = {}
    for r in rows_raw:
        by_status[r.status] = by_status.get(r.status, 0) + 1

    def inr(v):
        return frappe.utils.fmt_money(_flt(v), currency="INR")

    rows = [{
        "name": r.name,
        "cost_title": r.cost_title,
        "company_name": r.company_name or "—",
        "revision": f"R{r.revision:02d}",
        "total_cost": inr(r.total_cost),
        "projected_gp_percent": f"{_flt(r.projected_gp_percent):.1f}%",
        "status": r.status,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Cost Sheets", "value": str(len(rows_raw))},
            {"label": "Draft", "value": str(by_status.get("Draft", 0)), "tone": "warn"},
            {"label": "Submitted", "value": str(by_status.get("Submitted", 0))},
            {"label": "Approved", "value": str(by_status.get("Approved", 0)), "tone": "good"},
        ],
        "columns": [
            {"key": "name", "header": "No."},
            {"key": "cost_title", "header": "Title"},
            {"key": "company_name", "header": "Client"},
            {"key": "revision", "header": "Rev"},
            {"key": "total_cost", "header": "Total Cost", "align": "right", "kind": "amount"},
            {"key": "projected_gp_percent", "header": "GP %", "align": "right"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Stage 3. Built on an approved BOQ. Set overhead and the target/"
                "minimum GP % here — they drive the quotation approval engine.",
    }


def _serialize(doc):
    return {
        "name": doc.name,
        "cost_title": doc.cost_title,
        "opportunity": doc.opportunity,
        "boq": doc.boq,
        "company_name": doc.company_name,
        "stage": doc.stage,
        "status": doc.status,
        "revision": doc.revision,
        "prepared_by": doc.prepared_by,
        "approved_by": doc.approved_by,
        "approved_on": doc.approved_on,
        "supersedes": doc.supersedes,
        "base_cost": doc.base_cost,
        "overhead_percent": doc.overhead_percent,
        "total_cost": doc.total_cost,
        "selling_total": doc.selling_total,
        "projected_gp": doc.projected_gp,
        "projected_gp_percent": doc.projected_gp_percent,
        "target_gp_percent": doc.target_gp_percent,
        "min_gp_percent": doc.min_gp_percent,
        "gp_tone": gp_tone(doc.projected_gp_percent, doc.target_gp_percent, doc.min_gp_percent),
        "notes": doc.notes,
        "source": doc.source,
        "editable": doc.status in _EDITABLE_STATUSES,
        "lines": [ln.as_dict() for ln in doc.lines],
    }


@frappe.whitelist()
@handle_api_error
def get_cost_sheet(name: str):
    require_login()
    doc = frappe.get_doc("Vera Cost Sheet", name)
    return {"success": True, "cost_sheet": _serialize(doc)}


# ══════════════════════════════════════════════════════════════════════════════
# CREATE / UPDATE
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_cost_sheet(payload):
    """Build a cost sheet from an approved BOQ. Snapshots the BOQ's line costs
    and its selling total (the GP baseline)."""
    require_login()
    data = _clean(payload, _HEADER_FIELDS)
    if not data.get("cost_title"):
        frappe.throw("A cost sheet title is required.")

    boq_name = None
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    boq_name = payload.get("boq")
    if not boq_name:
        frappe.throw("Select the approved BOQ to build the cost sheet on.")
    boq = frappe.get_doc("Vera BOQ", boq_name)
    if boq.status != "Approved":
        frappe.throw("A cost sheet can only be built on an approved BOQ.")

    doc = frappe.new_doc("Vera Cost Sheet")
    doc.update(data)
    doc.boq = boq.name
    if not doc.company_name:
        doc.company_name = boq.company_name
    if not doc.opportunity:
        doc.opportunity = boq.opportunity
    doc.selling_total = boq.total_selling
    for ln in boq.lines:
        doc.append("lines", {
            "area": ln.area,
            "unit_name": ln.unit_name,
            "item_code": ln.item_code,
            "calc_qty": ln.calc_qty,
            "cost_rate": ln.cost_rate,
            "cost_amount": ln.cost_amount,
        })
    _apply_maths(doc)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_cost_sheet(name: str, payload):
    """Update overhead / GP targets / notes and recompute. Draft-only."""
    require_login()
    doc = frappe.get_doc("Vera Cost Sheet", name)
    _assert_editable(doc)
    doc.update(_clean(payload, _HEADER_FIELDS))
    _apply_maths(doc)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "total_cost": doc.total_cost,
            "projected_gp_percent": doc.projected_gp_percent}


# ══════════════════════════════════════════════════════════════════════════════
# WORKFLOW
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_cost_sheet(name: str):
    require_login()
    doc = frappe.get_doc("Vera Cost Sheet", name)
    if doc.status != "Draft":
        frappe.throw(f"Only a Draft cost sheet can be submitted (this is {doc.status}).")
    doc.status = "Submitted"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def reopen_cost_sheet(name: str):
    require_login()
    doc = frappe.get_doc("Vera Cost Sheet", name)
    if doc.status != "Submitted":
        frappe.throw("Only a Submitted cost sheet can be reopened.")
    doc.status = "Draft"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def approve_cost_sheet(name: str):
    require_login()
    doc = frappe.get_doc("Vera Cost Sheet", name)
    if doc.status not in ("Submitted", "Draft"):
        frappe.throw(f"Cannot approve a {doc.status} cost sheet.")
    if not doc.lines:
        frappe.throw("Cannot approve a cost sheet with no lines.")
    doc.status = "Approved"
    doc.approved_by = frappe.session.user
    doc.approved_on = frappe.utils.now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_revision(name: str):
    require_login()
    src = frappe.get_doc("Vera Cost Sheet", name)
    new = frappe.copy_doc(src, ignore_no_copy=False)
    new.status = "Draft"
    new.revision = (src.revision or 1) + 1
    new.approved_by = None
    new.approved_on = None
    new.supersedes = src.name
    new.insert(ignore_permissions=True)
    if src.status == "Approved":
        src.status = "Superseded"
        src.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": new.name, "revision": new.revision}


@frappe.whitelist()
@handle_api_error
def get_approved_cost_sheets():
    """Approved cost sheets — the GP baseline a quotation (§4.5) prices against."""
    require_login()
    return frappe.get_all(
        "Vera Cost Sheet",
        filters={"status": "Approved"},
        fields=["name", "cost_title", "company_name", "revision", "boq",
                "total_cost", "target_gp_percent", "min_gp_percent"],
        order_by="modified desc",
    )
