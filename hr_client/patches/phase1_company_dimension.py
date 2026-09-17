"""Phase 1 — company dimension on every siloed DocType.

Adds a reqd `company` Link (Custom Field, so we don't hand-edit ~55 JSONs),
backfills all existing rows to Vera Enterprises, adds intercompany tagging
fields (empty, populated in Phase 7), supplying_company on the BOQ line, and
composite indexes. The "VE " DocType rename is intentionally deferred (cosmetic,
high blast-radius, no multi-company benefit — the company field is the gate).
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

VE = "Vera Enterprises"

# Per-company parent DocTypes. Child tables (istable=1) are scoped via their
# parent and are intentionally excluded — except Vera BOQ Line (supplying_company).
SILOED = [
    # Tally + financial
    "VE Tally Voucher", "VE Tally Ledger", "VE Tally Group", "VE Tally Stock Item",
    "VE Tally Enrichment", "VE Sales Register Entry", "VE Purchase Register Entry",
    "VE GST Ledger Entry", "VE Creditor Ledger", "VE Creditor Advance",
    "VE Debtor Ledger", "VE Debtor Advance", "VE Cash Flow Entry",
    "VE Stock Movement Summary", "VE Receipt", "VE Bank Account Balance",
    "VE Virtual Account Balance", "VE OD Account Balance", "VE Transport Record",
    "VE Saved Graph",
    # Drive
    "VE Drive File",
    # Quotation chain (parents)
    "Vera Measurement Sheet", "Vera BOQ", "Vera Cost Sheet",
    "Vera Sales Quotation", "Vera Sales Order",
    # Quotation masters (cloned per company in Phase 6)
    "Vera Quotation Unit", "Vera Quotation Material", "Vera Quotation Finish",
    "Vera Quotation Hardware", "Vera Quotation Pricing Method",
    "Vera Quotation Template", "Vera Terms Clause", "Vera Terms Template",
    # CRM
    "Vera CRM Lead", "Vera CRM Enquiry", "Vera CRM Opportunity", "Vera CRM Contact",
    "Vera CRM Followup", "Vera CRM Approval Request", "Vera CRM Quotation",
    "Vera Sales Team Member",
    # HR / ops custom
    "Vera Expense Claim", "Vera Leave Application", "Vera Employee Note",
    "Vera ERP Entry", "Vera Data Entry Request",
    # Org Hub
    "VE Job Description", "VE KRA", "VE KPI", "VE SOP", "VE Policy",
    "VE Employee Handbook", "VE Operations Manual", "VE Department Process",
    "VE Forms Checklist",
]

INTERCOMPANY = ["VE Tally Voucher", "Vera Sales Order", "Vera Sales Quotation"]

INDEXES = {
    "VE Tally Voucher": [["company", "voucher_date"], ["company", "party_name"]],
    "VE Tally Ledger": [["company", "ledger_name"]],
    "VE Tally Stock Item": [["company", "item_name"]],
    "VE Drive File": [["company"]],
    "VE Sales Register Entry": [["company"]],
    "VE Purchase Register Entry": [["company"]],
    "VE GST Ledger Entry": [["company"]],
    "VE Cash Flow Entry": [["company"]],
}


def execute():
    _add_company_field()
    _add_intercompany_fields()
    _backfill()
    _add_indexes()
    frappe.db.commit()


def _add_company_field():
    fields = {}
    for dt in SILOED:
        if not frappe.db.exists("DocType", dt):
            continue
        fields[dt] = [{
            "fieldname": "company", "fieldtype": "Link", "options": "Company",
            "label": "Company", "reqd": 1, "in_standard_filter": 1,
        }]
    if fields:
        create_custom_fields(fields, ignore_validate=True)


def _add_intercompany_fields():
    fields = {}
    for dt in INTERCOMPANY:
        if not frappe.db.exists("DocType", dt):
            continue
        fields[dt] = [
            {"fieldname": "is_intercompany", "fieldtype": "Check", "default": "0",
             "label": "Inter-company"},
            {"fieldname": "counterparty_company", "fieldtype": "Link",
             "options": "Company", "label": "Counterparty Company",
             "depends_on": "is_intercompany"},
        ]
    if frappe.db.exists("DocType", "Vera BOQ Line"):
        fields["Vera BOQ Line"] = [{
            "fieldname": "supplying_company", "fieldtype": "Link",
            "options": "Company", "label": "Supplying Company",
        }]
    if fields:
        create_custom_fields(fields, ignore_validate=True)


def _backfill():
    # Every siloed row → Vera Enterprises (only where unset).
    # NOTE: frappe.db.table_exists() takes the DocType NAME (not "tab..") in v15.
    for dt in SILOED:
        if not frappe.db.exists("DocType", dt):
            continue
        try:
            frappe.db.sql(
                f"UPDATE `tab{dt}` SET company=%s WHERE company IS NULL OR company=''",
                (VE,),
            )
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"phase1 backfill {dt}")
    # Employee.company (native, reqd) — fill only nulls, never overwrite.
    frappe.db.sql(
        "UPDATE `tabEmployee` SET company=%s WHERE company IS NULL OR company=''",
        (VE,),
    )


def _add_indexes():
    for dt, index_sets in INDEXES.items():
        if not frappe.db.exists("DocType", dt):
            continue
        for cols in index_sets:
            try:
                frappe.db.add_index(dt, cols)
            except Exception:
                pass  # index may already exist; DDL auto-commits, keep going
