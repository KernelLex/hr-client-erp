import frappe
from frappe.model.document import Document


class VeraCostSheetLine(Document):
    """A cost line snapshotted from a BOQ line at cost-sheet build time
    (Phase 2 spec §4.4). Frozen so the cost sheet stays stable across later BOQ
    revisions."""
    pass
