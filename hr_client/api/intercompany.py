"""
Inter-company transactions (Phase 7) — Tally-shadow architecture.

This ERP mirrors Tally; it does not post to native ERPNext Sales/Purchase
Invoices. So the inter-company mechanism is: in each company's Tally books the
sibling companies appear as ordinary ledgers (under Sundry Debtors/Creditors).
`Intercompany Ledger Map` records which ledger in company A represents sibling
company B; `tag_intercompany()` then stamps every voucher touching a mapped
ledger with is_intercompany + counterparty_company (fields added in Phase 1) so
the group console (Phase 8) can eliminate them.

Seed the map by hand (it's a handful of rows), then run tag_intercompany().

Phase 7 §3 — the Quotation Studio payoff — adds the *forward* leg: when a Sales
Order is confirmed, any line supplied by a sibling company (line.supplying_company
!= the SO's own company) raises an internal PO to that company, one PO per
supplying company, tagged inter-company and routed through the supplying company's
§4.6 authority ladder. See generate_internal_pos_for_so() below.
"""

import frappe

from hr_client.api.utils import (
    require_admin, allowed_companies, ALL_COMPANIES, current_company, require_company,
)


@frappe.whitelist()
def get_ledger_map():
    """All inter-company ledger mappings the caller may see."""
    require_admin()
    cos = allowed_companies()
    rows = frappe.get_all(
        "Intercompany Ledger Map",
        filters={} if current_company() == ALL_COMPANIES else {"company": ["in", cos]},
        fields=["name", "company", "tally_ledger_name", "counterparty_company"],
        order_by="company asc",
    )
    return {"rows": rows}


@frappe.whitelist(methods=["POST"])
def add_ledger_map(company, tally_ledger_name, counterparty_company):
    """Add one mapping (company's `tally_ledger_name` == counterparty_company)."""
    require_admin()
    from hr_client.api.utils import require_company
    require_company(company)
    if company == counterparty_company:
        frappe.throw("A company cannot be its own counterparty.")
    if frappe.db.exists("Intercompany Ledger Map",
                        {"company": company, "tally_ledger_name": tally_ledger_name}):
        return {"success": True, "note": "already mapped"}
    doc = frappe.get_doc({
        "doctype": "Intercompany Ledger Map",
        "company": company,
        "tally_ledger_name": tally_ledger_name,
        "counterparty_company": counterparty_company,
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
def tag_intercompany(company=None):
    """Stamp is_intercompany + counterparty_company on every VE Tally Voucher whose
    party is a mapped inter-company ledger. Scoped to `company` (or all mapped
    companies for the group owner). Idempotent. Returns per-map tagged counts."""
    require_admin()
    company = current_company() if company is None else company
    filters = {} if company == ALL_COMPANIES else {"company": company}
    maps = frappe.get_all(
        "Intercompany Ledger Map", filters=filters,
        fields=["company", "tally_ledger_name", "counterparty_company"],
    )
    tagged = {}
    for m in maps:
        n = frappe.db.sql(
            """UPDATE `tabVE Tally Voucher`
               SET is_intercompany = 1, counterparty_company = %s
               WHERE company = %s AND party_name = %s""",
            (m.counterparty_company, m.company, m.tally_ledger_name),
        )
        tagged[f"{m.company}:{m.tally_ledger_name}->{m.counterparty_company}"] = frappe.db.sql(
            "SELECT COUNT(*) FROM `tabVE Tally Voucher` WHERE company=%s AND party_name=%s AND is_intercompany=1",
            (m.company, m.tally_ledger_name))[0][0]
    frappe.db.commit()
    return {"success": True, "tagged": tagged}


@frappe.whitelist()
def reconciliation_report():
    """For each ordered pair (A,B): what A's books say A transacts with B, vs what
    B's books say. These rarely tie out (timing, missing docs) — the report SHOWS
    the difference, it does not assert equality. Group owner sees all pairs."""
    require_admin()
    cos = allowed_companies()
    pairs = []
    for a in cos:
        for b in cos:
            if a == b:
                continue
            a_to_b = frappe.db.sql(
                """SELECT COALESCE(SUM(amount),0) v, COUNT(*) c FROM `tabVE Tally Voucher`
                   WHERE company=%s AND is_intercompany=1 AND counterparty_company=%s""",
                (a, b), as_dict=True)[0]
            b_from_a = frappe.db.sql(
                """SELECT COALESCE(SUM(amount),0) v, COUNT(*) c FROM `tabVE Tally Voucher`
                   WHERE company=%s AND is_intercompany=1 AND counterparty_company=%s""",
                (b, a), as_dict=True)[0]
            diff = frappe.utils.flt(a_to_b.v) - frappe.utils.flt(b_from_a.v)
            pairs.append({
                "from": a, "to": b,
                "a_books": {"value": frappe.utils.flt(a_to_b.v), "count": int(a_to_b.c)},
                "b_books": {"value": frappe.utils.flt(b_from_a.v), "count": int(b_from_a.c)},
                "difference": round(diff, 2),
            })
    return {"pairs": pairs, "note": "Differences are expected (timing / missing documents). "
                                    "This report surfaces them; it does not assert the sides match."}


# ══════════════════════════════════════════════════════════════════════════════
# Internal POs from Sales Order confirmation (Phase 7 §3)
# ══════════════════════════════════════════════════════════════════════════════

# §4.6-style value ladder for an internal PO, evaluated in the SUPPLYING company.
# (cap, authority label, needs_approval). "Internal does not mean unapproved" —
# anything above the executive auto-approve cap routes to a higher authority.
_PO_AUTHORITY = [
    (50_000.0, "Purchase Executive", False),
    (500_000.0, "Purchase Manager", True),
    (float("inf"), "Director / CFO", True),
]


def _po_authority(total):
    """Return (required_authority_label, needs_approval) for an internal PO total."""
    total = frappe.utils.flt(total)
    for cap, label, needs in _PO_AUTHORITY:
        if total <= cap:
            return label, needs
    return "Director / CFO", True


def generate_internal_pos_for_so(so_name):
    """Raise one internal PO per supplying company for a confirmed Sales Order.

    A line is inter-company when its supplying_company is set and differs from the
    SO's own company. Idempotent: a supplying company that already has a PO for
    this SO is skipped, so re-confirming never duplicates. Runs with elevated
    permissions — the confirming user need not have access to the supplying
    company; that company approves the PO in its own books afterwards.

    Returns the list of created internal-PO names (empty when nothing is
    cross-company, i.e. the ordinary single-company case)."""
    so = frappe.get_doc("Vera Sales Order", so_name)
    buying_company = so.company

    # Group cross-company lines by their supplying company.
    groups = {}
    for ln in so.lines:
        supplying = getattr(ln, "supplying_company", None)
        if not supplying or supplying == buying_company:
            continue
        groups.setdefault(supplying, []).append(ln)

    created = []
    for supplying_company, lines in groups.items():
        if frappe.db.exists("Vera Internal PO",
                            {"source_sales_order": so.name, "company": supplying_company}):
            continue  # idempotent — already raised on a prior confirm

        po = frappe.new_doc("Vera Internal PO")
        po.company = supplying_company
        po.buying_company = buying_company
        po.counterparty_company = buying_company
        po.is_intercompany = 1
        po.source_sales_order = so.name
        po.source_quotation = so.quotation
        po.boq = so.boq
        po.po_date = frappe.utils.today()
        for ln in lines:
            amount = frappe.utils.flt(ln.gross_amount) or round(
                frappe.utils.flt(ln.quantity) * frappe.utils.flt(ln.rate), 2)
            po.append("lines", {
                "section": ln.section,
                "specification": ln.specification,
                "quantity": ln.quantity,
                "uom": ln.uom,
                "rate": ln.rate,
                "amount": amount,
                "source_boq_line": getattr(ln, "source_boq_line", None),
            })
        # validate() sums the lines into po.total; evaluate authority off that.
        po.insert(ignore_permissions=True)
        authority, needs_approval = _po_authority(po.total)
        po.required_authority = authority
        po.status = "Pending Approval" if needs_approval else "Approved"
        if not needs_approval:
            po.approved_by = "Administrator"
            po.approved_on = frappe.utils.now()
        po.save(ignore_permissions=True)
        created.append(po.name)

    if created:
        frappe.db.commit()
    return created


@frappe.whitelist()
def get_internal_pos():
    """List internal POs the caller may see — scoped to the supplying company
    (the PO's `company`), which is where it is approved."""
    require_admin()
    cos = allowed_companies()
    filters = {} if current_company() == ALL_COMPANIES else {"company": ["in", cos]}
    rows = frappe.get_all(
        "Vera Internal PO", filters=filters,
        fields=["name", "company", "buying_company", "source_sales_order", "po_date",
                "status", "required_authority", "total"],
        order_by="modified desc",
    )
    return {"rows": rows}


@frappe.whitelist(methods=["POST"])
def approve_internal_po(name):
    """Approve an internal PO. Only an admin of the SUPPLYING company (the PO's
    own company) may approve — internal does not mean unapproved (§4.6)."""
    require_admin()
    doc = frappe.get_doc("Vera Internal PO", name)
    require_company(doc.company)          # must hold the supplying company
    if doc.status not in ("Pending Approval", "Draft"):
        frappe.throw(f"Cannot approve a PO in status {doc.status}.")
    doc.status = "Approved"
    doc.approved_by = frappe.session.user
    doc.approved_on = frappe.utils.now()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def reject_internal_po(name, reason=None):
    """Reject an internal PO (supplying-company admin only)."""
    require_admin()
    doc = frappe.get_doc("Vera Internal PO", name)
    require_company(doc.company)
    doc.status = "Rejected"
    if reason:
        doc.notes = (doc.notes + "\n" if doc.notes else "") + f"Rejected: {reason}"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": doc.status}
