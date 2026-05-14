import frappe

def execute():
    frappe.set_user("Administrator")
    bad = frappe.db.get_all(
        "Job Opening",
        filters=[["designation", "not in", [
            "Manager", "Project Manager", "Accounts Manager", "Accounts Executive",
            "GST & TDS Specialist", "Logistics Manager", "Stock Monitor", "Porter Executive", ""
        ]]],
        fields=["name", "designation"]
    )
    for jo in bad:
        print(f"Fixing {jo.name}: '{jo.designation}' -> 'Manager'")
        frappe.db.set_value("Job Opening", jo.name, "designation", "Manager")
    frappe.db.commit()
    print(f"Fixed {len(bad)} job opening(s).")
