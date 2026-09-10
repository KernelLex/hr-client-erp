"""
Quotation Studio — Measurement Sheets (Phase 2 spec §4.2), stage 1 of the
six-stage chain.

A measurement sheet captures actual site dimensions across three registers
(measurement rows, obstruction register, services register) and carries its own
revision with an approval gate: a BOQ (§4.3) can only be built on an *approved*
measurement revision. Everything here is ERP-native.

Editing model: a sheet is freely editable while Draft. Submitting locks it for
review; approving locks it permanently. To change an approved sheet you create a
new revision (which supersedes the old one) — so the source of every figure
stays permanently traceable, per §4.1.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

_HEADER_FIELDS = (
    "measurement_title", "opportunity", "company_name", "measurement_type",
    "measurement_date", "drawing_reference", "measured_by", "notes",
)

_ROW_FIELDS = ("area", "reference_code", "product", "template", "description",
               "width", "height", "depth", "quantity", "uom", "site_condition", "note")
_OBSTRUCTION_FIELDS = ("obstruction_type", "wall", "width", "height",
                       "distance_from_left", "distance_from_floor", "handling_note")
_SERVICE_FIELDS = ("service_type", "sub_description", "wall", "x_coord", "y_coord",
                   "readiness_status")

# register key -> (child fieldname on parent, allowed fields)
_REGISTERS = {
    "rows": ("rows", _ROW_FIELDS),
    "obstructions": ("obstructions", _OBSTRUCTION_FIELDS),
    "services": ("services", _SERVICE_FIELDS),
}

_EDITABLE_STATUSES = {"Draft"}


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


def _rows_of(payload, key):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return payload if isinstance(payload, list) else payload.get(key, [])


def _assert_editable(doc):
    if doc.status not in _EDITABLE_STATUSES:
        frappe.throw(
            f"This measurement is {doc.status} and can no longer be edited. "
            "Create a new revision to make changes."
        )


# ══════════════════════════════════════════════════════════════════════════════
# LIST
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_measurements_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera Measurement Sheet",
        fields=["name", "measurement_title", "company_name", "measurement_type",
                "status", "revision", "measurement_date", "source"],
        order_by="modified desc",
    )
    by_status = {}
    for r in rows_raw:
        by_status[r.status] = by_status.get(r.status, 0) + 1

    rows = [{
        "name": r.name,
        "measurement_title": r.measurement_title,
        "company_name": r.company_name or "—",
        "measurement_type": r.measurement_type,
        "revision": f"R{r.revision:02d}",
        "status": r.status,
        "measurement_date": r.measurement_date,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Sheets", "value": str(len(rows_raw))},
            {"label": "Draft", "value": str(by_status.get("Draft", 0)), "tone": "warn"},
            {"label": "Submitted", "value": str(by_status.get("Submitted", 0))},
            {"label": "Approved", "value": str(by_status.get("Approved", 0)), "tone": "good"},
        ],
        "columns": [
            {"key": "name", "header": "No."},
            {"key": "measurement_title", "header": "Title"},
            {"key": "company_name", "header": "Client"},
            {"key": "measurement_type", "header": "Type"},
            {"key": "revision", "header": "Rev"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Stage 1 of the Quotation Studio. Approve a measurement to "
                "unlock BOQ creation on it. Approved sheets are locked — create "
                "a revision to change them.",
    }


# ══════════════════════════════════════════════════════════════════════════════
# DETAIL (full sheet incl. registers) — for the editor
# ══════════════════════════════════════════════════════════════════════════════

def _serialize(doc):
    return {
        "name": doc.name,
        "measurement_title": doc.measurement_title,
        "opportunity": doc.opportunity,
        "company_name": doc.company_name,
        "measurement_type": doc.measurement_type,
        "measurement_date": doc.measurement_date,
        "drawing_reference": doc.drawing_reference,
        "stage": doc.stage,
        "status": doc.status,
        "revision": doc.revision,
        "measured_by": doc.measured_by,
        "approved_by": doc.approved_by,
        "approved_on": doc.approved_on,
        "supersedes": doc.supersedes,
        "notes": doc.notes,
        "source": doc.source,
        "editable": doc.status in _EDITABLE_STATUSES,
        "rows": [r.as_dict() for r in doc.rows],
        "obstructions": [r.as_dict() for r in doc.obstructions],
        "services": [r.as_dict() for r in doc.services],
    }


@frappe.whitelist()
@handle_api_error
def get_measurement(name: str):
    require_login()
    doc = frappe.get_doc("Vera Measurement Sheet", name)
    return {"success": True, "measurement": _serialize(doc)}


# ══════════════════════════════════════════════════════════════════════════════
# CREATE / UPDATE
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_measurement(payload):
    require_login()
    data = _clean(payload, _HEADER_FIELDS)
    if not data.get("measurement_title"):
        frappe.throw("A measurement title is required.")
    doc = frappe.new_doc("Vera Measurement Sheet")
    doc.update(data)
    if doc.opportunity and not doc.company_name:
        doc.company_name = frappe.db.get_value(
            "Vera CRM Opportunity", doc.opportunity, "company_name")
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_measurement(name: str, payload):
    require_login()
    doc = frappe.get_doc("Vera Measurement Sheet", name)
    _assert_editable(doc)
    doc.update(_clean(payload, _HEADER_FIELDS))
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_register(name: str, register: str, rows):
    """Replace all rows of one register (rows / obstructions / services) with the
    supplied set. Only permitted while the sheet is Draft."""
    require_login()
    if register not in _REGISTERS:
        frappe.throw(f"Unknown register: {register}")
    child_field, allowed = _REGISTERS[register]
    doc = frappe.get_doc("Vera Measurement Sheet", name)
    _assert_editable(doc)
    doc.set(child_field, [])
    for r in _rows_of(rows, register):
        doc.append(child_field, {k: r.get(k) for k in allowed if r.get(k) is not None})
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "count": len(doc.get(child_field))}


# ══════════════════════════════════════════════════════════════════════════════
# WORKFLOW — submit / approve / create revision
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_measurement(name: str):
    require_login()
    doc = frappe.get_doc("Vera Measurement Sheet", name)
    if doc.status != "Draft":
        frappe.throw(f"Only a Draft measurement can be submitted (this is {doc.status}).")
    if not doc.rows:
        frappe.throw("Add at least one measurement row before submitting.")
    doc.status = "Submitted"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def reopen_measurement(name: str):
    """Send a Submitted sheet back to Draft for further editing."""
    require_login()
    doc = frappe.get_doc("Vera Measurement Sheet", name)
    if doc.status != "Submitted":
        frappe.throw("Only a Submitted measurement can be reopened.")
    doc.status = "Draft"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def approve_measurement(name: str):
    require_login()
    doc = frappe.get_doc("Vera Measurement Sheet", name)
    if doc.status not in ("Submitted", "Draft"):
        frappe.throw(f"Cannot approve a {doc.status} measurement.")
    if not doc.rows:
        frappe.throw("Cannot approve a measurement with no rows.")
    doc.status = "Approved"
    doc.approved_by = frappe.session.user
    doc.approved_on = frappe.utils.now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_revision(name: str):
    """Clone an Approved (or Superseded) sheet into a fresh Draft with
    revision+1, mark the source Superseded, and link them via `supersedes`."""
    require_login()
    src = frappe.get_doc("Vera Measurement Sheet", name)
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


# ══════════════════════════════════════════════════════════════════════════════
# SHARED — approved-measurement options for downstream BOQ creation (§4.3)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_approved_measurements():
    """Approved measurement sheets — the only ones a BOQ may be built on."""
    require_login()
    return frappe.get_all(
        "Vera Measurement Sheet",
        filters={"status": "Approved"},
        fields=["name", "measurement_title", "company_name", "revision", "opportunity"],
        order_by="modified desc",
    )
