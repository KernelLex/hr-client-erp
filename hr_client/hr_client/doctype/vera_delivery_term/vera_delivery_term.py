import frappe
from frappe.model.document import Document


class VeraDeliveryTerm(Document):
    """Quotation-module taxonomy master (Vera Delivery Term). ERP-native, global; seeded by
    hr_client.api.quotation_taxonomy.seed_all()."""

    def before_insert(self):
        self.source = "ERP"
