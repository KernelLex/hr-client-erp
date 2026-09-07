"""Custom TOTP two-factor auth (Google Authenticator compatible).

Independent of Frappe's built-in 2FA. We generate a standard TOTP secret
(RFC 6238), the user scans a QR in any authenticator app, and we verify the
6-digit code ourselves. A `before_request` gate (enabled via the site-config
flag `enforce_2fa`) blocks all API access for a logged-in user until this
session has passed 2FA — so security is enforced server-side, not just in the UI.
"""

import base64
import hashlib
import io
import json

import frappe
import pyotp
from frappe.utils import now_datetime

from hr_client.api.utils import require_login, require_admin

ISSUER = "Vera Enterprises ERP"
DT = "Vera User 2FA"

# Administrator is the break-glass account — never gated.
_EXEMPT_USERS = {"Administrator", "Guest"}

def _enforced():
    """True only for real 'on' values — so `set-config enforce_2fa 0` (which
    stores the string "0", truthy in Python) correctly turns it OFF."""
    return str(frappe.conf.get("enforce_2fa") or "").strip().lower() in ("1", "true", "yes", "on")


# Endpoint substrings always allowed through the gate (auth / enrollment / verify).
_GATE_ALLOW = (
    "hr_client.api.twofa.",
    "/api/method/login",
    "/api/method/logout",
    "frappe.auth",
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _rec(user, create=False):
    name = frappe.db.exists(DT, {"user": user})
    if name:
        return frappe.get_doc(DT, name)
    if create:
        doc = frappe.new_doc(DT)
        doc.user = user
        return doc
    return None


def _sid():
    return getattr(frappe.session, "sid", None) or ""


def is_session_verified(user=None):
    """A session is verified when the doc's stored verified_sid matches the
    current session id. DB-backed (not cache) so it's deterministic and
    survives across requests; a new login (new sid) re-prompts automatically."""
    user = user or frappe.session.user
    row = frappe.db.get_value(DT, {"user": user}, ["enabled", "verified_sid"], as_dict=True)
    if not row or not row.enabled:
        return False
    sid = _sid()
    return bool(sid) and row.verified_sid == sid


def mark_session_verified(rec):
    rec.db_set("verified_sid", _sid(), update_modified=False)
    rec.db_set("last_verified_on", now_datetime(), update_modified=False)


def _qr_data_url(otpauth_uri):
    import qrcode
    import qrcode.image.svg
    qr = qrcode.QRCode(box_size=9, border=2)
    qr.add_data(otpauth_uri)
    qr.make(fit=True)
    img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    svg = buf.getvalue().decode("utf-8")
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def _consume_backup(rec, code):
    try:
        codes = json.loads(rec.backup_codes or "[]")
    except Exception:
        codes = []
    h = hashlib.sha256(code.encode()).hexdigest()
    for c in codes:
        if c.get("h") == h and not c.get("used"):
            c["used"] = 1
            rec.backup_codes = json.dumps(codes)
            return True
    return False


# ── status ───────────────────────────────────────────────────────────────────

@frappe.whitelist()
def get_status():
    require_login()
    user = frappe.session.user
    mandatory = _enforced()
    if user in _EXEMPT_USERS:
        return {"success": True, "exempt": True, "enrolled": False,
                "mandatory": mandatory, "verified": True, "action": "none"}

    rec = _rec(user)
    enrolled = bool(rec and rec.enabled)
    verified = is_session_verified(user)

    if enrolled:
        action = "none" if verified else "verify"
    else:
        action = "enroll" if mandatory else "none"

    return {"success": True, "exempt": False, "enrolled": enrolled,
            "mandatory": mandatory, "verified": verified, "action": action}


# ── enrollment ───────────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def begin_enroll():
    require_login()
    user = frappe.session.user
    rec = _rec(user, create=True)
    if rec.enabled:
        return {"success": False, "error": "2FA is already enabled. Reset it first to re-enroll."}

    secret = pyotp.random_base32()
    rec.secret = secret          # Password field → encrypted at rest
    rec.enabled = 0
    rec.save(ignore_permissions=True)
    frappe.db.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(name=user, issuer_name=ISSUER)
    return {"success": True, "secret": secret, "otpauth_uri": uri, "qr": _qr_data_url(uri)}


@frappe.whitelist(methods=["POST"])
def confirm_enroll(code):
    require_login()
    user = frappe.session.user
    rec = _rec(user)
    secret = rec.get_password("secret", raise_exception=False) if rec else None
    if not secret:
        return {"success": False, "error": "Start enrollment first."}

    if not pyotp.TOTP(secret).verify(str(code).strip().replace(" ", ""), valid_window=1):
        return {"success": False, "error": "Invalid code — check the time on your phone and try again."}

    import secrets as _secrets
    plain = [_secrets.token_hex(4) for _ in range(10)]   # 8-char one-time backup codes
    rec.backup_codes = json.dumps([{"h": hashlib.sha256(c.encode()).hexdigest(), "used": 0} for c in plain])
    rec.enabled = 1
    rec.confirmed_on = now_datetime()
    rec.last_verified_on = now_datetime()
    rec.save(ignore_permissions=True)
    frappe.db.commit()

    mark_session_verified(rec)   # they just proved possession
    return {"success": True, "backup_codes": plain}


# ── login-time verification ──────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def verify(code):
    require_login()
    user = frappe.session.user
    rec = _rec(user)
    if not rec or not rec.enabled:
        return {"success": False, "error": "2FA is not set up for this account."}

    code = str(code).strip().replace(" ", "").replace("-", "")
    secret = rec.get_password("secret")
    ok = pyotp.TOTP(secret).verify(code, valid_window=1)
    used_backup = False
    if not ok:
        ok = _consume_backup(rec, code)
        used_backup = ok
    if not ok:
        return {"success": False, "error": "Invalid code."}

    rec.last_verified_on = now_datetime()
    rec.save(ignore_permissions=True)
    frappe.db.commit()
    mark_session_verified(rec)
    return {"success": True, "used_backup": used_backup}


@frappe.whitelist(methods=["POST"])
def disable(code):
    """Self-service disable — requires a valid current code."""
    require_login()
    user = frappe.session.user
    rec = _rec(user)
    if not rec or not rec.enabled:
        return {"success": True}
    secret = rec.get_password("secret")
    code = str(code).strip().replace(" ", "").replace("-", "")
    if not (pyotp.TOTP(secret).verify(code, valid_window=1) or _consume_backup(rec, code)):
        return {"success": False, "error": "Invalid code."}
    frappe.delete_doc(DT, rec.name, ignore_permissions=True, force=True)
    frappe.db.commit()
    return {"success": True}


# ── admin ────────────────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def admin_reset(email):
    """Admin clears a user's 2FA so they re-enroll on next login (lost-device recovery)."""
    require_admin()
    name = frappe.db.exists(DT, {"user": email})
    if name:
        frappe.delete_doc(DT, name, ignore_permissions=True, force=True)
        frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def admin_list():
    """Admin view of who has enrolled — for monitoring the rollout."""
    require_admin()
    rows = frappe.get_all(DT, fields=["user", "enabled", "confirmed_on", "last_verified_on"])
    return {"success": True, "data": rows}


# ── enforcement gate (before_request hook) ───────────────────────────────────

def enforce():
    """Block API access for a logged-in, non-exempt user until this session has
    passed 2FA. Dormant unless site-config `enforce_2fa` is truthy."""
    if not _enforced():
        return

    user = getattr(frappe.session, "user", "Guest")
    if user in _EXEMPT_USERS:
        return

    req = getattr(frappe.local, "request", None)
    if not req:
        return
    path = req.path or ""
    if not path.startswith("/api/"):
        return
    if any(a in path for a in _GATE_ALLOW):
        return
    if is_session_verified(user):
        return

    frappe.throw("TWOFA_REQUIRED: two-factor verification required", frappe.PermissionError)
