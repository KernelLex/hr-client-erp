"""Seed the Quotation-module taxonomy masters (§3 enumerations).

Idempotent — skips codes already present. Run after `bench migrate`:
    bench --site vera.local execute hr_client.api.quotation_taxonomy.seed_all
"""

import frappe


# {DocType: [(code, name, {extra})]}
SEED = {
    "Vera Product Group": (
        "group_name", [
            ('KIT', 'Kitchen', {'is_group': 1}),
            ('WRD', 'Wardrobe', {'is_group': 1}),
            ('VAN', 'Vanity', {'is_group': 1}),
            ('TVU', 'TV Unit', {'is_group': 1}),
            ('CRK', 'Crockery', {'is_group': 1}),
            ('STU', 'Study', {'is_group': 1}),
            ('LIB', 'Library', {'is_group': 1}),
            ('CAB', 'Cabinet', {'is_group': 1}),
            ('FUR', 'Loose Furniture', {'is_group': 1}),
            ('SRV', 'Services', {'is_group': 1}),
            ('KIT-BAS', 'Kitchen Base Unit', {'parent_product_group': 'KIT', 'is_group': 1}),
            ('KIT-WAL', 'Kitchen Wall Unit', {'parent_product_group': 'KIT', 'is_group': 1}),
            ('KIT-TAL', 'Kitchen Tall Unit', {'parent_product_group': 'KIT', 'is_group': 1}),
            ('KIT-BAS-SNK', 'Sink Base Unit', {'parent_product_group': 'KIT-BAS'}),
            ('KIT-BAS-DRW', 'Drawer Base Unit', {'parent_product_group': 'KIT-BAS'}),
            ('KIT-BAS-COR', 'Corner Base Unit', {'parent_product_group': 'KIT-BAS'}),
            ('WRD-HNG', 'Hinged Wardrobe', {'parent_product_group': 'WRD'}),
            ('WRD-SLD', 'Sliding Wardrobe', {'parent_product_group': 'WRD'}),
        ]),
    "Vera Product Category": (
        "category_name", [
            ('HW', 'Hardware', {}),
            ('APP', 'Appliances', {}),
            ('STN', 'Countertop Stone', {}),
            ('SF', 'Sink & Faucet', {}),
            ('BRD', 'Boards / Panels', {}),
            ('GL', 'Glass', {}),
            ('AL', 'Aluminium Profiles', {}),
            ('AC', 'AC / HVAC', {}),
            ('LT', 'Lighting', {}),
            ('RM', 'Raw Materials', {}),
            ('OTH', 'Others', {}),
        ]),
    "Vera Component": (
        "component_name", [
            ('CMP-CAR', 'Carcass', {}),
            ('CMP-SHT', 'Shutter', {}),
            ('CMP-BAK', 'Back Panel', {}),
            ('CMP-DRW', 'Drawer', {}),
            ('CMP-SHF', 'Shelf', {}),
            ('CMP-HDW', 'Hardware', {}),
            ('CMP-HND', 'Handle', {}),
            ('CMP-LGT', 'Lighting', {}),
            ('CMP-ACC', 'Accessory', {}),
        ]),
    "Vera Scope Type": (
        "scope_name", [
            ('SCP-SUP', 'Supply Only', {'applies_to': 'Modular'}),
            ('SCP-SUP-INS', 'Supply + Installation', {'applies_to': 'Modular'}),
            ('SCP-SUP-HW', 'Supply + Hardware', {'applies_to': 'Modular'}),
            ('SCP-CMP', 'Complete Package', {'applies_to': 'Modular'}),
            ('SCP-STN-FAB', 'Supply + Fabrication', {'applies_to': 'Stone'}),
            ('SCP-STN-INS', 'Supply + Fabrication + Installation', {'applies_to': 'Stone'}),
        ]),
    "Vera Installation Type": (
        "install_name", [
            ('INS-SUP', 'Supply Only', {}),
            ('INS-STD', 'Standard', {}),
            ('INS-PRM', 'Premium', {}),
            ('INS-CUS', 'By Customer', {}),
            ('INS-VEN', 'By Vendor', {}),
            ('INS-INC', 'Included', {}),
            ('INS-CHG', 'Chargeable', {}),
        ]),
    "Vera Delivery Term": (
        "term_name", [
            ('DEL-EXW', 'Ex-Warehouse', {}),
            ('DEL-SITE', 'Delivered to Site', {}),
            ('DEL-UNL', 'Delivered & Unloaded', {}),
            ('DEL-INS', 'Delivered & Installed', {}),
            ('DEL-PICK', 'Customer Pickup', {}),
        ]),
    "Vera Thickness": (
        "thickness_name", [
            ('THK-04', '4 mm', {'value_mm': 4}),
            ('THK-06', '6 mm', {'value_mm': 6}),
            ('THK-08', '8 mm', {'value_mm': 8}),
            ('THK-09', '9 mm', {'value_mm': 9}),
            ('THK-12', '12 mm', {'value_mm': 12}),
            ('THK-15', '15 mm', {'value_mm': 15}),
            ('THK-16', '16 mm', {'value_mm': 16}),
            ('THK-17', '17 mm', {'value_mm': 17}),
            ('THK-18', '18 mm', {'value_mm': 18}),
            ('THK-19', '19 mm', {'value_mm': 19}),
            ('THK-25', '25 mm', {'value_mm': 25}),
            ('THK-30', '30 mm', {'value_mm': 30}),
        ]),
    "Vera Finish Category": (
        "category_name", [
            ('FIN-LAM', 'Laminate', {}),
            ('FIN-ACL', 'Acrylic', {}),
            ('FIN-PU', 'PU', {}),
            ('FIN-VEN', 'Veneer', {}),
            ('FIN-GLS', 'Glass', {}),
            ('FIN-CER', 'Ceramic', {}),
            ('FIN-MEM', 'Membrane', {}),
            ('FIN-MEL', 'Melamine', {}),
            ('FIN-PRE', 'Pre-Laminated', {}),
            ('FIN-MIR', 'Mirror', {}),
            ('FIN-FAB', 'Fabric / Leather', {}),
            ('FIN-ALU', 'Aluminium', {}),
        ]),
    "Vera Finish Type": (
        "type_name", [
            ('SL', 'Solid Laminate', {'finish_category': 'FIN-LAM'}),
            ('SYN', 'Synchronised Laminate', {'finish_category': 'FIN-LAM'}),
            ('ACG', 'Acrylic Gloss', {'finish_category': 'FIN-ACL'}),
            ('ACM', 'Acrylic Matt', {'finish_category': 'FIN-ACL'}),
            ('PUM', 'PU Matt', {'finish_category': 'FIN-PU'}),
            ('PUG', 'PU Gloss', {'finish_category': 'FIN-PU'}),
            ('VEN', 'Veneer', {'finish_category': 'FIN-VEN'}),
            ('MIR', 'Mirror', {'finish_category': 'FIN-MIR'}),
            ('MEM', 'Membrane', {'finish_category': 'FIN-MEM'}),
        ]),
    "Vera Edge Band": (
        "edge_name", [
            ('EB-04', '0.4 mm PVC', {'thickness_mm': 0.4, 'edge_material': 'PVC'}),
            ('EB-08', '0.8 mm PVC', {'thickness_mm': 0.8, 'edge_material': 'PVC'}),
            ('EB-1', '1 mm PVC', {'thickness_mm': 1, 'edge_material': 'PVC'}),
            ('EB-2', '2 mm PVC', {'thickness_mm': 2, 'edge_material': 'PVC'}),
            ('EB-ALU', 'Aluminium Edge', {'edge_material': 'Aluminium'}),
        ]),
    "Vera Glass": (
        "glass_name", [
            ('GL-CLR', 'Clear', {}),
            ('GL-XCL', 'Extra Clear', {}),
            ('GL-BRZ', 'Bronze', {}),
            ('GL-GRY', 'Grey', {}),
            ('GL-BLK', 'Black', {}),
            ('GL-FRO', 'Frosted', {}),
            ('GL-FLU', 'Fluted', {}),
            ('GL-REE', 'Reeded', {}),
            ('GL-TGH', 'Toughened', {}),
            ('GL-LAM', 'Laminated', {}),
            ('GL-MIR', 'Mirror', {}),
            ('GL-LAC', 'Lacquered', {}),
        ]),
    "Vera Aluminium Profile": (
        "profile_name", [
            ('ALU-BLK', 'Black', {}),
            ('ALU-CHM', 'Champagne', {}),
            ('ALU-BRZ', 'Bronze', {}),
            ('ALU-GLD', 'Gold', {}),
            ('ALU-SLV', 'Silver', {}),
            ('ALU-NAT', 'Natural', {}),
            ('ALU-ANT', 'Anthracite', {}),
            ('ALU-ANO', 'Anodised', {}),
            ('ALU-BRU', 'Brushed', {}),
        ]),
    "Vera Hardware Category": (
        "category_name", [
            ('HDW-HNG', 'Hinges', {}),
            ('HDW-DRW', 'Drawer Systems', {}),
            ('HDW-LFT', 'Lift-up', {}),
            ('HDW-SLD', 'Sliding', {}),
            ('HDW-WAC', 'Wardrobe Accessories', {}),
            ('HDW-KAC', 'Kitchen Accessories', {}),
            ('HDW-HND', 'Handles', {}),
            ('HDW-LEG', 'Legs', {}),
            ('HDW-SKT', 'Skirting', {}),
            ('HDW-LCK', 'Locks', {}),
            ('HDW-CON', 'Connectors', {}),
            ('HDW-LGT', 'Furniture Lighting', {}),
        ]),
    "Vera Hardware Brand": (
        "brand_name", [
            ('HB-BLM', 'Blum', {}),
            ('HB-HAF', 'Hafele', {}),
            ('HB-HET', 'Hettich', {}),
            ('HB-KES', 'Kessebohmer', {}),
            ('HB-EBC', 'Ebco', {}),
            ('HB-VIB', 'Vibo', {}),
            ('HB-RAU', 'Raumplus', {}),
            ('HB-CNR', 'CNR', {}),
            ('HB-NUO', 'Nuomi', {}),
            ('HB-REH', 'Rehau', {}),
        ]),
    "Vera Hardware Series": (
        "series_name", [
        ]),
    "Vera Appliance Category": (
        "category_name", [
            ('APP-HOB', 'Hob', {}),
            ('APP-HOD', 'Hood', {}),
            ('APP-OVN', 'Oven', {}),
            ('APP-MW', 'Microwave', {}),
            ('APP-DW', 'Dishwasher', {}),
            ('APP-REF', 'Refrigerator', {}),
            ('APP-FRZ', 'Freezer', {}),
            ('APP-WIN', 'Wine Cooler', {}),
            ('APP-COF', 'Coffee Machine', {}),
            ('APP-WM', 'Washing Machine', {}),
            ('APP-DRY', 'Dryer', {}),
            ('APP-COM', 'Combination', {}),
        ]),
    "Vera Appliance Brand": (
        "brand_name", [
            ('AB-SIE', 'Siemens', {}),
            ('AB-BOS', 'Bosch', {}),
            ('AB-GAG', 'Gaggenau', {}),
            ('AB-MIE', 'Miele', {}),
            ('AB-ASK', 'Asko', {}),
            ('AB-FAL', 'Falmec', {}),
            ('AB-HAF', 'Hafele', {}),
            ('AB-HAI', 'Haier', {}),
            ('AB-SAM', 'Samsung', {}),
            ('AB-LIE', 'Liebherr', {}),
        ]),
    "Vera Stone Type": (
        "type_name", [
            ('STN-QTZ', 'Quartz', {}),
            ('STN-POR', 'Porcelain', {}),
            ('STN-SIN', 'Sintered', {}),
            ('STN-GRA', 'Granite', {}),
            ('STN-MAR', 'Marble', {}),
            ('STN-ENG', 'Engineered', {}),
        ]),
    "Vera Stone Brand": (
        "brand_name", [
        ]),
    "Vera Stone Edge Profile": (
        "profile_name", [
            ('SEP-STR', 'Straight', {}),
            ('SEP-PEN', 'Pencil', {}),
            ('SEP-CHM', 'Chamfer', {}),
            ('SEP-BEV', 'Bevel', {}),
            ('SEP-BUL', 'Bullnose', {}),
            ('SEP-HBL', 'Half Bullnose', {}),
            ('SEP-MIT', 'Mitred', {}),
            ('SEP-WTR', 'Waterfall', {}),
        ]),
    "Vera Area": (
        "area_name", [
            ('AR-KIT', 'Kitchen', {}),
            ('AR-MBR', 'Master Bedroom', {}),
            ('AR-BR2', 'Bedroom 2', {}),
            ('AR-LIV', 'Living Room', {}),
            ('AR-DIN', 'Dining', {}),
            ('AR-FOY', 'Foyer', {}),
            ('AR-STU', 'Study', {}),
            ('AR-UTL', 'Utility', {}),
            ('AR-POO', 'Puja', {}),
            ('AR-BAL', 'Balcony', {}),
            ('AR-BATH', 'Bathroom', {}),
        ]),
    "Vera Obstruction Type": (
        "obstruction_name", [
            ('OBS-PIP', 'Pipe', {}),
            ('OBS-BEAM', 'Beam', {}),
            ('OBS-COL', 'Column', {}),
            ('OBS-SWT', 'Switchboard', {}),
            ('OBS-WIN', 'Window', {}),
            ('OBS-DOR', 'Door', {}),
            ('OBS-DUCT', 'Duct', {}),
            ('OBS-METER', 'Meter Box', {}),
        ]),
    "Vera Margin Class": (
        "class_name", [
            ('MRG-A', 'Class A', {'target_gp_percent': 40}),
            ('MRG-B', 'Class B', {'target_gp_percent': 35}),
            ('MRG-C', 'Class C', {'target_gp_percent': 30}),
            ('MRG-D', 'Class D', {'target_gp_percent': 25}),
            ('MRG-SPL', 'Special (manual)', {'target_gp_percent': 0}),
        ]),
    "Vera Wastage": (
        "material_name", [
            ('WST-PLY', 'Plywood', {'default_percent': 10}),
            ('WST-LAM', 'Laminate', {'default_percent': 10}),
            ('WST-ACL', 'Acrylic', {'default_percent': 12}),
            ('WST-GLS', 'Glass', {'default_percent': 8}),
            ('WST-STN', 'Stone', {'default_percent': 15}),
            ('WST-ALU', 'Aluminium', {'default_percent': 5}),
            ('WST-EDG', 'Edge Band', {'default_percent': 10}),
        ]),
    "Vera Cost Type": (
        "cost_type_name", [
            ('CT-MAT', 'Material', {}),
            ('CT-FIN', 'Finish', {}),
            ('CT-HDW', 'Hardware', {}),
            ('CT-GLS', 'Glass', {}),
            ('CT-ALU', 'Aluminium', {}),
            ('CT-MFG', 'Manufacturing', {}),
            ('CT-LAB', 'Labour', {}),
            ('CT-INS', 'Installation', {}),
            ('CT-TRN', 'Transportation', {}),
            ('CT-SIT', 'Site', {}),
            ('CT-OUT', 'Outsourcing', {}),
            ('CT-OVH', 'Overhead', {}),
        ]),
    "Vera Cost Source": (
        "source_name", [
            ('CS-LP', 'Last Purchase', {}),
            ('CS-MA', 'Moving Average', {}),
            ('CS-STD', 'Standard', {}),
            ('CS-SQ', 'Supplier Quotation', {}),
            ('CS-CR', 'Contract Rate', {}),
            ('CS-LC', 'Landed Cost', {}),
            ('CS-MAN', 'Manual', {}),
        ]),
    "Vera Warranty Template": (
        "warranty_name", [
            ('WR-1Y', '1 Year', {'period_months': 12}),
            ('WR-2Y', '2 Years', {'period_months': 24}),
            ('WR-5Y', '5 Years', {'period_months': 60}),
            ('WR-10Y', '10 Years', {'period_months': 120}),
            ('WR-LIFE', 'Lifetime', {'period_months': 0}),
        ]),
    "Vera Inclusion": (
        "inclusion_text", [
            ('INC-INS', 'Standard installation included', {}),
            ('INC-HW', 'Hardware included as specified', {}),
            ('INC-TRN', 'Transportation to site included', {}),
        ]),
    "Vera Exclusion": (
        "exclusion_text", [
            ('EXC-CIV', 'Civil / masonry work excluded', {}),
            ('EXC-ELE', 'Electrical points excluded', {}),
            ('EXC-PLM', 'Plumbing work excluded', {}),
            ('EXC-APP', 'Appliances excluded unless quoted', {}),
        ]),
}


def seed_all():
    made = {}
    for dt, (name_field, rows) in SEED.items():
        if not frappe.db.exists("DocType", dt):
            continue
        n = 0
        for i, (code, name, extra) in enumerate(rows):
            if frappe.db.exists(dt, code):
                continue
            doc = frappe.new_doc(dt)
            doc.code = code
            setattr(doc, name_field, name)
            doc.sort_order = i
            for k, v in (extra or {}).items():
                if doc.meta.has_field(k):
                    setattr(doc, k, v)
            doc.insert(ignore_permissions=True)
            n += 1
        made[dt] = n
    frappe.db.commit()
    return made
