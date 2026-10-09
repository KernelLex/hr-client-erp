"""Logistics — outbound Deliveries (+ Proof of Delivery) and a company-wide view
of inbound Goods Receipts (GRNs / order receipts).

Deliveries are managed MANUALLY by the logistics owner: they set the status by
hand, and a delivery can only become "Delivered" once a Proof-of-Delivery
document is attached (enforced in the Vera Delivery controller).

`delivery_dashboard()` is intentionally open to every logged-in user (not
admin-only) so the whole company sees what's going out and its status on the
main dashboard. Porter (on-demand logistics) lives in `porter.py` and is only a
scaffold until the API key is provisioned.
"""

import json
import frappe
from frappe.utils import flt, now_datetime

from hr_client.api.utils import (
    require_login, current_company, require_company, ALL_COMPANIES, handle_api_error,
)

DELIVERY = "Vera Delivery"
GRN = "Vera Goods Receipt"
PO = "Vera Procurement PO"

OPEN_STATUSES = ("Pending", "Ready for Dispatch", "Dispatched", "In Transit")


def _company_filter(base=None):
    """Company-scope a filters dict (no-op for the group __ALL__ view)."""
    f = dict(base or {})
    c = current_company()
    if c != ALL_COMPANIES:
        f["company"] = c
    return f


def _parse(payload, **kwargs):
    data = {}
    if payload:
        data = json.loads(payload) if isinstance(payload, str) else dict(payload)
    data.update({k: v for k, v in kwargs.items() if v is not None})
    return data


# ── Serialization ─────────────────────────────────────────────────────────────

def _serialize_delivery(doc):
    return {
        "name": doc.name,
        "delivery_title": doc.delivery_title,
        "company": doc.company,
        "project": doc.project,
        "customer_name": doc.customer_name,
        "sales_order": doc.sales_order,
        "destination_address": doc.destination_address,
        "status": doc.status,
        "expected_date": str(doc.expected_date) if doc.expected_date else None,
        "dispatch_date": str(doc.dispatch_date) if doc.dispatch_date else None,
        "delivered_on": str(doc.delivered_on) if doc.delivered_on else None,
        "transporter": doc.transporter,
        "vehicle_no": doc.vehicle_no,
        "driver_name": doc.driver_name,
        "driver_phone": doc.driver_phone,
        "pod_document": doc.pod_document,
        "pod_received": bool(doc.pod_received),
        "pod_notes": doc.pod_notes,
        "porter_order_id": doc.porter_order_id,
        "porter_status": doc.porter_status,
        "porter_tracking_url": doc.porter_tracking_url,
        "managed_by": doc.managed_by,
        "notes": doc.notes,
        "items": [{
            "item_description": r.item_description, "spec": r.spec,
            "qty": r.qty, "uom": r.uom, "remarks": r.remarks,
        } for r in doc.get("items") or []],
    }


def _apply_delivery_payload(doc, data):
    for f in ("delivery_title", "customer_name", "sales_order", "destination_address",
              "expected_date", "dispatch_date", "transporter", "vehicle_no",
              "driver_name", "driver_phone", "pod_notes", "managed_by", "notes", "project"):
        if f in data and data[f] is not None:
            doc.set(f, data[f])
    if data.get("items") is not None:
        doc.set("items", [])
        for r in data["items"]:
            if not (r.get("item_description") or r.get("qty")):
                continue
            doc.append("items", {
                "item_description": r.get("item_description"), "spec": r.get("spec"),
                "qty": flt(r.get("qty")), "uom": r.get("uom"), "remarks": r.get("remarks"),
            })


# ── Deliveries (outbound) ─────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def list_deliveries(status: str = None, scope: str = None):
    """List deliveries for the active company. scope='open' => not Delivered/Cancelled."""
    require_login()
    filters = _company_filter()
    if status:
        filters["status"] = status
    elif scope == "open":
        filters["status"] = ["in", list(OPEN_STATUSES)]
    rows = frappe.get_all(
        DELIVERY, filters=filters,
        fields=["name", "delivery_title", "customer_name", "status", "company",
                "expected_date", "dispatch_date", "delivered_on", "transporter",
                "pod_received", "project"],
        order_by="modified desc", limit_page_length=0,
    )
    for r in rows:
        r["item_count"] = frappe.db.count("Vera Delivery Line", {"parent": r["name"]})
        for k in ("expected_date", "dispatch_date", "delivered_on"):
            if r.get(k):
                r[k] = str(r[k])
    return {"deliveries": rows, "total": len(rows)}


@frappe.whitelist()
@handle_api_error
def get_delivery(name: str):
    require_login()
    return _serialize_delivery(frappe.get_doc(DELIVERY, name))


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_delivery(payload: str = None, **kwargs):
    require_login()
    data = _parse(payload, **kwargs)
    doc = frappe.new_doc(DELIVERY)
    doc.company = require_company(data.get("company") or current_company())
    doc.status = data.get("status") or "Pending"
    if not data.get("delivery_title"):
        data["delivery_title"] = f"Delivery — {data.get('customer_name') or 'Customer'}"
    _apply_delivery_payload(doc, data)
    doc.flags.ignore_permissions = True
    doc.insert()
    frappe.db.commit()
    return _serialize_delivery(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_delivery(name: str, payload: str = None, **kwargs):
    require_login()
    data = _parse(payload, **kwargs)
    doc = frappe.get_doc(DELIVERY, name)
    _apply_delivery_payload(doc, data)
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize_delivery(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_delivery_status(name: str, status: str):
    """Manual status change by the logistics owner. The controller blocks
    'Delivered' unless a POD document is attached."""
    require_login()
    valid = {"Pending", "Ready for Dispatch", "Dispatched", "In Transit", "Delivered", "Cancelled"}
    if status not in valid:
        frappe.throw(f"Invalid status '{status}'")
    doc = frappe.get_doc(DELIVERY, name)
    if status == "Delivered" and not doc.pod_document:
        frappe.throw("Attach a Proof of Delivery document before marking this as Delivered.")
    doc.status = status
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize_delivery(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def upload_pod(name: str):
    """Attach a Proof-of-Delivery file (multipart 'file'). Sets pod_received=1.
    Does NOT auto-mark Delivered — the logistics owner still sets status manually."""
    require_login()
    doc = frappe.get_doc(DELIVERY, name)
    files = frappe.request.files if getattr(frappe, "request", None) else None
    file_obj = files.get("file") if files else None
    if not file_obj:
        frappe.throw("No file provided")
    content = file_obj.stream.read()
    if len(content) > 10 * 1024 * 1024:
        frappe.throw("File too large (max 10 MB)")
    saved = frappe.get_doc({
        "doctype": "File",
        "file_name": file_obj.filename,
        "content": content,
        "attached_to_doctype": DELIVERY,
        "attached_to_name": name,
        "is_private": 1,
    })
    saved.flags.ignore_permissions = True
    saved.insert()
    doc.pod_document = saved.file_url
    doc.pod_received = 1
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize_delivery(doc)


@frappe.whitelist()
@handle_api_error
def is_logistics_handler():
    """True when the current user is the person who handles logistics — their
    active Employee sits in a Logistics department or carries a Logistics
    designation. Gates the dashboard quick-add so ONLY the logistics owner sees
    it (admins/owner who aren't logistics do not)."""
    require_login()
    emp = frappe.db.get_value(
        "Employee", {"user_id": frappe.session.user, "status": "Active"},
        ["department", "designation"], as_dict=True,
    )
    if not emp:
        return {"is_handler": False}
    blob = f"{emp.department or ''} {emp.designation or ''}".lower()
    return {"is_handler": "logistics" in blob}


@frappe.whitelist()
@handle_api_error
def delivery_dashboard(limit: int = 12):
    """Company-wide delivery snapshot for the MAIN dashboard — visible to every
    logged-in user. Returns status counts + the most recent deliveries with goods."""
    require_login()
    filters = _company_filter()
    all_rows = frappe.get_all(
        DELIVERY, filters=filters,
        fields=["name", "delivery_title", "customer_name", "status", "expected_date",
                "dispatch_date", "delivered_on", "transporter", "pod_received"],
        order_by="modified desc", limit_page_length=0,
    )
    counts = {"Pending": 0, "Ready for Dispatch": 0, "Dispatched": 0, "In Transit": 0,
              "Delivered": 0, "Cancelled": 0}
    for r in all_rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    recent = all_rows[: int(limit)]
    for r in recent:
        lines = frappe.get_all("Vera Delivery Line", filters={"parent": r["name"]},
                               fields=["item_description", "qty", "uom"], limit_page_length=5)
        r["goods"] = [
            (f"{l.item_description or 'Item'}" + (f" × {int(l.qty) if l.qty and float(l.qty).is_integer() else l.qty} {l.uom or ''}".rstrip() if l.qty else ""))
            for l in lines
        ]
        r["item_count"] = frappe.db.count("Vera Delivery Line", {"parent": r["name"]})
        for k in ("expected_date", "dispatch_date", "delivered_on"):
            if r.get(k):
                r[k] = str(r[k])

    in_progress = sum(counts.get(s, 0) for s in OPEN_STATUSES)
    return {
        "counts": counts,
        "in_progress": in_progress,
        "delivered": counts.get("Delivered", 0),
        "total": len(all_rows),
        "recent": recent,
    }


# ── Goods Receipts (inbound) — company-wide view over the existing GRN model ──

@frappe.whitelist()
@handle_api_error
def list_goods_receipts(status: str = None):
    """Company-wide GRNs with ordered-vs-received reconciliation + a shortfall flag,
    so logistics can confirm 'did we receive everything we ordered'."""
    require_login()
    filters = _company_filter()
    if status:
        filters["status"] = status
    rows = frappe.get_all(
        GRN, filters=filters,
        fields=["name", "grn_title", "vendor", "purchase_order", "project",
                "status", "receipt_date", "total", "company"],
        order_by="modified desc", limit_page_length=0,
    )
    for r in rows:
        lines = frappe.get_all("Vera Goods Receipt Line", filters={"parent": r["name"]},
                               fields=["ordered_qty", "received_qty"], limit_page_length=0)
        ordered = sum(flt(l.ordered_qty) for l in lines)
        received = sum(flt(l.received_qty) for l in lines)
        r["ordered_qty"] = round(ordered, 2)
        r["received_qty"] = round(received, 2)
        r["line_count"] = len(lines)
        r["short_lines"] = sum(1 for l in lines if flt(l.received_qty) < flt(l.ordered_qty))
        r["fully_received"] = r["short_lines"] == 0 and len(lines) > 0
        if r.get("receipt_date"):
            r["receipt_date"] = str(r["receipt_date"])
    return {"grns": rows, "total": len(rows)}


@frappe.whitelist()
@handle_api_error
def list_pos_awaiting_receipt():
    """POs that have been Sent but don't yet have a goods receipt — so logistics
    can raise an order receipt (GRN) to verify what arrived."""
    require_login()
    filters = _company_filter({"status": ["in", ["Sent", "Draft"]]})
    pos = frappe.get_all(PO, filters=filters,
                         fields=["name", "vendor", "project", "status", "po_date", "total"],
                         order_by="modified desc", limit_page_length=0)
    out = []
    for p in pos:
        has_grn = frappe.db.exists(GRN, {"purchase_order": p["name"]})
        if has_grn:
            continue
        if p.get("po_date"):
            p["po_date"] = str(p["po_date"])
        out.append(p)
    return {"pos": out, "total": len(out)}
