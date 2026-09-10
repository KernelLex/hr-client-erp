import frappe
from frappe.model.document import Document


class VeraSalesOrder(Document):
    """Stage 6 of the Quotation Studio six-stage chain (Phase 2 spec §4.11).

    Created only by gated conversion from an approved quotation. Permanently
    records the source quotation, BOQ and cost sheet numbers with their
    revisions, and is the commercial execution baseline + the §5 project-handover
    trigger. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
        if not self.prepared_by:
            self.prepared_by = frappe.session.user
