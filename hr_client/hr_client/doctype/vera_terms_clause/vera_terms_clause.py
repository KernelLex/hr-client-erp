import frappe
from frappe.model.document import Document


class VeraTermsClause(Document):
    """A modular clause in the terms library (Phase 2 spec §4.10)."""

    def before_insert(self):
        self.source = "ERP"
