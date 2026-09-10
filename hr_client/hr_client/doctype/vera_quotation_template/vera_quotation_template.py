import frappe
from frappe.model.document import Document


class VeraQuotationTemplate(Document):
    """Measurement/specification template master (Phase 2 spec §4.7). Declares
    which dynamic dimension fields a unit type exposes during measurement and
    BOQ entry. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
