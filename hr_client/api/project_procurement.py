"""
Project Procurement (Phase 2 of the delivery module).

Turns an accepted project's BOQ into what to buy:
  BOQ lines → **Material Requirement Sheet** (aggregated materials / finishes /
  edge-band / hardware) → assign a **vendor** per line (VOQ view) → generate a
  **Purchase Order** per vendor (intercompany-aware when the vendor is a sibling
  company). Follows the brief's "material requirement sheet → VOQ → vendor
  selection" flow and the spec's traceability rule (every MR line keeps its
  source BOQ + BOQ-line id). See PROJECT_EXECUTION_PLAN.md §6.

Est rates: hardware items resolve to the owner's Vendor Cost (else the package
MRP); materials/finishes have no catalogue price (owner rate / per-SFT) so they
start at 0 — never invented.
"""

import frappe

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company, allowed_companies,
)
from hr_client.api.finish_rate import get_rate as _finish_rate_lookup

MR = "Vera Material Requirement"
PO = "Vera Procurement PO"
COST_LIST = "Vendor Cost"
MRP_LIST = "Vendor MRP"


def _flt(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _latest_boq(opportunity):
    """Head-of-chain (latest, non-superseded) BOQ for an opportunity."""
    rows = frappe.get_all("Vera BOQ", filters={"opportunity": opportunity},
                          fields=["name", "supersedes"])
    if not rows:
        return None
    superseded = {r.supersedes for r in rows if r.supersedes}
    heads = [r.name for r in rows if r.name not in superseded]
    return heads[0] if heads else rows[0].name


def _rate_for(item_code, fallback=0.0):
    """Owner cost first, then MRP, then the fallback."""
    if item_code:
        c = frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": COST_LIST, "buying": 1}, "price_list_rate")
        if c:
            return _flt(c)
        m = frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": MRP_LIST}, "price_list_rate")
        if m:
            return _flt(m)
    return _flt(fallback)


def _finish_rate(item_name, scope, company):
    """Owner-supplied per-SFT rate for a named material/finish/edge band (or 0)."""
    return _finish_rate_lookup(item_name, scope, company)


def _find_package(pkg_value):
    """Resolve a BOQ line's hardware_package value to a Vera Hardware Package name
    (autoname is field:code, so name == code; also try package_name)."""
    if frappe.db.exists("Vera Hardware Package", pkg_value):
        return pkg_value
    return frappe.db.get_value("Vera Hardware Package", {"package_name": pkg_value}, "name")


def _expand_hardware_package(pkg_value, line_qty, bucket, boq, boq_line_id):
    """Expand a BOQ line's hardware package into its component items × line qty."""
    name = _find_package(pkg_value)
    if not name:
        _add(bucket, "Hardware", f"Hardware Package: {pkg_value}", "", line_qty, "SET", None, 0, boq, boq_line_id)
        return
    for it in frappe.get_all("Vera Hardware Package Item", filters={"parent": name},
                             fields=["item_code", "item_name", "brand", "qty", "uom", "rate"]):
        _add(bucket, "Hardware", it.item_name or it.item_code, it.brand or "",
             _flt(it.qty) * _flt(line_qty), it.uom or "PC", it.item_code,
             _rate_for(it.item_code, it.rate), boq, boq_line_id)


def _add(bucket, category, desc, spec, qty, uom, item_code, rate, boq, boq_line_id):
    if not desc:
        return
    key = (category, desc, spec, uom, item_code or "")
    if key in bucket:
        bucket[key]["qty"] += _flt(qty)
    else:
        bucket[key] = {"category": category, "item_description": desc, "spec": spec or "",
                       "qty": _flt(qty), "uom": uom or "", "item_code": item_code or "",
                       "est_rate": _flt(rate), "source_boq": boq, "source_boq_line_id": boq_line_id or ""}


# ------------------------------------------------------------------ build

@frappe.whitelist(methods=["POST"])
@handle_api_error
def build_requirement(project: str):
    """Aggregate the project's latest BOQ into a Material Requirement Sheet.
    Replaces the project's existing Draft MRS if one exists."""
    require_login()
    proj = frappe.get_doc("Vera Project", project)
    if not proj.opportunity:
        frappe.throw("This project has no linked opportunity, so its BOQ can't be found.")
    boq_name = _latest_boq(proj.opportunity)
    if not boq_name:
        frappe.throw("No BOQ found for this project's opportunity yet.")
    boq = frappe.get_doc("Vera BOQ", boq_name)
    company = proj.company or current_company()

    bucket = {}
    for ln in boq.get("lines") or []:
        area_qty = _flt(ln.calc_qty) or _flt(ln.quantity)
        lid = ln.name
        if ln.carcass_material:
            _add(bucket, "Carcass", ln.carcass_material, ln.carcass_thickness, area_qty, ln.uom, None,
                 _finish_rate(ln.carcass_material, "Carcass", company), boq_name, lid)
        if ln.shutter_material:
            _add(bucket, "Shutter", ln.shutter_material, ln.shutter_thickness, area_qty, ln.uom, None,
                 _finish_rate(ln.shutter_material, "Shutter", company), boq_name, lid)
        if ln.internal_finish:
            _add(bucket, "Finish", ln.internal_finish, "Internal", area_qty, ln.uom, None,
                 _finish_rate(ln.internal_finish, "Finish", company), boq_name, lid)
        if ln.external_finish:
            _add(bucket, "Finish", ln.external_finish, "External", area_qty, ln.uom, None,
                 _finish_rate(ln.external_finish, "Finish", company), boq_name, lid)
        if ln.edge_banding:
            _add(bucket, "Edge Band", ln.edge_banding, "", area_qty, "RFT", None,
                 _finish_rate(ln.edge_banding, "Edge Band", company), boq_name, lid)
        if ln.hardware_package:
            _expand_hardware_package(ln.hardware_package, _flt(ln.quantity) or 1, bucket, boq_name, lid)

    # replace an existing draft MRS for this project, else create
    existing = frappe.db.get_value(MR, {"project": project, "status": "Draft"}, "name")
    doc = frappe.get_doc(MR, existing) if existing else frappe.new_doc(MR)
    doc.mr_title = f"MRS — {proj.project_title}"
    doc.project = project
    doc.opportunity = proj.opportunity
    doc.company = proj.company or current_company()
    doc.status = "Draft"
    doc.generated_on = frappe.utils.now()
    doc.source_boqs = boq_name
    doc.set("lines", [])
    for row in bucket.values():
        doc.append("lines", row)
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return get_requirement_doc(doc.name)


# ------------------------------------------------------------------ read

def _serialize_mr(doc):
    return {
        "name": doc.name, "mr_title": doc.mr_title, "project": doc.project,
        "opportunity": doc.opportunity, "company": doc.company, "status": doc.status,
        "generated_on": str(doc.generated_on) if doc.generated_on else None,
        "source_boqs": doc.source_boqs, "notes": doc.notes,
        "lines": [{"idx": i, "category": r.category, "item_description": r.item_description,
                   "spec": r.spec, "qty": r.qty, "uom": r.uom, "item_code": r.item_code,
                   "assigned_vendor": r.assigned_vendor, "est_rate": r.est_rate,
                   "est_amount": r.est_amount, "source_boq": r.source_boq,
                   "source_boq_line_id": r.source_boq_line_id}
                  for i, r in enumerate(doc.get("lines") or [])],
    }


@frappe.whitelist()
@handle_api_error
def get_requirement_doc(name: str):
    require_login()
    return _serialize_mr(frappe.get_doc(MR, name))


@frappe.whitelist()
@handle_api_error
def get_requirement(project: str):
    """Latest MRS for a project (Draft preferred), or null."""
    require_login()
    name = frappe.db.get_value(MR, {"project": project, "status": "Draft"}, "name") \
        or frappe.db.get_value(MR, {"project": project}, "name", order_by="modified desc")
    if not name:
        return {"exists": False}
    return {"exists": True, **_serialize_mr(frappe.get_doc(MR, name))}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_requirement_lines(name: str, lines: str = None):
    """Edit MR lines (qty / vendor / rate)."""
    require_login()
    doc = frappe.get_doc(MR, name)
    rows = frappe.parse_json(lines) if lines else []
    doc.set("lines", [])
    for r in rows:
        doc.append("lines", {
            "category": r.get("category"), "item_description": r.get("item_description"),
            "spec": r.get("spec"), "qty": _flt(r.get("qty")), "uom": r.get("uom"),
            "item_code": r.get("item_code"), "assigned_vendor": r.get("assigned_vendor"),
            "est_rate": _flt(r.get("est_rate")), "source_boq": r.get("source_boq"),
            "source_boq_line_id": r.get("source_boq_line_id"),
        })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize_mr(doc)


@frappe.whitelist()
@handle_api_error
def get_voq(name: str):
    """Vendor Order Quantity view — MR lines grouped by assigned vendor."""
    require_login()
    doc = frappe.get_doc(MR, name)
    groups = {}
    unassigned = 0
    for r in doc.get("lines") or []:
        v = (r.assigned_vendor or "").strip()
        if not v:
            unassigned += 1
            continue
        g = groups.setdefault(v, {"vendor": v, "lines": 0, "value": 0.0})
        g["lines"] += 1
        g["value"] += _flt(r.est_amount)
    return {"vendors": list(groups.values()), "unassigned": unassigned}


# ------------------------------------------------------------------ POs

@frappe.whitelist(methods=["POST"])
@handle_api_error
def generate_pos(name: str):
    """Create a draft Purchase Order per assigned vendor from the MR lines.
    A vendor whose name matches a sibling Company is flagged intercompany."""
    require_login()
    doc = frappe.get_doc(MR, name)
    companies = set(frappe.get_all("Company", pluck="name"))
    by_vendor = {}
    for r in doc.get("lines") or []:
        v = (r.assigned_vendor or "").strip()
        if not v:
            continue
        by_vendor.setdefault(v, []).append(r)
    if not by_vendor:
        frappe.throw("Assign vendors to the requirement lines before generating POs.")
    created = []
    for vendor, rows in by_vendor.items():
        po = frappe.new_doc(PO)
        po.vendor = vendor
        po.project = doc.project
        po.company = doc.company or current_company()
        po.po_date = frappe.utils.today()
        po.material_requirement = doc.name
        po.status = "Draft"
        if vendor in companies:
            po.is_intercompany = 1
            po.supplying_company = vendor
        for r in rows:
            po.append("lines", {
                "item_description": r.item_description, "spec": r.spec, "qty": r.qty,
                "uom": r.uom, "rate": r.est_rate, "source_mr_line": f"{doc.name}#{r.idx}",
            })
        po.flags.ignore_permissions = True
        po.insert()
        created.append({"name": po.name, "vendor": vendor, "total": po.total, "intercompany": bool(po.is_intercompany)})
    doc.status = "Ordered"
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"created": created, "count": len(created)}


@frappe.whitelist()
@handle_api_error
def list_pos(project: str = None):
    require_login()
    comps = allowed_companies() or frappe.get_all("Company", pluck="name")
    filters = {"company": ["in", comps]}
    if project:
        filters["project"] = project
    rows = frappe.get_all(PO, filters=filters,
                          fields=["name", "vendor", "project", "status", "po_date",
                                  "total", "is_intercompany", "supplying_company"],
                          order_by="creation desc")
    kpis = {"total": len(rows),
            "draft": sum(1 for r in rows if r["status"] == "Draft"),
            "sent": sum(1 for r in rows if r["status"] == "Sent"),
            "received": sum(1 for r in rows if r["status"] == "Received"),
            "value": round(sum(_flt(r["total"]) for r in rows)),
            "intercompany": sum(1 for r in rows if r["is_intercompany"])}
    return {"pos": rows, "kpis": kpis}


@frappe.whitelist()
@handle_api_error
def get_po(name: str):
    require_login()
    doc = frappe.get_doc(PO, name)
    return {
        "name": doc.name, "vendor": doc.vendor, "project": doc.project, "company": doc.company,
        "status": doc.status, "po_date": str(doc.po_date) if doc.po_date else None,
        "total": doc.total, "is_intercompany": doc.is_intercompany,
        "supplying_company": doc.supplying_company, "notes": doc.notes,
        "lines": [{"item_description": r.item_description, "spec": r.spec, "qty": r.qty,
                   "uom": r.uom, "rate": r.rate, "amount": r.amount}
                  for r in doc.get("lines") or []],
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def update_po_status(name: str, status: str):
    require_login()
    doc = frappe.get_doc(PO, name)
    doc.status = status
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "status": doc.status}
