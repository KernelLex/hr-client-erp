import frappe

def execute():
    frappe.set_user("Administrator")
    if frappe.db.exists("Company", "Vera Enterprises"):
        print("Company 'Vera Enterprises' already exists")
        return
    frappe.rename_doc("Company", "valance", "Vera Enterprises", force=True)
    frappe.db.commit()
    print("Renamed company to 'Vera Enterprises'")
