import frappe
from frappe.model.document import Document


class VeraTermsTemplateClause(Document):
    """A clause included in a terms template, with its text snapshotted at the
    template version in force (Phase 2 spec §4.10)."""
    pass
