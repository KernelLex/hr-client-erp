import frappe
import json

ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}

# Frappe user name → actual email used on Employee records
_ADMIN_EMAIL_MAP = {"Administrator": "owais@veraenterprises.in"}

# Fields an employee can edit on their own profile
SELF_EDITABLE = {
    "image", "personal_email", "cell_number",
    "person_to_be_contacted", "emergency_phone_number",
    "current_address", "blood_group", "gender",
    "bank_name", "bank_ac_no", "custom_ifsc_code",
    "custom_skills",
    "custom_aadhaar_number", "custom_pan_number",
}

# Fields only admins can change
ADMIN_ONLY = {
    "designation", "department", "date_of_joining", "employment_type",
    "reports_to", "company_email", "status", "first_name", "last_name",
}


def _is_admin():
    return frappe.session.user in ADMIN_USERS


def _get_employee_by_email(email):
    email = _ADMIN_EMAIL_MAP.get(email, email)
    return (
        frappe.db.get_value("Employee", {"user_id": email, "status": "Active"}, "name")
        or frappe.db.get_value("Employee", {"company_email": email, "status": "Active"}, "name")
        or frappe.db.get_value("Employee", {"personal_email": email, "status": "Active"}, "name")
    )


def _serialize_employee(emp):
    doc = frappe.get_doc("Employee", emp)

    # Resolve reporting manager name
    reports_to_name = None
    if doc.reports_to:
        reports_to_name = frappe.db.get_value("Employee", doc.reports_to, "employee_name")

    # Education records
    education = [
        {
            "school": row.school_name,
            "qualification": row.qualification,
            "year": row.year_of_passing,
        }
        for row in (doc.education or [])
    ]

    return {
        # Identity
        "employee_id": doc.name,
        "employee_name": doc.employee_name,
        "first_name": doc.first_name,
        "last_name": doc.last_name or "",
        "image": doc.image or "",
        # Personal
        "date_of_birth": str(doc.date_of_birth) if doc.date_of_birth else "",
        "gender": doc.gender or "",
        "blood_group": doc.blood_group or "",
        "personal_email": doc.personal_email or "",
        "cell_number": doc.cell_number or "",
        "person_to_be_contacted": doc.person_to_be_contacted or "",
        "emergency_phone_number": doc.emergency_phone_number or "",
        "current_address": doc.current_address or "",
        # Work
        "designation": doc.designation or "",
        "department": doc.department or "",
        "date_of_joining": str(doc.date_of_joining) if doc.date_of_joining else "",
        "employment_type": doc.employment_type or "",
        "company_email": doc.company_email or "",
        "reports_to": doc.reports_to or "",
        "reports_to_name": reports_to_name or "",
        "status": doc.status or "",
        "user_id": doc.user_id or "",
        # Documents (admin-visible numbers; file uploads handled separately)
        "custom_aadhaar_number": doc.custom_aadhaar_number or "",
        "custom_pan_number": doc.custom_pan_number or "",
        # Bank
        "bank_name": doc.bank_name or "",
        "bank_ac_no": doc.bank_ac_no or "",
        "custom_ifsc_code": doc.custom_ifsc_code or "",
        # Skills / Education
        "custom_skills": doc.custom_skills or "",
        "education": education,
    }


@frappe.whitelist()
def get_employee_profile(email=None, employee_id=None):
    try:
        # Resolve identifier — accept HR-EMP-XXXXX, user email, or session user
        identifier = email or employee_id or frappe.session.user

        # Resolve admin alias (Administrator → owais@veraenterprises.in)
        resolved = _ADMIN_EMAIL_MAP.get(identifier, identifier)

        emp_name = None

        # 1. Direct Employee name lookup (e.g. HR-EMP-00005)
        if frappe.db.exists("Employee", resolved):
            emp_name = resolved

        # 2. Email-based lookups (user_id → company_email → personal_email)
        if not emp_name:
            emp_name = _get_employee_by_email(resolved)

        if not emp_name:
            frappe.log_error(
                f"get_employee_profile: no employee found for identifier={identifier!r} "
                f"session_user={frappe.session.user!r}",
                "Employee Lookup Failed",
            )
            frappe.response.http_status_code = 404
            return {"error": f"No active employee record found for {identifier}"}

        # Permission check: non-admins can only fetch their own profile.
        # Resolve the employee's linked identifiers before comparing — handles
        # the case where the caller passed an employee ID (HR-EMP-XXXXX) rather
        # than their email address.
        if not _is_admin():
            emp_user_id = frappe.db.get_value("Employee", emp_name, "user_id") or ""
            emp_company = frappe.db.get_value("Employee", emp_name, "company_email") or ""
            emp_personal = frappe.db.get_value("Employee", emp_name, "personal_email") or ""
            allowed = {emp_user_id, emp_company, emp_personal, emp_name}
            if frappe.session.user not in allowed:
                frappe.throw("Not permitted", frappe.PermissionError)

        data = _serialize_employee(emp_name)
        # Note: non-admins can only reach here for their own profile (PermissionError thrown above
        # for non-self access), so no masking needed — employees can see and edit their own values.
        return data

    except frappe.PermissionError:
        raise
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Get Employee Profile Error")
        raise


@frappe.whitelist(methods=["POST"])
def update_own_profile(fields_to_update=None):
    if isinstance(fields_to_update, str):
        fields_to_update = json.loads(fields_to_update)

    emp_name = _get_employee_by_email(frappe.session.user)
    if not emp_name:
        frappe.throw("No employee record found for your account")

    # Strip any fields not in the allowed set
    safe = {k: v for k, v in fields_to_update.items() if k in SELF_EDITABLE}
    if not safe:
        return {"success": False, "message": "No editable fields provided"}

    doc = frappe.get_doc("Employee", emp_name)
    for k, v in safe.items():
        setattr(doc, k, v)
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "message": "Profile updated"}


@frappe.whitelist(methods=["POST"])
def admin_update_profile(email=None, fields_to_update=None):
    if not _is_admin():
        frappe.throw("Admin access required", frappe.PermissionError)

    if isinstance(fields_to_update, str):
        fields_to_update = json.loads(fields_to_update)

    emp_name = _get_employee_by_email(email)
    if not emp_name:
        frappe.throw(f"No employee record found for {email}")

    allowed = SELF_EDITABLE | ADMIN_ONLY
    safe = {k: v for k, v in fields_to_update.items() if k in allowed}

    doc = frappe.get_doc("Employee", emp_name)
    for k, v in safe.items():
        setattr(doc, k, v)
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "message": "Profile updated"}


@frappe.whitelist(methods=["POST"])
def upload_profile_photo():
    if "file" not in frappe.request.files:
        frappe.throw("No file uploaded")

    file_obj = frappe.request.files["file"]
    email = frappe.form_dict.get("email") or frappe.session.user

    # Non-admins can only upload their own photo
    if not _is_admin() and email != frappe.session.user:
        frappe.throw("Not permitted", frappe.PermissionError)

    emp_name = _get_employee_by_email(email)
    if not emp_name:
        frappe.throw("No employee record found")

    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": file_obj.filename,
        "content": file_obj.read(),
        "attached_to_doctype": "Employee",
        "attached_to_name": emp_name,
        "attached_to_field": "image",
        "is_private": 0,
    })
    file_doc.insert(ignore_permissions=True)

    emp_doc = frappe.get_doc("Employee", emp_name)
    emp_doc.image = file_doc.file_url
    emp_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "file_url": file_doc.file_url}


@frappe.whitelist()
def get_all_employees():
    if not _is_admin():
        frappe.throw("Admin access required", frappe.PermissionError)

    employees = frappe.db.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "first_name", "last_name", "designation",
                "department", "image", "company_email", "user_id", "date_of_joining"],
        order_by="employee_name asc",
    )
    for emp in employees:
        try:
            emp["pending_leaves"] = frappe.db.count(
                "Vera Leave Application",
                {"employee": emp["name"], "status": "Pending"},
            )
        except Exception:
            emp["pending_leaves"] = 0
    return employees
