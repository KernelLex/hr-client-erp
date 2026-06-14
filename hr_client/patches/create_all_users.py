import frappe
from frappe.utils.password import update_password

USERS = [
    {
        "email": "owais@veraenterprises.in",
        "first_name": "Owais Ahmed",
        "last_name": "Khan",
        "roles": ["System Manager"],
    },
    {
        "email": "maazdgr8.mma@gmail.com",
        "first_name": "Maaz",
        "last_name": "",
        "roles": ["HR Manager", "HR User", "Accounts Manager", "Accounts User",
                  "Projects User", "Stock Manager", "Stock User",
                  "Expense Approver", "Employee", "Leave Approver"],
    },
    {
        "email": "manju.veraaccnts@outlook.com",
        "first_name": "Manjunath",
        "last_name": "M N",
        "roles": ["HR Manager", "HR User", "Accounts Manager", "Accounts User",
                  "Projects User", "Stock Manager", "Stock User",
                  "Expense Approver", "Employee", "Leave Approver"],
    },
    {
        "email": "lookman.vera@outlook.com",
        "first_name": "Lookman",
        "last_name": "",
        "roles": ["HR Manager", "HR User", "Accounts Manager", "Accounts User",
                  "Projects User", "Stock Manager", "Stock User",
                  "Expense Approver", "Employee", "Leave Approver"],
    },
    {
        "email": "bhagyashree.veraenterprises@outlook.com",
        "first_name": "Bhagya Shree",
        "last_name": "",
        "roles": ["HR Manager", "HR User", "Accounts Manager", "Accounts User",
                  "Projects User", "Stock Manager", "Stock User",
                  "Expense Approver", "Employee", "Leave Approver"],
    },
]

PASSWORD = "Vera@2026"


def execute():
    frappe.set_user("Administrator")

    for u in USERS:
        if frappe.db.exists("User", u["email"]):
            user = frappe.get_doc("User", u["email"])
            print(f"User exists: {u['email']} — updating roles")
        else:
            user = frappe.new_doc("User")
            user.email = u["email"]
            user.first_name = u["first_name"]
            user.last_name = u["last_name"] or None
            user.send_welcome_email = 0
            user.enabled = 1
            print(f"Creating user: {u['email']}")

        existing_roles = {r.role for r in user.roles}
        for role in u["roles"]:
            if role not in existing_roles:
                user.append("roles", {"role": role})

        if frappe.db.exists("User", u["email"]):
            user.save(ignore_permissions=True)
        else:
            user.insert(ignore_permissions=True)

        update_password(u["email"], PASSWORD)

    frappe.db.commit()
    print(f"Done — all {len(USERS)} users created/updated with password {PASSWORD}")
