import frappe
from frappe.model.document import Document


class VeraThickness(Document):
    """Quotation-module taxonomy master (Vera Thickness). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
