import frappe
from frappe.model.document import Document


class VeraCRMContact(Document):
    """Customer contact (Phase 2 spec §3.2). Multiple per customer. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
