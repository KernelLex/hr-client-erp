"""Multi-company endpoints + request-lifecycle hooks (Phase 0).

- get_login_companies : PUBLIC picker feed — leaks nothing but branding.
- get_my_companies    : the caller's granted companies + active one + tier.
- set_active_company  : switch the active company for the session.
- resolve             : before_request hook (runs AFTER twofa.enforce).
- on_login            : on_session_creation hook (wired in Phase 3).
"""

import frappe

from hr_client.api.utils import (
    ALL_COMPANIES,
    allowed_companies,
    current_company,
    handle_api_error,
    is_group_owner,
    is_platform_admin,
    require_company,
    require_login,
    can_grant_access,
)


def _accent(row) -> str:
    return row.get("ve_accent_hex") or "#4F46E5"


# ── Phase 6 — provisioning ────────────────────────────────────────────────────

# The 5 universal pricing-method formulas (mirror quotation_masters._STANDARD_PRICING).
_STANDARD_PRICING = [
    {"code": "RFT", "method": "RFT", "formula": "width ÷ 304.8 × qty", "uom": "RFT"},
    {"code": "SFT", "method": "SFT", "formula": "width × height ÷ 92,903.04 × qty", "uom": "SFT"},
    {"code": "SQM", "method": "SQM", "formula": "width × height ÷ 1,000,000 × qty", "uom": "SQM"},
    {"code": "UNIT", "method": "UNIT", "formula": "qty", "uom": "Nos"},
    {"code": "LS", "method": "LS", "formula": "1", "uom": "Lot"},
]

# Custom quotation/terms masters to mirror from the source company. Each is
# code-keyed (autoname field:code), so cloned rows are company-prefixed to avoid
# cross-company name collisions.
_MASTER_CLONE = {
    "Vera Quotation Unit": "code",
    "Vera Quotation Material": "code",
    "Vera Quotation Finish": "code",
    "Vera Quotation Hardware": "code",
    "Vera Quotation Template": "code",
    "Vera Terms Clause": "code",
    "Vera Terms Template": "code",
}


def _seed_pricing_methods(company: str, abbr: str):
    for row in _STANDARD_PRICING:
        code = f"{abbr}-{row['code']}"      # autoname is field:code → name == code
        if frappe.db.exists("Vera Quotation Pricing Method", code):
            continue
        doc = frappe.new_doc("Vera Quotation Pricing Method")
        doc.update(row)
        doc.code = code                     # company-prefixed, so no cross-company collision
        doc.method = row["method"]          # formula key stays universal (RFT/SFT/…)
        doc.status = "Active"
        doc.company = company
        doc.insert(ignore_permissions=True)


def _clone_masters(source: str, company: str, abbr: str):
    """Mirror the source company's custom quotation/terms masters into `company`
    with company-prefixed codes. Idempotent (skips codes already present)."""
    for dt, code_field in _MASTER_CLONE.items():
        if not frappe.db.exists("DocType", dt):
            continue
        rows = frappe.get_all(dt, filters={"company": source}, fields=["name"], limit_page_length=0)
        for r in rows:
            src = frappe.get_doc(dt, r.name)
            new_code = f"{abbr}-{getattr(src, code_field, src.name)}"
            if frappe.db.exists(dt, new_code):
                continue
            clone = frappe.copy_doc(src)
            clone.company = company
            setattr(clone, code_field, new_code)   # autoname field:code → name == new_code
            try:
                clone.insert(ignore_permissions=True)
            except Exception:
                frappe.log_error(frappe.get_traceback(), f"provision clone {dt}")


def _ensure_related_party_accounts(company: str, abbr: str):
    """Create the inter-company receivable/payable accounts Phase 7 needs, if the
    company's COA doesn't already carry them. Best-effort, non-fatal."""
    pairs = [
        ("Due from Related Party", "Asset", "Receivable"),
        ("Due to Related Party", "Liability", "Payable"),
    ]
    for acc_name, root, acc_type in pairs:
        full = f"{acc_name} - {abbr}"
        if frappe.db.exists("Account", full):
            continue
        # Parent = the company's root of the right type.
        parent = frappe.db.get_value(
            "Account",
            {"company": company, "root_type": root, "is_group": 1, "parent_account": ["in", ["", None]]},
            "name",
        ) or frappe.db.get_value("Account", {"company": company, "root_type": root, "is_group": 1}, "name")
        if not parent:
            continue
        try:
            frappe.get_doc({
                "doctype": "Account", "account_name": acc_name, "company": company,
                "parent_account": parent, "root_type": root, "account_type": acc_type,
                "is_group": 0,
            }).insert(ignore_permissions=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"provision account {full}")


def provision_company(name: str, abbr: str = None, source_company: str = "Vera Enterprises",
                      enable_login: int = 1):
    """Idempotent structural provisioning for a company (Phase 6).

    ERPNext already creates the Chart of Accounts, cost centres and warehouses
    when the Company record is inserted, so this focuses on the app's own
    per-company reference data: pricing-method formulas, cloned quotation/terms
    masters (company-prefixed codes), the inter-company related-party accounts
    (Phase 7), the Company custom fields, and the login flag. Does NOT create any
    transactional data (vouchers/ledgers/quotations/CRM/employees) or Items
    (Items stay a shared global namespace — per-company pricing lives in Item Price).

    Callable via bench execute:
      bench --site vera.local execute hr_client.api.company.provision_company \
        --kwargs "{'name':'Schones Leben','abbr':'SL'}"
    """
    if not frappe.db.exists("Company", name):
        frappe.throw(f"Company '{name}' does not exist — create it first.")
    abbr = abbr or (frappe.db.get_value("Company", name, "abbr") or name[:4])

    # 1. Company custom fields (accent set in Phase 4; don't clobber it).
    updates = {
        "ve_tally_upload_path": f"/home/vera/tally_uploads/{abbr}/",
    }
    if not frappe.db.get_value("Company", name, "ve_short_label"):
        updates["ve_short_label"] = name
    if not frappe.db.get_value("Company", name, "ve_tally_company_name"):
        # Placeholder = uppercase name; OWNER MUST confirm the exact
        # <SVCURRENTCOMPANY> string before the 6A import (content-verify rejects a
        # mismatch, so a wrong value fails safe rather than cross-contaminating).
        updates["ve_tally_company_name"] = name.upper()
    frappe.db.set_value("Company", name, updates)

    # 2. App reference data.
    _seed_pricing_methods(name, abbr)
    _clone_masters(source_company, name, abbr)
    _ensure_related_party_accounts(name, abbr)

    # 3. Flip login last, once structure exists.
    if enable_login:
        frappe.db.set_value("Company", name, "ve_login_enabled", 1)

    frappe.db.commit()
    return {
        "success": True,
        "company": name,
        "abbr": abbr,
        "pricing_methods": frappe.db.count("Vera Quotation Pricing Method", {"company": name}),
        "login_enabled": frappe.db.get_value("Company", name, "ve_login_enabled"),
        "tally_company_name": frappe.db.get_value("Company", name, "ve_tally_company_name"),
    }


@frappe.whitelist()
@handle_api_error
def group_summary(start=None, end=None):
    """Group-console consolidated summary (group owner only). Thin whitelisted
    wrapper over finance_core.group_summary (which enforces the __ALL__ scope)."""
    require_login()
    from hr_client.api import finance_core
    return finance_core.group_summary(start=start, end=end)


@frappe.whitelist()
@handle_api_error
def provision_company_api(name, abbr=None, source_company="Vera Enterprises"):
    """Owner-only whitelisted wrapper around provision_company."""
    if not can_grant_access():
        frappe.throw("Only the group owner may provision a company.", frappe.PermissionError)
    return provision_company(name, abbr=abbr, source_company=source_company)


def _label(row) -> str:
    return row.get("ve_short_label") or row.get("name")


@frappe.whitelist(allow_guest=True)
@handle_api_error
def get_login_companies():
    """PUBLIC. Only companies flagged ve_login_enabled=1, and ONLY branding
    fields — no counts, no users, no financials. Shown on the pre-login picker."""
    rows = frappe.get_all(
        "Company",
        filters={"ve_login_enabled": 1},
        fields=["name", "abbr", "ve_short_label", "ve_accent_hex"],
        order_by="name asc",
    )
    return {
        "success": True,
        "companies": [
            {"name": r.name, "abbr": r.abbr, "label": _label(r), "accent": _accent(r)}
            for r in rows
        ],
    }


@frappe.whitelist()
@handle_api_error
def get_my_companies():
    """The caller's granted companies + the currently active one + their tier."""
    require_login()
    user = frappe.session.user
    names = allowed_companies(user)
    rows = frappe.get_all(
        "Company",
        filters={"name": ["in", names]} if names else {"name": ["in", []]},
        fields=["name", "abbr", "ve_short_label", "ve_accent_hex", "ve_login_enabled"],
        order_by="name asc",
    )
    active = current_company() if names else None
    return {
        "success": True,
        "active_company": active,
        "is_group_owner": is_group_owner(user),
        "is_platform_admin": is_platform_admin(user),
        "companies": [
            {
                "name": r.name,
                "abbr": r.abbr,
                "label": _label(r),
                "accent": _accent(r),
                "login_enabled": bool(r.ve_login_enabled),
            }
            for r in rows
        ],
    }


@frappe.whitelist()
@handle_api_error
def set_active_company(company):
    """Switch the active company for this session (validated against access)."""
    require_login()
    company = require_company(company)
    _stash_active_company(company)
    frappe.defaults.set_user_default("active_company", company)
    return {"success": True, "active_company": company}


def _stash_active_company(company):
    sess = getattr(frappe.local, "session", None)
    if sess is not None and getattr(sess, "data", None) is not None:
        sess.data["active_company"] = company


# ── Request lifecycle ────────────────────────────────────────────────────────

def resolve():
    """before_request hook (AFTER twofa.enforce). Warms the session's active
    company from a valid ?company= param. Never throws — endpoints re-validate
    via require_company(), so an invalid param must not 403 unrelated requests."""
    try:
        user = getattr(frappe.session, "user", None)
        if not user or user == "Guest":
            return
        c = frappe.form_dict.get("company")
        if not c or c == ALL_COMPANIES:
            return
        _stash_active_company(require_company(c))
    except frappe.PermissionError:
        pass
    except Exception:
        pass


def on_login(login_manager=None):
    """on_session_creation hook (activated in Phase 3). Binds the company chosen
    on the login screen to the new session, or rejects with a GENERIC message
    (indistinguishable from a wrong password) if the user has no access to it."""
    user = frappe.session.user
    if user == "Guest":
        return
    company = frappe.form_dict.get("company")
    if not company:
        return  # single standard login with no picker — leave resolution to defaults
    if company not in allowed_companies(user):
        # Generic failure: never reveal which staff belong to which company.
        try:
            if login_manager:
                login_manager.logout()
        finally:
            frappe.local.response = frappe._dict()
            frappe.throw("Invalid login credentials", frappe.AuthenticationError)
    _stash_active_company(company)
    frappe.defaults.set_user_default("active_company", company)
