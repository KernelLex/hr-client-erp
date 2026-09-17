import frappe
from frappe.model.document import Document


class VeraInternalPOLine(Document):
    """A line on an inter-company internal PO, snapshotted from the Sales Order
    line whose supplying_company differs from the quoting company (Phase 7 §3)."""
    pass
