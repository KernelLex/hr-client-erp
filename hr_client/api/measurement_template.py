"""
Measurement product-type templates (UI spec §8-§10). A template captures the
standard row structure for a product type (a Kitchen has base / wall / tall /
loft units; a Wardrobe has shutters / loft / internals) so a site measurement
starts from a sensible skeleton instead of a blank grid. Applying a template
seeds the measurement's rows; the surveyor then fills the real dimensions.

Templates are global config masters (no company dimension), edited in desk or
via create_template. ERP-native.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

# Seed content — reasonable defaults the owner can refine (spec §9-§10).
_DEFAULTS = {
    "Kitchen — Standard": {
        "product_type": "Kitchen",
        "rows": [
            {"area": "Kitchen", "product": "Base Units", "uom": "RFT"},
            {"area": "Kitchen", "product": "Wall Units", "uom": "RFT"},
            {"area": "Kitchen", "product": "Tall Unit", "uom": "UNIT", "quantity": 1},
            {"area": "Kitchen", "product": "Loft", "uom": "RFT"},
            {"area": "Kitchen", "product": "Countertop", "uom": "RFT"},
        ],
    },
    "Wardrobe — Standard": {
        "product_type": "Wardrobe",
        "rows": [
            {"area": "Bedroom", "product": "Wardrobe Shutters", "uom": "SFT"},
            {"area": "Bedroom", "product": "Loft", "uom": "SFT"},
            {"area": "Bedroom", "product": "Internal Drawers", "uom": "UNIT", "quantity": 3},
            {"area": "Bedroom", "product": "Internal Shelves", "uom": "UNIT", "quantity": 4},
        ],
    },
    "TV Unit — Standard": {
        "product_type": "TV Unit",
        "rows": [
            {"area": "Living", "product": "TV Panel", "uom": "SFT"},
            {"area": "Living", "product": "Base Storage", "uom": "RFT"},
            {"area": "Living", "product": "Wall Shelves", "uom": "RFT"},
        ],
    },
}


@frappe.whitelist()
@handle_api_error
def seed_default_templates():
    """Idempotently create the built-in templates (safe to re-run)."""
    require_login()
    created = 0
    for tname, spec in _DEFAULTS.items():
        if frappe.db.exists("Vera Measurement Template", tname):
            continue
        doc = frappe.new_doc("Vera Measurement Template")
        doc.template_name = tname
        doc.product_type = spec["product_type"]
        doc.status = "Active"
        for r in spec["rows"]:
            doc.append("default_rows", r)
        doc.insert(ignore_permissions=True)
        created += 1
    frappe.db.commit()
    return {"success": True, "created": created}


@frappe.whitelist()
@handle_api_error
def list_templates():
    require_login()
    rows = frappe.get_all(
        "Vera Measurement Template", filters={"status": "Active"},
        fields=["name", "template_name", "product_type"], order_by="product_type, template_name")
    return {"templates": [{"name": r.name, "label": f"{r.template_name} ({r.product_type})"} for r in rows]}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def apply_template(measurement: str, template: str, mode: str = "append"):
    """Seed a measurement's rows from a template. mode 'append' adds to the
    existing rows; 'replace' clears them first. Draft/Returned only."""
    require_login()
    from hr_client.api.utils import assert_doc_company
    doc = frappe.get_doc("Vera Measurement Sheet", measurement)
    assert_doc_company(doc)
    if doc.status not in ("Draft", "Returned"):
        frappe.throw("Only a draft measurement can have a template applied.")
    tpl = frappe.get_doc("Vera Measurement Template", template)
    if mode == "replace":
        doc.set("rows", [])
    for r in tpl.default_rows:
        doc.append("rows", {
            "area": r.area, "product": r.product, "template": tpl.template_name,
            "width": r.width, "height": r.height, "depth": r.depth,
            "quantity": r.quantity or 1, "uom": r.uom, "note": r.note,
        })
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "rows": len(doc.rows)}
