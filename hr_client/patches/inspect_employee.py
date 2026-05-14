import frappe

def execute():
    doc = frappe.get_doc("Employee", "HR-EMP-00001")
    for f in doc.meta.fields:
        if 'emergency' in f.fieldname or 'contact' in f.fieldname:
            print(f.fieldname, '|', f.fieldtype, '|', f.label)
