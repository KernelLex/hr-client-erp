import frappe
import json

# All permission modules exposed to the React frontend
ALL_MODULES = [
    "recruitment",
    "employee_lifecycle",
    "accounts",
    "projects",
    "logistics",
    "hr",
    "attendance",
    "leave",
    "expense",
    "crm",
    "chat",
]

# ERPNext roles assigned to every non-admin user (full access by default)
ALL_ROLES = [
    "HR Manager",
    "HR User",
    "Accounts Manager",
    "Accounts User",
    "Projects User",
    "Stock Manager",
    "Stock User",
    "Expense Approver",
    "Employee",
    "Leave Approver",
]

# Maps each module to the ERPNext roles it requires
MODULE_ROLE_MAP = {
    "recruitment":        ["HR Manager", "HR User"],
    "employee_lifecycle": ["HR Manager", "HR User"],
    "accounts":           ["Accounts Manager", "Accounts User"],
    "projects":           ["Projects User"],
    "logistics":          ["Stock Manager", "Stock User"],
    "hr":                 ["HR Manager", "HR User", "Leave Approver"],
    "attendance":         ["HR Manager", "HR User"],
    "leave":              ["HR Manager", "HR User", "Leave Approver"],
    "expense":            ["Expense Approver"],
    "crm":                [],  # custom DocTypes only, no ERPNext desk roles needed
    "chat":               [],  # custom DocTypes only, no ERPNext desk roles needed
}

# Roles always present regardless of module permissions
BASE_ROLES = ["Employee"]

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}
_PROTECTED_USER = "owais@veraenterprises.in"


def _sync_user_roles(frappe_name: str, permissions: dict, valid_roles: set):
    """
    Sync ERPNext User roles via direct DB writes — avoids User.save() hooks
    (email notifications, validation, etc.) that can fail mid-request.
    """
    desired = set(BASE_ROLES)
    for module, enabled in permissions.items():
        if enabled and module in MODULE_ROLE_MAP:
            desired.update(r for r in MODULE_ROLE_MAP[module] if r in valid_roles)

    all_managed = set(r for roles in MODULE_ROLE_MAP.values() for r in roles) | set(BASE_ROLES)
    all_managed &= valid_roles  # only touch roles that actually exist

    # Remove managed roles that are no longer needed
    to_remove = all_managed - desired
    if to_remove:
        frappe.db.delete("Has Role", {
            "parent": frappe_name,
            "parenttype": "User",
            "role": ["in", list(to_remove)],
        })

    # Add desired roles that are missing
    current = {
        r.role for r in frappe.get_all(
            "Has Role",
            filters={"parent": frappe_name, "parenttype": "User"},
            fields=["role"],
        )
    }
    for role in desired:
        if role not in current:
            frappe.db.insert({
                "doctype": "Has Role",
                "name": frappe.generate_hash("Has Role", 10),
                "parent": frappe_name,
                "parenttype": "User",
                "parentfield": "roles",
                "role": role,
            })


def _require_admin():
    if frappe.session.user not in _ADMIN_USERS:
        frappe.throw("Only Administrators can manage user permissions", frappe.PermissionError)


def _all_true() -> dict:
    return {m: True for m in ALL_MODULES}


def _get_stored_permissions(frappe_name: str) -> dict:
    """Load from User Module Permission DocType, default all-true if no record."""
    if not frappe.db.exists("User Module Permission", frappe_name):
        return _all_true()
    doc = frappe.get_doc("User Module Permission", frappe_name)
    return {m: bool(getattr(doc, m, 1)) for m in ALL_MODULES}


def _get_linked_employee(user_email: str) -> dict:
    """Return {full_name, department, designation, company} from linked Employee record."""
    emp = frappe.db.get_value(
        "Employee",
        {"user_id": user_email, "status": "Active"},
        ["employee_name", "department", "designation", "company"],
        as_dict=True,
    )
    if not emp:
        emp = frappe.db.get_value(
            "Employee",
            {"company_email": user_email},
            ["employee_name", "department", "designation", "company"],
            as_dict=True,
        )
    return emp or {}


# ── v2 endpoints ──────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_all_users_with_permissions():
    """
    Dynamically returns ALL System Users with their module permission flags.
    Owais is always shown first with full access locked.
    """
    frappe.has_permission("User", ptype="read", throw=True)

    users = frappe.get_all(
        "User",
        filters={
            "user_type": "System User",
            "enabled": 1,
            "name": ["not in", ["Guest", "Administrator"]],
        },
        fields=["name", "full_name", "enabled"],
        order_by="full_name asc",
    )

    result = []
    # Owais always first
    owais_email = _PROTECTED_USER
    if frappe.db.exists("User", owais_email):
        emp = _get_linked_employee(owais_email)
        result.append({
            "name": "Owais Ahmed Khan",
            "email": owais_email,
            "department": emp.get("department", "Management"),
            "designation": emp.get("designation", "Administrator"),
            "company": emp.get("company", "Vera Enterprises"),
            "is_admin": True,
            "permissions": _all_true(),
        })

    for u in users:
        if u["name"] == owais_email:
            continue
        is_admin = u["name"] in _ADMIN_USERS
        emp = _get_linked_employee(u["name"])
        permissions = _all_true() if is_admin else _get_stored_permissions(u["name"])
        result.append({
            "name": u["full_name"],
            "email": u["name"],
            "department": emp.get("department") or "",
            "designation": emp.get("designation") or "",
            "company": emp.get("company") or "",
            "is_admin": is_admin,
            "permissions": permissions,
        })

    return {"users": result, "modules": ALL_MODULES}


@frappe.whitelist(methods=["POST"])
def update_user_permissions(email: str, permissions: str):
    """
    Save module permissions for any user. Admin only.
    permissions: JSON string of { module: bool }
    """
    try:
        _require_admin()

        if isinstance(permissions, str):
            try:
                permissions = json.loads(permissions)
            except Exception:
                return {"success": False, "error": "Invalid permissions format — expected JSON string"}

        # Owais can never be restricted
        if email == _PROTECTED_USER:
            return {"success": False, "error": "Cannot modify permissions for the protected admin account"}

        # frappe_name IS the email for all non-Administrator users
        frappe_name = email
        if not frappe.db.exists("User", frappe_name):
            return {"success": False, "error": f"User '{email}' not found"}

        valid_roles = {r.name for r in frappe.get_all("Role", fields=["name"])}

        # ── 1. Save to User Module Permission DocType ─────────────────────────
        if frappe.db.exists("User Module Permission", frappe_name):
            doc = frappe.get_doc("User Module Permission", frappe_name)
        else:
            doc = frappe.new_doc("User Module Permission")
            doc.user = frappe_name

        for module in ALL_MODULES:
            setattr(doc, module, 1 if permissions.get(module, True) else 0)

        doc.save(ignore_permissions=True)
        saved_perms = {m: bool(getattr(doc, m)) for m in ALL_MODULES}

        # ── 2. Sync ERPNext roles (non-fatal) ────────────────────────────────
        try:
            _sync_user_roles(frappe_name, saved_perms, valid_roles)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Role Sync Failed (non-fatal)")

        frappe.db.commit()
        return {"success": True, "email": email, "permissions": saved_perms}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Permission Update Failed")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_my_permissions():
    """
    Returns the calling user's module permissions.
    No admin check — every logged-in user can call this.
    Admins and guests always get all-true.
    """
    user = frappe.session.user
    if user in _ADMIN_USERS or user == "Guest":
        return {"modules": _all_true()}
    return {"modules": _get_stored_permissions(user)}


# ── Legacy endpoints (v1 — kept for backwards compat) ────────────────────────

@frappe.whitelist()
def get_users_with_roles():
    """Legacy v1 endpoint — use get_all_users_with_permissions instead."""
    return get_all_users_with_permissions()


@frappe.whitelist(methods=["POST"])
def update_user_roles(user_email: str, modules: str):
    """Legacy v1 endpoint — delegates to update_user_permissions."""
    if isinstance(modules, str):
        modules_dict = json.loads(modules)
    else:
        modules_dict = modules
    key_map = {
        "EmployeeLifecycle": "employee_lifecycle",
        "Logistics": "logistics",
        "Recruitment": "recruitment",
        "Accounts": "accounts",
        "Projects": "projects",
        "HR": "hr",
    }
    converted = {key_map.get(k, k.lower()): v for k, v in modules_dict.items()}
    return update_user_permissions(email=user_email, permissions=json.dumps(converted))
