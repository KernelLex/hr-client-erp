import frappe
from frappe.model.document import Document


class VeraBOQ(Document):
    """Stage 2 of the Quotation Studio six-stage chain (Phase 2 spec §4.3).

    A BOQ configures what will be supplied — one line per unit, each carrying the
    full technical specification and a pricing method that drives its quantity.
    Built on an approved measurement revision; carries its own revision and
    approval gate. Quantity/amount maths and validation live in
    hr_client.api.boq. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
        if not self.prepared_by:
            self.prepared_by = frappe.session.user
        if not self.revision:
            self.revision = 1
