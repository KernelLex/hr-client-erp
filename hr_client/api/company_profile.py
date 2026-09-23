"""
Company Profile / Letterhead admin (owner-editable settings).

Lets an admin enter the company's GSTIN, address, phone, email and website from
the React app instead of the Frappe desk. These are exactly the fields the
customer-facing quotation print reads via `quotation._company_info()`
(Company.tax_id = GSTIN, phone_no, email, website + the linked primary Address),
so filling them here makes the printed letterhead complete.

Multi-company aware: an admin edits any company they're allowed to manage
(VE / Schönes Leben / Hagan Modular). Nothing here is company-scoped data — it's
the Company master itself — but we still gate which companies a user may edit
through `allowed_companies()`.
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, allowed_companies,
)

_COMPANY_FIELDS = ["tax_id", "phone_no", "email", "website"]
_ADDRESS_FIELDS = ["address_line1", "address_line2", "city", "state", "pincode", "country"]


def _company_address_name(company: str):
    """Name of the first Address doc linked to this Company, or None."""
    links = frappe.get_all(
        "Dynamic Link",
        filters={"link_doctype": "Company", "link_name": company,
                 "parenttype": "Address"},
        pluck="parent")
    return links[0] if links else None


@frappe.whitelist()
@handle_api_error
def list_companies():
    """Companies the current user may edit + which one is their default."""
    require_login()
    names = allowed_companies()
    if not names:
        names = frappe.get_all("Company", pluck="name")
    rows = []
    for n in names:
        rows.append(frappe.db.get_value(
            "Company", n, ["name", "company_name", "tax_id"], as_dict=True) or {"name": n})
    return {"companies": rows, "default": names[0] if names else None}


@frappe.whitelist()
@handle_api_error
def get_company_profile(company: str):
    """Current letterhead details for one company (as the print will read them)."""
    require_login()
    vals = frappe.db.get_value(
        "Company", company,
        ["name", "company_name", "tax_id", "phone_no", "email", "website"],
        as_dict=True) or {}
    addr = {}
    aname = _company_address_name(company)
    if aname:
        addr = frappe.db.get_value("Address", aname, _ADDRESS_FIELDS, as_dict=True) or {}
    return {
        "company": vals.get("name") or company,
        "company_name": vals.get("company_name") or company,
        "gstin": vals.get("tax_id") or "",
        "phone": vals.get("phone_no") or "",
        "email": vals.get("email") or "",
        "website": vals.get("website") or "",
        "address_line1": addr.get("address_line1") or "",
        "address_line2": addr.get("address_line2") or "",
        "city": addr.get("city") or "",
        "state": addr.get("state") or "",
        "pincode": addr.get("pincode") or "",
        "country": addr.get("country") or "India",
        "has_address": bool(aname),
    }


def _validate_gstin(gstin: str):
    """Light validation — GSTIN is 15 chars: 2-digit state code + 10-char PAN +
    3 more. We warn but don't hard-block (owner may paste provisional/edge forms)."""
    g = (gstin or "").strip().upper()
    if not g:
        return ""
    if len(g) != 15:
        frappe.throw("GSTIN must be exactly 15 characters (e.g. 29ABCDE1234F1Z5).")
    if not (g[:2].isdigit()):
        frappe.throw("GSTIN must start with a 2-digit state code (Karnataka = 29).")
    return g


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_company_profile(company: str, profile: str = None, **kwargs):
    """Write GSTIN/phone/email/website to the Company + upsert its primary Address.
    Admin-only. `profile` is a JSON string (or fields passed individually)."""
    require_admin()
    if company not in (allowed_companies() or frappe.get_all("Company", pluck="name")):
        frappe.throw("You are not allowed to edit this company.")
    data = frappe.parse_json(profile) if profile else dict(kwargs)

    # --- Company master fields ---
    cdoc = frappe.get_doc("Company", company)
    gstin = _validate_gstin(data.get("gstin"))
    cdoc.tax_id = gstin
    cdoc.phone_no = (data.get("phone") or "").strip()
    cdoc.email = (data.get("email") or "").strip()
    cdoc.website = (data.get("website") or "").strip()
    cdoc.flags.ignore_permissions = True
    cdoc.save()

    # --- primary Address (create or update) ---
    addr_payload = {k: (data.get(k) or "").strip() for k in _ADDRESS_FIELDS}
    addr_payload["country"] = addr_payload.get("country") or "India"
    has_any = any(addr_payload.get(k) for k in ("address_line1", "city", "pincode"))
    aname = _company_address_name(company)
    if aname:
        adoc = frappe.get_doc("Address", aname)
        for k in _ADDRESS_FIELDS:
            setattr(adoc, k, addr_payload.get(k))
        adoc.gstin = gstin or None
        adoc.flags.ignore_permissions = True
        adoc.save()
    elif has_any:
        adoc = frappe.get_doc({
            "doctype": "Address",
            "address_title": (cdoc.company_name or company),
            "address_type": "Billing",
            "is_primary_address": 1,
            "gstin": gstin or None,
            **addr_payload,
            "links": [{"link_doctype": "Company", "link_name": company}],
        })
        adoc.flags.ignore_permissions = True
        adoc.insert()

    frappe.db.commit()
    return get_company_profile(company)
