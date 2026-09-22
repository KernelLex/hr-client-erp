import frappe
from frappe.model.document import Document


class VeraScopeType(Document):
    """Quotation-module taxonomy master (Vera Scope Type). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
