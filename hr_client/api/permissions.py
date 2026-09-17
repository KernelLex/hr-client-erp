import frappe
import json

from hr_client.api.utils import (
    ALL_COMPANIES, allowed_companies, can_grant_access, current_company,
    is_group_owner, require_company,
)

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
        {"key": "quotation.measurements", "label": "Measurement Sheets"},
        {"key": "quotation.boqs", "label": "BOQ / Configuration"},
        {"key": "quotation.cost_sheets", "label": "Cost Sheets"},
        {"key": "quotation.quotations", "label": "Customer Quotations"},
        {"key": "quotation.sales_orders", "label": "Sales Orders"},
        {"key": "quotation.terms_clauses", "label": "Terms — Clauses"},
        {"key": "quotation.terms_templates", "label": "Terms — Templates"},
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


def _is_per_company_blob(blob: dict) -> bool:
    """New format stores {company: {key: False}}; legacy stored {key: False}.
    Per-company if every value is a dict (empty blob → treat as legacy/empty)."""
    return bool(blob) and all(isinstance(v, dict) for v in blob.values())


def _denied_set(frappe_name: str, company: str = None) -> set:
    """
    The set of permission keys explicitly denied for a user WITHIN `company`.

    Storage (permissions_json):
      • new  → {company: {key: False}}   — per-company module denials
      • old  → {key: False}              — flat; applied to EVERY company (back-compat)
    Legacy per-column Check fields (0 = restricted) apply to every company too.
    Absent record / key => allowed (allow-by-default within a granted company).
    """
    denied = set()
    if not frappe.db.exists("User Module Permission", frappe_name):
        return denied

    doc = frappe.get_doc("User Module Permission", frappe_name)

    raw = getattr(doc, "permissions_json", None)
    if raw:
        try:
            blob = json.loads(raw)
            if _is_per_company_blob(blob):
                if company and company != ALL_COMPANIES:
                    sub = blob.get(company, {})
                    denied |= {k for k, v in sub.items() if v is False}
            else:
                # Legacy flat blob applies to all companies.
                denied |= {k for k, v in blob.items() if v is False}
        except Exception:
            pass

    # Legacy columns: a stored 0 means that module was restricted (all companies).
    for key in LEGACY_MODULE_KEYS:
        if getattr(doc, key, 1) == 0:
            denied.add(key)

    return denied


def _resolve_perms(frappe_name: str, company: str = None) -> dict:
    """Resolved {key: bool} over EVERY registry key for a user within a company."""
    denied = _denied_set(frappe_name, company)
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
        # Company access (positive allowlist) + the default company for the
        # back-compat flat `permissions` map.
        access = frappe.get_all(
            "User Company Access",
            filters={"parent": u["name"], "parenttype": "User"},
            fields=["company", "access_level", "is_default"], order_by="idx asc",
        )
        default_co = next((a.company for a in access if a.is_default), (access[0].company if access else None))
        permissions = _all_true() if is_admin else _resolve_perms(u["name"], default_co)
        result.append({
            "name": u["full_name"],
            "email": u["name"],
            "department": emp.get("department") or "",
            "designation": emp.get("designation") or "",
            # "Employed by" (payroll company, read-only) is SEPARATE from "Can
            # access" (the granted allowlist). Never conflate them.
            "employed_by": emp.get("company") or "",
            "company": emp.get("company") or "",
            "company_access": access,
            "is_admin": is_admin,
            "permissions": permissions,
        })

    return {
        "users": result,
        "registry": PERMISSION_REGISTRY,
        "keys": _all_keys(),
        "all_companies": frappe.get_all("Company", pluck="name"),
        "can_grant": can_grant_access(),
    }


@frappe.whitelist(methods=["POST"])
def update_user_permissions(email: str, permissions: str, company: str = None):
    """
    Save a user's MODULE permissions WITHIN one company (sparse negative — only
    denied keys are stored). Gated on can_grant_access() (Owais only). A denial
    on one company never affects the user's other companies.

    `permissions`: JSON string of { key: bool } over (a subset of) registry keys.
    `company`: which company these denials apply to (defaults to active company).
    """
    try:
        if not can_grant_access():
            return {"success": False, "error": "You are not permitted to change access."}

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

        company = require_company(company) if company else current_company()
        if company == ALL_COMPANIES:
            return {"success": False, "error": "Pick a specific company to set module access."}

        valid_keys = set(_all_keys())
        denied = {k for k, v in permissions.items() if v is False and k in valid_keys}

        # ── 1. Persist per-company into the sparse blob ───────────────────────
        if frappe.db.exists("User Module Permission", frappe_name):
            doc = frappe.get_doc("User Module Permission", frappe_name)
        else:
            doc = frappe.new_doc("User Module Permission")
            doc.user = frappe_name

        # Load + migrate the existing blob to per-company form.
        try:
            blob = json.loads(doc.permissions_json) if getattr(doc, "permissions_json", None) else {}
        except Exception:
            blob = {}
        if not _is_per_company_blob(blob):
            legacy_flat = {k: False for k, v in blob.items() if v is False}
            # Seed every currently-granted company with the legacy denials so
            # nothing silently loosens during migration.
            blob = {c: dict(legacy_flat) for c in allowed_companies(frappe_name)} if legacy_flat else {}

        before = dict(blob.get(company, {}))
        blob[company] = {k: False for k in sorted(denied)}
        doc.permissions_json = json.dumps(blob)
        doc.save(ignore_permissions=True)

        resolved = {k: (k not in denied) for k in _all_keys()}
        _log_access(email, f"module_perms::{company}", company, before, blob[company])

        # ── 2. Sync ERPNext roles from the UNION across companies (non-fatal) ─
        try:
            union_allowed = {}
            for c, sub in (blob.items() if _is_per_company_blob(blob) else {}):
                for k in _all_keys():
                    union_allowed[k] = union_allowed.get(k, False) or (k not in sub)
            valid_roles = {r.name for r in frappe.get_all("Role", fields=["name"])}
            _sync_user_roles(frappe_name, union_allowed or resolved, valid_roles)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Role Sync Failed (non-fatal)")

        frappe.db.commit()
        return {"success": True, "email": email, "company": company, "permissions": resolved}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Permission Update Failed")
        return {"success": False, "error": str(e)}


# ── Company access grants (POSITIVE allowlist — deny-by-default) ──────────────

def _log_access(target_user, action, company, before, after):
    """Append an immutable audit row for a grant/permission change."""
    try:
        frappe.get_doc({
            "doctype": "Company Access Log",
            "actor": frappe.session.user,
            "target_user": target_user,
            "action": action,
            "company": company or "",
            "before": json.dumps(before, default=str),
            "after": json.dumps(after, default=str),
            "at": frappe.utils.now_datetime(),
        }).insert(ignore_permissions=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Company Access Log insert failed")


@frappe.whitelist()
def get_user_company_access(email: str):
    """The companies a user is granted, with access level + default flag.
    Readable by admins (also drives the access grid)."""
    frappe.has_permission("User", ptype="read", throw=True)
    rows = frappe.get_all(
        "User Company Access",
        filters={"parent": email, "parenttype": "User"},
        fields=["company", "access_level", "is_default"],
        order_by="idx asc",
    )
    return {"email": email, "rows": rows}


@frappe.whitelist(methods=["POST"])
def update_user_company_access(user: str, rows: str):
    """Rewrite a user's company-access allowlist (Owais only). Positive allowlist,
    deny-by-default: a user sees nothing for a company until it appears here.

    `rows`: JSON list of {company, access_level, is_default}.
    """
    try:
        if not can_grant_access():
            return {"success": False, "error": "You are not permitted to grant company access."}
        if user == _PROTECTED_USER:
            return {"success": False, "error": "The protected admin account's access cannot be modified."}
        if not frappe.db.exists("User", user):
            return {"success": False, "error": f"User '{user}' not found"}

        rows_in = json.loads(rows) if isinstance(rows, str) else (rows or [])
        # Validate every company exists.
        clean = []
        seen = set()
        for r in rows_in:
            co = (r or {}).get("company")
            if not co or co in seen or not frappe.db.exists("Company", co):
                continue
            seen.add(co)
            clean.append({
                "company": co,
                "access_level": r.get("access_level") if r.get("access_level") in ("Admin", "Full", "ReadOnly") else "Full",
                "is_default": 1 if r.get("is_default") else 0,
            })
        # Exactly one default (first row if none flagged).
        if clean and not any(r["is_default"] for r in clean):
            clean[0]["is_default"] = 1

        before = frappe.get_all(
            "User Company Access", filters={"parent": user, "parenttype": "User"},
            fields=["company", "access_level", "is_default"], order_by="idx asc",
        )

        # Rewrite child rows directly (avoid User.save() hooks).
        frappe.db.delete("User Company Access", {"parent": user, "parenttype": "User"})
        for i, r in enumerate(clean, start=1):
            frappe.get_doc({
                "doctype": "User Company Access",
                "parent": user, "parenttype": "User", "parentfield": "ve_company_access",
                "idx": i, "company": r["company"],
                "access_level": r["access_level"], "is_default": r["is_default"],
            }).insert(ignore_permissions=True)

        _log_access(user, "company_access", None, before, clean)
        frappe.db.commit()
        return {"success": True, "user": user, "rows": clean,
                "warning": None if clean else "This user now has NO company access — they can log in but see nothing."}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Company Access Update Failed")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_my_permissions():
    """
    The calling user's resolved permission map over every registry key, FOR THE
    ACTIVE COMPANY (the frontend sends `company` on every request; switching
    companies clears the query cache and refetches, so `can(key)` is naturally
    per-company). Admins/guests get all-true. Also returns the caller's company
    access + tier so the frontend can render the switcher/console correctly.
    """
    user = frappe.session.user
    try:
        company = current_company()
    except Exception:
        company = None
    meta = {
        "active_company": None if company == ALL_COMPANIES else company,
        "companies": allowed_companies(user) if user != "Guest" else [],
        "is_group_owner": is_group_owner(user),
    }
    if user in _ADMIN_USERS or user == "Guest":
        return {"modules": _all_true(), "keys": _all_keys(), **meta}
    return {"modules": _resolve_perms(user, company), "keys": _all_keys(), **meta}


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
