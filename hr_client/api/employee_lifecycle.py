import frappe
import json


def _has_custom_field(doctype, fieldname):
    return frappe.db.exists("Custom Field", f"{doctype}-{fieldname}")


def _safe_json(value, default):
    if not value:
        return default
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


DEFAULT_DOCS_CHECKLIST = {
    "offer_letter_signed": "pending",
    "aadhaar": "pending",
    "pan_card": "pending",
    "address_proof": "pending",
    "educational_certificates": "pending",
    "bank_details": "pending",
    "passport_photo": "pending",
}

DEFAULT_IT_CHECKLIST = {
    "email_created": False,
    "laptop_assigned": False,
    "system_access": False,
    "software_installed": False,
    "access_card": False,
}


def _build_employee_item(emp: dict) -> dict:
    return {
        "name": emp.get("name"),
        "employee_name": emp.get("employee_name"),
        "designation": emp.get("designation") or "",
        "department": emp.get("department") or "",
        "company_email": emp.get("company_email") or emp.get("prefered_email") or "",
        "date_of_joining": str(emp.get("date_of_joining") or ""),
        "status": emp.get("status") or "Active",
        "custom_onboarding_stage": emp.get("custom_onboarding_stage") or "Active",
        "image": emp.get("image") or None,
    }


@frappe.whitelist()
def get_employees(status=None, onboarding_stage=None, search=None, department=None, tab=None):
    """
    Returns employees filtered by tab:
    - directory → Active employees
    - onboarding → employees not yet at Active stage
    - exiting → Left employees
    """
    frappe.has_permission("Employee", ptype="read", throw=True)

    filters = {}
    if tab == "directory":
        filters["status"] = "Active"
    elif tab == "exiting":
        filters["status"] = "Left"
    elif tab == "onboarding":
        filters["status"] = ["not in", ["Left"]]
    elif status:
        filters["status"] = status

    if department and department != "All":
        filters["department"] = department

    base_fields = [
        "name", "employee_name", "designation", "department",
        "company_email", "date_of_joining", "status", "image",
    ]

    has_onboarding = _has_custom_field("Employee", "custom_onboarding_stage")
    if has_onboarding:
        base_fields.append("custom_onboarding_stage")

    employees = frappe.get_all("Employee", filters=filters, fields=base_fields, order_by="employee_name asc")

    result = []
    for emp in employees:
        if not emp.get("custom_onboarding_stage"):
            emp["custom_onboarding_stage"] = "Active"

        # onboarding tab: only employees whose stage is NOT Active
        if tab == "onboarding" and emp.get("custom_onboarding_stage") == "Active":
            continue

        if search:
            name_match = search.lower() in (emp.get("employee_name") or "").lower()
            desig_match = search.lower() in (emp.get("designation") or "").lower()
            if not name_match and not desig_match:
                continue

        if onboarding_stage and emp.get("custom_onboarding_stage") != onboarding_stage:
            continue

        result.append(_build_employee_item(emp))

    return {"employees": result, "total": len(result)}


@frappe.whitelist()
def get_employee_detail(employee_id: str):
    frappe.has_permission("Employee", ptype="read", throw=True)

    try:
        emp = frappe.get_doc("Employee", employee_id)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": f"Employee {employee_id!r} not found"}

    has_docs = _has_custom_field("Employee", "custom_documents_checklist")
    has_it = _has_custom_field("Employee", "custom_it_setup_checklist")
    has_stage = _has_custom_field("Employee", "custom_onboarding_stage")

    docs_checklist = _safe_json(
        getattr(emp, "custom_documents_checklist", None), DEFAULT_DOCS_CHECKLIST
    ) if has_docs else DEFAULT_DOCS_CHECKLIST

    it_checklist = _safe_json(
        getattr(emp, "custom_it_setup_checklist", None), DEFAULT_IT_CHECKLIST
    ) if has_it else DEFAULT_IT_CHECKLIST

    employee_data = {
        "name": emp.name,
        "employee_name": emp.employee_name,
        "first_name": emp.first_name or "",
        "last_name": emp.last_name or "",
        "designation": emp.designation or "",
        "department": emp.department or "",
        "company_email": emp.company_email or emp.prefered_email or "",
        "personal_email": emp.personal_email or "",
        "cell_number": emp.cell_number or "",
        "date_of_joining": str(emp.date_of_joining or ""),
        "date_of_birth": str(emp.date_of_birth or ""),
        "gender": emp.gender or "",
        "status": emp.status or "Active",
        "image": emp.image or None,
        "permanent_address": emp.permanent_address or "",
        "emergency_contact_name": getattr(emp, "person_to_be_contacted", None) or "",
        "emergency_contact_phone": getattr(emp, "emergency_phone_number", None) or "",
        "reports_to": emp.reports_to or None,
        "reports_to_name": frappe.db.get_value("Employee", emp.reports_to, "employee_name") if emp.reports_to else None,
        "custom_onboarding_stage": getattr(emp, "custom_onboarding_stage", None) or "Active" if has_stage else "Active",
        "documents_checklist": docs_checklist,
        "it_setup_checklist": it_checklist,
        "bank_name": "",
        "bank_ac_no": "",
    }

    # Bank details from Bank Account if linked
    bank = frappe.get_all("Bank Account", filters={"party_type": "Employee", "party": emp.name}, fields=["bank", "bank_account_no"], limit=1)
    if bank:
        employee_data["bank_name"] = bank[0].get("bank") or ""
        employee_data["bank_ac_no"] = bank[0].get("bank_account_no") or ""

    # Exit record
    exit_record = None
    if frappe.db.exists("User Module Permission"):  # lightweight check DB is accessible
        pass
    exit_docs = frappe.get_all(
        "Employee Exit" if frappe.db.table_exists("tabEmployee Exit") else "Employee",
        filters={"employee": emp.name} if frappe.db.table_exists("tabEmployee Exit") else {"name": ""},
        limit=1
    ) if frappe.db.table_exists("tabEmployee Exit") else []

    if exit_docs:
        exit_doc = frappe.get_doc("Employee Exit", exit_docs[0].name)
        exit_record = {
            "name": exit_doc.name,
            "employee": exit_doc.employee,
            "employee_name": exit_doc.employee_name or emp.employee_name,
            "department": exit_doc.department or emp.department,
            "resignation_date": str(exit_doc.resignation_date or ""),
            "last_working_day": str(exit_doc.last_working_day or "") or None,
            "resignation_letter": exit_doc.resignation_letter or None,
            "status": exit_doc.status or "Pending",
            "final_settlement_status": exit_doc.final_settlement_status or "Pending",
            "exit_reason": exit_doc.exit_reason or None,
            "would_recommend": exit_doc.would_recommend or None,
            "enjoyed_most": exit_doc.enjoyed_most or None,
            "improvement_suggestions": exit_doc.improvement_suggestions or None,
            "management_feedback": exit_doc.management_feedback or None,
        }

    return {"employee": employee_data, "exit": exit_record}


@frappe.whitelist()
def get_onboarding_checklist(employee_id: str):
    frappe.has_permission("Employee", ptype="read", throw=True)

    try:
        emp = frappe.get_doc("Employee", employee_id)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Employee not found"}

    has_docs = _has_custom_field("Employee", "custom_documents_checklist")
    has_it = _has_custom_field("Employee", "custom_it_setup_checklist")
    has_stage = _has_custom_field("Employee", "custom_onboarding_stage")

    docs = _safe_json(getattr(emp, "custom_documents_checklist", None), DEFAULT_DOCS_CHECKLIST) if has_docs else DEFAULT_DOCS_CHECKLIST
    it = _safe_json(getattr(emp, "custom_it_setup_checklist", None), DEFAULT_IT_CHECKLIST) if has_it else DEFAULT_IT_CHECKLIST
    stage = getattr(emp, "custom_onboarding_stage", None) or "Active" if has_stage else "Active"

    mandatory_keys = ["offer_letter_signed", "aadhaar", "pan_card"]
    mandatory_complete = all(docs.get(k) in ("received", "waived") for k in mandatory_keys)

    return {
        "employee_id": employee_id,
        "onboarding_stage": stage,
        "documents_checklist": docs,
        "it_setup_checklist": it,
        "mandatory_docs_complete": mandatory_complete,
    }


@frappe.whitelist()
def get_exit_details(employee_id: str):
    frappe.has_permission("Employee", ptype="read", throw=True)

    if not frappe.db.table_exists("tabEmployee Exit"):
        return {"exit": None}

    exits = frappe.get_all("Employee Exit", filters={"employee": employee_id}, limit=1)
    if not exits:
        return {"exit": None}

    exit_doc = frappe.get_doc("Employee Exit", exits[0].name)
    return {
        "exit": {
            "name": exit_doc.name,
            "employee": exit_doc.employee,
            "resignation_date": str(exit_doc.resignation_date or ""),
            "last_working_day": str(exit_doc.last_working_day or "") or None,
            "status": exit_doc.status or "Pending",
            "final_settlement_status": exit_doc.final_settlement_status or "Pending",
            "exit_reason": exit_doc.exit_reason or None,
            "would_recommend": exit_doc.would_recommend or None,
            "enjoyed_most": exit_doc.enjoyed_most or None,
            "improvement_suggestions": exit_doc.improvement_suggestions or None,
            "management_feedback": exit_doc.management_feedback or None,
        }
    }


@frappe.whitelist(methods=["POST"])
def update_onboarding_stage(employee_id: str, stage: str, checklist_data: str = None):
    frappe.has_permission("Employee", ptype="write", throw=True)

    try:
        emp = frappe.get_doc("Employee", employee_id)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Employee not found"}

    if _has_custom_field("Employee", "custom_onboarding_stage"):
        emp.custom_onboarding_stage = stage

    if checklist_data and isinstance(checklist_data, str):
        checklist_data = json.loads(checklist_data)

    if checklist_data and _has_custom_field("Employee", "custom_documents_checklist"):
        current = _safe_json(getattr(emp, "custom_documents_checklist", None), DEFAULT_DOCS_CHECKLIST.copy())
        current.update(checklist_data)
        emp.custom_documents_checklist = json.dumps(current)

    emp.save(ignore_permissions=True)
    frappe.db.commit()

    welcome_sent = False
    if stage == "First Day":
        try:
            from hr_client.api.employee_lifecycle import send_welcome_email
            send_welcome_email(employee_id)
            welcome_sent = True
        except Exception:
            pass

    return {
        "success": True,
        "employee": {"name": emp.name, "custom_onboarding_stage": stage},
        "welcome_email_sent": welcome_sent,
    }


@frappe.whitelist(methods=["POST"])
def create_employee(first_name: str, last_name: str, date_of_joining: str, designation: str,
                    department: str, company: str, personal_email: str = None,
                    cell_number: str = None, job_applicant: str = None):
    frappe.has_permission("Employee", ptype="create", throw=True)

    emp = frappe.new_doc("Employee")
    emp.first_name = first_name
    emp.last_name = last_name or ""
    emp.employee_name = f"{first_name} {last_name}".strip()
    emp.date_of_joining = date_of_joining
    emp.designation = designation
    emp.department = department
    emp.company = company
    if personal_email:
        emp.personal_email = personal_email
    if cell_number:
        emp.cell_number = cell_number

    if _has_custom_field("Employee", "custom_onboarding_stage"):
        emp.custom_onboarding_stage = "Offer Accepted"

    emp.insert(ignore_permissions=True)
    frappe.db.commit()

    return {
        "success": True,
        "employee": {
            "name": emp.name,
            "employee_name": emp.employee_name,
            "custom_onboarding_stage": "Offer Accepted",
        },
    }


@frappe.whitelist(methods=["POST"])
def submit_resignation(employee_id: str, resignation_date: str, last_working_day: str = None,
                        resignation_letter_url: str = None):
    frappe.has_permission("Employee", ptype="write", throw=True)

    if not frappe.db.table_exists("tabEmployee Exit"):
        return {"error": "Employee Exit DocType not yet created. Run bench migrate."}

    if frappe.get_all("Employee Exit", filters={"employee": employee_id}):
        return {"error": "Resignation already submitted for this employee"}

    exit_doc = frappe.new_doc("Employee Exit")
    exit_doc.employee = employee_id
    exit_doc.employee_name = frappe.db.get_value("Employee", employee_id, "employee_name")
    exit_doc.department = frappe.db.get_value("Employee", employee_id, "department")
    exit_doc.resignation_date = resignation_date
    exit_doc.last_working_day = last_working_day or None
    exit_doc.resignation_letter = resignation_letter_url or None
    exit_doc.status = "Pending"
    exit_doc.final_settlement_status = "Pending"
    exit_doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "exit_record": exit_doc.name}


@frappe.whitelist(methods=["POST"])
def submit_exit_interview(employee_id: str, exit_reason: str, would_recommend: str,
                           enjoyed_most: str, improvement_suggestions: str, management_feedback: str):
    frappe.has_permission("Employee", ptype="write", throw=True)

    if not frappe.db.table_exists("tabEmployee Exit"):
        return {"error": "Employee Exit DocType not yet created"}

    exits = frappe.get_all("Employee Exit", filters={"employee": employee_id}, limit=1)
    if not exits:
        return {"error": "No resignation found for this employee"}

    exit_doc = frappe.get_doc("Employee Exit", exits[0].name)
    exit_doc.exit_reason = exit_reason
    exit_doc.would_recommend = would_recommend
    exit_doc.enjoyed_most = enjoyed_most
    exit_doc.improvement_suggestions = improvement_suggestions
    exit_doc.management_feedback = management_feedback
    exit_doc.status = "Interview Done"
    exit_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "employee_status_updated": True}


@frappe.whitelist(methods=["POST"])
def send_welcome_email(employee_id: str):
    frappe.has_permission("Employee", ptype="read", throw=True)

    emp = frappe.get_doc("Employee", employee_id)
    email = emp.personal_email or emp.company_email or emp.prefered_email

    if not email:
        return {"success": False, "error": "No email on record for this employee"}

    template = frappe.db.exists("Email Template", "employee_welcome")
    if template:
        frappe.sendmail(
            recipients=[email],
            template="employee_welcome",
            args={"employee_name": emp.employee_name},
        )
    else:
        frappe.sendmail(
            recipients=[email],
            subject=f"Welcome to the team, {emp.employee_name}!",
            message=f"<p>Hi {emp.employee_name},</p><p>Welcome aboard! We're excited to have you.</p>",
        )

    return {"success": True, "sent_to": email}
