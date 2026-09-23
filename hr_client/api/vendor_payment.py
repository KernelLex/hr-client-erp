"""
Vendor payments + supplier ledger.

Purchase Orders and Goods Receipts capture what we ordered and received; this
tracks what we've actually *paid* each vendor and what's still outstanding.
The ledger rolls up, per vendor: ordered (POs) vs received (GRN value) vs paid
(payments here) → outstanding. Company-scoped.
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company, allowed_companies, scoped,
)

_DT = "Vera Vendor Payment"
PO = "Vera Procurement PO"
GRN = "Vera Goods Receipt"
_FIELDS = ["vendor", "company", "project", "purchase_order", "amount", "payment_date", "mode", "reference", "notes"]
_flt = frappe.utils.flt


@frappe.whitelist(methods=["POST"])
@handle_api_error
def record_payment(payload: str = None, **kwargs):
    require_login()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    name = data.get("name")
    if name and frappe.db.exists(_DT, name):
        doc = frappe.get_doc(_DT, name)
    else:
        doc = frappe.new_doc(_DT)
        doc.company = data.get("company") or current_company()
    for f in _FIELDS:
        if f in data:
            doc.set(f, data.get(f))
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_payment(name: str):
    require_admin()
    frappe.delete_doc(_DT, name, ignore_permissions=True)
    frappe.db.commit()
    return {"deleted": name}


@frappe.whitelist()
@handle_api_error
def list_payments(vendor: str = None, project: str = None):
    require_login()
    filters = scoped({})
    if vendor:
        filters["vendor"] = vendor
    if project:
        filters["project"] = project
    rows = frappe.get_all(
        _DT, filters=filters,
        fields=["name", "vendor", "company", "project", "purchase_order", "amount",
                "payment_date", "mode", "reference"],
        order_by="payment_date desc, creation desc")
    return {"payments": rows}


@frappe.whitelist()
@handle_api_error
def get_supplier_ledger():
    """Per-vendor rollup: ordered (POs) vs received (confirmed GRN value) vs paid,
    with outstanding = received − paid (we owe for what we've received)."""
    require_login()
    comps = allowed_companies() or frappe.get_all("Company", pluck="name")
    ph = {"comps": tuple(comps) if comps else ("__none__",)}

    ordered = frappe.db.sql(
        f"SELECT vendor, SUM(total) v, COUNT(*) n FROM `tab{PO}` "
        f"WHERE company IN %(comps)s AND status != 'Cancelled' GROUP BY vendor", ph, as_dict=True)
    received = frappe.db.sql(
        f"SELECT vendor, SUM(total) v FROM `tab{GRN}` "
        f"WHERE company IN %(comps)s AND status = 'Received' GROUP BY vendor", ph, as_dict=True)
    paid = frappe.db.sql(
        f"SELECT vendor, SUM(amount) v FROM `tab{_DT}` "
        f"WHERE company IN %(comps)s GROUP BY vendor", ph, as_dict=True)

    ledger = {}
    for r in ordered:
        ledger.setdefault(r.vendor, {"vendor": r.vendor, "ordered": 0, "received": 0, "paid": 0, "pos": 0})
        ledger[r.vendor]["ordered"] = _flt(r.v); ledger[r.vendor]["pos"] = r.n
    for r in received:
        ledger.setdefault(r.vendor, {"vendor": r.vendor, "ordered": 0, "received": 0, "paid": 0, "pos": 0})
        ledger[r.vendor]["received"] = _flt(r.v)
    for r in paid:
        ledger.setdefault(r.vendor, {"vendor": r.vendor, "ordered": 0, "received": 0, "paid": 0, "pos": 0})
        ledger[r.vendor]["paid"] = _flt(r.v)

    rows = []
    for v in ledger.values():
        v["outstanding"] = round(v["received"] - v["paid"], 2)
        for k in ("ordered", "received", "paid"):
            v[k] = round(v[k], 2)
        rows.append(v)
    rows.sort(key=lambda x: x["outstanding"], reverse=True)
    kpis = {
        "vendors": len(rows),
        "ordered": round(sum(r["ordered"] for r in rows)),
        "received": round(sum(r["received"] for r in rows)),
        "paid": round(sum(r["paid"] for r in rows)),
        "outstanding": round(sum(r["outstanding"] for r in rows)),
    }
    return {"ledger": rows, "kpis": kpis}
