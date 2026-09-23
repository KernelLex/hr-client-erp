"""
Consolidated multi-company (group) dashboard.

One cockpit across the three companies (Vera Enterprises / Schönes Leben /
Hagan Modular): sales, active projects, live quotations, open service tickets
and vendor dues — per company and combined. Read-only aggregation over data
that already exists; no new storage.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error, allowed_companies

_flt = frappe.utils.flt


def _fy_start():
    try:
        fy = frappe.utils.get_fiscal_year(frappe.utils.today(), as_dict=True)
        return str(fy.get("year_start_date"))
    except Exception:
        return f"{frappe.utils.now_datetime().year}-01-01"


def _count(doctype, filters):
    try:
        return frappe.db.count(doctype, filters)
    except Exception:
        return 0


def _company_block(company, start, today):
    # sales via the shared profitability utility (Tally-backed, company-aware)
    net_sales = 0.0
    try:
        from hr_client.api.profitability import get_profitability_summary
        summ = get_profitability_summary(start, today, company)
        net_sales = _flt(summ.get("net_sales"))
    except Exception:
        net_sales = 0.0

    def cc(dt):
        # only filter by company when the doctype actually has that column
        try:
            if frappe.get_meta(dt).has_field("company"):
                return _count(dt, {"company": company})
            return None
        except Exception:
            return 0

    # vendor dues for this company (received − paid)
    received = _flt(frappe.db.sql(
        "SELECT SUM(total) FROM `tabVera Goods Receipt` WHERE company=%s AND status='Received'",
        company)[0][0])
    paid = _flt(frappe.db.sql(
        "SELECT SUM(amount) FROM `tabVera Vendor Payment` WHERE company=%s", company)[0][0])

    return {
        "company": company,
        "net_sales": round(net_sales),
        "quotations": cc("Vera Sales Quotation"),
        "projects": cc("Vera Project"),
        "sales_orders": cc("Vera Sales Order"),
        "open_tickets": _count("Vera Service Ticket", {"company": company, "status": ["in", ["Open", "In Progress"]]}),
        "vendor_outstanding": round(received - paid),
    }


@frappe.whitelist()
@handle_api_error
def get_group_overview():
    require_login()
    companies = allowed_companies() or frappe.get_all("Company", pluck="name")
    start, today = _fy_start(), frappe.utils.today()
    blocks = [_company_block(c, start, today) for c in companies]

    def s(key):
        return round(sum(_flt(b.get(key)) for b in blocks))

    combined = {
        "net_sales": s("net_sales"),
        "quotations": s("quotations"),
        "projects": s("projects"),
        "sales_orders": s("sales_orders"),
        "open_tickets": s("open_tickets"),
        "vendor_outstanding": s("vendor_outstanding"),
        # group-wide, not per-company
        "opportunities": _count("Vera CRM Opportunity", {}),
        "catalogue_items": _count("Item", {}),
        "employees": _count("Employee", {"status": "Active"}),
    }
    return {"period": {"from": start, "to": today}, "companies": blocks, "combined": combined}
