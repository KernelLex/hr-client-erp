"""Load the normalized vendor pricelist into native ERPNext Item + Item Price.

Phase-1 bridge: turns data/normalized/_all_vendors.csv (6,655 SKUs) into the
shared global Item namespace, with each vendor's MRP as an Item Price on a
dedicated **"Vendor MRP"** price list. This matches the platform's existing
design (company.py: "Items stay a shared global namespace — per-company pricing
lives in Item Price"), so no new DocType is introduced.

Run on the server (needs a bench context):

    bench --site vera.local execute hr_client.pricelist_import.load_items.run
    bench --site vera.local execute hr_client.pricelist_import.load_items.run \
        --kwargs "{'only':'bosch','dry_run':True}"

MRP-ONLY, by design: the catalogs print no dealer/cost price, so this loads the
MRP as the item's *list* rate and records the vendor as a supplier. It does NOT
write a purchase/cost rate — that stays an open P0 owner input. GST-inclusive
vendors (EBCO, Luxury) are flagged on the item so downstream costing can net it.
"""

from __future__ import annotations

import csv
import json
import os

import frappe

HERE = os.path.dirname(__file__)
CSV = os.path.join(HERE, "data", "normalized", "_all_vendors.csv")

PRICE_LIST = "Vendor MRP"
PARENT_GROUP = "Vendor Catalog"
DEFAULT_UOM = "Nos"
# Loose map from the free-text uom in the feed to ERPNext UOM names.
_UOM = {"": DEFAULT_UOM, "NOS": "Nos", "PC": "Nos", "PCS": "Nos", "SET": "Set",
        "PAIR": "Pair", "KIT": "Nos", "BOX": "Box", "RFT": "RFT", "SFT": "SFT"}


def _ensure(doctype: str, name: str, make) -> str:
    if frappe.db.exists(doctype, name):
        return name
    make().insert(ignore_permissions=True)
    return name


def _ensure_uom(raw: str) -> str:
    uom = _UOM.get((raw or "").strip().upper(), (raw or "").strip().title() or DEFAULT_UOM)
    if not frappe.db.exists("UOM", uom):
        d = frappe.new_doc("UOM")
        d.uom_name = uom
        d.insert(ignore_permissions=True)
    return uom


def _setup_static() -> None:
    """Idempotently create the price list, parent item group and default UOM."""
    if not frappe.db.exists("Price List", PRICE_LIST):
        pl = frappe.new_doc("Price List")
        pl.price_list_name = PRICE_LIST
        pl.selling = 1          # MRP is a list/selling reference
        pl.buying = 1           # also the buying starting point (pre-discount)
        pl.currency = "INR"
        pl.insert(ignore_permissions=True)
    if not frappe.db.exists("Item Group", PARENT_GROUP):
        root = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name") \
            or "All Item Groups"
        g = frappe.new_doc("Item Group")
        g.item_group_name = PARENT_GROUP
        g.parent_item_group = root
        g.is_group = 1
        g.insert(ignore_permissions=True)


def _group_for(brand: str) -> str:
    name = (brand or "Misc").strip() or "Misc"
    if not frappe.db.exists("Item Group", name):
        g = frappe.new_doc("Item Group")
        g.item_group_name = name
        g.parent_item_group = PARENT_GROUP
        g.is_group = 0
        g.insert(ignore_permissions=True)
    return name


def _supplier_for(vendor: str, brand: str) -> str | None:
    name = (brand or vendor or "").strip()
    if not name:
        return None
    if not frappe.db.exists("Supplier", name):
        try:
            s = frappe.new_doc("Supplier")
            s.supplier_name = name
            s.supplier_group = frappe.db.get_value("Supplier Group", {"is_group": 0}, "name") \
                or "All Supplier Groups"
            s.insert(ignore_permissions=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "pricelist supplier")
            return None
    return name


def _ensure_brand(brand: str) -> str | None:
    b = (brand or "").strip()
    if not b:
        return None
    if not frappe.db.exists("Brand", b):
        d = frappe.new_doc("Brand")
        d.brand = b
        d.insert(ignore_permissions=True)
    return b


def _upsert_item(row: dict) -> str | None:
    code = (row.get("item_code") or "").strip()
    if not code:
        return None
    existing = frappe.db.get_value("Item", {"item_code": code}, "name")
    uom = _ensure_uom(row.get("uom", ""))
    group = _group_for(row.get("brand", ""))
    brand = _ensure_brand(row.get("brand", ""))
    desc = (row.get("description") or code)[:140]
    if row.get("gst_inclusive") in ("True", "true", True, 1, "1"):
        desc_note = f"{desc} [MRP incl. GST]"
    else:
        desc_note = desc

    if existing:
        item = frappe.get_doc("Item", existing)
    else:
        item = frappe.new_doc("Item")
        item.item_code = code
        item.is_stock_item = 0            # trading/config reference, no valuation yet
    item.item_name = desc
    item.item_group = group
    item.stock_uom = uom
    item.description = desc_note
    if brand and item.meta.has_field("brand"):
        item.brand = brand
    hsn = (row.get("hsn") or "").strip()
    if hsn and item.meta.has_field("gst_hsn_code") and frappe.db.exists("GST HSN Code", hsn):
        item.gst_hsn_code = hsn
    item.save(ignore_permissions=True)
    return item.name


def _upsert_price(item_name: str, row: dict) -> bool:
    mrp = row.get("mrp")
    if mrp in (None, "", "None"):
        return False
    rate = float(mrp)
    uom = _ensure_uom(row.get("uom", ""))
    valid_from = (row.get("price_valid_from") or "").strip() or None
    filters = {"price_list": PRICE_LIST, "item_code": frappe.db.get_value("Item", item_name, "item_code")}
    existing = frappe.db.get_value("Item Price", filters, "name")
    if existing:
        ip = frappe.get_doc("Item Price", existing)
        ip.price_list_rate = rate
        if valid_from:
            ip.valid_from = valid_from
        ip.uom = uom
        ip.save(ignore_permissions=True)
    else:
        ip = frappe.new_doc("Item Price")
        ip.price_list = PRICE_LIST
        ip.item_code = frappe.db.get_value("Item", item_name, "item_code")
        ip.price_list_rate = rate
        ip.currency = "INR"
        ip.uom = uom
        if valid_from:
            ip.valid_from = valid_from
        ip.insert(ignore_permissions=True)
    return True


def run(only: str | None = None, dry_run: bool = False, commit_every: int = 200) -> dict:
    """Load _all_vendors.csv into Item + Item Price. Idempotent per item_code.

    only     — restrict to a single vendor key (e.g. 'bosch').
    dry_run  — count only, write nothing.
    """
    with open(CSV) as fh:
        rows = list(csv.DictReader(fh))
    if only:
        rows = [r for r in rows if r.get("vendor") == only]

    stats = {"rows": len(rows), "items": 0, "prices": 0, "skipped": 0, "errors": 0}
    if dry_run:
        stats["dry_run"] = True
        return stats

    _setup_static()
    for i, row in enumerate(rows, 1):
        try:
            item = _upsert_item(row)
            if not item:
                stats["skipped"] += 1
                continue
            stats["items"] += 1
            _supplier_for(row.get("vendor", ""), row.get("brand", ""))
            if _upsert_price(item, row):
                stats["prices"] += 1
        except Exception:
            stats["errors"] += 1
            frappe.log_error(frappe.get_traceback(), f"pricelist load {row.get('item_code')}")
        if i % commit_every == 0:
            frappe.db.commit()
    frappe.db.commit()
    return stats


if __name__ == "__main__":
    print(json.dumps(run(dry_run=True), indent=2))
