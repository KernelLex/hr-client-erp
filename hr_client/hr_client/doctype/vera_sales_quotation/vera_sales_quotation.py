import frappe
from frappe.model.document import Document


class VeraSalesQuotation(Document):
    """Stage 4 of the Quotation Studio six-stage chain (Phase 2 spec §4.5/§4.6).

    The commercial offer, built from an approved BOQ and priced against an
    approved cost sheet. Totals cascade Gross → Discount → Adjustment → Net →
    GST → Grand; gross profit is live against the cost basis. A commercial-
    approval exception engine (§4.6) routes it to the right authority. Maths,
    the engine, and the workflow live in hr_client.api.quotation. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
        if not self.prepared_by:
            self.prepared_by = frappe.session.user
        if not self.revision:
            self.revision = 1
