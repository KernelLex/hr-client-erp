"""
ERP Entries + request-and-approve workflow (Phase 2 spec §2.3 / §2.4).

Two DocTypes back this module:
  * Vera ERP Entry           — the ERP-native record (Class B). Admin-writable.
  * Vera Data Entry Request  — a non-admin's request to create one.

Write access to entries is restricted to Admin. Every other user files a
request, which enters the admin queue and, on approval, materialises the real
entry (the two are linked permanently). Entries are voided, never hard-deleted.
"""

import frappe

from hr_client.api.utils import require_login, require_admin, handle_api_error

# Fields a requester/admin may set on an entry or request. Everything else
# (status, provenance, audit fields) is server-controlled.
_ENTRY_FIELDS = (
    "entry_type", "entry_date", "party", "amount", "description", "reason",
    "attachment", "linked_project", "linked_quotation", "linked_sales_order",
)

_ENTRY_TYPES = {
    "Supplementary Invoice", "Proforma Invoice", "Internal Debit Note",
    "Internal Credit Note", "Expense Entry", "Advance Record",
    "Manual Adjustment", "Free-form Document",
}


def _clean(payload: dict) -> dict:
    """Keep only recognised entry fields from a caller-supplied dict."""
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in _ENTRY_FIELDS if payload.get(k) is not None}


def _validate(data: dict):
    if data.get("entry_type") and data["entry_type"] not in _ENTRY_TYPES:
        frappe.throw(f"Unknown entry type: {data['entry_type']}")


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — direct entry management (§2.3)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_entry(payload: str):
    """Admin creates an ERP-native entry directly."""
    require_admin()
    data = _clean(payload)
    _validate(data)
    if not data.get("entry_type") or not data.get("entry_date") or not data.get("description"):
        frappe.throw("Entry type, date and description are required.")

    doc = frappe.new_doc("Vera ERP Entry")
    doc.update(data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def void_entry(name: str, reason: str):
    """Void an entry (never hard-delete). Reason is mandatory."""
    require_admin()
    if not reason:
        frappe.throw("A reason is required to void an entry.")
    doc = frappe.get_doc("Vera ERP Entry", name)
    doc.void(reason)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "status": doc.status}


@frappe.whitelist()
@handle_api_error
def list_entries(status: str = None, entry_type: str = None):
    """All ERP-native entries. Read-only for everyone; write is admin-only."""
    require_login()
    filters = {}
    if status:
        filters["status"] = status
    if entry_type:
        filters["entry_type"] = entry_type
    rows = frappe.get_all(
        "Vera ERP Entry",
        filters=filters,
        fields=[
            "name", "entry_type", "entry_date", "party", "amount", "description",
            "status", "source", "created_via_request", "created_by_user",
            "linked_project", "linked_quotation", "linked_sales_order",
        ],
        order_by="entry_date desc",
    )
    return {"entries": rows, "can_write": _is_admin()}


# ══════════════════════════════════════════════════════════════════════════════
# REQUEST ROUTE — non-admins (§2.4)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_request(payload: str, name: str = None):
    """Create or update a Draft / Returned-for-Info request. Requester only."""
    require_login()
    data = _clean(payload)
    _validate(data)

    if name:
        doc = frappe.get_doc("Vera Data Entry Request", name)
        _assert_requester(doc)
        if doc.request_status not in ("Draft", "Returned for Info"):
            frappe.throw("Only draft or returned requests can be edited.")
        doc.update(data)
        doc.save(ignore_permissions=True)
    else:
        if not data.get("entry_type") or not data.get("entry_date") or not data.get("description"):
            frappe.throw("Entry type, date and description are required.")
        doc = frappe.new_doc("Vera Data Entry Request")
        doc.update(data)
        doc.request_status = "Draft"
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return {"success": True, "name": doc.name, "request_status": doc.request_status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def submit_request(name: str):
    """Draft / Returned → Submitted. Requester can no longer edit after this."""
    require_login()
    doc = frappe.get_doc("Vera Data Entry Request", name)
    _assert_requester(doc)
    if doc.request_status not in ("Draft", "Returned for Info"):
        frappe.throw("This request has already been submitted.")
    doc.request_status = "Submitted"
    doc.submitted_on = frappe.utils.now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "request_status": doc.request_status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def withdraw_request(name: str):
    """Requester withdraws a submitted request (before it is approved/rejected)."""
    require_login()
    doc = frappe.get_doc("Vera Data Entry Request", name)
    _assert_requester(doc)
    if doc.request_status not in ("Submitted", "Under Review"):
        frappe.throw("Only a submitted or under-review request can be withdrawn.")
    doc.request_status = "Draft"
    doc.submitted_on = None
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "request_status": doc.request_status}


@frappe.whitelist()
@handle_api_error
def my_requests(status: str = None):
    """The calling user's own requests."""
    require_login()
    filters = {"requested_by": frappe.session.user}
    if status:
        filters["request_status"] = status
    rows = frappe.get_all(
        "Vera Data Entry Request",
        filters=filters,
        fields=[
            "name", "entry_type", "entry_date", "party", "amount", "description",
            "request_status", "submitted_on", "rejection_reason", "admin_notes",
            "created_entry",
        ],
        order_by="modified desc",
    )
    return {"requests": rows}


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN QUEUE — review & decide (§2.4)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def list_requests(status: str = None, entry_type: str = None, requester: str = None):
    """Admin queue with filters. Includes a pending count for the sidebar badge."""
    require_admin()
    filters = {}
    if status:
        filters["request_status"] = status
    if entry_type:
        filters["entry_type"] = entry_type
    if requester:
        filters["requested_by"] = requester
    rows = frappe.get_all(
        "Vera Data Entry Request",
        filters=filters,
        fields=[
            "name", "entry_type", "entry_date", "party", "amount", "description",
            "reason", "request_status", "requested_by", "requested_by_name",
            "submitted_on", "reviewed_by", "reviewed_on", "admin_notes",
            "rejection_reason", "created_entry", "linked_project",
            "linked_quotation", "linked_sales_order",
        ],
        order_by="submitted_on asc",
    )
    pending = frappe.db.count(
        "Vera Data Entry Request",
        {"request_status": ["in", ["Submitted", "Under Review"]]},
    )
    return {"requests": rows, "pending_count": pending}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def mark_under_review(name: str):
    """Submitted → Under Review. Visible to the requester so they know."""
    require_admin()
    doc = frappe.get_doc("Vera Data Entry Request", name)
    if doc.request_status != "Submitted":
        frappe.throw("Only a submitted request can be moved to Under Review.")
    doc.request_status = "Under Review"
    doc.reviewed_by = frappe.session.user
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "request_status": doc.request_status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def approve_request(name: str, admin_notes: str = None):
    """Approve: materialise the real ERP Entry from the request and link them."""
    require_admin()
    doc = frappe.get_doc("Vera Data Entry Request", name)
    if doc.request_status not in ("Submitted", "Under Review"):
        frappe.throw("Only a submitted or under-review request can be approved.")

    entry = frappe.new_doc("Vera ERP Entry")
    for field in _ENTRY_FIELDS:
        entry.set(field, doc.get(field))
    entry.created_via_request = doc.name
    entry.created_by_user = doc.requested_by
    entry.insert(ignore_permissions=True)

    doc.request_status = "Approved"
    doc.created_entry = entry.name
    doc.reviewed_by = frappe.session.user
    doc.reviewed_on = frappe.utils.now_datetime()
    if admin_notes:
        doc.admin_notes = admin_notes
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "request_status": doc.request_status, "created_entry": entry.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def reject_request(name: str, rejection_reason: str, admin_notes: str = None):
    """Reject with a mandatory reason. Requester can raise a fresh request."""
    require_admin()
    if not rejection_reason:
        frappe.throw("A rejection reason is required.")
    doc = frappe.get_doc("Vera Data Entry Request", name)
    if doc.request_status not in ("Submitted", "Under Review"):
        frappe.throw("Only a submitted or under-review request can be rejected.")
    doc.request_status = "Rejected"
    doc.rejection_reason = rejection_reason
    doc.reviewed_by = frappe.session.user
    doc.reviewed_on = frappe.utils.now_datetime()
    if admin_notes:
        doc.admin_notes = admin_notes
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "request_status": doc.request_status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def return_request(name: str, admin_notes: str):
    """Return to the requester for a correction/attachment (editable again)."""
    require_admin()
    if not admin_notes:
        frappe.throw("Please say what needs correcting when returning a request.")
    doc = frappe.get_doc("Vera Data Entry Request", name)
    if doc.request_status not in ("Submitted", "Under Review"):
        frappe.throw("Only a submitted or under-review request can be returned.")
    doc.request_status = "Returned for Info"
    doc.admin_notes = admin_notes
    doc.reviewed_by = frappe.session.user
    doc.reviewed_on = frappe.utils.now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "request_status": doc.request_status}


# ── helpers ──────────────────────────────────────────────────────────────────

def _is_admin() -> bool:
    user = frappe.session.user
    from hr_client.api.utils import ADMIN_USERS
    return user in ADMIN_USERS or "System Manager" in frappe.get_roles(user)


def _assert_requester(doc):
    """Only the requester (or an admin) may act on a request as its owner."""
    if doc.requested_by != frappe.session.user and not _is_admin():
        frappe.throw("You can only act on your own requests.", frappe.PermissionError)
