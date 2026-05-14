import frappe

def execute():
    depts = frappe.db.sql("SELECT name, department_name FROM tabDepartment", as_dict=True)
    for d in depts:
        print(d)
