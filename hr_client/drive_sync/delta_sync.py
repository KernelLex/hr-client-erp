"""
Delta sync: calls changes.list with stored pageToken to find only what changed.
Scheduled every 10 minutes (cron). Also triggered by webhook.

On first run with no saved token: initialises the token and exits cleanly.
Full sync must be run separately to backfill existing files.
"""
import frappe
from frappe.utils import now_datetime

from hr_client.drive_sync.utils import get_drive_service, resolve_folder_path
from hr_client.drive_sync.parser import parse_filename, folder_path_to_module

_FILE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,parents,trashed"


def run_delta_sync():
    """
    Fetch changes since last saved pageToken, upsert/delete affected VE Drive File records.
    Saves the new pageToken back to VE Drive Settings after processing.
    """
    settings = frappe.get_single("VE Drive Settings")
    service = get_drive_service()

    page_token = settings.page_token

    if not page_token:
        # First run — initialise token only, do not backfill
        resp = service.changes().getStartPageToken().execute()
        new_token = resp.get("startPageToken")
        frappe.db.set_value("VE Drive Settings", None, "page_token", new_token)
        frappe.db.commit()
        frappe.logger().info("VE Drive delta_sync: initialised page_token, run full_sync to backfill.")
        return {"status": "initialised", "page_token": new_token}

    path_cache = {}
    upserted = 0
    deleted = 0
    errors = 0
    new_token = page_token

    while page_token:
        try:
            resp = service.changes().list(
                pageToken=page_token,
                fields="nextPageToken,newStartPageToken,changes(removed,fileId,file(" + _FILE_FIELDS + "))",
                pageSize=1000,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
            ).execute()
        except Exception as e:
            frappe.log_error(str(e), "VE Drive delta_sync: changes().list error")
            break

        for change in resp.get("changes", []):
            file_id = change.get("fileId")
            if not file_id:
                continue

            if change.get("removed"):
                _handle_deleted(file_id)
                deleted += 1
                continue

            file_data = change.get("file", {})
            if file_data.get("trashed"):
                _handle_deleted(file_id)
                deleted += 1
                continue

            try:
                _upsert_file(service, file_data, path_cache)
                upserted += 1
            except Exception as e:
                errors += 1
                frappe.log_error(str(e), f"VE Drive delta_sync: upsert {file_id}")

        new_token = resp.get("newStartPageToken") or new_token
        page_token = resp.get("nextPageToken")

    frappe.db.set_value("VE Drive Settings", None, "page_token", new_token)
    frappe.db.commit()

    result = {"upserted": upserted, "deleted": deleted, "errors": errors}
    frappe.logger().info(f"VE Drive delta_sync complete: {result}")
    return result


def _handle_deleted(file_id):
    """Mark the VE Drive File as deleted (soft delete by setting sync_status=Error) or remove it."""
    existing = frappe.db.get_value("VE Drive File", {"drive_file_id": file_id}, "name")
    if existing:
        frappe.db.delete("VE Drive File", {"name": existing})


def _upsert_file(service, item, path_cache):
    file_id = item.get("id")
    if not file_id:
        return

    # Skip folders
    mime = item.get("mimeType", "")
    if mime == "application/vnd.google-apps.folder":
        return

    file_name = item.get("name", "")
    parents = item.get("parents", [])

    folder_path = ""
    if parents:
        folder_path = resolve_folder_path(service, parents[0], path_cache)

    parsed = parse_filename(file_name)
    module = folder_path_to_module(folder_path)

    now = now_datetime()
    data = {
        "drive_file_id": file_id,
        "file_name": file_name,
        "folder_path": folder_path,
        "module": module,
        "doc_type": parsed.get("doc_type") or "",
        "party_name": parsed.get("party") or "",
        "direction": parsed.get("direction", "Unknown"),
        "mime_type": mime,
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
    if not dt_str:
        return None
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None
