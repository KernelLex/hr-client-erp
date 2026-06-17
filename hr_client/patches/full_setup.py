"""Bootstrap Vera Enterprises ERPNext data: company, departments, designations, employees."""
import frappe
from frappe.utils import getdate


def execute():
    for wt in ["Transit", "Stores", "Fixed Asset", "Quality Inspection"]:
        if not frappe.db.exists("Warehouse Type", wt):
            frappe.get_doc({"doctype": "Warehouse Type", "name": wt}).insert(ignore_permissions=True)

    if not frappe.db.exists("Company", "Vera Enterprises"):
        company = frappe.new_doc("Company")
        company.company_name = "Vera Enterprises"
        company.abbr = "V"
        company.default_currency = "INR"
        company.country = "India"
        company.flags.ignore_mandatory = True
        company.insert(ignore_permissions=True)
        frappe.db.commit()

    for dept_name in ["Management", "Project", "Accounts", "Logistics", "HR"]:
        full_name = f"{dept_name} - V"
        if not frappe.db.exists("Department", full_name):
            dept = frappe.new_doc("Department")
            dept.department_name = dept_name
            dept.company = "Vera Enterprises"
            dept.insert(ignore_permissions=True)

    for desig in ["Manager", "Project Manager", "Accounts Manager", "Accounts Executive",
                  "GST & TDS Specialist", "Logistics Manager", "Stock Monitor", "Porter Executive"]:
        if not frappe.db.exists("Designation", desig):
            frappe.get_doc({"doctype": "Designation", "designation_name": desig}).insert(ignore_permissions=True)

    for et in ["Full-time", "Part-time", "Contract", "Probation"]:
        if not frappe.db.exists("Employment Type", et):
            frappe.get_doc({"doctype": "Employment Type", "employment_type_name": et}).insert(ignore_permissions=True)

    for g in ["Male", "Female", "Non-binary", "Prefer not to say", "Other"]:
        if not frappe.db.exists("Gender", g):
            frappe.get_doc({"doctype": "Gender", "gender": g}).insert(ignore_permissions=True)

    frappe.db.commit()

    employees = [
        dict(first_name="Owais Ahmed", last_name="Khan",
             user_id="owais@veraenterprises.in", company_email="owais@veraenterprises.in",
             designation="Manager", department="Management - V",
             cell_number="9845320577", gender="Male"),
        dict(first_name="Maaz", last_name="",
             user_id="maazdgr8.mma@gmail.com", company_email="maazdgr8.mma@gmail.com",
             designation="Project Manager", department="Project - V",
             cell_number="8904706343", gender="Male"),
        dict(first_name="Manjunath", last_name="M N",
             user_id="manju.veraaccnts@outlook.com", company_email="manju.veraaccnts@outlook.com",
             designation="Accounts Manager", department="Accounts - V",
             cell_number="9606944904", gender="Male"),
        dict(first_name="Lookman", last_name="",
             user_id="lookman.vera@outlook.com", company_email="lookman.vera@outlook.com",
             designation="Accounts Executive", department="Accounts - V",
             cell_number="9035076487", gender="Male"),
        dict(first_name="Bhagya", last_name="Shree",
             user_id="bhagyashree.veraenterprises@outlook.com",
             company_email="bhagyashree.veraenterprises@outlook.com",
             designation="Logistics Manager", department="Logistics - V",
             cell_number="9845322006", gender="Female"),
    ]

    for e in employees:
        if frappe.db.exists("Employee", {"user_id": e["user_id"]}):
            continue
        doc = frappe.new_doc("Employee")
        doc.first_name = e["first_name"]
        doc.last_name = e.get("last_name", "")
        doc.user_id = e["user_id"]
        doc.company_email = e["company_email"]
        doc.designation = e["designation"]
        doc.department = e["department"]
        doc.cell_number = e["cell_number"]
        doc.gender = e["gender"]
        doc.date_of_joining = getdate("2024-01-01")
        doc.status = "Active"
        doc.company = "Vera Enterprises"
        doc.employment_type = "Full-time"
        doc.date_of_birth = getdate("1990-01-01")
        doc.flags.ignore_mandatory = True
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return "Setup complete"
