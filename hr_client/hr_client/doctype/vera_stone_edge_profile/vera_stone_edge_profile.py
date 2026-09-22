import frappe
from frappe.model.document import Document


class VeraStoneEdgeProfile(Document):
    """Quotation-module taxonomy master (Vera Stone Edge Profile). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
