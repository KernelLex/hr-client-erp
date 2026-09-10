import frappe
import json

# ──────────────────────────────────────────────────────────────────────────────
# PERMISSION REGISTRY — the SINGLE source of truth for what can be granted.
#
# Every module (group) and its subsections live here with a stable `key`. The
# React sidebar gate, the admin Role-Control page, and stored user permissions
# all read from this one structure. To add a new module/subsection to the
# permission control, add an entry here (and reference its key in the sidebar) —
# it then appears in the admin control automatically and is gated everywhere.
#
# `admin: True` marks an item that is only ever shown to admins in the UI. It is
# still listed in the control (so the map is complete) but toggling it for a
# regular user has no effect — they can never see admin-only items anyway.
#
# Legacy top-level keys that already gated the app (chat, crm, accounts,
# attendance, leave, recruitment, expense, logistics) are kept verbatim so any
# permissions already stored for existing users keep working.
# ──────────────────────────────────────────────────────────────────────────────
PERMISSION_REGISTRY = [
    {"key": "overview", "label": "Overview", "icon": "◫", "items": [
        {"key": "dashboard", "label": "Dashboard"},
        {"key": "my_profile", "label": "My Profile"},
        {"key": "chat", "label": "Chat"},
    ]},
    {"key": "crm", "label": "Sales (CRM)", "icon": "◈", "items": [
        {"key": "crm.pipeline", "label": "Pipeline"},
        {"key": "crm.sales_register", "label": "Sales Register", "admin": True},
    ]},
    {"key": "quotation", "label": "Quotation Studio", "icon": "◆", "items": [
        {"key": "quotation.units", "label": "Units"},
        {"key": "quotation.materials", "label": "Materials"},
        {"key": "quotation.finishes", "label": "Finishes"},
        {"key": "quotation.hardware", "label": "Hardware"},
        {"key": "quotation.pricing", "label": "Pricing Methods"},
        {"key": "quotation.templates", "label": "Templates"},
    ]},
    {"key": "inventory", "label": "Inventory", "icon": "▤", "admin": True, "items": []},
    {"key": "purchasing", "label": "Purchasing", "icon": "◪", "admin": True, "items": []},
    {"key": "logistics", "label": "Logistics", "icon": "◇", "admin": True, "items": []},
    {"key": "returns", "label": "Returns & QC", "icon": "◔", "admin": True, "items": []},
    {"key": "accounting", "label": "Accounting", "icon": "◎", "admin": True, "items": [
        {"key": "accounting.coa", "label": "Chart of Accounts"},
        {"key": "accounting.journal", "label": "Journal Entries"},
        {"key": "accounting.payment", "label": "Payment Entries"},
        {"key": "accounting.receipts", "label": "Receipts"},
        {"key": "accounting.bank_recon", "label": "Bank Book"},
        {"key": "accounting.sales_invoices", "label": "Sales Invoices"},
        {"key": "accounting.purchase_bills", "label": "Purchase Bills"},
        {"key": "accounting.credit_notes", "label": "Credit Notes"},
        {"key": "accounting.debit_notes", "label": "Debit Notes"},
        {"key": "accounting.general_ledger", "label": "General Ledger"},
        {"key": "accounting.ar", "label": "Accounts Receivable"},
        {"key": "accounting.ap", "label": "Accounts Payable"},
        {"key": "accounting.depreciation", "label": "Depreciation"},
        {"key": "accounting.cash_flow", "label": "Cash Flow"},
        {"key": "accounting.financial_statements", "label": "Financial Statements"},
        {"key": "accounting.erp_entries", "label": "ERP Entries"},
    ]},
    {"key": "accounts_dashboard", "label": "Accounts Dashboard", "icon": "◎", "admin": True, "items": []},
    {"key": "hrms", "label": "HRMS", "icon": "☺", "items": [
        {"key": "hrms.employees", "label": "Employee Master", "admin": True},
        {"key": "attendance", "label": "Attendance"},
        {"key": "hrms.holidays", "label": "Holidays"},
        {"key": "leave", "label": "Leave"},
        {"key": "expense", "label": "Expenses"},
        {"key": "recruitment", "label": "Recruitment"},
        {"key": "hrms.team", "label": "Team", "admin": True},
        {"key": "hrms.shifts", "label": "Shifts", "admin": True},
        {"key": "hrms.shift_roster", "label": "Shift Roster", "admin": True},
        {"key": "hrms.payroll", "label": "Payroll", "admin": True},
        {"key": "hrms.salary_assignments", "label": "Salary Assignments", "admin": True},
        {"key": "hrms.payroll_runs", "label": "Payroll Runs", "admin": True},
        {"key": "hrms.salary_slips", "label": "Salary Slips", "admin": True},
        {"key": "hrms.onboarding", "label": "Onboarding", "admin": True},
        {"key": "hrms.training", "label": "Training", "admin": True},
        {"key": "hrms.training_sessions", "label": "Training Sessions", "admin": True},
        {"key": "hrms.appraisals", "label": "Appraisals", "admin": True},
        {"key": "hrms.appraisal_cycles", "label": "Appraisal Cycles", "admin": True},
        {"key": "hrms.exit", "label": "Exit Management", "admin": True},
        {"key": "hrms.departments", "label": "Departments", "admin": True},
        {"key": "hrms.designations", "label": "Designations", "admin": True},
    ]},
    {"key": "todo", "label": "To-Do System", "icon": "✓", "items": [
        {"key": "todo.personal", "label": "Personal Tasks"},
        {"key": "todo.team", "label": "Team Tasks", "admin": True},
        {"key": "todo.approvals", "label": "Workflow Approvals", "admin": True},
        {"key": "todo.reminders", "label": "Reminders"},
        {"key": "todo.calendar", "label": "Calendar"},
        {"key": "todo.meetings", "label": "Meetings"},
        {"key": "todo.notes", "label": "Notes", "admin": True},
    ]},
    {"key": "org_hub", "label": "Org Hub", "icon": "◐", "items": []},
    {"key": "accounts", "label": "Document Management", "icon": "▤", "items": [
        {"key": "accounts.drive", "label": "Drive Documents"},
        {"key": "accounts.upload", "label": "Upload Status"},
        {"key": "accounts.verify", "label": "Verify Data", "admin": True},
        {"key": "accounts.ai_insights", "label": "AI Insights", "admin": True},
        {"key": "accounts.graphs", "label": "Graphs", "admin": True},
    ]},
    {"key": "administration", "label": "Administration", "icon": "◈", "admin": True, "items": [
        {"key": "administration.users", "label": "User Management"},
        {"key": "administration.permissions", "label": "Permissions"},
        {"key": "administration.data_entry_requests", "label": "Data Entry Requests"},
    ]},
]

# Legacy per-column module keys on the User Module Permission DocType. Kept so
# permissions saved before the registry migration are honoured (a stored 0 on
# any of these columns is merged into the denied set on read).
LEGACY_MODULE_KEYS = [
    "recruitment", "employee_lifecycle", "accounts", "projects", "logistics",
    "hr", "attendance", "leave", "expense", "crm", "chat",
]

# ERPNext roles assigned to every non-admin user (full access by default)
ALL_ROLES = [
    "HR Manager", "HR User", "Accounts Manager", "Accounts User", "Projects User",
    "Stock Manager", "Stock User", "Expense Approver", "Employee", "Leave Approver",
]

# Maps a permission key to the ERPNext roles it requires (desk access; the SPA
# does not use these, but they are kept in sync for completeness).
MODULE_ROLE_MAP = {
    "recruitment": ["HR Manager", "HR User"],
    "employee_lifecycle": ["HR Manager", "HR User"],
    "accounts": ["Accounts Manager", "Accounts User"],
    "projects": ["Projects User"],
    "logistics": ["Stock Manager", "Stock User"],
    "hr": ["HR Manager", "HR User", "Leave Approver"],
    "hrms": ["HR Manager", "HR User", "Leave Approver"],
    "attendance": ["HR Manager", "HR User"],
    "leave": ["HR Manager", "HR User", "Leave Approver"],
    "expense": ["Expense Approver"],
    "crm": [],
    "quotation": [],
    "chat": [],
}

# Roles always present regardless of module permissions
BASE_ROLES = ["Employee"]

_ADMIN_USERS = {"Administrator", "owais@veraenterprises.in", "amoghspace@gmail.com"}
_PROTECTED_USER = "owais@veraenterprises.in"


# ── Registry helpers ─────────────────────────────────────────────────────────

def _all_keys() -> list:
    """Flat list of every permission key (groups + their items), in order."""
    keys = []
    for group in PERMISSION_REGISTRY:
        keys.append(group["key"])
        for item in group.get("items", []):
            keys.append(item["key"])
    return keys


def _key_parent() -> dict:
    """Map each item key -> its group key. Group keys map to None."""
    parents = {}
    for group in PERMISSION_REGISTRY:
        parents[group["key"]] = None
        for item in group.get("items", []):
            parents[item["key"]] = group["key"]
    return parents


def _all_true() -> dict:
    return {k: True for k in _all_keys()}


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

    to_remove = all_managed - desired
    if to_remove:
        frappe.db.delete("Has Role", {
            "parent": frappe_name,
            "parenttype": "User",
            "role": ["in", list(to_remove)],
        })

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


def _denied_set(frappe_name: str) -> set:
    """
    The set of permission keys explicitly denied for a user.
    Sources merged: (1) the sparse permissions_json blob, and (2) any legacy
    per-column Check field still set to 0 (back-compat with pre-registry saves).
    Absent record or key => allowed.
    """
    denied = set()
    if not frappe.db.exists("User Module Permission", frappe_name):
        return denied

    doc = frappe.get_doc("User Module Permission", frappe_name)

    raw = getattr(doc, "permissions_json", None)
    if raw:
        try:
            blob = json.loads(raw)
            denied |= {k for k, v in blob.items() if v is False}
        except Exception:
            pass

    # Legacy columns: a stored 0 means that module was restricted.
    for key in LEGACY_MODULE_KEYS:
        if getattr(doc, key, 1) == 0:
            denied.add(key)

    return denied


def _resolve_perms(frappe_name: str) -> dict:
    """Resolved {key: bool} over EVERY registry key for a user (True = allowed)."""
    denied = _denied_set(frappe_name)
    return {k: (k not in denied) for k in _all_keys()}


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


# ── v3 endpoints (registry-driven) ───────────────────────────────────────────

@frappe.whitelist()
def get_permission_registry():
    """The full module/subsection registry. Any logged-in user may read it
    (the sidebar gate needs it); writes are admin-only elsewhere."""
    return {"registry": PERMISSION_REGISTRY}


@frappe.whitelist()
def get_all_users_with_permissions():
    """
    ALL enabled System Users with their resolved permission map over every
    registry key, plus the registry itself. Owais always first, full access.
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
        permissions = _all_true() if is_admin else _resolve_perms(u["name"])
        result.append({
            "name": u["full_name"],
            "email": u["name"],
            "department": emp.get("department") or "",
            "designation": emp.get("designation") or "",
            "company": emp.get("company") or "",
            "is_admin": is_admin,
            "permissions": permissions,
        })

    return {"users": result, "registry": PERMISSION_REGISTRY, "keys": _all_keys()}


@frappe.whitelist(methods=["POST"])
def update_user_permissions(email: str, permissions: str):
    """
    Save permissions for any user. Admin only.
    `permissions`: JSON string of { key: bool } over (any subset of) registry keys.
    Stored sparsely as the set of denied keys in permissions_json.
    """
    try:
        _require_admin()

        if isinstance(permissions, str):
            try:
                permissions = json.loads(permissions)
            except Exception:
                return {"success": False, "error": "Invalid permissions format — expected JSON string"}

        if email == _PROTECTED_USER:
            return {"success": False, "error": "Cannot modify permissions for the protected admin account"}

        frappe_name = email
        if not frappe.db.exists("User", frappe_name):
            return {"success": False, "error": f"User '{email}' not found"}

        valid_keys = set(_all_keys())
        # Only keys that are explicitly False and belong to the registry are denied.
        denied = {k for k, v in permissions.items() if v is False and k in valid_keys}

        # ── 1. Persist to the DocType ─────────────────────────────────────────
        if frappe.db.exists("User Module Permission", frappe_name):
            doc = frappe.get_doc("User Module Permission", frappe_name)
        else:
            doc = frappe.new_doc("User Module Permission")
            doc.user = frappe_name

        doc.permissions_json = json.dumps({k: False for k in sorted(denied)})
        # Keep legacy Check columns in sync for the overlapping module keys so any
        # old reader still sees the right state.
        for key in LEGACY_MODULE_KEYS:
            if hasattr(doc, key):
                setattr(doc, key, 0 if key in denied else 1)

        doc.save(ignore_permissions=True)

        resolved = {k: (k not in denied) for k in _all_keys()}

        # ── 2. Sync ERPNext roles (non-fatal) ────────────────────────────────
        try:
            valid_roles = {r.name for r in frappe.get_all("Role", fields=["name"])}
            _sync_user_roles(frappe_name, resolved, valid_roles)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Role Sync Failed (non-fatal)")

        frappe.db.commit()
        return {"success": True, "email": email, "permissions": resolved}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Permission Update Failed")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_my_permissions():
    """
    The calling user's resolved permission map over every registry key.
    No admin check — every logged-in user can call this. Admins/guests get all-true.
    """
    user = frappe.session.user
    if user in _ADMIN_USERS or user == "Guest":
        return {"modules": _all_true(), "keys": _all_keys()}
    return {"modules": _resolve_perms(user), "keys": _all_keys()}


# ── Legacy endpoints (kept for backwards compat) ─────────────────────────────

@frappe.whitelist()
def get_users_with_roles():
    """Legacy endpoint — use get_all_users_with_permissions instead."""
    return get_all_users_with_permissions()


@frappe.whitelist(methods=["POST"])
def update_user_roles(user_email: str, modules: str):
    """Legacy endpoint — delegates to update_user_permissions."""
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
