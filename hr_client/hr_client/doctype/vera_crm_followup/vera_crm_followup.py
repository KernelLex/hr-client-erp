import frappe
from frappe.model.document import Document


class VeraCRMFollowup(Document):
    """Follow-up task against a lead/enquiry/opportunity (Phase 2 spec §3.2).
    ERP-native."""

    def before_insert(self):
        self.source = "ERP"
        if not self.assigned_to:
            self.assigned_to = frappe.session.user
