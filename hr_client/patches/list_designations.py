import frappe

def execute():
    rows = frappe.db.sql("SELECT name, designation_name FROM tabDesignation", as_dict=True)
    for r in rows:
        print(r)
