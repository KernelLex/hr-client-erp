"""
Hardware Package admin (Functional PRD §25 — Standard / Premium / Luxury bundles).

The spec names three tiers (Package A Standard / B Premium / C Luxury) but leaves
their contents and price to the business. This module lets an admin build each
package from the live vendor catalogue: pick hardware items (rate auto-fills from
the Vendor MRP price list), set quantities, and either auto-sum or set a package
price. Packages then speed up BOQ/quotation prep.

Company-aware: packages carry a `company` so each brand (VE / Schönes Leben /
Hagan Modular) can maintain its own tiers; list is filtered to the user's
companies.
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company,
    allowed_companies, scoped,
)

_DT = "Vera Hardware Package"
_HEADER = ["package_name", "tier", "status", "company", "product_scope",
           "description", "auto_price", "package_price"]


def _company_filter():
    comps = allowed_companies()
    return comps or frappe.get_all("Company", pluck="name")


@frappe.whitelist()
@handle_api_error
def list_packages():
    """All packages the user may see, with light KPIs for the header."""
    require_login()
    rows = frappe.get_all(
        _DT, filters={"company": ["in", _company_filter()]},
        fields=["name", "package_name", "tier", "status", "company",
                "product_scope", "package_price"],
        order_by="tier asc, package_name asc")
    for r in rows:
        r["item_count"] = frappe.db.count("Vera Hardware Package Item", {"parent": r["name"]})
    kpis = {
        "total": len(rows),
        "standard": sum(1 for r in rows if r["tier"] == "Standard"),
        "premium": sum(1 for r in rows if r["tier"] == "Premium"),
        "luxury": sum(1 for r in rows if r["tier"] == "Luxury"),
    }
    return {"packages": rows, "kpis": kpis}


@frappe.whitelist()
@handle_api_error
def get_package(name: str):
    require_login()
    doc = frappe.get_doc(_DT, name)
    return {
        "name": doc.name,
        "code": doc.code,
        **{f: doc.get(f) for f in _HEADER},
        "items": [
            {"item_code": r.item_code, "item_name": r.item_name, "brand": r.brand,
             "qty": r.qty, "uom": r.uom, "rate": r.rate, "amount": r.amount}
            for r in doc.get("items") or []
        ],
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_package(payload: str = None, name: str = None, **kwargs):
    """Create or update a package with its item lines. Admin-only."""
    require_admin()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    name = name or data.get("name")

    if name and frappe.db.exists(_DT, name):
        doc = frappe.get_doc(_DT, name)
    else:
        doc = frappe.new_doc(_DT)
        # code drives autoname; derive from name/tier when not supplied
        code = (data.get("code") or "").strip()
        if not code:
            base = (data.get("package_name") or data.get("tier") or "PKG").upper()
            code = frappe.scrub(base).upper().replace("_", "-")[:30]
        doc.code = code

    for f in _HEADER:
        if f in data:
            doc.set(f, data.get(f))
    if not doc.company:
        doc.company = current_company()

    items = data.get("items") or []
    doc.set("items", [])
    for it in items:
        if not (it.get("item_code") or it.get("item_name")):
            continue
        doc.append("items", {
            "item_code": it.get("item_code"),
            "item_name": it.get("item_name"),
            "brand": it.get("brand"),
            "qty": frappe.utils.flt(it.get("qty")) or 1,
            "uom": it.get("uom"),
            "rate": frappe.utils.flt(it.get("rate")),
        })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return get_package(doc.name)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_package(name: str):
    require_admin()
    frappe.delete_doc(_DT, name, ignore_permissions=True)
    frappe.db.commit()
    return {"deleted": name}


@frappe.whitelist()
@handle_api_error
def search_items(query: str = "", limit: int = 20):
    """Find catalogue items to add to a package. Returns item_code/name/brand +
    the current MRP from the Vendor MRP price list so the rate auto-fills."""
    require_login()
    q = (query or "").strip()
    if len(q) < 2:
        return {"items": []}
    like = f"%{q}%"
    rows = frappe.db.sql(
        """
        SELECT i.name AS item_code, i.item_name, i.brand,
               i.stock_uom AS uom, ip.price_list_rate AS rate
        FROM `tabItem` i
        LEFT JOIN `tabItem Price` ip
          ON ip.item_code = i.name AND ip.price_list = 'Vendor MRP'
        WHERE (i.name LIKE %(like)s OR i.item_name LIKE %(like)s)
        ORDER BY (i.item_name LIKE %(like)s) DESC, i.item_name ASC
        LIMIT %(limit)s
        """,
        {"like": like, "limit": int(limit)}, as_dict=True)
    return {"items": rows}
