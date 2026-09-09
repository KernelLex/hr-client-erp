import frappe
from frappe.model.document import Document


class VeraCRMOpportunity(Document):
    """Pipeline opportunity (Phase 2 spec §3.2). Marking stage=Won is the
    trigger for the CRM→Project handover (spec §5). ERP-native."""

    def before_insert(self):
        self.source = "ERP"
