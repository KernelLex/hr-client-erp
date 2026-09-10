import frappe
from frappe.model.document import Document


class VeraSalesOrderLine(Document):
    """A line on a sales order, snapshotted from the source quotation (§4.11)."""
    pass
