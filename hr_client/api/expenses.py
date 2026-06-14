import frappe
from frappe.utils import now_datetime, getdate, today

OWAIS_USERS = {"owais@veraenterprises.in", "Administrator"}
PETROL_RATE_PER_KM = 4.0


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
        "pdf_path": doc.pdf_path or "",
    }


def _generate_petrol_pdf(doc):
    """Generate petrol claim PDF, attach to doc, return file URL or None."""
    try:
        from frappe.utils.pdf import get_pdf
        from frappe.utils.file_manager import save_file

        route = ""
        if doc.route_from or doc.route_to:
            route = f"{doc.route_from or '—'} → {doc.route_to or '—'}"

        rows = [
            ("Employee Name", f"<strong>{doc.employee_name}</strong>"),
            ("Employee ID", doc.employee),
            ("Claim Date", str(doc.claim_date)),
            ("Kilometers Traveled", f"<strong>{doc.km_driven} km</strong>"),
            ("Rate per KM", "&#8377;4.00"),
            ("Claim Amount", f"<span style='font-size:20px;font-weight:bold;color:#1a56db;'>&#8377;{doc.amount:.2f}</span>"),
        ]
        if doc.vehicle_number:
            rows.append(("Vehicle Number", doc.vehicle_number))
        if route:
            rows.append(("Route", route))
        if doc.purpose:
            rows.append(("Purpose", doc.purpose))

        table_rows = "".join(
            f"<tr><td style='padding:10px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;'>{label}</td>"
            f"<td style='padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;'>{value}</td></tr>"
            for label, value in rows
        )

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;margin:40px;color:#111;">
  <div style="border-bottom:3px solid #1a56db;padding-bottom:12px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div style="font-size:22px;font-weight:bold;color:#1a56db;">Vera Enterprises</div>
      <div style="font-size:15px;color:#555;margin-top:4px;">Petrol Claim Receipt</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280;">
      <div>Claim ID: <strong>{doc.name}</strong></div>
      <div>Status: <strong>{doc.status}</strong></div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-top:8px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="text-align:left;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600;width:40%;">Field</th>
        <th style="text-align:left;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;font-weight:600;">Details</th>
      </tr>
    </thead>
    <tbody>
      {table_rows}
    </tbody>
  </table>
  <div style="margin-top:40px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">
    This is a computer-generated document. Generated on {now_datetime().strftime('%d %B %Y at %H:%M')}.
  </div>
</body>
</html>"""

        pdf_content = get_pdf(html)
        fname = f"{doc.name}-petrol-claim.pdf"
        file_doc = save_file(fname, pdf_content, "Vera Expense Claim", doc.name, is_private=0)
        return file_doc.file_url
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Petrol PDF Generation Failed")
        return None


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
            "employee_email", "pdf_path",
        ],
        order_by="claim_date desc",
    )
    for c in claims:
        c["amount"] = float(c.get("amount") or 0)
        c["km_driven"] = float(c.get("km_driven") or 0)
        c["claim_date"] = str(c.get("claim_date") or "")
        c["submitted_on"] = str(c.get("submitted_on") or "")
        c["reviewed_on"] = str(c.get("reviewed_on") or "")
        c["pdf_path"] = c.get("pdf_path") or ""

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
            "pdf_path",
        ],
        order_by="claim_date desc",
    )
    for c in claims:
        c["amount"] = float(c.get("amount") or 0)
        c["km_driven"] = float(c.get("km_driven") or 0)
        c["claim_date"] = str(c.get("claim_date") or "")
        c["submitted_on"] = str(c.get("submitted_on") or "")
        c["reviewed_on"] = str(c.get("reviewed_on") or "")
        c["pdf_path"] = c.get("pdf_path") or ""

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
    purpose,
    amount=None,
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
    doc.purpose = purpose
    doc.status = "Pending"
    doc.submitted_on = now_datetime()

    if claim_type == "Petrol":
        km = float(km_driven) if km_driven else 0.0
        if km <= 0:
            return {"success": False, "error": "Kilometers traveled must be greater than 0"}
        doc.km_driven = km
        doc.amount = round(km * PETROL_RATE_PER_KM, 2)
        doc.vehicle_number = vehicle_number or ""
        doc.route_from = route_from or ""
        doc.route_to = route_to or ""
        doc.fuel_receipt = fuel_receipt or ""
    elif claim_type == "Material":
        if amount is None:
            return {"success": False, "error": "Amount is required for Material claims"}
        doc.amount = float(amount)
        if doc.amount <= 0:
            return {"success": False, "error": "Amount must be greater than 0"}
        doc.material_description = material_description or ""
        doc.vendor_name = vendor_name or ""
        doc.material_receipt = material_receipt or ""
    else:
        return {"success": False, "error": f"Unknown claim type: {claim_type}"}

    doc.insert(ignore_permissions=True)

    # Generate PDF for petrol claims
    if claim_type == "Petrol":
        pdf_url = _generate_petrol_pdf(doc)
        if pdf_url:
            doc.pdf_path = pdf_url
            doc.save(ignore_permissions=True)

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
