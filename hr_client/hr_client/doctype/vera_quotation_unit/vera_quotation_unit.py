import frappe
from frappe.model.document import Document


class VeraQuotationUnit(Document):
    """Unit master (Phase 2 spec §4.7). Drives the unit-type dropdown and its
    default pricing method / measurement template / hardware package in the
    BOQ configurator. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
