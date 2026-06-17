"""
Full sync: BFS walk from root folder, upsert all files into VE Drive File.
Run once as a backfill:
  bench --site hr.veraenterprises.in execute hr_client.drive_sync.full_sync.run_full_sync
"""
import frappe
from frappe.utils import now_datetime

from hr_client.drive_sync.utils import get_drive_service, resolve_folder_path
from hr_client.drive_sync.parser import parse_filename, folder_path_to_module

_FIELDS = "id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,parents,trashed"
_PAGE_SIZE = 1000


def run_full_sync():
    """Walk the entire Drive tree from root and upsert every non-trashed file."""
    settings = frappe.get_single("VE Drive Settings")
    root_folder_id = settings.root_folder_id
    if not root_folder_id:
        frappe.throw("VE Drive Settings.root_folder_id is not configured.")

    service = get_drive_service()
    path_cache = {}

    total = 0
    upserted = 0
    errors = 0

    # BFS: start from root folder, discover subfolders as we go
    folder_queue = [root_folder_id]
    visited_folders = set()

    while folder_queue:
        folder_id = folder_queue.pop(0)
        if folder_id in visited_folders:
            continue
        visited_folders.add(folder_id)

        # List everything inside this folder
        page_token = None
        while True:
            params = {
                "q": f"'{folder_id}' in parents and trashed = false",
                "fields": f"nextPageToken, files({_FIELDS})",
                "pageSize": _PAGE_SIZE,
                "supportsAllDrives": True,
                "includeItemsFromAllDrives": True,
            }
            if page_token:
                params["pageToken"] = page_token

            try:
                resp = service.files().list(**params).execute()
            except Exception as e:
                frappe.log_error(str(e), "VE Drive full_sync: files().list error")
                break

            for item in resp.get("files", []):
                mime = item.get("mimeType", "")
                if mime == "application/vnd.google-apps.folder":
                    folder_queue.append(item["id"])
                    continue

                total += 1
                try:
                    _upsert_file(service, item, path_cache)
                    upserted += 1
                except Exception as e:
                    errors += 1
                    frappe.log_error(str(e), f"VE Drive full_sync: upsert {item.get('id')}")

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    frappe.db.commit()
    result = {"total": total, "upserted": upserted, "errors": errors}
    frappe.logger().info(f"VE Drive full_sync complete: {result}")
    return result


def _upsert_file(service, item, path_cache):
    """Insert or update a single VE Drive File record."""
    file_id = item["id"]
    file_name = item.get("name", "")
    parents = item.get("parents", [])

    folder_path = ""
    if parents:
        folder_path = resolve_folder_path(service, parents[0], path_cache)

    parsed = parse_filename(file_name)
    module = folder_path_to_module(folder_path)
    if module == "Unknown" and parsed.get("module"):
        module = parsed["module"]

    now = now_datetime()
    data = {
        "drive_file_id": file_id,
        "file_name": file_name,
        "folder_path": folder_path,
        "module": module,
        "doc_type": parsed.get("doc_type") or "",
        "party_name": parsed.get("party") or "",
        "direction": parsed.get("direction", "Unknown"),
        "mime_type": item.get("mimeType", ""),
        "drive_modified_time": _parse_drive_dt(item.get("modifiedTime")),
        "web_view_link": item.get("webViewLink", ""),
        "thumbnail_link": item.get("thumbnailLink", ""),
        "sync_status": "Synced",
        "last_synced": now,
        "naming_valid": 1 if parsed.get("naming_valid") else 0,
    }
    if parsed.get("date"):
        data["doc_date"] = parsed["date"]

    existing = frappe.db.get_value("VE Drive File", {"drive_file_id": file_id}, "name")
    if existing:
        frappe.db.set_value("VE Drive File", existing, data)
    else:
        doc = frappe.get_doc({"doctype": "VE Drive File", **data})
        doc.insert(ignore_permissions=True)


def _parse_drive_dt(dt_str):
    """Convert Drive's RFC3339 datetime string to Frappe datetime string."""
    if not dt_str:
        return None
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None
