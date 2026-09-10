import frappe
from frappe.model.document import Document


class VeraQuotationPricingMethod(Document):
    """Pricing method master (Phase 2 spec §4.3/§4.7). The `method` key
    (RFT/SFT/SQM/UNIT/LS) drives the BOQ quantity calculation; `formula` is the
    human-readable description shown to users. ERP-native."""

    def before_insert(self):
        self.source = "ERP"
