"""Central multi-company ORM safety net (Phase 2).

Registers a `permission_query_conditions` handler for every siloed DocType so
that *any* frappe.get_all / get_list / get_count issued as the logged-in user is
automatically constrained to their active company. Group owner and platform
admin get no restriction (they see all companies).

This is defense-in-depth: it cannot be forgotten when a new endpoint is added.
Raw `frappe.db.sql()` queries bypass this layer and are scoped explicitly with
`utils.company_sql()` in the financial modules.
"""

import frappe
from hr_client.api.utils import is_group_owner, is_platform_admin, current_company

# Siloed parent DocTypes (mirror of the Phase 1 list). Child tables are reached
# through their parent, which is already constrained.
SILOED_QC = [
    "VE Tally Voucher", "VE Tally Ledger", "VE Tally Group", "VE Tally Stock Item",
    "VE Tally Enrichment", "VE Sales Register Entry", "VE Purchase Register Entry",
    "VE GST Ledger Entry", "VE Creditor Ledger", "VE Creditor Advance",
    "VE Debtor Ledger", "VE Debtor Advance", "VE Cash Flow Entry",
    "VE Stock Movement Summary", "VE Receipt", "VE Bank Account Balance",
    "VE Virtual Account Balance", "VE OD Account Balance", "VE Transport Record",
    "VE Saved Graph", "VE Drive File",
    "Vera Measurement Sheet", "Vera BOQ", "Vera Cost Sheet",
    "Vera Sales Quotation", "Vera Sales Order",
    "Vera Quotation Unit", "Vera Quotation Material", "Vera Quotation Finish",
    "Vera Quotation Hardware", "Vera Quotation Pricing Method",
    "Vera Quotation Template", "Vera Terms Clause", "Vera Terms Template",
    "Vera CRM Lead", "Vera CRM Enquiry", "Vera CRM Opportunity", "Vera CRM Contact",
    "Vera CRM Followup", "Vera CRM Approval Request", "Vera CRM Quotation",
    "Vera Sales Team Member",
    "Vera Expense Claim", "Vera Leave Application", "Vera Employee Note",
    "Vera ERP Entry", "Vera Data Entry Request",
    "VE Job Description", "VE KRA", "VE KPI", "VE SOP", "VE Policy",
    "VE Employee Handbook", "VE Operations Manual", "VE Department Process",
    "VE Forms Checklist",
]


def qc_name(dt: str) -> str:
    return "qc_" + dt.lower().replace(" ", "_")


def _make_qc(dt: str):
    def _cond(user=None):
        u = user or frappe.session.user
        if is_group_owner(u) or is_platform_admin(u):
            return ""
        try:
            c = current_company()
        except Exception:
            return "1=0"   # no company access → see nothing
        return f"`tab{dt}`.`company` = {frappe.db.escape(c)}"
    _cond.__name__ = qc_name(dt)
    return _cond


# Generate one module-level function per siloed DocType.
for _dt in SILOED_QC:
    globals()[qc_name(_dt)] = _make_qc(_dt)
