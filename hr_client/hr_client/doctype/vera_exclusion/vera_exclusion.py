import frappe
from frappe.model.document import Document


class VeraExclusion(Document):
    """Quotation-module taxonomy master (Vera Exclusion). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
