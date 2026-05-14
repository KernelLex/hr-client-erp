import frappe
from frappe.utils.password import update_password

def execute():
    users = [
        "maazdgr8.mma@gmail.com",
        "manju.veraaccnts@outlook.com",
        "lookman.vera@outlook.com",
        "Bhagyashree.veraenterprises@outlook.com",
    ]
    for email in users:
        if frappe.db.exists("User", email):
            update_password(email, "Vera@2026")
            frappe.db.commit()
            print(f"DONE: {email}")
        else:
            print(f"MISSING: {email}")
