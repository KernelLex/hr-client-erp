import frappe
from frappe.model.document import Document


class VeraQuotationFinish(Document):
    """Finish master (Phase 2 spec §4.7) — internal/external finishes and edge
    banding options for BOQ line specifications. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
