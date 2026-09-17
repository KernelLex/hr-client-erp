import datetime
import functools
import frappe


# ── Role tiers (Phase 0 — multi-company) ─────────────────────────────────────
# Membership-based, NEVER role-based. `require_admin()` still passes on the
# System Manager role for back-compat, BUT grant rights and the __ALL__ group
# view must gate on is_group_owner() only — otherwise any System Manager could
# grant themselves another company's books.
GROUP_OWNER    = frozenset({"owais@veraenterprises.in"})   # + "Administrator" break-glass
PLATFORM_ADMIN = frozenset({"amoghspace@gmail.com"})       # developer: all companies, no grants

# Back-compat admin set (union). Existing code imports ADMIN_USERS / OWAIS_USERS.
ADMIN_USERS  = frozenset({"Administrator"}) | GROUP_OWNER | PLATFORM_ADMIN
OWAIS_USERS  = ADMIN_USERS   # alias kept for the legacy approval flows
COMPANY_NAME = "Vera Enterprises"


def _u(user=None) -> str:
    return user or frappe.session.user


def is_group_owner(user=None) -> bool:
    """Group owner = Owais (+ Administrator break-glass). Membership only."""
    u = _u(user)
    return u == "Administrator" or u in GROUP_OWNER


def is_platform_admin(user=None) -> bool:
    """Developer tier: sees all companies, but cannot grant access."""
    return _u(user) in PLATFORM_ADMIN


def can_grant_access(user=None) -> bool:
    """Group owner or platform admin may grant/revoke company access.
    (Owner's decision 2026-09-16: Amogh/platform-admin manages company membership too.)"""
    return is_group_owner(user) or is_platform_admin(user)


def require_login():
    """Raise PermissionError if the current user is a Guest (not logged in)."""
    if frappe.session.user == "Guest":
        frappe.throw("Authentication required", frappe.PermissionError)


def require_admin():
    """Raise PermissionError if the current user is not a System Manager / admin."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)
    if user not in ADMIN_USERS and "System Manager" not in frappe.get_roles(user):
        frappe.throw("Not permitted", frappe.PermissionError)


# ── Multi-company scoping kernel (Phase 0) ───────────────────────────────────
# Every endpoint touching per-company (siloed) data resolves + validates a
# company here. Records shared across companies are exempt via GLOBAL_DOCTYPES.
ALL_COMPANIES = "__ALL__"   # group-console sentinel; group owner only

GLOBAL_DOCTYPES = frozenset({
    "User", "Role", "Has Role", "ToDo",
    "Vera Chat Room", "Vera Chat Message", "Vera Chat Room Member",
    "UOM", "Item", "Item Group", "Company",
    "User Company Access", "Company Access Log",
})


def allowed_companies(user=None) -> list:
    """Companies the user may access. Owner / platform-admin implicitly get
    every Company that exists; everyone else gets their ve_company_access rows."""
    u = _u(user)
    if is_group_owner(u) or is_platform_admin(u):
        return frappe.get_all("Company", pluck="name")
    rows = frappe.get_all(
        "User Company Access",
        filters={"parent": u, "parenttype": "User"},
        fields=["company"], pluck="company",
    )
    return list(dict.fromkeys(rows))   # dedupe, preserve order


def require_company(company) -> str:
    """Validate the user may act within `company`. Raises PermissionError if not.
    __ALL__ is permitted only for the group owner."""
    user = frappe.session.user
    if company == ALL_COMPANIES:
        if is_group_owner(user):
            return company
        frappe.throw("Not permitted", frappe.PermissionError)
    if company in allowed_companies(user):
        return company
    frappe.throw("Not permitted for this company", frappe.PermissionError)


def current_company() -> str:
    """Resolve the active company for this request, always validated.
    Precedence: form_dict → session → user default → is_default row → first allowed."""
    user = frappe.session.user

    c = frappe.form_dict.get("company")
    if c:
        return require_company(c)

    sess = getattr(frappe.local, "session", None)
    c = (getattr(sess, "data", None) or {}).get("active_company") if sess else None
    if c:
        try:
            return require_company(c)
        except frappe.PermissionError:
            pass

    c = frappe.defaults.get_user_default("active_company")
    if c:
        try:
            return require_company(c)
        except frappe.PermissionError:
            pass

    allowed = allowed_companies(user)
    row = frappe.get_all(
        "User Company Access",
        filters={"parent": user, "parenttype": "User", "is_default": 1},
        fields=["company"], limit=1,
    )
    if row and row[0].company in allowed:
        return row[0].company

    if allowed:
        return allowed[0]
    frappe.throw("No company access", frappe.PermissionError)


def scoped(filters: dict, company: str = None) -> dict:
    """Add a company filter to a frappe.get_all filters dict (no-op for __ALL__)."""
    company = require_company(company or current_company())
    filters = dict(filters or {})
    if company != ALL_COMPANIES:
        filters["company"] = company
    return filters


def company_sql(company: str = None, alias: str = "") -> str:
    """SQL fragment ' AND `alias`.company = %(company)s ' (empty for __ALL__).
    Always pass the resolved company into the query params as {"company": company}."""
    company = require_company(company or current_company())
    if company == ALL_COMPANIES:
        return ""
    prefix = f"`{alias}`." if alias else ""
    return f" AND {prefix}company = %(company)s "


def company_scoped(fn):
    """Decorator: resolve + validate the company, inject it as kwarg `company`."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        c = kwargs.get("company") or frappe.form_dict.get("company")
        kwargs["company"] = require_company(c) if c else current_company()
        return fn(*args, **kwargs)
    return wrapper


def assert_doc_company(doc_or_company):
    """Guard a fetched document: raise PermissionError if its company is not one
    the caller may access. Accepts a Document (reads `.company`) or a company str.
    No-op when the value is empty (legacy/unscoped rows)."""
    c = getattr(doc_or_company, "company", doc_or_company)
    if c:
        require_company(c)
    return c


# ── Financial year helpers ───────────────────────────────────────────────────

def current_fy() -> tuple[str, str, str]:
    """Return (start_date, end_date_exclusive, label) for the current Indian FY.

    Example on 2026-06-30 → ('2026-04-01', '2027-04-01', '2026-27')
    """
    today = datetime.date.today()
    start_year = today.year if today.month >= 4 else today.year - 1
    return (
        f"{start_year}-04-01",
        f"{start_year + 1}-04-01",
        f"{start_year}-{str(start_year + 1)[2:]}",
    )


def current_fy_label() -> str:
    """e.g. '2026-27' — use in display strings instead of hardcoding."""
    return current_fy()[2]


def prev_fy_label() -> str:
    """e.g. '2025-26' — previous FY label."""
    today = datetime.date.today()
    start_year = (today.year if today.month >= 4 else today.year - 1) - 1
    return f"{start_year}-{str(start_year + 1)[2:]}"


def current_fy_start() -> str:
    """e.g. '2026-04-01' — start of current FY."""
    return current_fy()[0]


def handle_api_error(fn):
    """
    Wraps a whitelisted endpoint to catch unhandled exceptions and return
    clean JSON instead of raw Python tracebacks. Logs the real error via
    frappe.log_error so nothing is silently swallowed.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except frappe.ValidationError as e:
            frappe.clear_messages()
            frappe.response["http_status_code"] = 400
            return {"success": False, "error": str(e)}
        except frappe.PermissionError as e:
            frappe.clear_messages()
            frappe.response["http_status_code"] = 403
            return {"success": False, "error": str(e) or "Permission denied"}
        except frappe.DoesNotExistError as e:
            frappe.clear_messages()
            frappe.response["http_status_code"] = 404
            return {"success": False, "error": str(e) or "Not found"}
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"{fn.__module__}.{fn.__name__}")
            frappe.clear_messages()
            frappe.response["http_status_code"] = 500
            return {"success": False, "error": "An unexpected error occurred"}
    return wrapper
