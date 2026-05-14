import frappe


def execute():
    frappe.set_user("Administrator")
    company = "Vera Enterprises"

    # Create missing departments
    missing_depts = ["Project", "Logistics"]
    for dept in missing_depts:
        if not frappe.db.exists("Department", {"department_name": dept, "company": company}):
            frappe.get_doc({
                "doctype": "Department",
                "department_name": dept,
                "company": company,
            }).insert(ignore_permissions=True)
            print(f"Created Department: {dept}")
        else:
            print(f"Department exists: {dept}")

    frappe.db.commit()

    # Map designation → department name (the `name` field in ERPNext)
    dept_name_map = {
        "Manager": "Management - V",
        "Project Manager": "Project - V",
        "Accounts Manager": "Accounts - V",
        "Accounts Executive": "Accounts - V",
        "Logistics Manager": "Logistics - V",
    }

    employees = [
        {
            "first_name": "Owais Ahmed",
            "last_name": "Khan",
            "company_email": "owais@veraenterprises.in",
            "designation": "Manager",
            "user_id": "owais@veraenterprises.in",
        },
        {
            "first_name": "Maaz",
            "last_name": "",
            "company_email": "maazdgr8.mma@gmail.com",
            "designation": "Project Manager",
            "user_id": "maazdgr8.mma@gmail.com",
        },
        {
            "first_name": "Manjunath",
            "last_name": "M N",
            "company_email": "manju.veraaccnts@outlook.com",
            "designation": "Accounts Manager",
            "user_id": "manju.veraaccnts@outlook.com",
        },
        {
            "first_name": "Lookman",
            "last_name": "",
            "company_email": "lookman.vera@outlook.com",
            "designation": "Accounts Executive",
            "user_id": "lookman.vera@outlook.com",
        },
        {
            "first_name": "Bhagya Shree",
            "last_name": "",
            "company_email": "Bhagyashree.veraenterprises@outlook.com",
            "designation": "Logistics Manager",
            "user_id": "Bhagyashree.veraenterprises@outlook.com",
        },
    ]

    for emp in employees:
        existing = frappe.db.get_value("Employee", {"company_email": emp["company_email"]}, "name")
        if existing:
            print(f"Employee exists: {emp['first_name']} ({existing})")
            continue

        doc = frappe.get_doc({
            "doctype": "Employee",
            "first_name": emp["first_name"],
            "last_name": emp["last_name"] or None,
            "company": company,
            "company_email": emp["company_email"],
            "designation": emp["designation"],
            "department": dept_name_map[emp["designation"]],
            "status": "Active",
            "gender": "Prefer Not to Say",
            "date_of_birth": "1990-01-01",
            "date_of_joining": "2024-01-01",
        })

        if frappe.db.exists("User", emp["user_id"]):
            doc.user_id = emp["user_id"]

        doc.insert(ignore_permissions=True)
        print(f"Created Employee: {emp['first_name']} {emp['last_name']} -> {doc.name}")

    frappe.db.commit()
    print("Done.")
