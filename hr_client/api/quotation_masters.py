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

from hr_client.api.utils import require_login, handle_api_error

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
        doc.insert(ignore_permissions=True)
    frappe.db.commit()


@frappe.whitelist()
@handle_api_error
def get_pricing_page():
    require_login()
    _ensure_pricing_seeded()
    rows = frappe.get_all(
        "Vera Quotation Pricing Method",
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
        return frappe.get_all(doctype, filters={"status": "Active"}, fields=fields,
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
