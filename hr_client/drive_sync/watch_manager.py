"""
Drive watch channel registration and renewal.

Google Drive watch channels expire in at most 7 days.
renew_watches() runs daily, re-registers any channel expiring within 24 hours.

Channel state is stored in VE Drive Settings.watch_channel_ids as a JSON list:
  [{"folder_id": "...", "channel_id": "...", "resource_id": "...", "expiration": <ms timestamp>}, ...]
"""
import json
import uuid
import frappe
from frappe.utils import now_datetime

from hr_client.drive_sync.utils import get_drive_service

# Top-level folder names under root (used to discover folder IDs dynamically)
_TOP_FOLDERS = ["01_Sales", "02_Purchase", "03_Accounts", "04_HR_Payroll", "05_Logistics"]

# Renew channels expiring within this many milliseconds (24 hours)
_RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000


def register_watch(folder_id: str, service=None) -> dict:
    """
    Register a push notification watch for a given folder_id.
    Stores the channel info in VE Drive Settings.watch_channel_ids.
    Returns the channel dict.
    """
    if service is None:
        service = get_drive_service()

    webhook_url = _get_webhook_url()
    channel_token = frappe.conf.get("ve_drive_channel_token", "")
    channel_id = str(uuid.uuid4())

    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": webhook_url,
    }
    if channel_token:
        body["token"] = channel_token

    try:
        resp = service.files().watch(
            fileId=folder_id,
            body=body,
            supportsAllDrives=True,
        ).execute()
    except Exception as e:
        frappe.log_error(str(e), f"VE Drive register_watch: folder {folder_id}")
        return {}

    channel = {
        "folder_id": folder_id,
        "channel_id": resp.get("id"),
        "resource_id": resp.get("resourceId"),
        "expiration": int(resp.get("expiration", 0)),
    }

    _save_channel(channel)
    return channel


def renew_watches():
    """
    Check all stored watch channels and re-register any expiring within 24 hours.
    Called daily by the scheduler.
    """
    service = get_drive_service()
    channels = _load_channels()
    now_ms = _now_ms()
    renewed = 0

    for ch in channels:
        if ch.get("expiration", 0) - now_ms < _RENEW_THRESHOLD_MS:
            # Stop old channel first (best-effort)
            _stop_channel(service, ch)
            # Re-register
            new_ch = register_watch(ch["folder_id"], service=service)
            if new_ch:
                renewed += 1

    frappe.logger().info(f"VE Drive renew_watches: renewed {renewed} channels")
    return {"renewed": renewed}


def register_top_folder_watches():
    """
    Register watches for all 5 top-level folders under root.
    Discovers folder IDs dynamically from Drive.
    Call once after configuring VE Drive Settings.root_folder_id.
    """
    settings = frappe.get_single("VE Drive Settings")
    root_folder_id = settings.root_folder_id
    if not root_folder_id:
        frappe.throw("VE Drive Settings.root_folder_id is not configured.")

    service = get_drive_service()

    # List immediate children of root to find top-level folders
    resp = service.files().list(
        q=f"'{root_folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields="files(id,name)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    top_folders = {f["name"]: f["id"] for f in resp.get("files", [])}
    registered = []

    for name in _TOP_FOLDERS:
        folder_id = top_folders.get(name)
        if folder_id:
            ch = register_watch(folder_id, service=service)
            if ch:
                registered.append({"name": name, "folder_id": folder_id})

    frappe.logger().info(f"VE Drive register_top_folder_watches: {registered}")
    return {"registered": registered}


def _load_channels() -> list:
    raw = frappe.db.get_single_value("VE Drive Settings", "watch_channel_ids") or "[]"
    try:
        return json.loads(raw)
    except Exception:
        return []


def _save_channel(new_channel: dict):
    """Append or update a channel in VE Drive Settings."""
    channels = _load_channels()
    channels = [c for c in channels if c.get("folder_id") != new_channel["folder_id"]]
    channels.append(new_channel)
    frappe.db.set_value("VE Drive Settings", None, "watch_channel_ids", json.dumps(channels))
    frappe.db.commit()


def _stop_channel(service, channel: dict):
    """Tell Drive API to stop an old channel (best-effort, ignore errors)."""
    try:
        service.channels().stop(body={
            "id": channel.get("channel_id"),
            "resourceId": channel.get("resource_id"),
        }).execute()
    except Exception:
        pass


def _now_ms() -> int:
    """Current UTC time in milliseconds (format Drive uses for expiration)."""
    from datetime import datetime, timezone
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _get_webhook_url() -> str:
    """Build the public webhook URL for this Frappe site."""
    site_name = frappe.conf.get("host_name") or f"https://{frappe.local.site}"
    return f"{site_name.rstrip('/')}/api/method/hr_client.drive_sync.webhook.on_drive_change"
