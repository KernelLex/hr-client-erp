import frappe
from frappe.model.document import Document


class VeraGlass(Document):
    """Quotation-module taxonomy master (Vera Glass). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
