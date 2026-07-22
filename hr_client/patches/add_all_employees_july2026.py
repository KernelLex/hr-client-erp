"""
Full company roster — July 2026.

Creates:
  - Companies: Schones Leben (SL), Hagan Modular (HM)
  - Departments for each company
  - New designations (Co-founder, Interior Designer, Carpenter, etc.)
  - Employee records for all ~37 new employees
  - User accounts (Vera@2026) for employees who have email addresses
  - Updates existing VE employees (Bhagya Shree, Lookman, Manjunath) with
    corrected designation / dept / joining date
"""

import frappe
from frappe.utils import getdate
from frappe.utils.password import update_password

DEFAULT_PASSWORD = "Vera@2026"

# Roles assigned to every non-admin user
DEFAULT_ROLES = [
    "HR Manager", "HR User", "Accounts Manager", "Accounts User",
    "Projects User", "Stock Manager", "Stock User",
    "Expense Approver", "Employee", "Leave Approver",
]

_PROTECTED = "owais@veraenterprises.in"


# ── Entry point ───────────────────────────────────────────────────────────────

def execute():
    frappe.set_user("Administrator")

    _ensure_company("Schones Leben", "SL")
    _ensure_company("Hagan Modular", "HM")

    _setup_departments()
    _setup_designations()
    _update_existing_employees()
    _create_all_employees()

    frappe.db.commit()
    print("✅ add_all_employees_july2026 — complete.")


# ── Company ───────────────────────────────────────────────────────────────────

def _ensure_company(name, abbr):
    if frappe.db.exists("Company", name):
        print(f"Company exists: {name}")
        return
    doc = frappe.new_doc("Company")
    doc.company_name = name
    doc.abbr = abbr
    doc.default_currency = "INR"
    doc.country = "India"
    doc.insert(ignore_permissions=True)
    print(f"Created company: {name} ({abbr})")


# ── Departments ───────────────────────────────────────────────────────────────

def _ensure_dept(dept_name, company):
    """dept_name already includes the company suffix, e.g. 'Designing - SL'."""
    if frappe.db.exists("Department", dept_name):
        return
    base = dept_name.rsplit(" - ", 1)[0]
    doc = frappe.new_doc("Department")
    doc.department_name = base
    doc.company = company
    doc.insert(ignore_permissions=True)
    print(f"Created dept: {dept_name}")


def _setup_departments():
    ve, sl, hm = "Vera Enterprises", "Schones Leben", "Hagan Modular"

    # Vera Enterprises — most already exist; ensure Sales is present
    for d in ["Management - V", "Accounts - V", "Sales - V", "Logistics - V"]:
        _ensure_dept(d, ve)

    # Schones Leben
    for d in ["Management - SL", "Designing - SL", "Operations - SL",
              "Carpentry - SL", "Projects - SL"]:
        _ensure_dept(d, sl)

    # Hagan Modular
    for d in ["Management - HM", "Designing - HM", "Manufacturing - HM",
              "Carpentry - HM", "Security - HM"]:
        _ensure_dept(d, hm)


# ── Designations ──────────────────────────────────────────────────────────────

def _ensure_desig(name):
    if frappe.db.exists("Designation", name):
        return
    frappe.get_doc({"doctype": "Designation", "designation_name": name}).insert(
        ignore_permissions=True
    )
    print(f"Created designation: {name}")


def _setup_designations():
    for d in [
        "Co-founder",
        "Chartered Accountant",
        "Logistics In-charge",
        "Sales & Collection Coordinator",
        "Sales Representative",
        "Accountant",
        "Material Shifting In-charge",
        "Interior Designer",
        "Operation Manager",
        "Carpenter",
        "Carpenter Helper",
        "Design Head",
        "Edgeband Machine Operator",
        "CNC Machine Helper",
        "CNC Machine Operator",
        "Panel Saw Operator",
        "Panel Saw Machine Helper",
        "Production Supervisor",
        "Production Manager",
        "Helper",
        "Semi Carpenter",
        "Security",
    ]:
        _ensure_desig(d)


# ── Update existing VE employees ──────────────────────────────────────────────

def _update_existing_employees():
    # Bhagya Shree — designation updated, dept updated, joining date corrected
    emp = frappe.db.get_value("Employee", {"user_id": "bhagyashree.veraenterprises@outlook.com"}, "name")
    if emp:
        doc = frappe.get_doc("Employee", emp)
        doc.designation = "Logistics In-charge"
        doc.department = "Accounts - V"
        doc.date_of_joining = getdate("2023-10-16")
        doc.save(ignore_permissions=True)
        print(f"Updated Bhagya Shree ({emp})")

    # Manjunath — corrected joining date
    emp = frappe.db.get_value("Employee", {"user_id": "manju.veraaccnts@outlook.com"}, "name")
    if emp:
        doc = frappe.get_doc("Employee", emp)
        doc.date_of_joining = getdate("2024-06-17")
        doc.save(ignore_permissions=True)
        print(f"Updated Manjunath ({emp})")

    # Lookman — designation updated, last name added, joining date corrected
    emp = frappe.db.get_value("Employee", {"user_id": "lookman.vera@outlook.com"}, "name")
    if emp:
        doc = frappe.get_doc("Employee", emp)
        doc.designation = "Accountant"
        doc.last_name = "Mohammed"
        doc.date_of_joining = getdate("2025-05-15")
        doc.save(ignore_permissions=True)
        print(f"Updated Lookman ({emp})")


# ── Create employees + users ──────────────────────────────────────────────────

def _create_all_employees():
    ve, sl, hm = "Vera Enterprises", "Schones Leben", "Hagan Modular"

    roster = [
        # ── Directors (assigned to Schones Leben per email domain) ──────────
        dict(first="Mohammed Saquib", last="Malik",
             email="saquib@schonesleben.com", phone="8088907113", gender="Male",
             joined="2022-01-01", desig="Co-founder", dept="Management - SL", co=sl),
        dict(first="Nripandra", last="Singh",
             email="nripandra@schonesleben.com", phone="9967160007", gender="Male",
             joined="2024-02-01", desig="Co-founder", dept="Management - SL", co=sl),

        # ── CA — Vera Enterprises ────────────────────────────────────────────
        dict(first="Venkata Kishore", last="Bathala",
             email="kishore.ve@outlook.com", phone="9705609498", gender="Male",
             joined="2023-07-01", desig="Chartered Accountant",
             dept="Accounts - V", co=ve,
             skills=(
                 "Chartered Accountant (CA) — Licensed accounting professional responsible for "
                 "financial auditing, tax compliance (GST / TDS / Income Tax), financial "
                 "reporting, and statutory filings for Vera Enterprises. "
                 "Member of the Institute of Chartered Accountants of India (ICAI)."
             )),

        # ── VE new employees ─────────────────────────────────────────────────
        dict(first="Monisha", last="Merry",
             email="monishamarys@outlook.com", phone="9606944903", gender="Female",
             joined="2025-04-02", desig="Sales & Collection Coordinator",
             dept="Sales - V", co=ve),
        dict(first="Mufaseel", last="Khan",
             email="mufaseel.vera@outlook.com", phone="8800137032", gender="Male",
             joined="2023-05-01", desig="Sales Representative",
             dept="Sales - V", co=ve),
        dict(first="Abdul", last="Samad",
             email="abdulsamad.veraenterprises@outlook.com", phone="9845331003", gender="Male",
             joined="2024-10-07", desig="Sales Representative",
             dept="Sales - V", co=ve),
        dict(first="Kariyappa", last="",
             email="kariyappa.vera@outlook.com", phone="6361392467", gender="Male",
             joined="2025-01-23", desig="Material Shifting In-charge",
             dept="Logistics - V", co=ve),

        # ── SL — Schones Leben ───────────────────────────────────────────────
        dict(first="Sultan", last="Sharief",
             email="ops@schonesleben.com", phone="9148186091", gender="Male",
             joined="2023-01-10", desig="Operation Manager",
             dept="Operations - SL", co=sl),
        dict(first="Rakesh", last="Kumar",
             email="rakesh.schones@outlook.com", phone="8651725197", gender="Male",
             joined="2024-04-18", desig="Carpenter",
             dept="Carpentry - SL", co=sl),
        dict(first="Rajesh", last="Ray",
             email="rajesh.schones@outlook.com", phone="9845366455", gender="Male",
             joined="2024-06-17", desig="Carpenter",
             dept="Carpentry - SL", co=sl),
        dict(first="Sunil", last="B",
             email="sunil.schones@outlook.com", phone="6363707873", gender="Male",
             joined="2024-08-05", desig="Project Manager",
             dept="Projects - SL", co=sl),
        dict(first="Raushan Kumar", last="Sharma",
             email="raushan.schones@outlook.com", phone="6202996592", gender="Male",
             joined="2024-09-02", desig="Project Manager",
             dept="Projects - SL", co=sl),
        dict(first="Hemanth Kumar", last="R",
             email="hemanth.schones@outlook.com", phone="9148186092", gender="Male",
             joined="2025-05-19", desig="Interior Designer",
             dept="Designing - SL", co=sl),
        dict(first="Bhagyashree Moti", last="Solanki",
             email="bhagyashrees.schones@outlook.com", phone="9606944906", gender="Female",
             joined="2025-06-30", desig="Interior Designer",
             dept="Designing - SL", co=sl),
        dict(first="Eeshani T", last="Prasad",
             email="eeshani.schones@outlook.com", phone="9606944901", gender="Female",
             joined="2025-06-30", desig="Interior Designer",
             dept="Designing - SL", co=sl),
        dict(first="Bharath", last="P",
             email="bharath.schones@outlook.com", phone="9606944900", gender="Male",
             joined="2025-08-16", desig="Project Manager",
             dept="Projects - SL", co=sl),
        dict(first="Sreenath Kishore", last="Batthala",
             email="sreenath.schones@outlook.com", phone="9381294293", gender="Male",
             joined="2026-04-04", desig="Project Manager",
             dept="Projects - SL", co=sl),
        dict(first="Sachin Kumar", last="Sharma",
             email="sachin.schones@outlook.com", phone="", gender="Male",
             joined="2026-05-22", desig="Carpenter Helper",
             dept="Carpentry - SL", co=sl),

        # ── HM — Hagan Modular (with email) ─────────────────────────────────
        dict(first="Samarth", last="Rai",
             email="samarth@houseofshutters.in", phone="7259000739", gender="Male",
             joined="2024-10-01", desig="Co-founder",
             dept="Management - HM", co=hm),
        dict(first="Saif Ur", last="Rehman",
             email="saif.hagan@outlook.com", phone="7337451486", gender="Male",
             joined="2026-11-06", desig="Design Head",
             dept="Designing - HM", co=hm),
        dict(first="Momin Mohammed", last="Shahid",
             email="mominshahid.hm@gmail.com", phone="9606954553", gender="Male",
             joined="2024-01-08", desig="Production Supervisor",
             dept="Manufacturing - HM", co=hm),
        dict(first="Raju Kumar", last="Sharma",
             email="raju.heganmadular@gmail.com", phone="9035076485", gender="Male",
             joined="2026-02-09", desig="Production Manager",
             dept="Manufacturing - HM", co=hm),

        # ── HM — Hagan Modular (no email — employee record only) ─────────────
        dict(first="Shivananjaya", last="",
             email="", phone="9535220454", gender="Male",
             joined="2026-09-27", desig="Edgeband Machine Operator",
             dept="Manufacturing - HM", co=hm),
        dict(first="Sulendar", last="Ram",
             email="", phone="9110442949", gender="Male",
             joined="2026-10-02", desig="CNC Machine Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Udhayanithi", last="K",
             email="", phone="9513144390", gender="Male",
             joined="2026-02-04", desig="Panel Saw Machine Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Mukesh", last="Kumar",
             email="", phone="6362657285", gender="Male",
             joined="2025-01-06", desig="Carpenter",
             dept="Carpentry - HM", co=hm),
        dict(first="Rajath Kumar", last="Behera",
             email="", phone="9008845256", gender="Male",
             joined="2026-05-05", desig="Panel Saw Operator",
             dept="Manufacturing - HM", co=hm),
        dict(first="Manoranjan", last="Behra",
             email="", phone="7847932032", gender="Male",
             joined="2026-05-12", desig="Panel Saw Machine Helper",
             dept="Manufacturing - HM", co=hm),
        # Left on 2026-06-20 but data says Active — record relieving date
        dict(first="Ram Mohith Kumar", last="Sharma",
             email="", phone="8877523576", gender="Male",
             joined="2026-05-11", desig="CNC Machine Operator",
             dept="Manufacturing - HM", co=hm,
             relieving="2026-06-20"),
        dict(first="Abhishek", last="",
             email="", phone="7349200617", gender="Male",
             joined="2026-05-15", desig="Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Ranjumoni", last="Majhi",
             email="", phone="9101758068", gender="Female",
             joined="2026-03-21", desig="Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Manish Kumar", last="Sharma",
             email="", phone="6361641296", gender="Male",
             joined="2026-04-03", desig="Semi Carpenter",
             dept="Manufacturing - HM", co=hm),
        dict(first="Ambrish", last="",
             email="", phone="7899129359", gender="Male",
             joined="2026-04-04", desig="Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Allah Tabarak", last="",
             email="", phone="7411532302", gender="Male",
             joined="2026-04-10", desig="Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Suresh", last="",
             email="", phone="9101758068", gender="Male",
             joined="2026-04-11", desig="Helper",
             dept="Manufacturing - HM", co=hm),
        dict(first="Murugaiyan", last="",
             email="", phone="9980865443", gender="Male",
             joined="2026-09-27", desig="Security",
             dept="Security - HM", co=hm),
    ]

    for r in roster:
        try:
            _create_employee(r)
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                f"add_all_employees_july2026: {r['first']} {r['last']}",
            )
            print(f"ERROR: {r['first']} {r['last']} — see Error Log")


def _create_employee(r: dict):
    email = (r.get("email") or "").strip()

    if email == _PROTECTED:
        print(f"Skipping protected account: {email}")
        return

    # Already exists?
    if email:
        existing = (
            frappe.db.get_value("Employee", {"user_id": email}, "name") or
            frappe.db.get_value("Employee", {"company_email": email}, "name")
        )
        if existing:
            print(f"Employee already exists ({existing}): {r['first']} {r['last']}")
            return

    doc = frappe.new_doc("Employee")
    doc.first_name = r["first"]
    doc.last_name = r.get("last") or ""
    doc.gender = r.get("gender", "Male")
    doc.date_of_joining = getdate(r["joined"])
    doc.status = "Active"
    doc.designation = r["desig"]
    doc.department = r["dept"]
    doc.company = r["co"]
    doc.employment_type = "Full-time"

    phone = (r.get("phone") or "").replace(" ", "")
    if phone:
        doc.cell_number = phone

    if email:
        doc.user_id = email
        doc.company_email = email

    if r.get("relieving"):
        doc.relieving_date = getdate(r["relieving"])

    if r.get("skills"):
        doc.custom_skills = r["skills"]

    # Create the User first so the user_id Link on Employee validates
    if email:
        _ensure_user(email, r["first"], r.get("last") or "")

    doc.flags.ignore_mandatory = True
    doc.insert(ignore_permissions=True)
    print(f"Created employee: {doc.employee_name} ({doc.name}) — {r['co']}")


def _ensure_user(email: str, first_name: str, last_name: str):
    if frappe.db.exists("User", email):
        print(f"User exists: {email}")
        return

    user = frappe.new_doc("User")
    user.email = email
    user.first_name = first_name
    user.last_name = last_name or None
    user.send_welcome_email = 0
    user.enabled = 1
    user.user_type = "System User"

    for role in DEFAULT_ROLES:
        if frappe.db.exists("Role", role):
            user.append("roles", {"role": role})

    user.insert(ignore_permissions=True)
    update_password(email, DEFAULT_PASSWORD)
    print(f"Created user: {email}")
