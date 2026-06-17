import frappe
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def get_drive_service():
    """Build an authorized Drive v3 client from site_config ve_drive_service_account."""
    creds_info = frappe.conf.get("ve_drive_service_account")
    if not creds_info:
        frappe.throw(
            "ve_drive_service_account not set in site_config.json. "
            "Set it to the path of the service account JSON key file or the JSON dict itself."
        )

    if isinstance(creds_info, str):
        creds = service_account.Credentials.from_service_account_file(
            creds_info, scopes=SCOPES
        )
    else:
        creds = service_account.Credentials.from_service_account_info(
            creds_info, scopes=SCOPES
        )

    return build("drive", "v3", credentials=creds, cache_discovery=False)


def resolve_folder_path(service, folder_id, _cache=None):
    """
    Walk up parent chain to build human-readable path like '01_Sales/03_Sales_Invoices'.
    _cache is a dict shared across one sync run to avoid redundant API calls.
    Returns just the folder name when no parent exists (root).
    """
    if _cache is None:
        _cache = {}

    if folder_id in _cache:
        return _cache[folder_id]

    try:
        meta = service.files().get(
            fileId=folder_id,
            fields="name,parents",
            supportsAllDrives=True,
        ).execute()
    except Exception:
        _cache[folder_id] = ""
        return ""

    name = meta.get("name", "")
    parents = meta.get("parents", [])

    if not parents:
        # Root folder — return just the name so we don't include Drive root in paths
        _cache[folder_id] = name
        return name

    parent_path = resolve_folder_path(service, parents[0], _cache)

    # Stop building path once we reach the root folder (one level below My Drive root)
    root_folder_id = frappe.db.get_single_value("VE Drive Settings", "root_folder_id")
    if parents[0] == root_folder_id or not parent_path:
        path = name
    else:
        path = f"{parent_path}/{name}"

    _cache[folder_id] = path
    return path
