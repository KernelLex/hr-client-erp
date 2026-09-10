import frappe
from frappe.model.document import Document


class VeraQuotationHardware(Document):
    """Hardware master (Phase 2 spec §4.7) — hardware items and packages
    (hinges, channels, baskets) referenced by units and BOQ lines. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
