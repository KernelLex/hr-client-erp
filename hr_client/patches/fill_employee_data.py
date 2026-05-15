import frappe


def execute():
    # Ensure Employment Type masters exist
    for et in ["Full-time", "Part-time", "Contract", "Probation"]:
        if not frappe.db.exists("Employment Type", et):
            frappe.get_doc({"doctype": "Employment Type", "employee_type_name": et}).insert(ignore_permissions=True)
    frappe.db.commit()
    print("Employment types seeded")

    owais_emp = frappe.db.get_value("Employee", {"user_id": "owais@veraenterprises.in"}, "name")
    manju_emp = frappe.db.get_value("Employee", {"user_id": "manju.veraaccnts@outlook.com"}, "name")

    employees = [
        {
            "user_id": "maazdgr8.mma@gmail.com",
            "date_of_birth": "1995-01-01",
            "gender": "Male",
            "personal_email": "maazdgr8.mma@gmail.com",
            "cell_number": "8904706343",
            "employment_type": "Full-time",
            "reports_to": owais_emp,
        },
        {
            "user_id": "owais@veraenterprises.in",
            "gender": "Male",
            "personal_email": "owais@veraenterprises.in",
            "cell_number": "9845320577",
            "employment_type": "Full-time",
            "reports_to": None,
        },
        {
            "user_id": "manju.veraaccnts@outlook.com",
            "gender": "Male",
            "personal_email": "manju.veraaccnts@outlook.com",
            "cell_number": "9606944904",
            "employment_type": "Full-time",
            "reports_to": owais_emp,
        },
        {
            "user_id": "lookman.vera@outlook.com",
            "gender": "Male",
            "personal_email": "lookman.vera@outlook.com",
            "cell_number": "9035076487",
            "employment_type": "Full-time",
            "reports_to": manju_emp,
        },
        {
            "user_id": "Bhagyashree.veraenterprises@outlook.com",
            "gender": "Female",
            "personal_email": "Bhagyashree.veraenterprises@outlook.com",
            "cell_number": "9845322006",
            "employment_type": "Full-time",
            "reports_to": owais_emp,
        },
    ]

    for data in employees:
        user_id = data.pop("user_id")
        name = frappe.db.get_value("Employee", {"user_id": user_id}, "name")
        if not name:
            print(f"No employee found for {user_id} — skipping")
            continue
        emp = frappe.get_doc("Employee", name)
        for k, v in data.items():
            if v is not None:
                setattr(emp, k, v)
        emp.save(ignore_permissions=True)
        frappe.db.commit()
        print(f"Done: {name} ({user_id})")
