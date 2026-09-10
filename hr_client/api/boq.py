"""
Quotation Studio — BOQ / Configuration (Phase 2 spec §4.3), stage 2 of the
six-stage chain.

A BOQ is built on an *approved* measurement revision and captures the full
technical specification of each unit on its own line. Each line's quantity is
derived server-side from its pricing method (never trusted from the client):

    RFT   width ÷ 304.8 × qty
    SFT   width × height ÷ 92,903.04 × qty
    SQM   width × height ÷ 1,000,000 × qty
    UNIT  qty
    LS    1

Before a BOQ can be approved it must pass validation (§4.3): no zero dimensions
on dimensional pricing methods, mandatory specification fields on every line,
and every referenced material/finish/hardware must exist in the masters. Carries
its own revision + approval gate, mirroring measurement sheets. ERP-native.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

_HEADER_FIELDS = ("boq_title", "opportunity", "measurement_sheet", "company_name",
                  "prepared_by", "notes")

_LINE_FIELDS = (
    "area", "category", "unit_name", "item_code", "width", "height", "depth",
    "quantity", "pricing_method", "uom", "carcass_material", "carcass_thickness",
    "internal_finish", "shutter_material", "shutter_thickness", "external_finish",
    "edge_banding", "hardware_package", "selling_rate", "cost_rate", "line_status",
)

_DIMENSIONAL = {"RFT", "SFT", "SQM"}
_EDITABLE_STATUSES = {"Draft"}

# Mandatory specification fields required on every line before approval (§4.3).
_MANDATORY_SPEC = ("unit_name", "pricing_method", "carcass_material", "internal_finish")


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


def calc_line_qty(method, width, height, quantity):
    """The §4.3 pricing formulas. Returns the calculated quantity (3 dp)."""
    method = (method or "").upper()
    w, h, q = _flt(width), _flt(height), _flt(quantity) or 0
    if method == "RFT":
        val = w / 304.8 * q
    elif method == "SFT":
        val = w * h / 92903.04 * q
    elif method == "SQM":
        val = w * h / 1000000.0 * q
    elif method == "UNIT":
        val = q
    elif method == "LS":
        val = 1.0
    else:
        val = 0.0
    return round(val, 3)


def _apply_line_maths(doc):
    """Recompute calc_qty + amounts for every line and roll up header totals."""
    total_sell = 0.0
    total_cost = 0.0
    for ln in doc.lines:
        ln.calc_qty = calc_line_qty(ln.pricing_method, ln.width, ln.height, ln.quantity)
        ln.selling_amount = round(ln.calc_qty * _flt(ln.selling_rate), 2)
        ln.cost_amount = round(ln.calc_qty * _flt(ln.cost_rate), 2)
        total_sell += ln.selling_amount
        total_cost += ln.cost_amount
    doc.total_selling = round(total_sell, 2)
    doc.total_cost = round(total_cost, 2)


def _assert_editable(doc):
    if doc.status not in _EDITABLE_STATUSES:
        frappe.throw(
            f"This BOQ is {doc.status} and can no longer be edited. "
            "Create a new revision to make changes."
        )


# ── Master compatibility lookups (cached per call) ────────────────────────────

def _active_names(doctype, label_field):
    return {
        (r[label_field] or "").strip()
        for r in frappe.get_all(doctype, filters={"status": "Active"}, fields=[label_field])
    }


def _validate_lines(doc):
    """Return a list of human-readable issues; empty list == ready to approve."""
    issues = []
    if not doc.lines:
        return ["The BOQ has no lines."]

    materials = _active_names("Vera Quotation Material", "material_name")
    finishes = _active_names("Vera Quotation Finish", "finish_name")
    hardware = _active_names("Vera Quotation Hardware", "hardware_item")

    for i, ln in enumerate(doc.lines, start=1):
        tag = f"Line {i} ({ln.unit_name or 'unnamed'})"
        # mandatory spec fields (all strings)
        for f in _MANDATORY_SPEC:
            if not (ln.get(f) or "").strip():
                issues.append(f"{tag}: '{f.replace('_', ' ')}' is required.")
        # dimensional zero-check
        method = (ln.pricing_method or "").upper()
        if method in _DIMENSIONAL and _flt(ln.width) <= 0:
            issues.append(f"{tag}: width must be > 0 for {method} pricing.")
        if method in {"SFT", "SQM"} and _flt(ln.height) <= 0:
            issues.append(f"{tag}: height must be > 0 for {method} pricing.")
        # master compatibility — any set value must exist in its master
        for val, pool, kind in (
            (ln.carcass_material, materials, "carcass material"),
            (ln.shutter_material, materials, "shutter material"),
            (ln.internal_finish, finishes, "internal finish"),
            (ln.external_finish, finishes, "external finish"),
            (ln.hardware_package, hardware, "hardware package"),
        ):
            v = (val or "").strip()
            if v and v not in pool:
                issues.append(f"{tag}: {kind} '{v}' is not in the masters.")
    return issues


# ══════════════════════════════════════════════════════════════════════════════
# LIST / DETAIL
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_boqs_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera BOQ",
        fields=["name", "boq_title", "company_name", "status", "revision",
                "total_selling", "measurement_sheet", "source"],
        order_by="modified desc",
    )
    by_status = {}
    for r in rows_raw:
        by_status[r.status] = by_status.get(r.status, 0) + 1

    def inr(v):
        return frappe.utils.fmt_money(_flt(v), currency="INR")

    rows = [{
        "name": r.name,
        "boq_title": r.boq_title,
        "company_name": r.company_name or "—",
        "revision": f"R{r.revision:02d}",
        "total_selling": inr(r.total_selling),
        "status": r.status,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "BOQs", "value": str(len(rows_raw))},
            {"label": "Draft", "value": str(by_status.get("Draft", 0)), "tone": "warn"},
            {"label": "Submitted", "value": str(by_status.get("Submitted", 0))},
            {"label": "Approved", "value": str(by_status.get("Approved", 0)), "tone": "good"},
        ],
        "columns": [
            {"key": "name", "header": "No."},
            {"key": "boq_title", "header": "Title"},
            {"key": "company_name", "header": "Client"},
            {"key": "revision", "header": "Rev"},
            {"key": "total_selling", "header": "Total Selling", "align": "right", "kind": "amount"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Stage 2. Built on an approved measurement. Approve a BOQ to "
                "unlock the cost sheet and quotation; approval requires every "
                "line to pass validation.",
    }


def _serialize(doc):
    return {
        "name": doc.name,
        "boq_title": doc.boq_title,
        "opportunity": doc.opportunity,
        "measurement_sheet": doc.measurement_sheet,
        "company_name": doc.company_name,
        "stage": doc.stage,
        "status": doc.status,
        "revision": doc.revision,
        "prepared_by": doc.prepared_by,
        "approved_by": doc.approved_by,
        "approved_on": doc.approved_on,
        "supersedes": doc.supersedes,
        "notes": doc.notes,
        "total_selling": doc.total_selling,
        "total_cost": doc.total_cost,
        "source": doc.source,
        "editable": doc.status in _EDITABLE_STATUSES,
        "lines": [ln.as_dict() for ln in doc.lines],
    }


@frappe.whitelist()
@handle_api_error
def get_boq(name: str):
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    out = _serialize(doc)
    out["issues"] = _validate_lines(doc)
    return {"success": True, "boq": out}


# ══════════════════════════════════════════════════════════════════════════════
# CREATE / UPDATE
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_boq(payload, seed_from_measurement: int = 1):
    """Create a BOQ. If a measurement sheet is supplied it must be Approved
    (§4.2/§4.3); its rows optionally seed the BOQ lines."""
    require_login()
    data = _clean(payload, _HEADER_FIELDS)
    if not data.get("boq_title"):
        frappe.throw("A BOQ title is required.")

    ms_name = data.get("measurement_sheet")
    ms = None
    if ms_name:
        ms = frappe.get_doc("Vera Measurement Sheet", ms_name)
        if ms.status != "Approved":
            frappe.throw("A BOQ can only be built on an approved measurement revision.")

    doc = frappe.new_doc("Vera BOQ")
    doc.update(data)
    if ms:
        if not doc.company_name:
            doc.company_name = ms.company_name
        if not doc.opportunity:
            doc.opportunity = ms.opportunity
        if frappe.utils.cint(seed_from_measurement):
            for r in ms.rows:
                doc.append("lines", {
                    "area": r.area,
                    "unit_name": r.product,
                    "item_code": r.reference_code,
                    "width": r.width,
                    "height": r.height,
                    "depth": r.depth,
                    "quantity": r.quantity or 1,
                    "uom": r.uom,
                    "line_status": "Draft",
                })
    _apply_line_maths(doc)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "seeded_lines": len(doc.lines)}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_boq(name: str, payload):
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    _assert_editable(doc)
    doc.update(_clean(payload, _HEADER_FIELDS))
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_lines(name: str, lines):
    """Replace all BOQ lines, recompute quantities/amounts/totals server-side.
    Draft-only."""
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    _assert_editable(doc)
    doc.set("lines", [])
    for r in _rows_of(lines, "lines"):
        doc.append("lines", {k: r.get(k) for k in _LINE_FIELDS if r.get(k) is not None})
    _apply_line_maths(doc)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "count": len(doc.lines),
            "total_selling": doc.total_selling, "total_cost": doc.total_cost}


# ══════════════════════════════════════════════════════════════════════════════
# VALIDATION + WORKFLOW
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def validate_boq(name: str):
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    issues = _validate_lines(doc)
    return {"success": True, "ready": not issues, "issues": issues}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_boq(name: str):
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    if doc.status != "Draft":
        frappe.throw(f"Only a Draft BOQ can be submitted (this is {doc.status}).")
    if not doc.lines:
        frappe.throw("Add at least one line before submitting.")
    doc.status = "Submitted"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def reopen_boq(name: str):
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    if doc.status != "Submitted":
        frappe.throw("Only a Submitted BOQ can be reopened.")
    doc.status = "Draft"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def approve_boq(name: str):
    """Approve — but only if validation passes (§4.3)."""
    require_login()
    doc = frappe.get_doc("Vera BOQ", name)
    if doc.status not in ("Submitted", "Draft"):
        frappe.throw(f"Cannot approve a {doc.status} BOQ.")
    issues = _validate_lines(doc)
    if issues:
        return {"success": False, "ready": False, "issues": issues,
                "error": "BOQ failed validation — resolve the issues before approving."}
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
    src = frappe.get_doc("Vera BOQ", name)
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
def get_approved_boqs():
    """Approved BOQs — the source for cost sheets (§4.4) and quotations (§4.5)."""
    require_login()
    return frappe.get_all(
        "Vera BOQ",
        filters={"status": "Approved"},
        fields=["name", "boq_title", "company_name", "revision", "opportunity",
                "total_selling", "total_cost"],
        order_by="modified desc",
    )
