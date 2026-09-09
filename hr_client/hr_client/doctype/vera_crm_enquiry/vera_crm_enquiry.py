import frappe
from frappe.model.document import Document


class VeraCRMEnquiry(Document):
    """Qualified requirement in the CRM pipeline (Phase 2 spec §3.2).
    Lead → Enquiry → Opportunity. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
