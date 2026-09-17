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
"""

import frappe

from hr_client.api.utils import require_admin, allowed_companies, ALL_COMPANIES, current_company


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
