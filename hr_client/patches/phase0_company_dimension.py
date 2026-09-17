"""Phase 0 — multi-company primitives.

Idempotent. Creates the Company + User custom fields, seeds Vera Enterprises'
branding/Tally values, and backfills a Vera Enterprises access row for every
enabled System User. SL/HM Company records are intentionally NOT created here
(Phase 6 provision_company owns that, to avoid ERPNext's default-COA cruft).
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

VE = "Vera Enterprises"


def execute():
    _create_custom_fields()
    _seed_ve_company_values()
    _backfill_access_rows()
    frappe.db.commit()


def _create_custom_fields():
    create_custom_fields({
        "Company": [
            {"fieldname": "ve_multicompany_section", "fieldtype": "Section Break",
             "label": "Vera ERP — Multi-company", "insert_after": "abbr"},
            {"fieldname": "ve_login_enabled", "fieldtype": "Check", "default": "0",
             "label": "Login Enabled (show on picker)",
             "insert_after": "ve_multicompany_section"},
            {"fieldname": "ve_accent_hex", "fieldtype": "Data",
             "label": "SPA Accent (hex)", "insert_after": "ve_login_enabled"},
            {"fieldname": "ve_short_label", "fieldtype": "Data",
             "label": "Short Label", "insert_after": "ve_accent_hex"},
            {"fieldname": "ve_col_break_mc", "fieldtype": "Column Break",
             "insert_after": "ve_short_label"},
            {"fieldname": "ve_tally_company_name", "fieldtype": "Data",
             "label": "Tally Company Name (exact string in XML)",
             "insert_after": "ve_col_break_mc"},
            {"fieldname": "ve_tally_upload_path", "fieldtype": "Data",
             "label": "Tally Upload Path", "insert_after": "ve_tally_company_name"},
            {"fieldname": "ve_drive_root_id", "fieldtype": "Data",
             "label": "Google Drive Root Folder ID",
             "insert_after": "ve_tally_upload_path"},
        ],
        "User": [
            {"fieldname": "ve_company_access", "fieldtype": "Table",
             "label": "Company Access", "options": "User Company Access",
             "insert_after": "roles"},
        ],
    }, ignore_validate=True)


def _seed_ve_company_values():
    if not frappe.db.exists("Company", VE):
        return
    frappe.db.set_value("Company", VE, {
        "ve_login_enabled": 1,
        "ve_accent_hex": "#C6A15B",           # VE keeps gold-on-forest
        "ve_short_label": "Vera Enterprises",
        "ve_tally_company_name": "VERA ENTERPRISES",   # exact <SVCURRENTCOMPANY>
        "ve_tally_upload_path": "/home/vera/tally_uploads/VE/",
    })


def _backfill_access_rows():
    if not frappe.db.exists("Company", VE):
        return
    users = frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User", "name": ["not in", ["Guest"]]},
        pluck="name",
    )
    for u in users:
        existing = frappe.get_all(
            "User Company Access",
            filters={"parent": u, "parenttype": "User"},
            fields=["company"], pluck="company",
        )
        if VE in existing:
            continue
        # Direct child-row insert — avoids User.save() email/gravatar hooks.
        frappe.get_doc({
            "doctype": "User Company Access",
            "parent": u,
            "parenttype": "User",
            "parentfield": "ve_company_access",
            "idx": len(existing) + 1,
            "company": VE,
            "access_level": "Full",
            "is_default": 0 if existing else 1,
        }).insert(ignore_permissions=True)
