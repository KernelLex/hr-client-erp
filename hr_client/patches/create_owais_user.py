import frappe
from frappe.utils.password import update_password

def execute():
    email = "owais@veraenterprises.in"

    if frappe.db.exists("User", email):
        # Already exists — just reset password and ensure System Manager role
        user = frappe.get_doc("User", email)
    else:
        user = frappe.new_doc("User")
        user.email = email
        user.first_name = "Owais"
        user.last_name = "Ahmed Khan"
        user.send_welcome_email = 0
        user.enabled = 1

    # Make sure System Manager role is there
    existing_roles = {r.role for r in user.roles}
    if "System Manager" not in existing_roles:
        user.append("roles", {"role": "System Manager"})
    if "Administrator" not in existing_roles:
        user.append("roles", {"role": "Administrator"})

    if frappe.db.exists("User", email):
        user.save(ignore_permissions=True)
    else:
        user.insert(ignore_permissions=True)

    frappe.db.commit()
    update_password(email, "Vera@2026")
    frappe.db.commit()
    print(f"DONE: {email} created/updated with System Manager")
