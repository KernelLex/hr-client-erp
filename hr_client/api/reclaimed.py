"""
Reclaimed Materials — returned / rejected / surplus material inventory.

When material comes back from a project (rejected, cancelled, surplus or an
offcut) it is logged here with its full specification (material, finish, colour,
thickness, W×H×D, quantity), photos and where it is physically stored, instead
of being scrapped. A reclaimed piece then flows Available → Reserved → Reused,
and the "where can this be used" matcher scans open BOQ lines for jobs whose
spec + dimensions the piece can satisfy (a piece can be cut down, never up), so
the team reuses stock before buying new — cutting both waste and cost.

Company-scoped through the standard kernel. ERP-native (no external inventory).
"""

import frappe

from hr_client.api.utils import (
    require_login, handle_api_error, current_company, scoped, ALL_COMPANIES,
    assert_doc_company,
)

# Scalar fields a client may set (images are handled by save_images).
_FIELDS = (
    "material_title", "status", "source_project", "source_boq", "returned_by",
    "return_date", "return_reason", "category", "core_material", "finish",
    "colour", "thickness", "edge_banding", "condition", "salvage_value",
    "width", "height", "depth", "quantity", "uom",
    "warehouse", "rack", "bin", "storage_notes",
    "reserved_for", "reused_in", "notes",
)


def _flt(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _clean(payload):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in _FIELDS if payload.get(k) is not None}


def _label(doctype, name, field):
    return frappe.db.get_value(doctype, name, field) if name else None


def _serialize(doc, with_suggestions=True):
    out = {f: doc.get(f) for f in _FIELDS}
    out["name"] = doc.name
    out["company"] = doc.get("company")
    out["images"] = [{"image": r.image, "caption": r.caption, "is_primary": r.is_primary}
                     for r in doc.images]
    primary = next((r.image for r in doc.images if r.is_primary), None)
    out["primary_image"] = primary or (doc.images[0].image if doc.images else None)
    # Project links resolve to their titles; spec fields already hold display names.
    out["source_project_label"] = _label("Vera CRM Opportunity", doc.source_project, "opportunity_title")
    out["reserved_for_label"] = _label("Vera CRM Opportunity", doc.reserved_for, "opportunity_title")
    out["reused_in_label"] = _label("Vera CRM Opportunity", doc.reused_in, "opportunity_title")
    if with_suggestions:
        out["reuse_suggestions"] = _match_open_boqs(doc)
    return out


# ── Reuse matcher — "where can this be used" ──────────────────────────────────

def _match_open_boqs(doc):
    """Scan open BOQ lines for jobs this reclaimed piece can satisfy. Matches on
    material / finish / thickness (by display name, as BOQ lines store names) and
    scores dimension fit — a piece can be cut down to size, never enlarged."""
    material, finish, thickness = doc.core_material, doc.finish, doc.thickness
    if not (material or finish):
        return []

    # Open BOQs in the active company; skip superseded/rejected.
    boqs = frappe.get_all(
        "Vera BOQ", filters=scoped({"status": ["in", ["Draft", "Submitted", "Approved"]]}),
        fields=["name", "boq_title", "opportunity", "company_name"], limit_page_length=500)
    if not boqs:
        return []
    boq_by_name = {b.name: b for b in boqs}

    rw, rh, rd = _flt(doc.width), _flt(doc.height), _flt(doc.depth)
    tol = 2.0  # mm — a saw kerf / measurement tolerance

    lines = frappe.get_all(
        "Vera BOQ Line",
        filters={"parent": ["in", list(boq_by_name)]},
        fields=["parent", "area", "unit_name", "carcass_material", "shutter_material",
                "internal_finish", "external_finish", "carcass_thickness",
                "shutter_thickness", "width", "height", "depth"],
        limit_page_length=0)

    out = []
    for ln in lines:
        score, reasons = 0, []
        if material and material in (ln.carcass_material, ln.shutter_material):
            score += 40; reasons.append(f"material {material}")
        if finish and finish in (ln.internal_finish, ln.external_finish):
            score += 25; reasons.append(f"finish {finish}")
        if thickness and thickness in (ln.carcass_thickness, ln.shutter_thickness):
            score += 15; reasons.append(f"thickness {thickness}")
        if score < 40:
            continue  # need at least a material match to be relevant
        # dimension fit — reclaimed piece must cover the required size (cut down)
        req_w, req_h = _flt(ln.width), _flt(ln.height)
        if (rw or rh) and (req_w or req_h):
            fits = (rw + tol >= req_w) and (rh + tol >= req_h)
            score += 15 if fits else 0
            reasons.append("fits the size" if fits else "piece is smaller — check")
        b = boq_by_name.get(ln.parent)
        out.append({
            "boq": ln.parent,
            "boq_title": b.boq_title if b else ln.parent,
            "opportunity": b.opportunity if b else None,
            "customer": b.company_name if b else None,
            "area": ln.area,
            "unit_name": ln.unit_name,
            "required": f"{req_w:.0f}×{req_h:.0f}" if (req_w or req_h) else "—",
            "score": min(score, 100),
            "why": ", ".join(reasons),
        })
    out.sort(key=lambda r: r["score"], reverse=True)
    return out[:20]


# ── CRUD ──────────────────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_reclaimed(payload):
    require_login()
    data = _clean(payload)
    if not data.get("material_title"):
        frappe.throw("A material name is required.")
    doc = frappe.new_doc("Vera Reclaimed Material")
    doc.update(data)
    doc.company = current_company()
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_reclaimed(name: str, payload):
    require_login()
    doc = frappe.get_doc("Vera Reclaimed Material", name)
    assert_doc_company(doc)
    doc.update(_clean(payload))
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_images(name: str, images):
    """Replace the image gallery — each row is {image (file url), caption, is_primary}."""
    require_login()
    doc = frappe.get_doc("Vera Reclaimed Material", name)
    assert_doc_company(doc)
    if isinstance(images, str):
        images = frappe.parse_json(images)
    doc.set("images", [])
    for r in (images or []):
        url = (r.get("image") or "").strip()
        if url:
            doc.append("images", {"image": url, "caption": r.get("caption"),
                                  "is_primary": 1 if r.get("is_primary") else 0})
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "count": len(doc.images)}


@frappe.whitelist()
@handle_api_error
def get_reclaimed(name: str):
    require_login()
    doc = frappe.get_doc("Vera Reclaimed Material", name)
    assert_doc_company(doc)
    return {"success": True, "material": _serialize(doc)}


@frappe.whitelist()
@handle_api_error
def list_reclaimed(status: str = None):
    """Reclaimed-inventory list for the ArchetypePage, newest first."""
    require_login()
    filters = {}
    if status:
        filters["status"] = status
    rows_raw = frappe.get_all(
        "Vera Reclaimed Material", filters=scoped(filters),
        fields=["name", "material_title", "status", "category", "core_material",
                "finish", "colour", "width", "height", "depth", "quantity", "uom",
                "warehouse", "rack", "salvage_value", "source_project"],
        order_by="modified desc", limit_page_length=500)
    # Aggregate KPIs across ALL rows (unfiltered) for an honest header.
    allrows = rows_raw if not status else frappe.get_all(
        "Vera Reclaimed Material", filters=scoped({}),
        fields=["status", "salvage_value"], limit_page_length=0)
    avail = sum(1 for r in allrows if r.status == "Available")
    reserved = sum(1 for r in allrows if r.status == "Reserved")
    reusable_value = sum(_flt(r.salvage_value) for r in allrows if r.status in ("Available", "Reserved"))

    def dims(r):
        d = "×".join(f"{_flt(x):.0f}" for x in (r.width, r.height, r.depth) if _flt(x))
        return d or "—"

    rows = [{
        "name": r.name,
        "material_title": r.material_title,
        "status": r.status,
        "spec": " · ".join(x for x in [r.core_material, r.finish, r.colour] if x) or "—",
        "dimensions": dims(r),
        "quantity": f"{_flt(r.quantity):g} {r.uom or ''}".strip(),
        "location": " / ".join(x for x in [r.warehouse, r.rack] if x) or "—",
        "salvage_value": "₹" + frappe.utils.fmt_money(_flt(r.salvage_value), currency="INR"),
    } for r in rows_raw]

    return {
        "kpis": [
            {"label": "Available", "value": str(avail), "tone": "good"},
            {"label": "Reserved", "value": str(reserved)},
            {"label": "Total Pieces", "value": str(len(allrows))},
            {"label": "Reusable Value", "value": "₹" + frappe.utils.fmt_money(reusable_value, currency="INR"), "tone": "good"},
        ],
        "columns": [
            {"key": "material_title", "header": "Material"},
            {"key": "spec", "header": "Spec"},
            {"key": "dimensions", "header": "W×H×D (mm)"},
            {"key": "quantity", "header": "Qty"},
            {"key": "location", "header": "Location"},
            {"key": "status", "header": "Status", "kind": "status"},
            {"key": "salvage_value", "header": "Salvage", "align": "right", "kind": "amount"},
        ],
        "rows": rows,
        "note": "Returned & surplus material kept for reuse. Open a piece to see where "
                "it can be used on current jobs, then reserve it.",
    }


# ── Lifecycle ─────────────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
@handle_api_error
def reserve_reclaimed(name: str, opportunity: str = None):
    require_login()
    doc = frappe.get_doc("Vera Reclaimed Material", name)
    assert_doc_company(doc)
    doc.status = "Reserved"
    doc.reserved_for = opportunity
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def mark_reused(name: str, opportunity: str = None):
    require_login()
    doc = frappe.get_doc("Vera Reclaimed Material", name)
    assert_doc_company(doc)
    doc.status = "Reused"
    doc.reused_in = opportunity or doc.reserved_for
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def set_status(name: str, status: str):
    """Available / Reserved / Reused / Scrapped — clears reservation when freed."""
    require_login()
    if status not in ("Available", "Reserved", "Reused", "Scrapped"):
        frappe.throw(f"Unknown status: {status}")
    doc = frappe.get_doc("Vera Reclaimed Material", name)
    assert_doc_company(doc)
    doc.status = status
    if status == "Available":
        doc.reserved_for = None
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}
