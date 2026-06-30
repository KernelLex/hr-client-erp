import datetime
import functools
import frappe


# ── Shared admin sets ────────────────────────────────────────────────────────
# Single source of truth. Import from here instead of redefining per file.
ADMIN_USERS  = {"Administrator", "owais@veraenterprises.in"}
OWAIS_USERS  = ADMIN_USERS   # same set; alias for clarity in approval flows
COMPANY_NAME = "Vera Enterprises"


def require_admin():
    """Raise PermissionError if the current user is not a System Manager / admin."""
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)
    if user not in ADMIN_USERS and "System Manager" not in frappe.get_roles(user):
        frappe.throw("Not permitted", frappe.PermissionError)


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
