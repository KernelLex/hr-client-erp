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
