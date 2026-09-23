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

# Seed content — realistic modular-interior defaults the owner can refine
# (spec §9-§10). Generic industry-standard product breakdowns, no owner data or
# pricing. `description` pre-fills the measurement row so a survey starts already
# annotated. UOM matches the pricing methods (RFT/SFT/SQM/UNIT/LS).
_DEFAULTS = {
    "Kitchen — Standard": {
        "product_type": "Kitchen",
        "rows": [
            {"area": "Kitchen", "product": "Base Units", "uom": "RFT", "description": "Floor units incl. carcass + shutter, excl. countertop"},
            {"area": "Kitchen", "product": "Wall Units", "uom": "RFT", "description": "Overhead units up to 700mm height"},
            {"area": "Kitchen", "product": "Tall / Larder Unit", "uom": "UNIT", "quantity": 1, "description": "Full-height pull-out or shelf tower"},
            {"area": "Kitchen", "product": "Loft Units", "uom": "RFT", "description": "Above wall units, up to ceiling"},
            {"area": "Kitchen", "product": "Countertop", "uom": "RFT", "description": "Stone / quartz, measured separately"},
            {"area": "Kitchen", "product": "Skirting", "uom": "RFT", "description": "PVC / SS toe-kick"},
            {"area": "Kitchen", "product": "Cornice & Pelmet", "uom": "RFT", "description": "Top & bottom trims on wall units"},
            {"area": "Kitchen", "product": "Gola / Handle Profile", "uom": "RFT", "description": "Continuous J/G profile (optional)"},
        ],
    },
    "Wardrobe — Hinged": {
        "product_type": "Wardrobe",
        "rows": [
            {"area": "Bedroom", "product": "Hinged Shutters", "uom": "SFT", "description": "Full-height shutters on hinges"},
            {"area": "Bedroom", "product": "Loft", "uom": "SFT", "description": "Above wardrobe, separate shutters"},
            {"area": "Bedroom", "product": "Internal Drawers", "uom": "UNIT", "quantity": 3, "description": "Soft-close drawer sets"},
            {"area": "Bedroom", "product": "Internal Shelves", "uom": "UNIT", "quantity": 4, "description": "Adjustable shelves"},
            {"area": "Bedroom", "product": "Hanging Rod", "uom": "UNIT", "quantity": 1, "description": "SS rod incl. brackets"},
        ],
    },
    "Wardrobe — Sliding": {
        "product_type": "Wardrobe",
        "rows": [
            {"area": "Bedroom", "product": "Sliding Shutters", "uom": "SFT", "description": "2/3-track sliding, measured as elevation"},
            {"area": "Bedroom", "product": "Loft", "uom": "SFT", "description": "Above wardrobe (hinged)"},
            {"area": "Bedroom", "product": "Internal Drawers", "uom": "UNIT", "quantity": 3, "description": "Soft-close drawer sets"},
            {"area": "Bedroom", "product": "Internal Shelves", "uom": "UNIT", "quantity": 4, "description": "Adjustable shelves"},
            {"area": "Bedroom", "product": "Hanging Rod", "uom": "UNIT", "quantity": 1, "description": "SS rod incl. brackets"},
        ],
    },
    "TV Unit — Standard": {
        "product_type": "TV Unit",
        "rows": [
            {"area": "Living", "product": "TV Back Panel", "uom": "SFT", "description": "Feature / laminate / veneer panel"},
            {"area": "Living", "product": "Base Storage", "uom": "RFT", "description": "Below-TV drawer + shutter run"},
            {"area": "Living", "product": "Wall Shelves", "uom": "RFT", "description": "Open / closed display shelves"},
            {"area": "Living", "product": "Top Storage", "uom": "RFT", "description": "Overhead cabinets (optional)"},
        ],
    },
    "Vanity — Standard": {
        "product_type": "Vanity",
        "rows": [
            {"area": "Bathroom", "product": "Vanity Base Cabinet", "uom": "RFT", "description": "Under-counter storage, wall-hung / floor"},
            {"area": "Bathroom", "product": "Mirror Cabinet", "uom": "SFT", "description": "Mirror with storage back"},
            {"area": "Bathroom", "product": "Countertop", "uom": "RFT", "description": "Stone / quartz with basin cutout"},
        ],
    },
    "Crockery / Storage Unit": {
        "product_type": "Storage",
        "rows": [
            {"area": "Dining", "product": "Base Storage", "uom": "RFT", "description": "Floor storage run"},
            {"area": "Dining", "product": "Wall Storage", "uom": "RFT", "description": "Overhead display / storage"},
            {"area": "Dining", "product": "Tall Storage", "uom": "UNIT", "quantity": 1, "description": "Full-height utility / crockery tower"},
        ],
    },
    "Study / Office Table": {
        "product_type": "Other",
        "rows": [
            {"area": "Study", "product": "Table Top", "uom": "SFT", "description": "Work surface incl. edge banding"},
            {"area": "Study", "product": "Under-table Storage", "uom": "RFT", "description": "Drawer / CPU / keyboard unit"},
            {"area": "Study", "product": "Overhead Storage", "uom": "RFT", "description": "Wall cabinets (optional)"},
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
            "quantity": r.quantity or 1, "uom": r.uom,
            "description": getattr(r, "description", None), "note": r.note,
        })
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "rows": len(doc.rows)}
