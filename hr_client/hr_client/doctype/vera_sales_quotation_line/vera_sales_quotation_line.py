import frappe
from frappe.model.document import Document


class VeraSalesQuotationLine(Document):
    """A commercial line on a customer quotation (Phase 2 spec §4.5). Grouped by
    line_type into the three content tabs: Project/Modular, Trading, Services."""
    pass
