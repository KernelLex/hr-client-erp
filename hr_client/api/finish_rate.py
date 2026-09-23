"""
Per-SFT finish / material rate master.

The founding brief (`projects idea.txt`) states the core interior pricing model:
"we will calculate as per sqft and finishes, each finish will have a standard
price for sqft". Vendor pricelists cover branded *hardware* (Blum, Hettich, …),
but the sheet-goods / finishes / edge bands used on carcass + shutter lines are
priced by Vera per unit area, not from a catalogue.

`Vera Finish Rate` is the owner-maintained rate card for those named
materials/finishes. It is keyed on the SAME display name that BOQ lines store
(carcass_material / shutter_material / internal_finish / external_finish /
edge_banding), so `get_rate()` can price a Material Requirement Sheet line that
has no `item_code`. Owner self-serves the numbers (like GSTIN / dealer cost /
hardware packages); we never invent a rate.
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company, allowed_companies,
)

_DT = "Vera Finish Rate"


def _scoped_filters(base=None):
    """Restrict to the caller's companies (plus company-less global rows)."""
    filters = dict(base or {})
    comps = allowed_companies()
    if comps:
        filters["company"] = ["in", comps + [None, ""]]
    return filters


# ------------------------------------------------------------------ rate lookup

def get_rate(item_name, scope=None, company=None):
    """Standard rate for a named finish/material, or 0.0 if none is on record.

    Prefers a scope-specific Active rate over an 'Any'-scope one, and a
    company-specific row over a global one. Case-insensitive name match. This is
    a plain Python helper (importable) — the whitelisted wrapper is below.
    """
    name = (item_name or "").strip()
    if not name:
        return 0.0
    # Safe before the DocType table is migrated onto a server (returns 0, as before).
    if not frappe.db.table_exists("tabVera Finish Rate"):
        return 0.0
    rows = frappe.get_all(
        _DT,
        filters={"item_name": name, "status": "Active"},
        fields=["rate", "scope", "company"],
    )
    if not rows:
        return 0.0

    def score(r):
        s = 0
        if scope and r.get("scope") == scope:
            s += 2
        elif r.get("scope") in (None, "", "Any"):
            s += 1
        if company and r.get("company") == company:
            s += 1
        return s

    best = max(rows, key=score)
    return frappe.utils.flt(best.get("rate"))


@frappe.whitelist()
@handle_api_error
def get_item_rate(item_name, scope=None, company=None):
    require_login()
    return get_rate(item_name, scope, company)


# ------------------------------------------------------------------ CRUD

@frappe.whitelist()
@handle_api_error
def list_rates():
    require_login()
    rates = frappe.get_all(
        _DT, filters=_scoped_filters(),
        fields=["name", "code", "item_name", "scope", "rate", "uom", "status", "company", "notes"],
        order_by="item_name asc")
    return {"rates": rates, "summary": get_rate_summary()}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_rate(payload: str = None, **kwargs):
    require_admin()
    data = frappe.parse_json(payload) if payload else dict(kwargs)
    name = data.get("name")
    if name and frappe.db.exists(_DT, name):
        doc = frappe.get_doc(_DT, name)
    else:
        doc = frappe.new_doc(_DT)
        doc.code = _make_code(data.get("item_name"), data.get("scope"), data.get("company"))
    for f in ("item_name", "scope", "rate", "uom", "status", "company", "notes"):
        if f in data:
            doc.set(f, data.get(f))
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def delete_rate(name: str):
    require_admin()
    frappe.delete_doc(_DT, name, ignore_permissions=True)
    frappe.db.commit()
    return {"deleted": name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def sync_from_catalogue():
    """Create a rate row (rate 0, Active) for every studio Material + Finish +
    Edge Band that doesn't have one yet, so the owner only has to fill numbers.
    Idempotent on (item_name, scope, company)."""
    require_admin()
    company = current_company()
    created = 0
    seeds = (
        ("Vera Quotation Material", "material_name", "Any"),
        ("Vera Quotation Finish", "finish_name", "Finish"),
        ("Vera Edge Band", "edge_name", "Edge Band"),
    )
    for doctype, field, scope in seeds:
        if not frappe.db.exists("DocType", doctype):
            continue
        meta = frappe.get_meta(doctype)
        if not meta.has_field(field):
            continue
        filters = {}
        if meta.has_field("status"):
            filters["status"] = "Active"
        if meta.has_field("company"):
            filters["company"] = ["in", (allowed_companies() or [company]) + [None, ""]]
        seen = set()
        for r in frappe.get_all(doctype, filters=filters, fields=[field]):
            item = (r.get(field) or "").strip()
            if not item or item in seen:
                continue
            seen.add(item)
            if frappe.db.exists(_DT, {"item_name": item, "scope": scope, "company": company}):
                continue
            if frappe.db.exists(_DT, {"item_name": item, "scope": scope, "company": ["in", [None, ""]]}):
                continue
            doc = frappe.new_doc(_DT)
            doc.code = _make_code(item, scope, company)
            doc.item_name = item
            doc.scope = scope
            doc.rate = 0
            doc.uom = "SFT"
            doc.status = "Active"
            doc.company = company
            doc.flags.ignore_permissions = True
            doc.insert()
            created += 1
    frappe.db.commit()
    return {"created": created, "summary": get_rate_summary()}


@frappe.whitelist()
@handle_api_error
def get_rate_summary():
    require_login()
    filters = _scoped_filters()
    total = frappe.db.count(_DT, filters)
    priced = frappe.db.count(_DT, _scoped_filters({"rate": [">", 0]}))
    return {
        "total": total,
        "priced": priced,
        "coverage_pct": round(priced / total * 100, 1) if total else 0,
    }


def _make_code(item_name, scope, company):
    base = frappe.scrub(f"{item_name or 'rate'}-{scope or 'any'}").upper().replace("_", "-")[:36]
    code = base
    i = 2
    while frappe.db.exists(_DT, code):
        code = f"{base}-{i}"
        i += 1
    return code
