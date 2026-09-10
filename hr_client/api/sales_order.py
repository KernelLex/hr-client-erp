"""
Quotation Studio — Sales Orders (Phase 2 spec §4.11), stage 6 of the six-stage
chain.

A sales order is created only by gated conversion from an approved quotation
(the conversion itself lives in hr_client.api.quotation.convert_to_sales_order).
It permanently records the source quotation / BOQ / cost sheet numbers with
their revisions and is the commercial execution baseline. This module serves the
list + detail read views. ERP-native.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error


def _flt(v):
    return frappe.utils.flt(v)


@frappe.whitelist()
@handle_api_error
def get_sales_orders_page():
    require_login()
    rows_raw = frappe.get_all(
        "Vera Sales Order",
        fields=["name", "so_title", "company_name", "status", "grand_total",
                "quotation", "so_date", "source"],
        order_by="modified desc",
    )
    by_status = {}
    for r in rows_raw:
        by_status[r.status] = by_status.get(r.status, 0) + 1

    def inr(v):
        return frappe.utils.fmt_money(_flt(v), currency="INR")

    rows = [{
        "name": r.name,
        "so_title": r.so_title,
        "company_name": r.company_name or "—",
        "quotation": r.quotation or "—",
        "grand_total": inr(r.grand_total),
        "so_date": r.so_date,
        "status": r.status,
        "source": r.source or "ERP",
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Sales Orders", "value": str(len(rows_raw))},
            {"label": "Open", "value": str(by_status.get("Open", 0)), "tone": "warn"},
            {"label": "Confirmed", "value": str(by_status.get("Confirmed", 0)), "tone": "good"},
            {"label": "Value", "value": inr(sum(_flt(r.grand_total) for r in rows_raw))},
        ],
        "columns": [
            {"key": "name", "header": "No."},
            {"key": "so_title", "header": "Title"},
            {"key": "company_name", "header": "Client"},
            {"key": "quotation", "header": "From Quotation"},
            {"key": "grand_total", "header": "Grand Total", "align": "right", "kind": "amount"},
            {"key": "so_date", "header": "Date", "kind": "date"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Stage 6 — the approved commercial baseline. Created only by "
                "gated conversion from an approved quotation; records the source "
                "quotation, BOQ and cost sheet revisions. Triggers the §5 "
                "project handover.",
    }


@frappe.whitelist()
@handle_api_error
def get_sales_order(name: str):
    require_login()
    doc = frappe.get_doc("Vera Sales Order", name)
    return {"success": True, "sales_order": {
        "name": doc.name,
        "so_title": doc.so_title,
        "opportunity": doc.opportunity,
        "company_name": doc.company_name,
        "so_date": doc.so_date,
        "status": doc.status,
        "stage": doc.stage,
        "grand_total": doc.grand_total,
        "prepared_by": doc.prepared_by,
        "quotation": doc.quotation,
        "quotation_revision": doc.quotation_revision,
        "boq": doc.boq,
        "boq_revision": doc.boq_revision,
        "cost_sheet": doc.cost_sheet,
        "cost_sheet_revision": doc.cost_sheet_revision,
        "notes": doc.notes,
        "lines": [ln.as_dict() for ln in doc.lines],
    }}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_status(name: str, status: str):
    require_login()
    if status not in ("Open", "Confirmed", "Cancelled"):
        frappe.throw(f"Unknown status: {status}")
    doc = frappe.get_doc("Vera Sales Order", name)
    doc.status = status
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}
