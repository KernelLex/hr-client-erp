"""Porter (porter.in) on-demand logistics — ADAPTER SCAFFOLD.

Status: NOT yet active. Every call is a no-op that returns
`{"configured": False, ...}` until a Porter API key is provisioned and the exact
partner contract is confirmed. Nothing here makes a live network call yet.

── What Porter is (research, 2026-10) ───────────────────────────────────────────
Porter is an Indian intra-city goods-logistics provider (2-wheelers, 3-wheelers,
trucks). "Porter for Enterprise / API" lets a business create delivery orders
from its own system, get live tracking, and receive webhook status updates
(currently 2-wheeler on the API; larger vehicles rolling out).

── Expected contract (TO BE CONFIRMED against the partner docs shipped WITH the key)
Auth:    HTTP header  `x-api-key: <key>`  on every request.
Base:    UAT  https://pfe-apigw-uat.porter.in
         PROD https://pfe-apigw.porter.in
Likely endpoints (names/shapes must be confirmed with Porter's partner docs):
  POST /v1/get_quote
       -> body: pickup {lat,lng}, drop {lat,lng}, customer, vehicle type
       -> returns: fare estimate + ETA per vehicle
  POST /v1/orders/create
       -> body: request_id, pickup_details, drop_details, customer {name, mobile},
                delivery_instructions, (optional) quote/vehicle
       -> returns: order_id, (sometimes) tracking url, status
  GET  /v1/orders/{order_id}
       -> returns: status, partner/driver info {name, phone, vehicle}, live location,
                   timestamps for each state transition
  POST /v1/orders/{order_id}/cancel
Webhook: Porter POSTs status transitions to a URL we register
         (created -> allocated/driver assigned -> arrived at pickup -> picked up
          -> in transit -> arrived at drop -> delivered | cancelled).

── Config (set ONLY in site_config.json, never in code/git) ─────────────────────
  porter_api_key        : the partner API key (provided by the user)
  porter_env            : "uat" | "prod"  (default "uat")
  porter_webhook_secret : optional shared secret to verify inbound webhooks

When the key arrives: fill in `_request()` + the TODOs, confirm field names
against the partner docs, store order_id/status/tracking on the Vera Delivery,
and register the webhook URL `/api/method/hr_client.api.porter.porter_webhook`.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

DELIVERY = "Vera Delivery"

_BASE_URLS = {
    "uat": "https://pfe-apigw-uat.porter.in",
    "prod": "https://pfe-apigw.porter.in",
}
_NOT_CONFIGURED = {
    "configured": False,
    "message": "Porter API is not configured yet. Add 'porter_api_key' to site config "
               "to enable live booking & tracking. The manual workflow is fully usable meanwhile.",
}


def _api_key():
    return (frappe.conf.get("porter_api_key") or "").strip()


def _env():
    return (frappe.conf.get("porter_env") or "uat").strip().lower()


def _enabled():
    return bool(_api_key())


def _base_url():
    return _BASE_URLS.get(_env(), _BASE_URLS["uat"])


def _request(method, path, payload=None):
    """Single choke-point for live Porter calls. Deliberately raises until the
    integration is switched on so nothing calls Porter by accident."""
    raise NotImplementedError(
        "Porter live calls are not enabled yet. Provide 'porter_api_key' and complete "
        "the request contract in hr_client/api/porter.py once the partner docs are available."
    )
    # Reference implementation (enable once the key + contract are confirmed):
    # import requests
    # headers = {"x-api-key": _api_key(), "Content-Type": "application/json"}
    # resp = requests.request(method, f"{_base_url()}{path}", json=payload, headers=headers, timeout=30)
    # resp.raise_for_status()
    # return resp.json()


# ── Status / config ───────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_porter_status():
    """Tells the UI whether Porter is live yet (drives the 'coming soon' banner)."""
    require_login()
    return {
        "configured": _enabled(),
        "env": _env() if _enabled() else None,
        "base_url": _base_url() if _enabled() else None,
        "capabilities": ["quote", "create_order", "track", "cancel", "webhooks"],
        "message": None if _enabled() else _NOT_CONFIGURED["message"],
    }


# ── Booking / tracking (guarded no-ops until configured) ──────────────────────

@frappe.whitelist(methods=["POST"])
@handle_api_error
def get_quote(pickup=None, drop=None, vehicle=None):
    require_login()
    if not _enabled():
        return dict(_NOT_CONFIGURED)
    # TODO: data = _request("POST", "/v1/get_quote", {...}); return normalized quote
    return dict(_NOT_CONFIGURED)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def book_delivery(delivery: str):
    """Create a Porter order for an existing Vera Delivery and stamp the returned
    order id / tracking onto it. No-op until configured."""
    require_login()
    if not _enabled():
        return dict(_NOT_CONFIGURED)
    frappe.get_doc(DELIVERY, delivery)  # existence check
    # TODO when live:
    #   data = _request("POST", "/v1/orders/create", {<mapped from the delivery>})
    #   doc.porter_order_id = data["order_id"]; doc.porter_status = data["status"]
    #   doc.porter_tracking_url = data.get("tracking_url"); doc.transporter = "Porter"
    #   doc.save(ignore_permissions=True); frappe.db.commit()
    return dict(_NOT_CONFIGURED)


@frappe.whitelist()
@handle_api_error
def track_order(delivery: str = None, order_id: str = None):
    require_login()
    if not _enabled():
        return dict(_NOT_CONFIGURED)
    # TODO: data = _request("GET", f"/v1/orders/{order_id}"); sync status onto the delivery
    return dict(_NOT_CONFIGURED)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def cancel_order(delivery: str = None, order_id: str = None):
    require_login()
    if not _enabled():
        return dict(_NOT_CONFIGURED)
    # TODO: _request("POST", f"/v1/orders/{order_id}/cancel", {...})
    return dict(_NOT_CONFIGURED)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def porter_webhook():
    """Inbound Porter status webhook. Stub: logs the payload so we can see the real
    shape when Porter starts sending. Verifies a shared secret if one is set.
    When live: map Porter status -> Vera Delivery status and update the record."""
    if not _enabled():
        frappe.local.response["http_status_code"] = 503
        return {"ok": False, "message": "Porter not configured"}
    secret = (frappe.conf.get("porter_webhook_secret") or "").strip()
    if secret:
        got = frappe.get_request_header("X-Porter-Signature") or frappe.form_dict.get("secret")
        if got != secret:
            frappe.local.response["http_status_code"] = 401
            return {"ok": False, "message": "bad signature"}
    try:
        frappe.log_error(frappe.as_json(dict(frappe.form_dict)), "Porter webhook (scaffold)")
    except Exception:
        pass
    # TODO when live: look up delivery by porter_order_id, map status, save.
    return {"ok": True}
