import frappe
from frappe.model.document import Document


class VeraQuotationMaterial(Document):
    """Material master (Phase 2 spec §4.7) — carcass/shutter materials and
    thicknesses used in BOQ line specifications. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
