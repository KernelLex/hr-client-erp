import re
import frappe
from frappe.utils import now_datetime
from frappe.utils.password import update_password
from hr_client.api.utils import handle_api_error

# Owais is the protected superuser — cannot be disabled, deleted, or have
# password changed via this panel.
_PROTECTED_USER = "owais@veraenterprises.in"
_ADMIN_USERS = {"Administrator", _PROTECTED_USER}

# Roles that are system-internal and should never be shown for assignment
_HIDDEN_ROLES = {"Guest", "All"}


def _require_admin():
    u = frappe.session.user
    if u in _ADMIN_USERS:
        return
    frappe.throw("Administrator access required", frappe.PermissionError)


def _validate_password_strength(password: str):
    if len(password) < 8:
        frappe.throw("Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", password):
        frappe.throw("Password must contain at least one uppercase letter")
    if not re.search(r"[0-9]", password):
        frappe.throw("Password must contain at least one number")
    if not re.search(r'[!@#$%^&*()\-_=+\[\]{}|;:,.<>?/\\\'\"~`]', password):
        frappe.throw("Password must contain at least one special character")


def _check_rate_limit(action: str, limit: int, window_secs: int):
    key = f"vera_rate_limit:{action}:{frappe.session.user}"
    current = int(frappe.cache().get_value(key) or 0)
    if current >= limit:
        mins = window_secs // 60
        frappe.throw(
            f"Rate limit reached. Maximum {limit} {action.replace('_', ' ')} actions per {mins} minutes.",
            frappe.ValidationError,
        )
    frappe.cache().set_value(key, current + 1, expires_in_sec=window_secs)


def _log_activity(action: str, target_user: str, detail: str = ""):
    try:
        frappe.get_doc({
            "doctype": "Activity Log",
            "user": frappe.session.user,
            "status": "Update",
            "subject": f"User Management: {action} — {target_user}",
            "content": (
                f"<b>Action:</b> {action}<br>"
                f"<b>Target user:</b> {target_user}<br>"
                f"<b>Performed by:</b> {frappe.session.user}<br>"
                f"<b>Time:</b> {now_datetime()}"
                + (f"<br><b>Detail:</b> {detail}" if detail else "")
            ),
            "reference_doctype": "User",
            "reference_name": target_user,
        }).insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception:
        # Activity log failure must never break the main action
        frappe.log_error(frappe.get_traceback(), "user_management._log_activity")


def _get_linked_employee(user_email: str):
    emp = frappe.db.get_value(
        "Employee",
        {"user_id": user_email, "status": "Active"},
        ["employee_name", "designation"],
        as_dict=True,
    )
    if not emp:
        emp = frappe.db.get_value(
            "Employee",
            {"company_email": user_email},
            ["employee_name", "designation"],
            as_dict=True,
        )
    return emp or {}


def _serialize_user(user, include_roles=False):
    emp = _get_linked_employee(user.name)
    result = {
        "name": user.name,
        "full_name": user.full_name,
        "user_type": user.user_type,
        "enabled": bool(user.enabled),
        "last_login": str(user.last_login) if user.last_login else None,
        "creation": str(user.creation) if user.creation else None,
        "linked_employee": emp.get("employee_name"),
        "linked_designation": emp.get("designation"),
        "is_protected": user.name == _PROTECTED_USER or user.name == "Administrator",
    }
    if include_roles:
        result["roles"] = [r.role for r in user.get("roles", [])]
    else:
        result["roles"] = frappe.get_roles(user.name)
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_all_users():
    _require_admin()
    users = frappe.get_all(
        "User",
        filters={"user_type": ["!=", "Website User"], "name": ["not in", ["Guest", "Administrator"]]},
        fields=["name", "full_name", "user_type", "enabled", "last_login", "creation"],
        order_by="full_name asc",
    )
    result = []
    for u in users:
        emp = _get_linked_employee(u["name"])
        roles = frappe.get_roles(u["name"])
        result.append({
            "name": u["name"],
            "full_name": u["full_name"],
            "user_type": u["user_type"],
            "enabled": bool(u["enabled"]),
            "roles": roles,
            "last_login": str(u["last_login"]) if u["last_login"] else None,
            "creation": str(u["creation"]) if u["creation"] else None,
            "linked_employee": emp.get("employee_name"),
            "linked_designation": emp.get("designation"),
            "is_protected": u["name"] == _PROTECTED_USER,
        })
    return result


@frappe.whitelist()
@handle_api_error
def get_user_detail(user_email: str):
    _require_admin()
    if not frappe.db.exists("User", user_email):
        frappe.throw(f"User '{user_email}' not found", frappe.DoesNotExistError)
    user = frappe.get_doc("User", user_email)
    return _serialize_user(user, include_roles=True)


@frappe.whitelist()
@handle_api_error
def create_user(email: str, first_name: str, last_name: str, password: str, roles=None):
    _require_admin()
    _check_rate_limit("create_user", limit=10, window_secs=3600)

    # Validate inputs
    if not frappe.utils.validate_email_address(email):
        frappe.throw("Invalid email address")
    if frappe.db.exists("User", email):
        frappe.throw(f"A user with email '{email}' already exists")
    _validate_password_strength(password)

    if roles is None:
        roles = []
    if isinstance(roles, str):
        import json
        roles = json.loads(roles)

    # Validate all requested roles exist
    all_roles = {r.name for r in frappe.get_all("Role", fields=["name"])}
    for role in roles:
        if role not in all_roles:
            frappe.throw(f"Role '{role}' does not exist in ERPNext")

    # Create user
    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "send_welcome_email": 0,
        "user_type": "System User",
        "roles": [{"role": r} for r in roles],
    })
    user.insert(ignore_permissions=True)
    update_password(email, password)
    frappe.db.commit()

    _log_activity("Created user", email, f"Roles: {', '.join(roles) or 'none'}")
    return {"success": True, "name": email, "message": f"User '{email}' created successfully"}


@frappe.whitelist()
@handle_api_error
def update_user_roles(user_email: str, roles=None):
    _require_admin()

    if not frappe.db.exists("User", user_email):
        frappe.throw(f"User '{user_email}' not found", frappe.DoesNotExistError)

    if roles is None:
        roles = []
    if isinstance(roles, str):
        import json
        roles = json.loads(roles)

    # Validate all roles exist
    all_roles = {r.name for r in frappe.get_all("Role", fields=["name"])}
    for role in roles:
        if role not in all_roles:
            frappe.throw(f"Role '{role}' does not exist")

    # Protect Owais's Administrator role
    if user_email == _PROTECTED_USER and "Administrator" not in roles:
        frappe.throw("Cannot remove the Administrator role from this account")

    # Replace roles by deleting existing and inserting new
    frappe.db.delete("Has Role", {"parent": user_email})
    for role in roles:
        frappe.db.insert({
            "doctype": "Has Role",
            "parenttype": "User",
            "parentfield": "roles",
            "parent": user_email,
            "role": role,
        })
    frappe.db.commit()

    _log_activity("Updated roles", user_email, f"New roles: {', '.join(roles) or 'none'}")
    return {"success": True, "message": f"Roles updated for '{user_email}'"}


@frappe.whitelist()
@handle_api_error
def change_user_password(user_email: str, new_password: str):
    _require_admin()
    _check_rate_limit("change_password", limit=5, window_secs=900)

    if user_email == _PROTECTED_USER:
        frappe.throw(
            f"Cannot change password for this account via this panel. "
            f"The account holder must update their own password in profile settings.",
            frappe.PermissionError,
        )
    if not frappe.db.exists("User", user_email):
        frappe.throw(f"User '{user_email}' not found", frappe.DoesNotExistError)

    _validate_password_strength(new_password)
    update_password(user_email, new_password)
    frappe.db.commit()

    _log_activity("Changed password", user_email)
    return {"success": True, "message": f"Password updated for '{user_email}'"}


@frappe.whitelist()
@handle_api_error
def toggle_user_status(user_email: str, enabled):
    _require_admin()

    if user_email == _PROTECTED_USER:
        frappe.throw("Cannot disable this protected account", frappe.PermissionError)
    if not frappe.db.exists("User", user_email):
        frappe.throw(f"User '{user_email}' not found", frappe.DoesNotExistError)

    enabled_val = 1 if str(enabled).lower() in ("1", "true") else 0
    frappe.db.set_value("User", user_email, "enabled", enabled_val)
    frappe.db.commit()

    action = "Enabled user" if enabled_val else "Disabled user"
    _log_activity(action, user_email)
    return {"success": True, "enabled": bool(enabled_val), "message": f"User '{user_email}' {'enabled' if enabled_val else 'disabled'}"}


@frappe.whitelist()
@handle_api_error
def delete_user(user_email: str):
    _require_admin()

    if user_email == _PROTECTED_USER:
        frappe.throw("Cannot delete this protected account", frappe.PermissionError)
    if user_email == frappe.session.user:
        frappe.throw("Cannot delete your own account", frappe.PermissionError)
    if not frappe.db.exists("User", user_email):
        frappe.throw(f"User '{user_email}' not found", frappe.DoesNotExistError)

    # Soft delete: disable + rename email to avoid future conflicts
    suffix = "_deleted"
    new_email = user_email + suffix
    # Only append suffix if not already deleted
    if not user_email.endswith(suffix):
        frappe.db.set_value("User", user_email, {
            "enabled": 0,
            "email": new_email,
        })
        frappe.db.commit()
        _log_activity("Deleted (soft) user", user_email, f"Email renamed to {new_email}")
        return {"success": True, "message": f"User '{user_email}' has been deactivated"}
    else:
        frappe.db.set_value("User", user_email, "enabled", 0)
        frappe.db.commit()
        _log_activity("Disabled already-deleted user", user_email)
        return {"success": True, "message": f"User '{user_email}' is already deactivated"}


@frappe.whitelist()
@handle_api_error
def get_available_roles():
    _require_admin()
    roles = frappe.get_all(
        "Role",
        filters={"name": ["not in", list(_HIDDEN_ROLES)], "disabled": 0},
        fields=["name", "description"],
        order_by="name asc",
    )
    return roles
