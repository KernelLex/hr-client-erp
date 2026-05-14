import frappe

def execute():
    frappe.set_user("Administrator")
    designations = [
        "Accounts Manager",
        "Accounts Executive",
        "GST & TDS Specialist",
        "Logistics Manager",
        "Stock Monitor",
        "Porter Executive",
    ]
    for d in designations:
        if not frappe.db.exists("Designation", d):
            frappe.get_doc({"doctype": "Designation", "designation_name": d}).insert(ignore_permissions=True)
            print(f"Created: {d}")
        else:
            print(f"Exists: {d}")
    frappe.db.commit()
    print("Done.")
