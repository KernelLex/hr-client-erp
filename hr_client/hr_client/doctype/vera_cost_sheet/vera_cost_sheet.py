import frappe
from frappe.model.document import Document


class VeraCostSheet(Document):
    """Stage 3 of the Quotation Studio six-stage chain (Phase 2 spec §4.4).

    Base cost = Σ(cost rate × calculated quantity) across the BOQ lines; an
    overhead % gives total cost. Target and minimum GP % set here drive the §4.6
    commercial-approval engine. Carries its own revision + approval; the approved
    revision is stamped onto the sales order (§4.11). Maths live in
    hr_client.api.cost_sheet. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
        if not self.prepared_by:
            self.prepared_by = frappe.session.user
        if not self.revision:
            self.revision = 1
