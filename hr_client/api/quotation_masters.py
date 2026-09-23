"""
Quotation Studio — Masters (Phase 2 spec §4.7).

Six master tabs drive every dropdown, formula and compatibility rule in the
Quotation Studio, so transaction users select structured values instead of
retyping descriptions:

    Units · Materials · Finishes · Hardware · Pricing Methods · Templates

Everything here is ERP-native (source=ERP). List endpoints return the
ModulePayload envelope the SystemPage archetype renders (kpis / columns / rows
/ note); create endpoints take a cleaned payload. A small seeding helper plants
the five standard pricing methods (§4.3) so the BOQ quantity calculator always
has its formulas.
"""

import frappe

from hr_client.api.utils import (
    require_login, handle_api_error, current_company, scoped, ALL_COMPANIES,
)

# ── Field allow-lists (what create endpoints will accept) ─────────────────────
_UNIT_FIELDS = (
    "code", "unit_name", "product_group", "category",
    "pricing_method", "measurement_template", "hardware_package", "status",
)
_MATERIAL_FIELDS = ("code", "material_name", "category", "thickness", "uom", "status")
_FINISH_FIELDS = ("code", "finish_name", "category", "finish_type", "colour", "rate_uom", "status")
_HARDWARE_FIELDS = ("code", "hardware_item", "category", "brand", "series", "uom", "status")
_PRICING_FIELDS = ("code", "method", "formula", "uom", "status")
_TEMPLATE_FIELDS = ("code", "template_name", "applies_to", "dynamic_fields", "status")

# The five standard pricing methods, with the exact formulas from spec §4.3.
_STANDARD_PRICING = [
    {"code": "RFT", "method": "RFT", "formula": "width ÷ 304.8 × qty", "uom": "RFT"},
    {"code": "SFT", "method": "SFT", "formula": "width × height ÷ 92,903.04 × qty", "uom": "SFT"},
    {"code": "SQM", "method": "SQM", "formula": "width × height ÷ 1,000,000 × qty", "uom": "SQM"},
    {"code": "UNIT", "method": "UNIT", "formula": "qty", "uom": "Nos"},
    {"code": "LS", "method": "LS", "formula": "1", "uom": "Lot"},
]


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


def _active_kpis(rows, label):
    active = sum(1 for r in rows if (r.get("status") or "Active") == "Active")
    return [
        {"label": label, "value": str(len(rows))},
        {"label": "Active", "value": str(active), "tone": "good"},
        {"label": "Inactive", "value": str(len(rows) - active), "tone": "warn"},
    ]


def _create(doctype, payload, allowed, required_field, required_label):
    require_login()
    data = _clean(payload, allowed)
    if not data.get(required_field):
        frappe.throw(f"{required_label} is required.")
    if frappe.db.exists(doctype, data.get("code")):
        frappe.throw(f"Code '{data['code']}' already exists.")
    doc = frappe.new_doc(doctype)
    doc.update(data)
    doc.company = current_company()
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ══════════════════════════════════════════════════════════════════════════════
# UNITS
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_units_page():
    require_login()
    _ensure_pricing_seeded()
    rows = frappe.get_all(
        "Vera Quotation Unit",
        filters=scoped({}),
        fields=["name", "code", "unit_name", "product_group", "category",
                "pricing_method", "status"],
        order_by="product_group asc, unit_name asc",
    )
    return {
        "kpis": _active_kpis(rows, "Units"),
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "unit_name", "header": "Unit"},
            {"key": "product_group", "header": "Product Group"},
            {"key": "category", "header": "Category"},
            {"key": "pricing_method", "header": "Pricing"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Unit types. Each unit carries a default pricing method, "
                "measurement template and hardware package that pre-fill the "
                "BOQ configurator.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_unit(payload):
    return _create("Vera Quotation Unit", payload, _UNIT_FIELDS, "unit_name", "A unit name")


# ══════════════════════════════════════════════════════════════════════════════
# MATERIALS
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_materials_page():
    require_login()
    rows = frappe.get_all(
        "Vera Quotation Material",
        filters=scoped({}),
        fields=["name", "code", "material_name", "category", "thickness", "uom", "status"],
        order_by="category asc, material_name asc",
    )
    return {
        "kpis": _active_kpis(rows, "Materials"),
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "material_name", "header": "Material"},
            {"key": "category", "header": "Category"},
            {"key": "thickness", "header": "Thickness"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Carcass and shutter materials with thicknesses, used in BOQ "
                "line specifications.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_material(payload):
    return _create("Vera Quotation Material", payload, _MATERIAL_FIELDS, "material_name", "A material name")


# ══════════════════════════════════════════════════════════════════════════════
# FINISHES
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_finishes_page():
    require_login()
    rows = frappe.get_all(
        "Vera Quotation Finish",
        filters=scoped({}),
        fields=["name", "code", "finish_name", "category", "finish_type", "colour", "status"],
        order_by="category asc, finish_name asc",
    )
    return {
        "kpis": _active_kpis(rows, "Finishes"),
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "finish_name", "header": "Finish"},
            {"key": "category", "header": "Category"},
            {"key": "finish_type", "header": "Type"},
            {"key": "colour", "header": "Colour"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Internal/external finishes and edge banding for BOQ line "
                "specifications.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_finish(payload):
    return _create("Vera Quotation Finish", payload, _FINISH_FIELDS, "finish_name", "A finish name")


# ══════════════════════════════════════════════════════════════════════════════
# HARDWARE
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_hardware_page():
    require_login()
    rows = frappe.get_all(
        "Vera Quotation Hardware",
        filters=scoped({}),
        fields=["name", "code", "hardware_item", "category", "brand", "series", "status"],
        order_by="brand asc, hardware_item asc",
    )
    return {
        "kpis": _active_kpis(rows, "Hardware"),
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "hardware_item", "header": "Hardware Item"},
            {"key": "category", "header": "Category"},
            {"key": "brand", "header": "Brand"},
            {"key": "series", "header": "Series"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Hardware items and packages (hinges, channels, baskets) "
                "referenced by units and BOQ lines.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_hardware(payload):
    return _create("Vera Quotation Hardware", payload, _HARDWARE_FIELDS, "hardware_item", "A hardware item name")


# ══════════════════════════════════════════════════════════════════════════════
# PRICING METHODS
# ══════════════════════════════════════════════════════════════════════════════

def _ensure_pricing_seeded():
    """Plant the five standard pricing methods once. Idempotent — safe to call
    from any masters page load."""
    if frappe.db.exists("Vera Quotation Pricing Method", "UNIT"):
        return
    for row in _STANDARD_PRICING:
        if frappe.db.exists("Vera Quotation Pricing Method", row["code"]):
            continue
        doc = frappe.new_doc("Vera Quotation Pricing Method")
        doc.update(row)
        doc.status = "Active"
        doc.company = current_company()
        doc.insert(ignore_permissions=True)
    frappe.db.commit()


@frappe.whitelist()
@handle_api_error
def get_pricing_page():
    require_login()
    _ensure_pricing_seeded()
    rows = frappe.get_all(
        "Vera Quotation Pricing Method",
        filters=scoped({}),
        fields=["name", "code", "method", "formula", "uom", "status"],
        order_by="code asc",
    )
    return {
        "kpis": _active_kpis(rows, "Methods"),
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "method", "header": "Method", "kind": "status"},
            {"key": "formula", "header": "Formula"},
            {"key": "uom", "header": "UOM"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "The five pricing methods that drive BOQ quantity calculation. "
                "The standard set (RFT/SFT/SQM/UNIT/LS) is seeded automatically.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_pricing_method(payload):
    return _create("Vera Quotation Pricing Method", payload, _PRICING_FIELDS, "method", "A method")


# ══════════════════════════════════════════════════════════════════════════════
# TEMPLATES
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_templates_page():
    require_login()
    rows = frappe.get_all(
        "Vera Quotation Template",
        filters=scoped({}),
        fields=["name", "code", "template_name", "applies_to", "dynamic_fields", "status"],
        order_by="template_name asc",
    )
    return {
        "kpis": _active_kpis(rows, "Templates"),
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "template_name", "header": "Template"},
            {"key": "applies_to", "header": "Applies To"},
            {"key": "dynamic_fields", "header": "Dynamic Fields"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Measurement/specification templates. The dynamic fields a "
                "template declares are the dimension inputs that appear during "
                "measurement and BOQ entry for its unit types.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_template(payload):
    return _create("Vera Quotation Template", payload, _TEMPLATE_FIELDS, "template_name", "A template name")


# ══════════════════════════════════════════════════════════════════════════════
# SHARED — option lists for downstream dropdowns (measurement/BOQ/quotation)
# ══════════════════════════════════════════════════════════════════════════════

@frappe.whitelist()
@handle_api_error
def get_master_options():
    """Compact option lists the configurator reads to populate its dropdowns —
    one call instead of six. Only Active records."""
    require_login()
    _ensure_pricing_seeded()

    def opts(doctype, label_field, extra=None):
        fields = ["name", label_field] + (extra or [])
        return frappe.get_all(doctype, filters=scoped({"status": "Active"}), fields=fields,
                              order_by=f"{label_field} asc")

    return {
        "units": opts("Vera Quotation Unit", "unit_name",
                      ["product_group", "category", "pricing_method",
                       "measurement_template", "hardware_package"]),
        "materials": opts("Vera Quotation Material", "material_name", ["category", "thickness"]),
        "finishes": opts("Vera Quotation Finish", "finish_name", ["category", "finish_type"]),
        "hardware": opts("Vera Quotation Hardware", "hardware_item", ["brand"]),
        "pricing_methods": opts("Vera Quotation Pricing Method", "method", ["formula", "uom"]),
        "templates": opts("Vera Quotation Template", "template_name", ["applies_to", "dynamic_fields"]),
    }


# ══════════════════════════════════════════════════════════════════════════════
# SEED — standard studio catalogue (Materials / Finishes / Hardware / Units)
# ══════════════════════════════════════════════════════════════════════════════
#
# These four masters ship EMPTY, so the BOQ line spec dropdowns (§4.7, wired via
# boq.get_boq_options → _master_names) render nothing until data exists. This
# plants a generic, industry-standard catalogue derived from the owner spec
# ("ERP Master Data & Dropdown Database Structure" §14-§26) and the founding
# brief (initiation.txt §IV-§IX). NO prices/brands — rates are owner data and
# live in the cost sheet / price list, never invented here (§G). The masters
# carry no company column, so seeded rows are global — exactly what _master_names
# reads. Idempotent by code; safe to re-run.

# Core substrates (spec §14.2 + initiation §V). Thickness left blank — a material
# ships in many thicknesses; the BOQ line picks the thickness per line.
_SEED_MATERIALS = [
    ("MAT-PLY-CMR", "Commercial Plywood", "Plywood"),
    ("MAT-PLY-BWR", "BWR Plywood", "Plywood"),
    ("MAT-PLY-BWP", "BWP Plywood", "Plywood"),
    ("MAT-PLY-MRN", "Marine Plywood", "Plywood"),
    ("MAT-PLY-BIR", "Birch Plywood", "Plywood"),
    ("MAT-MDF", "MDF", "MDF"),
    ("MAT-HDF", "HDF", "HDF"),
    ("MAT-HDHMR", "HDHMR", "HDHMR"),
    ("MAT-PB", "Particle Board", "Particle Board"),
    ("MAT-BLK", "Block Board", "Block Board"),
    ("MAT-WPC", "WPC Board", "WPC"),
    ("MAT-PVC", "PVC Board", "PVC"),
    ("MAT-SW", "Solid Wood", "Solid Wood"),
]

# Carcass + shutter finishes (initiation §A/§B, spec §17). rate_uom SFT — finishes
# are priced per square foot (projects idea: "each finish has a standard SFT rate").
_SEED_FINISHES = [
    ("FIN-LAM-SOL", "Solid Laminate", "Laminate", "Solid"),
    ("FIN-LAM-WDG", "Woodgrain Laminate", "Laminate", "Woodgrain"),
    ("FIN-LAM-SYN", "Synchronised Laminate", "Laminate", "Synchronised"),
    ("FIN-LAM-TEX", "Textured Laminate", "Laminate", "Textured"),
    ("FIN-LAM-MAT", "Matt Laminate", "Laminate", "Matt"),
    ("FIN-LAM-GLS", "Gloss Laminate", "Laminate", "Gloss"),
    ("FIN-LAM-FAB", "Fabric Finish Laminate", "Laminate", "Fabric"),
    ("FIN-LAM-LIN", "Linen Finish Laminate", "Laminate", "Linen"),
    ("FIN-ACL-GLS", "Acrylic Gloss", "Acrylic", "Gloss"),
    ("FIN-ACL-MAT", "Acrylic Matt", "Acrylic", "Matt"),
    ("FIN-ACL-FEN", "Fenix Soft Matt", "Acrylic", "Soft Matt"),
    ("FIN-ACL-ZEN", "Zenith Soft Matt", "Acrylic", "Soft Matt"),
    ("FIN-ACL-GLA", "Glass Acrylic", "Acrylic", "Glass"),
    ("FIN-PU-MAT", "PU Matt", "PU", "Matt"),
    ("FIN-PU-GLS", "PU Gloss", "PU", "Gloss"),
    ("FIN-PU-MET", "PU Metallic", "PU", "Metallic"),
    ("FIN-PU-TEX", "PU Textured", "PU", "Textured"),
    ("FIN-VEN", "Veneer", "Veneer", "Natural"),
    ("FIN-VEN-PU", "Veneer + PU", "Veneer", "PU Coated"),
    ("FIN-MEM", "Membrane", "Membrane", "Standard"),
    ("FIN-MEL", "Melamine", "Melamine", "Standard"),
    ("FIN-GLS-LAC", "Lacquered Glass", "Glass", "Lacquered"),
    ("FIN-GLS-FRO", "Frosted Glass", "Glass", "Frosted"),
    ("FIN-GLS-FLU", "Fluted Glass", "Glass", "Fluted"),
    ("FIN-MIR", "Mirror", "Mirror", "Standard"),
    ("FIN-FAB", "Leather / Fabric", "Fabric", "Standard"),
    ("FIN-ALU-SHT", "Aluminium Profile Shutter", "Aluminium", "Profile"),
]

# Generic hardware items by category (spec §23/§26). Brand/series blank — the owner
# picks brand (Blum/Hafele/Hettich…) per project; MRP lives in the vendor price list.
_SEED_HARDWARE = [
    ("HW-HNG-STD", "Standard Hinge", "Hinges", "Nos"),
    ("HW-HNG-SC", "Soft-close Hinge", "Hinges", "Nos"),
    ("HW-DRW-STD", "Standard Drawer", "Drawer Systems", "Set"),
    ("HW-DRW-TAN", "Tandem Drawer", "Drawer Systems", "Set"),
    ("HW-DRW-LGB", "Legrabox Drawer", "Drawer Systems", "Set"),
    ("HW-CHL-TEL", "Telescopic Channel", "Drawer Systems", "Pair"),
    ("HW-LFT-STD", "Lift-up System", "Lift-up", "Set"),
    ("HW-SLD-STD", "Sliding System", "Sliding", "Set"),
    ("HW-BSK-CUT", "Cutlery Basket", "Kitchen Accessories", "Nos"),
    ("HW-BSK-PLT", "Plate Basket", "Kitchen Accessories", "Nos"),
    ("HW-PUL-BTL", "Bottle Pull-out", "Kitchen Accessories", "Nos"),
    ("HW-PUL-CRN", "Corner Pull-out", "Kitchen Accessories", "Nos"),
    ("HW-BIN-DST", "Dustbin Unit", "Kitchen Accessories", "Nos"),
    ("HW-HND-PRO", "Profile Handle", "Handles", "RFT"),
    ("HW-HND-STD", "Cabinet Handle", "Handles", "Nos"),
    ("HW-LEG-ABS", "ABS Leg", "Legs", "Nos"),
    ("HW-ROD-HNG", "Hanging Rod", "Wardrobe Accessories", "Nos"),
    ("HW-TRS-RCK", "Trouser Rack", "Wardrobe Accessories", "Nos"),
    ("HW-SHO-RCK", "Shoe Rack", "Wardrobe Accessories", "Nos"),
    ("HW-LGT-LED", "LED Profile Light", "Furniture Lighting", "RFT"),
]

# Standard units (spec §7.1-§7.3/§8-§11, initiation §VIII/§IX) with the default
# pricing method from spec §48 (Kitchen base/wall RFT, tall/island UNIT, wardrobe SFT).
_SEED_UNITS = [
    ("KIT-BAS-SNK", "Sink Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-HOB", "Hob Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-DRW", "Drawer Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-SHL", "Shelf Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-CRN", "Corner Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-BTL", "Bottle Pull-out Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-TDM", "Tandem Base", "Kitchen", "Base Units", "RFT"),
    ("KIT-BAS-DST", "Dustbin Base", "Kitchen", "Base Units", "UNIT"),
    ("KIT-WAL-STD", "Standard Wall", "Kitchen", "Wall Units", "RFT"),
    ("KIT-WAL-LFT", "Lift-up Wall", "Kitchen", "Wall Units", "RFT"),
    ("KIT-WAL-GLS", "Glass Wall", "Kitchen", "Wall Units", "RFT"),
    ("KIT-WAL-CRN", "Corner Wall", "Kitchen", "Wall Units", "RFT"),
    ("KIT-WAL-OPN", "Open Shelf", "Kitchen", "Wall Units", "RFT"),
    ("KIT-TAL-OVN", "Oven Tall", "Kitchen", "Tall Units", "UNIT"),
    ("KIT-TAL-PAN", "Pantry Tall", "Kitchen", "Tall Units", "UNIT"),
    ("KIT-TAL-REF", "Refrigerator Tall", "Kitchen", "Tall Units", "UNIT"),
    ("KIT-TAL-CRK", "Crockery Tall", "Kitchen", "Tall Units", "UNIT"),
    ("KIT-LOF", "Loft", "Kitchen", "Loft", "RFT"),
    ("KIT-ISL", "Island", "Kitchen", "Island", "UNIT"),
    ("WRD-HNG", "Hinged Wardrobe", "Wardrobe", "Hinged", "SFT"),
    ("WRD-SLD", "Sliding Wardrobe", "Wardrobe", "Sliding", "SFT"),
    ("WRD-LOF", "Wardrobe Loft", "Wardrobe", "Loft", "SFT"),
    ("VAN-STD", "Vanity Unit", "Vanity", "Standard", "UNIT"),
    ("TVU-PNL", "TV Back Panel", "TV Unit", "Panel", "SFT"),
    ("TVU-CON", "TV Console", "TV Unit", "Console", "RFT"),
    ("CRK-STD", "Crockery Unit", "Crockery", "Standard", "SFT"),
    ("STU-TBL", "Study Table", "Study", "Standard", "RFT"),
]


def _seed_rows(doctype, rows_as_dicts):
    # These masters are company-scoped on some deployments (mandatory `company`
    # field) and global on others — set company only when the field exists so the
    # rows are visible to the same scoped reads the BOQ dropdowns use.
    has_company = frappe.get_meta(doctype).has_field("company")
    company = current_company() if has_company else None
    n = 0
    for data in rows_as_dicts:
        if frappe.db.exists(doctype, data["code"]):
            continue
        doc = frappe.new_doc(doctype)
        doc.update(data)
        doc.status = "Active"
        doc.source = "ERP"
        if has_company:
            doc.company = company
        doc.insert(ignore_permissions=True)
        n += 1
    return n


@frappe.whitelist()
@handle_api_error
def seed_studio_masters():
    """Idempotently plant the standard Materials/Finishes/Hardware/Units catalogue
    so the BOQ spec dropdowns are usable out of the box. Run once after deploy:
        bench --site vera.local execute hr_client.api.quotation_masters.seed_studio_masters
    """
    require_login()
    made = {
        "materials": _seed_rows("Vera Quotation Material", [
            {"code": c, "material_name": n, "category": cat, "uom": "Sheet"}
            for c, n, cat in _SEED_MATERIALS]),
        "finishes": _seed_rows("Vera Quotation Finish", [
            {"code": c, "finish_name": n, "category": cat, "finish_type": ft, "rate_uom": "SFT"}
            for c, n, cat, ft in _SEED_FINISHES]),
        "hardware": _seed_rows("Vera Quotation Hardware", [
            {"code": c, "hardware_item": n, "category": cat, "uom": uom}
            for c, n, cat, uom in _SEED_HARDWARE]),
        "units": _seed_rows("Vera Quotation Unit", [
            {"code": c, "unit_name": n, "product_group": pg, "category": cat, "pricing_method": pm}
            for c, n, pg, cat, pm in _SEED_UNITS]),
    }
    frappe.db.commit()
    return {"success": True, "created": made}
