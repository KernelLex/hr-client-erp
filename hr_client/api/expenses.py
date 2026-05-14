import frappe
from frappe.utils import now_datetime, getdate, today

OWAIS_USERS = {"owais@veraenterprises.in", "Administrator"}


def _is_owais():
    return frappe.session.user in OWAIS_USERS


def _get_employee():
    emp = (
        frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")
        or frappe.db.get_value("Employee", {"company_email": frappe.session.user, "status": "Active"}, "name")
        or frappe.db.get_value("Employee", {"personal_email": frappe.session.user, "status": "Active"}, "name")
    )
    return emp


def _claim_to_dict(doc):
    return {
        "name": doc.name,
        "claim_title": doc.claim_title or "",
        "employee": doc.employee,
        "employee_name": doc.employee_name or "",
        "employee_email": doc.employee_email or "",
        "claim_type": doc.claim_type,
        "claim_date": str(doc.claim_date or ""),
        "amount": float(doc.amount or 0),
        "km_driven": float(doc.km_driven or 0),
        "vehicle_number": doc.vehicle_number or "",
        "route_from": doc.route_from or "",
        "route_to": doc.route_to or "",
        "fuel_receipt": doc.fuel_receipt or "",
        "material_description": doc.material_description or "",
        "vendor_name": doc.vendor_name or "",
        "material_receipt": doc.material_receipt or "",
        "purpose": doc.purpose or "",
        "status": doc.status or "Pending",
        "admin_notes": doc.admin_notes or "",
        "reviewed_by": doc.reviewed_by or "",
        "reviewed_on": str(doc.reviewed_on or ""),
        "rejection_reason": doc.rejection_reason or "",
        "submitted_on": str(doc.submitted_on or ""),
    }


@frappe.whitelist()
def get_my_claims():
    frappe.has_permission("Vera Expense Claim", ptype="read", throw=True)
    emp = _get_employee()
    if not emp:
        return {"success": True, "claims": []}

    claims = frappe.get_all(
        "Vera Expense Claim",
        filters={"employee": emp},
        fields=[
            "name", "claim_title", "claim_type", "claim_date", "amount",
            "purpose", "status", "admin_notes", "rejection_reason",
            "submitted_on", "reviewed_on", "employee", "employee_name",
            "km_driven", "vehicle_number", "route_from", "route_to",
            "fuel_receipt", "material_description", "vendor_name", "material_receipt",
            "employee_email",
        ],
        order_by="claim_date desc",
    )
    for c in claims:
        c["amount"] = float(c.get("amount") or 0)
        c["km_driven"] = float(c.get("km_driven") or 0)
        c["claim_date"] = str(c.get("claim_date") or "")
        c["submitted_on"] = str(c.get("submitted_on") or "")
        c["reviewed_on"] = str(c.get("reviewed_on") or "")

    return {"success": True, "claims": claims}


@frappe.whitelist()
def get_all_claims():
    if not _is_owais():
        return {"success": False, "error": "Not authorized"}

    claims = frappe.get_all(
        "Vera Expense Claim",
        fields=[
            "name", "claim_title", "employee", "employee_name", "employee_email",
            "claim_type", "claim_date", "amount", "purpose", "status",
            "admin_notes", "rejection_reason", "submitted_on", "reviewed_on",
            "km_driven", "vehicle_number", "route_from", "route_to",
            "fuel_receipt", "material_description", "vendor_name", "material_receipt",
        ],
        order_by="claim_date desc",
    )
    for c in claims:
        c["amount"] = float(c.get("amount") or 0)
        c["km_driven"] = float(c.get("km_driven") or 0)
        c["claim_date"] = str(c.get("claim_date") or "")
        c["submitted_on"] = str(c.get("submitted_on") or "")
        c["reviewed_on"] = str(c.get("reviewed_on") or "")

    # Group by employee
    by_employee = {}
    for c in claims:
        emp = c["employee"]
        if emp not in by_employee:
            by_employee[emp] = {
                "employee": emp,
                "employee_name": c.get("employee_name") or emp,
                "employee_email": c.get("employee_email") or "",
                "claims": [],
            }
        by_employee[emp]["claims"].append(c)

    return {"success": True, "claims": claims, "by_employee": list(by_employee.values())}


@frappe.whitelist(methods=["POST"])
def submit_claim(
    claim_type,
    claim_date,
    amount,
    purpose,
    km_driven=None,
    vehicle_number=None,
    route_from=None,
    route_to=None,
    fuel_receipt=None,
    material_description=None,
    vendor_name=None,
    material_receipt=None,
):
    frappe.has_permission("Vera Expense Claim", ptype="create", throw=True)

    emp_name = _get_employee()
    if not emp_name:
        return {"success": False, "error": "No active employee record found for your account"}

    emp_doc = frappe.get_doc("Employee", emp_name)

    from frappe.utils import getdate as _getdate
    dt = _getdate(claim_date)
    month_year = dt.strftime("%b %Y")
    claim_title = f"{emp_doc.employee_name} - {claim_type} - {month_year}"

    doc = frappe.new_doc("Vera Expense Claim")
    doc.claim_title = claim_title
    doc.employee = emp_name
    doc.employee_name = emp_doc.employee_name
    doc.employee_email = emp_doc.company_email or emp_doc.personal_email or frappe.session.user
    doc.claim_type = claim_type
    doc.claim_date = claim_date
    doc.amount = float(amount)
    doc.purpose = purpose
    doc.status = "Pending"
    doc.submitted_on = now_datetime()

    if claim_type == "Petrol":
        if km_driven:
            doc.km_driven = float(km_driven)
        doc.vehicle_number = vehicle_number or ""
        doc.route_from = route_from or ""
        doc.route_to = route_to or ""
        doc.fuel_receipt = fuel_receipt or ""
    elif claim_type == "Material":
        doc.material_description = material_description or ""
        doc.vendor_name = vendor_name or ""
        doc.material_receipt = material_receipt or ""

    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "claim": _claim_to_dict(doc)}


@frappe.whitelist(methods=["POST"])
def approve_claim(claim_id, admin_notes=""):
    if frappe.session.user not in OWAIS_USERS:
        return {"success": False, "error": "Not authorized"}

    try:
        doc = frappe.get_doc("Vera Expense Claim", claim_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Claim not found"}

    doc.status = "Approved"
    doc.admin_notes = admin_notes or ""
    doc.reviewed_by = frappe.session.user
    doc.reviewed_on = now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "claim": _claim_to_dict(doc)}


@frappe.whitelist(methods=["POST"])
def reject_claim(claim_id, rejection_reason, admin_notes=""):
    if frappe.session.user not in OWAIS_USERS:
        return {"success": False, "error": "Not authorized"}

    if not rejection_reason or not str(rejection_reason).strip():
        return {"success": False, "error": "Rejection reason is required"}

    try:
        doc = frappe.get_doc("Vera Expense Claim", claim_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Claim not found"}

    doc.status = "Rejected"
    doc.rejection_reason = str(rejection_reason).strip()
    doc.admin_notes = admin_notes or ""
    doc.reviewed_by = frappe.session.user
    doc.reviewed_on = now_datetime()
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "claim": _claim_to_dict(doc)}


@frappe.whitelist()
def get_monthly_summary(month=None, year=None):
    frappe.has_permission("Vera Expense Claim", ptype="read", throw=True)

    from frappe.utils import getdate as _getdate
    import datetime

    today_dt = datetime.date.today()
    target_month = int(month) if month else today_dt.month
    target_year = int(year) if year else today_dt.year

    from_date = f"{target_year}-{target_month:02d}-01"
    if target_month == 12:
        to_date = f"{target_year + 1}-01-01"
    else:
        to_date = f"{target_year}-{target_month + 1:02d}-01"

    if _is_owais():
        claims = frappe.get_all(
            "Vera Expense Claim",
            filters=[
                ["claim_date", ">=", from_date],
                ["claim_date", "<", to_date],
            ],
            fields=["employee", "employee_name", "claim_type", "amount", "status"],
        )
    else:
        emp = _get_employee()
        if not emp:
            return {"success": True, "summary": [], "month": target_month, "year": target_year}
        claims = frappe.get_all(
            "Vera Expense Claim",
            filters=[
                ["employee", "=", emp],
                ["claim_date", ">=", from_date],
                ["claim_date", "<", to_date],
            ],
            fields=["employee", "employee_name", "claim_type", "amount", "status"],
        )

    # Aggregate per employee
    agg = {}
    for c in claims:
        emp_key = c["employee"]
        if emp_key not in agg:
            agg[emp_key] = {
                "employee": emp_key,
                "employee_name": c.get("employee_name") or emp_key,
                "total_claimed": 0,
                "total_approved": 0,
                "total_rejected": 0,
                "total_pending": 0,
                "claim_count": 0,
                "petrol_total": 0,
                "material_total": 0,
            }
        amt = float(c.get("amount") or 0)
        agg[emp_key]["total_claimed"] += amt
        agg[emp_key]["claim_count"] += 1
        status = c.get("status") or "Pending"
        if status == "Approved":
            agg[emp_key]["total_approved"] += amt
        elif status == "Rejected":
            agg[emp_key]["total_rejected"] += amt
        else:
            agg[emp_key]["total_pending"] += amt
        if c.get("claim_type") == "Petrol":
            agg[emp_key]["petrol_total"] += amt
        else:
            agg[emp_key]["material_total"] += amt

    return {
        "success": True,
        "summary": list(agg.values()),
        "month": target_month,
        "year": target_year,
    }
