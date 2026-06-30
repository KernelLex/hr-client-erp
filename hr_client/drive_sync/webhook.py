"""
Drive push notification receiver.

Endpoint: /api/method/hr_client.drive_sync.webhook.on_drive_change
Register this URL when setting up watch channels (watch_manager.py).

Security: Google sends X-Goog-Channel-Token header with the secret token
we supplied at watch creation time. We validate it against site_config
ve_drive_channel_token before enqueuing work.
"""
import frappe


@frappe.whitelist(allow_guest=True)
def on_drive_change():
    """
    Receives push notifications from Google Drive.
    Ignores the 'sync' handshake ping.
    On any real change, enqueues run_delta_sync via the short queue.
    """
    headers = frappe.request.headers

    # Validate channel token — fail closed: reject if token not configured or mismatches
    expected_token = frappe.conf.get("ve_drive_channel_token")
    if not expected_token:
        frappe.log_error("ve_drive_channel_token not set in site_config — rejecting webhook", "DriveWebhook")
        frappe.response.http_status_code = 403
        return
    received_token = headers.get("X-Goog-Channel-Token", "")
    if received_token != expected_token:
        frappe.response.http_status_code = 403
        return

    resource_state = headers.get("X-Goog-Resource-State", "")

    # 'sync' is a handshake ping — acknowledge and do nothing
    if resource_state == "sync":
        frappe.response.http_status_code = 200
        return

    # Any other state (change, add, remove, update, trash) → trigger delta sync
    frappe.enqueue(
        "hr_client.drive_sync.delta_sync.run_delta_sync",
        queue="short",
        is_async=True,
        job_id="ve_drive_delta_sync",
        deduplicate=True,
    )

    frappe.response.http_status_code = 200
