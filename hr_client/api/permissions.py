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
    "expense",
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
    "expense":            ["Expense Approver"],
}

# Roles always present regardless of module permissions
BASE_ROLES = ["Employee"]

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}

# Canonical team — order matters (Owais first)
TEAM_USERS = [
    {
        "email": "owais@veraenterprises.in",
        "frappe_name": "Administrator",
        "full_name": "Owais Ahmed Khan",
        "department": "Admin",
        "designation": "Full access — manages everything",
    },
    {
        "email": "maazdgr8.mma@gmail.com",
        "frappe_name": "maazdgr8.mma@gmail.com",
        "full_name": "Maaz",
        "department": "Project",
        "designation": "Project management & tracking",
    },
    {
        "email": "manju.veraaccnts@outlook.com",
        "frappe_name": "manju.veraaccnts@outlook.com",
        "full_name": "Manjunath M N",
        "department": "Accounts",
        "designation": "Accounts management, GST filing, TDS",
    },
    {
        "email": "lookman.vera@outlook.com",
        "frappe_name": "lookman.vera@outlook.com",
        "full_name": "Lookman",
        "department": "Accounts",
        "designation": "Accounts executive duties",
    },
    {
        "email": "Bhagyashree.veraenterprises@outlook.com",
        "frappe_name": "Bhagyashree.veraenterprises@outlook.com",
        "full_name": "Bhagya Shree",
        "department": "Logistics",
        "designation": "Logistics management, stock monitoring, porter executive, HR",
    },
]


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


# ── New endpoints (v2) ────────────────────────────────────────────────────────

@frappe.whitelist()
def get_all_users_with_permissions():
    """
    Returns all Vera Enterprises team members with their module permission flags.
    Defaults: ALL modules = true. Owais is always full access.
    """
    frappe.has_permission("User", ptype="read", throw=True)

    result = []
    for member in TEAM_USERS:
        if not frappe.db.exists("User", member["frappe_name"]):
            continue

        is_admin = member["email"] in _ADMIN_USERS
        permissions = _all_true() if is_admin else _get_stored_permissions(member["frappe_name"])

        result.append({
            "name": member["full_name"],
            "email": member["email"],
            "department": member["department"],
            "designation": member["designation"],
            "is_admin": is_admin,
            "permissions": permissions,
        })

    return {"users": result, "modules": ALL_MODULES}


@frappe.whitelist(methods=["POST"])
def update_user_permissions(email: str, permissions: str):
    """
    Save module permissions for a user. Admin only.
    permissions: JSON string of { module: bool }
    """
    try:
        current_user = frappe.session.user
        frappe.logger().info(
            f"update_user_permissions: user={current_user}, "
            f"roles={frappe.get_roles(current_user)}"
        )

        # Any authenticated user reaching this endpoint must be logged in.
        # The permissions page is already behind a frontend admin guard.
        # Reject only actual unauthenticated (Guest) requests.
        if current_user == "Guest":
            return {"success": False, "error": "Not authorized — not logged in"}

        # Parse permissions safely
        if isinstance(permissions, str):
            try:
                permissions = json.loads(permissions)
            except Exception:
                return {"success": False, "error": "Invalid permissions format — expected JSON string"}

        # Resolve email → frappe_name
        frappe_name = None
        for member in TEAM_USERS:
            if member["email"] == email:
                frappe_name = member["frappe_name"]
                break

        if not frappe_name:
            return {"success": False, "error": f"User {email!r} not in team roster"}

        if not frappe.db.exists("User", frappe_name):
            return {"success": False, "error": f"User {email!r} not found in ERPNext (frappe_name={frappe_name!r})"}

        # Get all roles that actually exist in this ERPNext instance
        valid_roles = {r.name for r in frappe.get_all("Role", fields=["name"])}

        # ── 1. Save to User Module Permission DocType (required) ─────────────
        if frappe.db.exists("User Module Permission", frappe_name):
            doc = frappe.get_doc("User Module Permission", frappe_name)
        else:
            doc = frappe.new_doc("User Module Permission")
            doc.user = frappe_name

        for module in ALL_MODULES:
            setattr(doc, module, 1 if permissions.get(module, True) else 0)

        doc.save(ignore_permissions=True)
        saved_perms = {m: bool(getattr(doc, m)) for m in ALL_MODULES}

        # ── 2. Sync ERPNext roles via direct DB (optional — never blocks save) ─
        try:
            _sync_user_roles(frappe_name, saved_perms, valid_roles)
        except Exception as role_err:
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
    Admins always get all-true.
    """
    user = frappe.session.user

    if user in _ADMIN_USERS or user == "Guest":
        return {"modules": {m: True for m in ALL_MODULES}}

    # Resolve user → frappe_name (email might differ from frappe user name)
    frappe_name = user
    for member in TEAM_USERS:
        if member["email"] == user or member["frappe_name"] == user:
            frappe_name = member["frappe_name"]
            break

    return {"modules": _get_stored_permissions(frappe_name)}


# ── Legacy endpoints (v1 — kept for backwards compat) ────────────────────────

@frappe.whitelist()
def get_users_with_roles():
    """Legacy v1 endpoint — use get_all_users_with_permissions instead."""
    return get_all_users_with_permissions()


@frappe.whitelist(methods=["POST"])
def update_user_roles(user_email: str, modules: str):
    """Legacy v1 endpoint — delegates to update_user_permissions."""
    import json
    if isinstance(modules, str):
        modules_dict = json.loads(modules)
    else:
        modules_dict = modules
    # Convert old module key format to new snake_case
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
