import frappe
from frappe.utils import getdate
from frappe.utils.password import update_password

def execute():
    frappe.set_user("Administrator")
    try:
        # Step 1 - create employee
        doc = frappe.new_doc("Employee")
        doc.first_name = "Monisha"
        doc.last_name = "Merry"
        doc.gender = "Female"
        doc.date_of_joining = getdate("2025-04-02")
        doc.status = "Active"
        doc.designation = "Sales & Collection Coordinator"
        doc.department = "Sales - V"
        doc.company = "Vera Enterprises"
        doc.employment_type = "Full-time"
        doc.cell_number = "9606944903"
        doc.user_id = "monishamarys@outlook.com"
        doc.company_email = "monishamarys@outlook.com"
        doc.flags.ignore_mandatory = True
        doc.insert(ignore_permissions=True)
        print(f"Employee created: {doc.name}")
    except Exception as e:
        import traceback
        print(f"Employee error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return

    try:
        # Step 2 - create user
        email = "monishamarys@outlook.com"
        if frappe.db.exists("User", email):
            print("User already exists")
            return
        user = frappe.new_doc("User")
        user.email = email
        user.first_name = "Monisha"
        user.last_name = "Merry"
        user.send_welcome_email = 0
        user.enabled = 1
        user.user_type = "System User"
        user.insert(ignore_permissions=True)
        update_password(email, "Vera@2026")
        print(f"User created: {email}")
    except Exception as e:
        import traceback
        print(f"User error: {type(e).__name__}: {e}")
        traceback.print_exc()

    frappe.db.rollback()
