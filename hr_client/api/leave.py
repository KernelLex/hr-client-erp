import frappe
from frappe.utils import now, getdate
from datetime import timedelta

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}


def _is_admin():
    u = frappe.session.user
    if u in _ADMIN_USERS:
        return True
    return "System Manager" in frappe.get_roles(u)


def _require_admin():
    if not _is_admin():
        frappe.throw("Admin access required", frappe.PermissionError)


def _get_employee(user=None):
    """Return Employee record dict for a user, or None if not found."""
    if not user:
        user = frappe.session.user
    return frappe.db.get_value(
        "Employee",
        {"user_id": user, "status": "Active"},
        ["name", "employee_name", "department", "designation", "user_id"],
        as_dict=True,
    )


def _calc_total_days(from_date_str, to_date_str):
    """Count days from_date..to_date inclusive, excluding Sundays."""
    from_d = getdate(from_date_str)
    to_d = getdate(to_date_str)
    if to_d < from_d:
        return 0
    count, d = 0, from_d
    while d <= to_d:
        if d.weekday() != 6:  # 6 = Sunday
            count += 1
        d += timedelta(days=1)
    return count


# ── Employee endpoints ────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def apply_leave(leave_type, from_date, to_date, reason):
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.AuthenticationError)

    emp = _get_employee()
    if not emp:
        return {"success": False, "error": "No active Employee record found for your account"}

    total_days = _calc_total_days(from_date, to_date)
    if total_days <= 0:
        return {"success": False, "error": "Invalid date range — to_date must be on or after from_date"}

    # Enforce max 5 leaves per calendar month (count non-rejected leaves in the same month)
    from_d = getdate(from_date)
    month_start = from_d.replace(day=1)
    import datetime
    if from_d.month == 12:
        month_end = datetime.date(from_d.year + 1, 1, 1)
    else:
        month_end = datetime.date(from_d.year, from_d.month + 1, 1)

    existing_count = frappe.db.count(
        "Vera Leave Application",
        filters=[
            ["employee", "=", emp.name],
            ["from_date", ">=", str(month_start)],
            ["from_date", "<", str(month_end)],
            ["status", "!=", "Rejected"],
        ],
    )
    if existing_count >= 5:
        month_label = from_d.strftime("%B %Y")
        return {
            "success": False,
            "error": f"You have reached the maximum of 5 leaves for {month_label}.",
        }

    try:
        doc = frappe.new_doc("Vera Leave Application")
        doc.employee = emp.name
        doc.employee_name = emp.employee_name
        doc.leave_type = leave_type
        doc.from_date = from_date
        doc.to_date = to_date
        doc.total_days = total_days
        doc.reason = reason
        doc.status = "Pending"
        doc.applied_on = now()
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Leave Apply Failed")
        return {"success": False, "error": str(e)}

    return {"success": True, "data": doc.as_dict()}


@frappe.whitelist()
def get_my_leaves():
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.AuthenticationError)

    emp = _get_employee()
    if not emp:
        return {"success": True, "data": []}

    leaves = frappe.get_all(
        "Vera Leave Application",
        filters={"employee": emp.name},
        fields=[
            "name", "leave_type", "from_date", "to_date", "total_days",
            "reason", "status", "admin_remarks", "applied_on",
        ],
        order_by="applied_on desc",
    )
    return {"success": True, "data": leaves}


# ── Admin endpoints ───────────────────────────────────────────────────────────

@frappe.whitelist()
def get_all_leaves(status="All", employee_email=None):
    _require_admin()

    filters = {}
    if status != "All":
        filters["status"] = status

    if employee_email:
        emp = _get_employee(employee_email)
        if emp:
            filters["employee"] = emp.name

    leaves = frappe.get_all(
        "Vera Leave Application",
        filters=filters,
        fields=[
            "name", "employee", "employee_name", "leave_type", "from_date", "to_date",
            "total_days", "reason", "status", "admin_remarks",
            "applied_on", "approved_by", "approved_on",
        ],
        order_by="applied_on desc",
    )

    emp_cache: dict = {}
    for leave in leaves:
        if leave.employee not in emp_cache:
            info = frappe.db.get_value(
                "Employee", leave.employee,
                ["department", "designation"],
                as_dict=True,
            ) or {}
            emp_cache[leave.employee] = info
        leave.update(emp_cache[leave.employee])

    return {"success": True, "data": leaves}


@frappe.whitelist()
def get_employee_leave_history(employee_email):
    _require_admin()

    emp = _get_employee(employee_email)
    if not emp:
        return {"success": False, "error": f"No active employee found for {employee_email}"}

    leaves = frappe.get_all(
        "Vera Leave Application",
        filters={"employee": emp.name},
        fields=[
            "name", "leave_type", "from_date", "to_date", "total_days",
            "reason", "status", "admin_remarks", "applied_on", "approved_by", "approved_on",
        ],
        order_by="applied_on desc",
    )
    return {"success": True, "employee": emp, "data": leaves}


@frappe.whitelist(methods=["POST"])
def approve_leave(leave_id, admin_remarks=None):
    _require_admin()

    try:
        doc = frappe.get_doc("Vera Leave Application", leave_id)
        doc.status = "Approved"
        doc.approved_by = frappe.session.user
        doc.approved_on = now()
        if admin_remarks:
            doc.admin_remarks = admin_remarks
        doc.save(ignore_permissions=True)
        frappe.db.commit()
    except frappe.DoesNotExistError:
        return {"success": False, "error": f"Leave request {leave_id} not found"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Leave Approve Failed")
        return {"success": False, "error": str(e)}

    return {"success": True, "leave_id": leave_id}


@frappe.whitelist(methods=["POST"])
def reject_leave(leave_id, admin_remarks):
    _require_admin()

    if not admin_remarks or not str(admin_remarks).strip():
        return {"success": False, "error": "Rejection reason is required"}

    try:
        doc = frappe.get_doc("Vera Leave Application", leave_id)
        doc.status = "Rejected"
        doc.approved_by = frappe.session.user
        doc.approved_on = now()
        doc.admin_remarks = admin_remarks
        doc.save(ignore_permissions=True)
        frappe.db.commit()
    except frappe.DoesNotExistError:
        return {"success": False, "error": f"Leave request {leave_id} not found"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Leave Reject Failed")
        return {"success": False, "error": str(e)}

    return {"success": True, "leave_id": leave_id}


@frappe.whitelist()
def get_leave_documents(leave_id):
    """Return files attached to a leave record. Accessible by owner or admin."""
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.AuthenticationError)

    try:
        doc = frappe.get_doc("Vera Leave Application", leave_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Leave not found"}

    emp = _get_employee()
    if not _is_admin() and (not emp or doc.employee != emp.name):
        return {"success": False, "error": "Access denied"}

    files = frappe.get_all(
        "File",
        filters={
            "attached_to_doctype": "Vera Leave Application",
            "attached_to_name": leave_id,
        },
        fields=["name", "file_name", "file_url", "creation", "file_size"],
        order_by="creation asc",
    )
    return {"success": True, "files": files}


@frappe.whitelist()
def get_holidays():
    """Returns 2026 public holidays for Vera Enterprises with computed status."""
    from datetime import date as _date
    from frappe.utils import getdate, today

    holidays = [
        {"date": "2026-01-01", "name": "Happy New Year",                           "day": "Thursday",  "month": "January"},
        {"date": "2026-01-15", "name": "Maatu Pongal / Makar Sankranthi / Lohri",  "day": "Thursday",  "month": "January"},
        {"date": "2026-01-26", "name": "Republic Day",                              "day": "Monday",    "month": "January"},
        {"date": "2026-03-19", "name": "Gudi Padwa / Ugadi",                        "day": "Thursday",  "month": "March"},
        {"date": "2026-03-20", "name": "Ramzan Id / Eid-Ul-Fitar",                  "day": "Friday",    "month": "March"},
        {"date": "2026-05-01", "name": "Labour's Day",                              "day": "Friday",    "month": "May"},
        {"date": "2026-08-15", "name": "Independence Day",                          "day": "Saturday",  "month": "August"},
        {"date": "2026-09-14", "name": "Ganesh Chaturthi",                          "day": "Monday",    "month": "September"},
        {"date": "2026-10-02", "name": "Gandhi Jayanti",                            "day": "Friday",    "month": "October"},
        {"date": "2026-10-19", "name": "Ashtami / Ayudha Pooja",                    "day": "Monday",    "month": "October"},
        {"date": "2026-10-20", "name": "Dussehra",                                  "day": "Tuesday",   "month": "October"},
        {"date": "2026-11-10", "name": "Diwali / Padwa",                            "day": "Tuesday",   "month": "November"},
        {"date": "2026-11-11", "name": "Diwali",                                    "day": "Wednesday", "month": "November"},
        {"date": "2026-12-25", "name": "Christmas",                                 "day": "Friday",    "month": "December"},
    ]

    today_date = getdate(today())
    for h in holidays:
        hd = getdate(h["date"])
        delta = (hd - today_date).days
        h["is_past"] = hd < today_date
        h["is_today"] = hd == today_date
        h["is_upcoming"] = hd > today_date
        h["days_until"] = delta

    return holidays


@frappe.whitelist()
def get_leave_policy():
    """Returns Vera Enterprises full leave policy for 2026."""
    return {
        "summary": {
            "public_holidays": 14,
            "happy_holiday": 1,
            "earned_leave": 12,
            "sick_leave": 5,
            "max_carry_forward": 5,
        },
        "leave_types": [
            {
                "type": "Earned Leave (EL)", "days": 12, "days_label": "12 days",
                "color": "green", "icon": "🌿",
                "rules": [
                    "1 leave earned per month",
                    "Credited at end of each month",
                    "Max 5 days carry forward to next year",
                    "Holidays/weekly offs between leave not counted",
                    "Planned leaves need advance approval",
                    "New joiners before 20th get 1 day credit",
                    "New joiners after 20th get 0.5 day credit",
                ],
            },
            {
                "type": "Sick Leave (SL)", "days": 5, "days_label": "5 days",
                "color": "blue", "icon": "🏥",
                "rules": [
                    "Max 2 consecutive days without medical certificate",
                    "More than 2 days requires medical certificate",
                    "Inform Reporting Manager and HR beforehand",
                    "1 day allowed for vaccination side effects",
                ],
            },
            {
                "type": "Public Holidays", "days": 14, "days_label": "14 days",
                "color": "purple", "icon": "🎉",
                "rules": [
                    "14 listed public holidays in 2026",
                    "Plus 1 Happy Holiday of your choice",
                    "Happy Holiday can be birthday, anniversary, or personal festival",
                ],
            },
            {
                "type": "Maternity Leave", "days": 182, "days_label": "26 weeks",
                "color": "pink", "icon": "👶",
                "rules": [
                    "First 2 children: 26 weeks (182 days)",
                    "Third child onwards: 12 weeks",
                    "Must have worked 80+ days in last 12 months",
                    "Doctor certificate required before leave",
                    "Form 2 must be submitted to HR",
                    "Miscarriage: 6 weeks leave",
                    "Tubectomy: 2 weeks leave",
                ],
            },
            {
                "type": "Paternity Leave", "days": 5, "days_label": "5 days",
                "color": "teal", "icon": "👨‍👶",
                "rules": [
                    "5 consecutive days",
                    "Must be taken within 3 months of childbirth",
                    "Maximum 2 instances during tenure",
                    "Can be clubbed with earned leaves with approval",
                ],
            },
            {
                "type": "Death Leave", "days": 5, "days_label": "Up to 5 days",
                "color": "grey", "icon": "🕊️",
                "rules": [
                    "Up to 5 days for immediate family",
                    "Immediate family: parents, siblings, spouse, children, in-laws",
                ],
            },
            {
                "type": "Compensatory Off", "days": 0, "days_label": "As earned",
                "color": "orange", "icon": "⚖️",
                "rules": [
                    "For working on weekly off or public holiday",
                    "Must be availed within 60 days",
                    "Needs Reporting Manager approval",
                ],
            },
            {
                "type": "Leave Without Pay (LWP)", "days": 0, "days_label": "As needed",
                "color": "red", "icon": "📋",
                "rules": [
                    "Only when leave balance is exhausted",
                    "Needs Reporting Manager approval",
                    "Employee expected to return to duty on approved date",
                ],
            },
        ],
        "important_rules": [
            "Leaves need Reporting Manager approval",
            "Long leaves (5+ days): apply 15 working days in advance",
            "Unauthorized absence 3+ days may lead to disciplinary action",
            "Leave during notice period is at Manager's discretion",
            "Previous leave requests valid only for last 60 days",
            "Absence 3+ days without communication is considered absconding",
        ],
    }


@frappe.whitelist()
def get_leave_summary():
    _require_admin()

    current_year = str(getdate(now()).year)
    leaves = frappe.get_all(
        "Vera Leave Application",
        filters=[["from_date", ">=", f"{current_year}-01-01"]],
        fields=["employee", "employee_name", "leave_type", "total_days", "status"],
    )

    summary: dict = {}
    for leave in leaves:
        emp_id = leave.employee
        if emp_id not in summary:
            info = frappe.db.get_value(
                "Employee", emp_id, ["department", "designation"], as_dict=True,
            ) or {}
            summary[emp_id] = {
                "employee": emp_id,
                "employee_name": leave.employee_name,
                "department": info.get("department", ""),
                "designation": info.get("designation", ""),
                "total_days_taken": 0,
                "pending": 0,
                "approved": 0,
                "rejected": 0,
                "by_type": {},
            }

        s = summary[emp_id]
        if leave.status == "Approved":
            s["total_days_taken"] += leave.total_days or 0
            s["approved"] += 1
            s["by_type"][leave.leave_type] = s["by_type"].get(leave.leave_type, 0) + (leave.total_days or 0)
        elif leave.status == "Pending":
            s["pending"] += 1
        elif leave.status == "Rejected":
            s["rejected"] += 1

    return {"success": True, "data": list(summary.values()), "year": current_year}
