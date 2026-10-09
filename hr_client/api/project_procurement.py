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

import json

from hr_client.api.utils import (
    require_login, require_admin, handle_api_error, current_company, allowed_companies,
    ALL_COMPANIES,
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
def list_project_options():
    """Lightweight (name, title) project list for the PO 'link to project'
    dropdown. Scoped to the companies the user can see."""
    require_login()
    comps = allowed_companies() or frappe.get_all("Company", pluck="name")
    rows = frappe.get_all(
        "Vera Project", filters={"company": ["in", comps]},
        fields=["name", "project_title", "company"],
        order_by="modified desc", limit_page_length=0,
    )
    return {"projects": rows}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_po(payload: str = None, **kwargs):
    """Create a Purchase Order directly. `project` is OPTIONAL — a PO can be
    raised standalone (e.g. from Logistics) without being tied to a project, or
    linked to one when relevant. Both paths are supported."""
    require_login()
    data = json.loads(payload) if isinstance(payload, str) else dict(payload or {})
    data.update({k: v for k, v in kwargs.items() if v is not None})

    vendor = (data.get("vendor") or "").strip()
    if not vendor:
        frappe.throw("A vendor is required to raise a purchase order.")

    company = data.get("company") or current_company()
    if company == ALL_COMPANIES:
        frappe.throw("Select a specific company before raising a purchase order.")

    project = (data.get("project") or "").strip() or None
    if project and not frappe.db.exists("Vera Project", project):
        frappe.throw("The selected project no longer exists.")

    po = frappe.new_doc(PO)
    po.vendor = vendor
    po.project = project
    po.company = company
    po.po_date = data.get("po_date") or frappe.utils.today()
    po.status = "Draft"
    po.notes = data.get("notes")
    po.source = "Manual"
    if vendor in set(frappe.get_all("Company", pluck="name")):
        po.is_intercompany = 1
        po.supplying_company = vendor
    for r in data.get("lines") or []:
        desc = (r.get("item_description") or "").strip()
        if not desc:
            continue
        po.append("lines", {
            "item_description": desc, "spec": r.get("spec"),
            "qty": _flt(r.get("qty")), "uom": r.get("uom"), "rate": _flt(r.get("rate")),
        })
    if not po.get("lines"):
        frappe.throw("Add at least one line item with a description.")
    po.flags.ignore_permissions = True
    po.insert()
    frappe.db.commit()
    return {"name": po.name, "total": po.total, "project": po.project}


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


# ------------------------------------------------------------------ vendor auto-suggest

@frappe.whitelist(methods=["POST"])
@handle_api_error
def suggest_vendors(name: str):
    """Auto-assign a standard vendor to every unassigned MR line.

    Rule (brief §VOQ): "standard vendor per material unless the customer specifies
    a brand". In our catalogue an Item's Brand IS the vendor (Suppliers weren't
    seeded), so item-linked lines get their brand. Non-catalogue lines (finishes,
    sheet goods) have no brand → they stay unassigned for manual choice. Only fills
    blanks — never overwrites a vendor already chosen.
    """
    require_login()
    doc = frappe.get_doc(MR, name)
    assigned = 0
    for r in doc.get("lines") or []:
        if (r.assigned_vendor or "").strip():
            continue
        vendor = None
        if r.item_code:
            vendor = frappe.db.get_value("Item", r.item_code, "brand")
        if vendor:
            r.assigned_vendor = vendor
            assigned += 1
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"assigned": assigned, **_serialize_mr(doc)}


# ------------------------------------------------------------------ goods receipt

GRN = "Vera Goods Receipt"


def _serialize_grn(doc):
    return {
        "name": doc.name, "grn_title": doc.grn_title, "project": doc.project,
        "purchase_order": doc.purchase_order, "vendor": doc.vendor, "company": doc.company,
        "status": doc.status, "total": doc.total, "notes": doc.notes,
        "receipt_date": str(doc.receipt_date) if doc.receipt_date else None,
        "lines": [{"item_description": r.item_description, "spec": r.spec, "item_code": r.item_code,
                   "uom": r.uom, "ordered_qty": r.ordered_qty, "received_qty": r.received_qty,
                   "rate": r.rate, "amount": r.amount, "source_po_line": r.source_po_line}
                  for r in doc.get("lines") or []],
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_grn_from_po(po: str):
    """Draft a Goods Receipt pre-filled from a PO's lines (received_qty defaults to
    ordered qty; the receiver edits down for partial deliveries). Reuses an existing
    Draft GRN for the same PO if one is open."""
    require_login()
    po_doc = frappe.get_doc(PO, po)
    existing = frappe.db.get_value(GRN, {"purchase_order": po, "status": "Draft"}, "name")
    doc = frappe.get_doc(GRN, existing) if existing else frappe.new_doc(GRN)
    doc.grn_title = f"GRN — {po_doc.vendor}"
    doc.project = po_doc.project
    doc.purchase_order = po
    doc.vendor = po_doc.vendor
    doc.company = po_doc.company or current_company()
    doc.receipt_date = frappe.utils.today()
    doc.status = "Draft"
    doc.set("lines", [])
    for i, r in enumerate(po_doc.get("lines") or []):
        doc.append("lines", {
            "item_description": r.item_description, "spec": r.spec, "uom": r.uom,
            "ordered_qty": r.qty, "received_qty": r.qty, "rate": r.rate,
            "source_po_line": f"{po}#{i}",
        })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize_grn(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def save_grn_lines(name: str, lines: str = None, receipt_date: str = None, notes: str = None):
    require_login()
    doc = frappe.get_doc(GRN, name)
    if doc.status != "Draft":
        frappe.throw("Only a Draft goods receipt can be edited.")
    rows = frappe.parse_json(lines) if lines else None
    if rows is not None:
        doc.set("lines", [])
        for r in rows:
            doc.append("lines", {
                "item_description": r.get("item_description"), "spec": r.get("spec"),
                "item_code": r.get("item_code"), "uom": r.get("uom"),
                "ordered_qty": _flt(r.get("ordered_qty")), "received_qty": _flt(r.get("received_qty")),
                "rate": _flt(r.get("rate")), "source_po_line": r.get("source_po_line"),
            })
    if receipt_date:
        doc.receipt_date = receipt_date
    if notes is not None:
        doc.notes = notes
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return _serialize_grn(doc)


@frappe.whitelist(methods=["POST"])
@handle_api_error
def confirm_grn(name: str):
    """Mark a goods receipt Received; flip the linked PO to Received. Received items
    then show up in the project's site inventory."""
    require_login()
    doc = frappe.get_doc(GRN, name)
    doc.status = "Received"
    doc.flags.ignore_permissions = True
    doc.save()
    if doc.purchase_order and frappe.db.exists(PO, doc.purchase_order):
        frappe.db.set_value(PO, doc.purchase_order, "status", "Received")
    frappe.db.commit()
    return _serialize_grn(doc)


@frappe.whitelist()
@handle_api_error
def get_grn(name: str):
    require_login()
    return _serialize_grn(frappe.get_doc(GRN, name))


@frappe.whitelist()
@handle_api_error
def list_grns(project: str):
    require_login()
    rows = frappe.get_all(GRN, filters={"project": project},
                          fields=["name", "vendor", "purchase_order", "status", "receipt_date", "total"],
                          order_by="creation desc")
    return {"grns": rows}


@frappe.whitelist()
@handle_api_error
def get_site_inventory(project: str):
    """Materials received on site for a project — aggregated from confirmed
    (Received) goods receipts, grouped by item + spec + unit."""
    require_login()
    rows = frappe.db.sql(
        """
        SELECT l.item_description, l.spec, l.uom,
               SUM(l.received_qty) AS qty, SUM(l.amount) AS value
        FROM `tabVera Goods Receipt Line` l
        JOIN `tabVera Goods Receipt` g ON l.parent = g.name
        WHERE g.project = %(project)s AND g.status = 'Received' AND l.received_qty > 0
        GROUP BY l.item_description, l.spec, l.uom
        ORDER BY value DESC
        """, {"project": project}, as_dict=True)
    total_value = round(sum(_flt(r["value"]) for r in rows))
    return {"items": rows, "total_value": total_value, "line_count": len(rows)}
