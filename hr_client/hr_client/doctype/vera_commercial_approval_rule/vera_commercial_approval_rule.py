import frappe
from frappe.model.document import Document


class VeraCommercialApprovalRule(Document):
    """Configurable band for the commercial-approval engine (spec §5). Each row
    maps a range of one commercial dimension (discount %, quotation value, FOC ₹,
    waiver ₹, price-override %) to the approval level it requires. The engine in
    hr_client.api.commercial_approval reads these; GP and advance are computed
    against each quote's own target/minimum rather than static bands."""

    def before_insert(self):
        if not self.severity:
            self.severity = "Approval Required"
