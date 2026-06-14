import functools
import frappe


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
