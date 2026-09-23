"""
Cost / dealer price admin input.

Every vendor pricelist we loaded is MRP (selling) only — the catalogue has no
idea what Vera actually *pays*, so true profit can't be computed. This module
lets an admin supply cost two ways:

  1. Dealer discount % per brand (a `Vera Vendor Cost Rule`) — "Blum gives us 45%
     off MRP" → cost = MRP × (1 − 45%). One number covers a whole brand.
  2. Per-item cost override — type the exact buy price for a single SKU.

Both write to a **"Vendor Cost"** buying price list (native ERPNext Item Price,
buying=1), leaving the Vendor MRP (selling) list untouched. Downstream costing
can then read a real cost via `get_item_cost()`.
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company, allowed_companies,
)

COST_LIST = "Vendor Cost"
MRP_LIST = "Vendor MRP"
_DT = "Vera Vendor Cost Rule"


def _ensure_cost_list():
    if not frappe.db.exists("Price List", COST_LIST):
        pl = frappe.get_doc({
            "doctype": "Price List", "price_list_name": COST_LIST,
            "buying": 1, "selling": 0, "currency": "INR", "enabled": 1,
        })
        pl.flags.ignore_permissions = True
        pl.insert()
        frappe.db.commit()


def _upsert_price(item_code: str, rate: float):
    existing = frappe.db.get_value(
        "Item Price", {"item_code": item_code, "price_list": COST_LIST, "buying": 1}, "name")
    if existing:
        frappe.db.set_value("Item Price", existing, "price_list_rate", rate)
    else:
        doc = frappe.get_doc({
            "doctype": "Item Price", "item_code": item_code, "price_list": COST_LIST,
            "buying": 1, "price_list_rate": rate, "currency": "INR",
        })
        doc.flags.ignore_permissions = True
        doc.insert()


# ---------------------------------------------------------------- discount rules

@frappe.whitelist()
@handle_api_error
def list_rules():
    require_login()
    comps = allowed_companies() or frappe.get_all("Company", pluck="name")
    rules = frappe.get_all(
        _DT, filters={"company": ["in", comps + [None, ""]]},
        fields=["name", "code", "brand", "discount_percent", "status", "company", "notes"],
        order_by="brand asc")
    return {"rules": rules, "summary": get_cost_summary()}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_rule(payload: str = None, **kwargs):
    require_admin()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    name = data.get("name")
    if name and frappe.db.exists(_DT, name):
        doc = frappe.get_doc(_DT, name)
    else:
        doc = frappe.new_doc(_DT)
        brand = (data.get("brand") or "").strip()
        doc.code = frappe.scrub(f"{brand}").upper().replace("_", "-")[:30] or "RULE"
    for f in ("brand", "discount_percent", "status", "company", "notes"):
        if f in data:
            doc.set(f, data.get(f))
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_rule(name: str):
    require_admin()
    frappe.delete_doc(_DT, name, ignore_permissions=True)
    frappe.db.commit()
    return {"deleted": name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def apply_discounts():
    """Recompute cost for every item covered by an active brand discount rule:
    cost = MRP × (1 − discount%). Writes to the Vendor Cost buying list."""
    require_admin()
    _ensure_cost_list()
    rules = frappe.get_all(
        _DT, filters={"status": "Active"}, fields=["brand", "discount_percent"])
    updated, brands = 0, []
    for r in rules:
        disc = frappe.utils.flt(r.discount_percent)
        if disc <= 0:
            continue
        factor = 1.0 - disc / 100.0
        prices = frappe.db.sql(
            """
            SELECT ip.item_code, ip.price_list_rate AS mrp
            FROM `tabItem Price` ip JOIN `tabItem` i ON ip.item_code = i.name
            WHERE ip.price_list = %(mrp)s AND i.brand = %(brand)s
            """, {"mrp": MRP_LIST, "brand": r.brand}, as_dict=True)
        for p in prices:
            _upsert_price(p.item_code, round(frappe.utils.flt(p.mrp) * factor, 2))
            updated += 1
        if prices:
            brands.append({"brand": r.brand, "discount": disc, "items": len(prices)})
    frappe.db.commit()
    return {"updated": updated, "brands": brands, "summary": get_cost_summary()}


# ---------------------------------------------------------------- per-item cost

@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_item_cost(item_code: str, cost):
    require_admin()
    _ensure_cost_list()
    _upsert_price(item_code, round(frappe.utils.flt(cost), 2))
    frappe.db.commit()
    return {"item_code": item_code, "cost": frappe.utils.flt(cost)}


@frappe.whitelist()
@handle_api_error
def get_item_cost(item_code: str):
    """Cost for one item (Vendor Cost list), or None."""
    require_login()
    return frappe.db.get_value(
        "Item Price", {"item_code": item_code, "price_list": COST_LIST, "buying": 1},
        "price_list_rate")


@frappe.whitelist()
@handle_api_error
def search_items(query: str = "", limit: int = 20):
    """Search catalogue items showing MRP and current cost for per-item entry."""
    require_login()
    q = (query or "").strip()
    if len(q) < 2:
        return {"items": []}
    like = f"%{q}%"
    rows = frappe.db.sql(
        """
        SELECT i.name AS item_code, i.item_name, i.brand,
               mrp.price_list_rate AS mrp, cost.price_list_rate AS cost
        FROM `tabItem` i
        LEFT JOIN `tabItem Price` mrp ON mrp.item_code = i.name AND mrp.price_list = %(mrp)s
        LEFT JOIN `tabItem Price` cost ON cost.item_code = i.name AND cost.price_list = %(cost)s
        WHERE (i.name LIKE %(like)s OR i.item_name LIKE %(like)s)
        ORDER BY (i.item_name LIKE %(like)s) DESC, i.item_name ASC
        LIMIT %(limit)s
        """, {"like": like, "limit": int(limit), "mrp": MRP_LIST, "cost": COST_LIST},
        as_dict=True)
    return {"items": rows}


@frappe.whitelist()
@handle_api_error
def get_cost_summary():
    require_login()
    total = frappe.db.count("Item Price", {"price_list": MRP_LIST})
    with_cost = frappe.db.count("Item Price", {"price_list": COST_LIST, "buying": 1})
    return {
        "total_items": total,
        "with_cost": with_cost,
        "coverage_pct": round(with_cost / total * 100, 1) if total else 0,
    }
