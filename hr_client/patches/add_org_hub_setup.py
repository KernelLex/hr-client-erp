"""
Patch: add_org_hub_setup
Adds Custom Field 'Company Assets' (child table VE Employee Asset) to Employee DocType.
Idempotent — safe to re-run.
"""
import frappe


def execute():
    # Add custom_assets child table field to Employee
    if not frappe.db.exists("Custom Field", "Employee-custom_assets"):
        cf = frappe.new_doc("Custom Field")
        cf.dt = "Employee"
        cf.fieldname = "custom_assets"
        cf.label = "Company Assets"
        cf.fieldtype = "Table"
        cf.options = "VE Employee Asset"
        cf.insert_after = "custom_skills"
        cf.insert(ignore_permissions=True)
        frappe.db.commit()
        print("Created Custom Field: Employee-custom_assets")
    else:
        print("Custom Field Employee-custom_assets already exists — skipping")
