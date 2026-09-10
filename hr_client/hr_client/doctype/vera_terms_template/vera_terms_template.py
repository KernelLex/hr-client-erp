import frappe
from frappe.model.document import Document


class VeraTermsTemplate(Document):
    """A versioned clause set assembled per quotation category (Phase 2 spec
    §4.10). An approved quotation retains the clause version in force at the time
    of approval, so reprinting reproduces the original terms."""

    def before_insert(self):
        self.source = "ERP"
