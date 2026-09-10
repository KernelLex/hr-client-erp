import frappe
from frappe.model.document import Document


class VeraBOQLine(Document):
    """One configured unit on a BOQ (Phase 2 spec §4.3). Quantity and amounts
    are computed server-side in hr_client.api.boq, never trusted from input."""
    pass
