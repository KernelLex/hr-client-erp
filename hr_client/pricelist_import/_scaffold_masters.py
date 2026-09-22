"""One-shot dev scaffolder for the Quotation-module taxonomy masters.

Emits, for each master in SPEC, a Frappe DocType folder under
``hr_client/hr_client/doctype/<snake>/`` (``__init__.py`` + ``<snake>.json`` +
``<snake>.py``) matching the existing ``vera_quotation_*`` convention
(autoname ``field:code``, module "Hr Client", System Manager + Employee perms,
``before_insert`` sets ``source="ERP"``). Also writes a bench-executable seed at
``hr_client/api/quotation_taxonomy.py`` populating the §3 enumerations.

Run locally (no bench needed — it only writes source files):
    python3 -m hr_client.pricelist_import._scaffold_masters

Idempotent: rewrites files deterministically. Then, on the server:
    bench --site vera.local migrate   # creates the tables
    bench --site vera.local execute hr_client.api.quotation_taxonomy.seed_all
"""

from __future__ import annotations

import json
import os

PKG = os.path.dirname(os.path.dirname(__file__))          # .../hr_client (outer package)
DT_DIR = os.path.join(PKG, "hr_client", "doctype")        # double-nested per convention
API_DIR = os.path.join(PKG, "api")

STD_STATUS = {"fieldname": "status", "fieldtype": "Select", "label": "Status",
              "options": "Active\nInactive", "default": "Active", "in_list_view": 1}
STD_SOURCE = {"fieldname": "source", "fieldtype": "Data", "label": "Source",
              "default": "ERP", "read_only": 1}


def F(fieldname, fieldtype="Data", label=None, **kw):
    d = {"fieldname": fieldname, "fieldtype": fieldtype,
         "label": label or fieldname.replace("_", " ").title()}
    d.update(kw)
    return d


# ── SPEC: {DocType Name: {name_field, extra_fields, seed rows}} ────────────────
# Every master implicitly gets: code, <name_field>, description, sort_order,
# status, source. `extra` inserts domain fields after <name_field>.
def _snake(name: str) -> str:
    return name.lower().replace(" ", "_")


SPEC = {
    # ── Classification / structure ────────────────────────────────────────────
    "Vera Product Group": {
        "name_field": ("group_name", "Group Name"),
        "extra": [F("parent_product_group", "Link", options="Vera Product Group"),
                  F("is_group", "Check", default="0"),
                  F("hierarchy", "Data", label="Hierarchy Level",
                    description="Group / Sub-group / Unit")],
        "seed": [
            ("KIT", "Kitchen", {"is_group": 1}), ("WRD", "Wardrobe", {"is_group": 1}),
            ("VAN", "Vanity", {"is_group": 1}), ("TVU", "TV Unit", {"is_group": 1}),
            ("CRK", "Crockery", {"is_group": 1}), ("STU", "Study", {"is_group": 1}),
            ("LIB", "Library", {"is_group": 1}), ("CAB", "Cabinet", {"is_group": 1}),
            ("FUR", "Loose Furniture", {"is_group": 1}), ("SRV", "Services", {"is_group": 1}),
            ("KIT-BAS", "Kitchen Base Unit", {"parent_product_group": "KIT", "is_group": 1}),
            ("KIT-WAL", "Kitchen Wall Unit", {"parent_product_group": "KIT", "is_group": 1}),
            ("KIT-TAL", "Kitchen Tall Unit", {"parent_product_group": "KIT", "is_group": 1}),
            ("KIT-BAS-SNK", "Sink Base Unit", {"parent_product_group": "KIT-BAS"}),
            ("KIT-BAS-DRW", "Drawer Base Unit", {"parent_product_group": "KIT-BAS"}),
            ("KIT-BAS-COR", "Corner Base Unit", {"parent_product_group": "KIT-BAS"}),
            ("WRD-HNG", "Hinged Wardrobe", {"parent_product_group": "WRD"}),
            ("WRD-SLD", "Sliding Wardrobe", {"parent_product_group": "WRD"}),
        ],
    },
    "Vera Product Category": {  # trading categories §3.3
        "name_field": ("category_name", "Category Name"),
        "seed": [("HW", "Hardware"), ("APP", "Appliances"), ("STN", "Countertop Stone"),
                 ("SF", "Sink & Faucet"), ("BRD", "Boards / Panels"), ("GL", "Glass"),
                 ("AL", "Aluminium Profiles"), ("AC", "AC / HVAC"), ("LT", "Lighting"),
                 ("RM", "Raw Materials"), ("OTH", "Others")],
    },
    "Vera Component": {
        "name_field": ("component_name", "Component Name"),
        "extra": [F("product_group", "Link", options="Vera Product Group")],
        "seed": [("CMP-CAR", "Carcass"), ("CMP-SHT", "Shutter"), ("CMP-BAK", "Back Panel"),
                 ("CMP-DRW", "Drawer"), ("CMP-SHF", "Shelf"), ("CMP-HDW", "Hardware"),
                 ("CMP-HND", "Handle"), ("CMP-LGT", "Lighting"), ("CMP-ACC", "Accessory")],
    },
    "Vera Scope Type": {  # §3.5
        "name_field": ("scope_name", "Scope Name"),
        "extra": [F("applies_to", "Data", label="Applies To",
                    description="Modular / Stone / Hardware / Services")],
        "seed": [("SCP-SUP", "Supply Only", {"applies_to": "Modular"}),
                 ("SCP-SUP-INS", "Supply + Installation", {"applies_to": "Modular"}),
                 ("SCP-SUP-HW", "Supply + Hardware", {"applies_to": "Modular"}),
                 ("SCP-CMP", "Complete Package", {"applies_to": "Modular"}),
                 ("SCP-STN-FAB", "Supply + Fabrication", {"applies_to": "Stone"}),
                 ("SCP-STN-INS", "Supply + Fabrication + Installation", {"applies_to": "Stone"})],
    },
    "Vera Installation Type": {  # §3.10
        "name_field": ("install_name", "Installation Type"),
        "seed": [("INS-SUP", "Supply Only"), ("INS-STD", "Standard"), ("INS-PRM", "Premium"),
                 ("INS-CUS", "By Customer"), ("INS-VEN", "By Vendor"),
                 ("INS-INC", "Included"), ("INS-CHG", "Chargeable")],
    },
    "Vera Delivery Term": {  # §3.10
        "name_field": ("term_name", "Delivery Term"),
        "seed": [("DEL-EXW", "Ex-Warehouse"), ("DEL-SITE", "Delivered to Site"),
                 ("DEL-UNL", "Delivered & Unloaded"), ("DEL-INS", "Delivered & Installed"),
                 ("DEL-PICK", "Customer Pickup")],
    },
    # ── Material / finish system §3.6-3.7 ─────────────────────────────────────
    "Vera Thickness": {
        "name_field": ("thickness_name", "Thickness"),
        "extra": [F("value_mm", "Float", label="Value (mm)")],
        "seed": [(f"THK-{v:02d}", f"{v} mm", {"value_mm": v})
                 for v in (4, 6, 8, 9, 12, 15, 16, 17, 18, 19, 25, 30)],
    },
    "Vera Finish Category": {  # §3.6
        "name_field": ("category_name", "Category Name"),
        "seed": [("FIN-LAM", "Laminate"), ("FIN-ACL", "Acrylic"), ("FIN-PU", "PU"),
                 ("FIN-VEN", "Veneer"), ("FIN-GLS", "Glass"), ("FIN-CER", "Ceramic"),
                 ("FIN-MEM", "Membrane"), ("FIN-MEL", "Melamine"),
                 ("FIN-PRE", "Pre-Laminated"), ("FIN-MIR", "Mirror"),
                 ("FIN-FAB", "Fabric / Leather"), ("FIN-ALU", "Aluminium")],
    },
    "Vera Finish Type": {
        "name_field": ("type_name", "Type Name"),
        "extra": [F("finish_category", "Link", options="Vera Finish Category")],
        "seed": [("SL", "Solid Laminate", {"finish_category": "FIN-LAM"}),
                 ("SYN", "Synchronised Laminate", {"finish_category": "FIN-LAM"}),
                 ("ACG", "Acrylic Gloss", {"finish_category": "FIN-ACL"}),
                 ("ACM", "Acrylic Matt", {"finish_category": "FIN-ACL"}),
                 ("PUM", "PU Matt", {"finish_category": "FIN-PU"}),
                 ("PUG", "PU Gloss", {"finish_category": "FIN-PU"}),
                 ("VEN", "Veneer", {"finish_category": "FIN-VEN"}),
                 ("MIR", "Mirror", {"finish_category": "FIN-MIR"}),
                 ("MEM", "Membrane", {"finish_category": "FIN-MEM"})],
    },
    "Vera Edge Band": {  # §3.6
        "name_field": ("edge_name", "Edge Band"),
        "extra": [F("thickness_mm", "Float", label="Thickness (mm)"),
                  F("edge_material", "Data", label="Material"),
                  F("matching_finish", "Data", label="Matching Finish")],
        "seed": [("EB-04", "0.4 mm PVC", {"thickness_mm": 0.4, "edge_material": "PVC"}),
                 ("EB-08", "0.8 mm PVC", {"thickness_mm": 0.8, "edge_material": "PVC"}),
                 ("EB-1", "1 mm PVC", {"thickness_mm": 1, "edge_material": "PVC"}),
                 ("EB-2", "2 mm PVC", {"thickness_mm": 2, "edge_material": "PVC"}),
                 ("EB-ALU", "Aluminium Edge", {"edge_material": "Aluminium"})],
    },
    "Vera Glass": {  # §3.6
        "name_field": ("glass_name", "Glass"),
        "extra": [F("thickness_mm", "Float", label="Thickness (mm)")],
        "seed": [("GL-CLR", "Clear"), ("GL-XCL", "Extra Clear"), ("GL-BRZ", "Bronze"),
                 ("GL-GRY", "Grey"), ("GL-BLK", "Black"), ("GL-FRO", "Frosted"),
                 ("GL-FLU", "Fluted"), ("GL-REE", "Reeded"), ("GL-TGH", "Toughened"),
                 ("GL-LAM", "Laminated"), ("GL-MIR", "Mirror"), ("GL-LAC", "Lacquered")],
    },
    "Vera Aluminium Profile": {  # §3.6
        "name_field": ("profile_name", "Profile"),
        "extra": [F("finish_colour", "Data", label="Finish / Colour")],
        "seed": [("ALU-BLK", "Black"), ("ALU-CHM", "Champagne"), ("ALU-BRZ", "Bronze"),
                 ("ALU-GLD", "Gold"), ("ALU-SLV", "Silver"), ("ALU-NAT", "Natural"),
                 ("ALU-ANT", "Anthracite"), ("ALU-ANO", "Anodised"), ("ALU-BRU", "Brushed")],
    },
    # ── Hardware / appliance / stone reference §3.9 ───────────────────────────
    "Vera Hardware Category": {
        "name_field": ("category_name", "Category Name"),
        "seed": [("HDW-HNG", "Hinges"), ("HDW-DRW", "Drawer Systems"), ("HDW-LFT", "Lift-up"),
                 ("HDW-SLD", "Sliding"), ("HDW-WAC", "Wardrobe Accessories"),
                 ("HDW-KAC", "Kitchen Accessories"), ("HDW-HND", "Handles"),
                 ("HDW-LEG", "Legs"), ("HDW-SKT", "Skirting"), ("HDW-LCK", "Locks"),
                 ("HDW-CON", "Connectors"), ("HDW-LGT", "Furniture Lighting")],
    },
    "Vera Hardware Brand": {
        "name_field": ("brand_name", "Brand Name"),
        "seed": [("HB-BLM", "Blum"), ("HB-HAF", "Hafele"), ("HB-HET", "Hettich"),
                 ("HB-KES", "Kessebohmer"), ("HB-EBC", "Ebco"), ("HB-VIB", "Vibo"),
                 ("HB-RAU", "Raumplus"), ("HB-CNR", "CNR"), ("HB-NUO", "Nuomi"),
                 ("HB-REH", "Rehau")],
    },
    "Vera Hardware Series": {
        "name_field": ("series_name", "Series Name"),
        "extra": [F("hardware_brand", "Link", options="Vera Hardware Brand"),
                  F("hardware_category", "Link", options="Vera Hardware Category")],
        "seed": [],  # populated per-brand later from vendor pricelists
    },
    "Vera Appliance Category": {
        "name_field": ("category_name", "Category Name"),
        "seed": [("APP-HOB", "Hob"), ("APP-HOD", "Hood"), ("APP-OVN", "Oven"),
                 ("APP-MW", "Microwave"), ("APP-DW", "Dishwasher"),
                 ("APP-REF", "Refrigerator"), ("APP-FRZ", "Freezer"),
                 ("APP-WIN", "Wine Cooler"), ("APP-COF", "Coffee Machine"),
                 ("APP-WM", "Washing Machine"), ("APP-DRY", "Dryer"),
                 ("APP-COM", "Combination")],
    },
    "Vera Appliance Brand": {
        "name_field": ("brand_name", "Brand Name"),
        "seed": [("AB-SIE", "Siemens"), ("AB-BOS", "Bosch"), ("AB-GAG", "Gaggenau"),
                 ("AB-MIE", "Miele"), ("AB-ASK", "Asko"), ("AB-FAL", "Falmec"),
                 ("AB-HAF", "Hafele"), ("AB-HAI", "Haier"), ("AB-SAM", "Samsung"),
                 ("AB-LIE", "Liebherr")],
    },
    "Vera Stone Type": {
        "name_field": ("type_name", "Stone Type"),
        "seed": [("STN-QTZ", "Quartz"), ("STN-POR", "Porcelain"), ("STN-SIN", "Sintered"),
                 ("STN-GRA", "Granite"), ("STN-MAR", "Marble"), ("STN-ENG", "Engineered")],
    },
    "Vera Stone Brand": {
        "name_field": ("brand_name", "Brand Name"),
        "seed": [],
    },
    "Vera Stone Edge Profile": {
        "name_field": ("profile_name", "Edge Profile"),
        "seed": [("SEP-STR", "Straight"), ("SEP-PEN", "Pencil"), ("SEP-CHM", "Chamfer"),
                 ("SEP-BEV", "Bevel"), ("SEP-BUL", "Bullnose"), ("SEP-HBL", "Half Bullnose"),
                 ("SEP-MIT", "Mitred"), ("SEP-WTR", "Waterfall")],
    },
    # ── Measurement helpers §3.1 ──────────────────────────────────────────────
    "Vera Area": {
        "name_field": ("area_name", "Area Name"),
        "seed": [("AR-KIT", "Kitchen"), ("AR-MBR", "Master Bedroom"), ("AR-BR2", "Bedroom 2"),
                 ("AR-LIV", "Living Room"), ("AR-DIN", "Dining"), ("AR-FOY", "Foyer"),
                 ("AR-STU", "Study"), ("AR-UTL", "Utility"), ("AR-POO", "Puja"),
                 ("AR-BAL", "Balcony"), ("AR-BATH", "Bathroom")],
    },
    "Vera Obstruction Type": {
        "name_field": ("obstruction_name", "Obstruction Type"),
        "seed": [("OBS-PIP", "Pipe"), ("OBS-BEAM", "Beam"), ("OBS-COL", "Column"),
                 ("OBS-SWT", "Switchboard"), ("OBS-WIN", "Window"), ("OBS-DOR", "Door"),
                 ("OBS-DUCT", "Duct"), ("OBS-METER", "Meter Box")],
    },
    # ── Commercial masters §3.10 ──────────────────────────────────────────────
    "Vera Margin Class": {
        "name_field": ("class_name", "Class Name"),
        "extra": [F("target_gp_percent", "Percent", label="Target GP %")],
        "seed": [("MRG-A", "Class A", {"target_gp_percent": 40}),
                 ("MRG-B", "Class B", {"target_gp_percent": 35}),
                 ("MRG-C", "Class C", {"target_gp_percent": 30}),
                 ("MRG-D", "Class D", {"target_gp_percent": 25}),
                 ("MRG-SPL", "Special (manual)", {"target_gp_percent": 0})],
    },
    "Vera Wastage": {
        "name_field": ("material_name", "Material"),
        "extra": [F("default_percent", "Percent", label="Default Wastage %")],
        "seed": [("WST-PLY", "Plywood", {"default_percent": 10}),
                 ("WST-LAM", "Laminate", {"default_percent": 10}),
                 ("WST-ACL", "Acrylic", {"default_percent": 12}),
                 ("WST-GLS", "Glass", {"default_percent": 8}),
                 ("WST-STN", "Stone", {"default_percent": 15}),
                 ("WST-ALU", "Aluminium", {"default_percent": 5}),
                 ("WST-EDG", "Edge Band", {"default_percent": 10})],
    },
    "Vera Cost Type": {
        "name_field": ("cost_type_name", "Cost Type"),
        "seed": [("CT-MAT", "Material"), ("CT-FIN", "Finish"), ("CT-HDW", "Hardware"),
                 ("CT-GLS", "Glass"), ("CT-ALU", "Aluminium"), ("CT-MFG", "Manufacturing"),
                 ("CT-LAB", "Labour"), ("CT-INS", "Installation"), ("CT-TRN", "Transportation"),
                 ("CT-SIT", "Site"), ("CT-OUT", "Outsourcing"), ("CT-OVH", "Overhead")],
    },
    "Vera Cost Source": {  # cross-agent notes
        "name_field": ("source_name", "Cost Source"),
        "seed": [("CS-LP", "Last Purchase"), ("CS-MA", "Moving Average"),
                 ("CS-STD", "Standard"), ("CS-SQ", "Supplier Quotation"),
                 ("CS-CR", "Contract Rate"), ("CS-LC", "Landed Cost"), ("CS-MAN", "Manual")],
    },
    "Vera Warranty Template": {
        "name_field": ("warranty_name", "Warranty"),
        "extra": [F("period_months", "Int", label="Period (months)")],
        "seed": [("WR-1Y", "1 Year", {"period_months": 12}),
                 ("WR-2Y", "2 Years", {"period_months": 24}),
                 ("WR-5Y", "5 Years", {"period_months": 60}),
                 ("WR-10Y", "10 Years", {"period_months": 120}),
                 ("WR-LIFE", "Lifetime", {"period_months": 0})],
    },
    "Vera Inclusion": {
        "name_field": ("inclusion_text", "Inclusion"),
        "seed": [("INC-INS", "Standard installation included"),
                 ("INC-HW", "Hardware included as specified"),
                 ("INC-TRN", "Transportation to site included")],
    },
    "Vera Exclusion": {
        "name_field": ("exclusion_text", "Exclusion"),
        "seed": [("EXC-CIV", "Civil / masonry work excluded"),
                 ("EXC-ELE", "Electrical points excluded"),
                 ("EXC-PLM", "Plumbing work excluded"),
                 ("EXC-APP", "Appliances excluded unless quoted")],
    },
}


def _build_json(dtname: str, cfg: dict) -> dict:
    name_fn, name_lbl = cfg["name_field"]
    fields = [F("code", "Data", "Code", reqd=1, unique=1, in_list_view=1),
              F(name_fn, "Data", name_lbl, reqd=1, in_list_view=1)]
    fields += cfg.get("extra", [])
    fields += [F("description", "Small Text", "Description"),
               F("sort_order", "Int", "Sort Order"),
               STD_STATUS, STD_SOURCE]
    return {
        "autoname": "field:code", "creation": "2026-09-22 00:00:00.000000",
        "doctype": "DocType", "editable_grid": 1, "engine": "InnoDB",
        "field_order": [f["fieldname"] for f in fields], "fields": fields,
        "modified": "2026-09-22 00:00:00.000000", "modified_by": "Administrator",
        "module": "Hr Client", "name": dtname, "naming_rule": "By fieldname",
        "owner": "Administrator",
        "permissions": [
            {"create": 1, "delete": 1, "read": 1, "role": "System Manager", "write": 1},
            {"create": 1, "delete": 0, "read": 1, "role": "Employee", "write": 1},
        ],
        "sort_field": "modified", "sort_order": "DESC", "track_changes": 1,
    }


def _controller(dtname: str) -> str:
    cls = dtname.replace(" ", "")
    return (f'''import frappe
from frappe.model.document import Document


class {cls}(Document):
    """Quotation-module taxonomy master ({dtname}). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
''')


def _write_doctypes() -> list[str]:
    written = []
    for dtname, cfg in SPEC.items():
        snake = _snake(dtname)
        folder = os.path.join(DT_DIR, snake)
        os.makedirs(folder, exist_ok=True)
        open(os.path.join(folder, "__init__.py"), "w").close()
        with open(os.path.join(folder, f"{snake}.json"), "w") as fh:
            json.dump(_build_json(dtname, cfg), fh, indent=1)
            fh.write("\n")
        with open(os.path.join(folder, f"{snake}.py"), "w") as fh:
            fh.write(_controller(dtname))
        written.append(dtname)
    return written


def _write_seed() -> None:
    lines = ['"""Seed the Quotation-module taxonomy masters (§3 enumerations).',
             '',
             'Idempotent — skips codes already present. Run after `bench migrate`:',
             '    bench --site vera.local execute hr_client.api.quotation_taxonomy.seed_all',
             '"""',
             '', 'import frappe', '', '',
             '# {DocType: [(code, name, {extra})]}', 'SEED = {']
    for dtname, cfg in SPEC.items():
        name_fn = cfg["name_field"][0]
        rows = cfg.get("seed", [])
        lines.append(f'    "{dtname}": (')
        lines.append(f'        "{name_fn}", [')
        for r in rows:
            code, nm = r[0], r[1]
            extra = r[2] if len(r) > 2 else {}
            lines.append(f'            ({code!r}, {nm!r}, {extra!r}),')
        lines.append('        ]),')
    lines.append('}')
    lines.append('')
    lines.append('')
    lines.append('def seed_all():')
    lines.append('    made = {}')
    lines.append('    for dt, (name_field, rows) in SEED.items():')
    lines.append('        if not frappe.db.exists("DocType", dt):')
    lines.append('            continue')
    lines.append('        n = 0')
    lines.append('        for i, (code, name, extra) in enumerate(rows):')
    lines.append('            if frappe.db.exists(dt, code):')
    lines.append('                continue')
    lines.append('            doc = frappe.new_doc(dt)')
    lines.append('            doc.code = code')
    lines.append('            setattr(doc, name_field, name)')
    lines.append('            doc.sort_order = i')
    lines.append('            for k, v in (extra or {}).items():')
    lines.append('                if doc.meta.has_field(k):')
    lines.append('                    setattr(doc, k, v)')
    lines.append('            doc.insert(ignore_permissions=True)')
    lines.append('            n += 1')
    lines.append('        made[dt] = n')
    lines.append('    frappe.db.commit()')
    lines.append('    return made')
    with open(os.path.join(API_DIR, "quotation_taxonomy.py"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    made = _write_doctypes()
    _write_seed()
    print(f"scaffolded {len(made)} taxonomy masters + api/quotation_taxonomy.py")
    for m in made:
        print("  -", m)
