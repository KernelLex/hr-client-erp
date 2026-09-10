import frappe
from frappe.model.document import Document


class VeraMeasurementSheet(Document):
    """Stage 1 of the Quotation Studio six-stage chain (Phase 2 spec §4.2).

    Captures actual site dimensions across three registers (measurement rows,
    obstructions, services). Carries its own revision and an approval gate: a
    BOQ can only be built on an *approved* measurement revision (§4.2, enforced
    downstream in §4.3). ERP-native."""

    def before_insert(self):
        self.source = "ERP"
        if not self.measured_by:
            self.measured_by = frappe.session.user
        if not self.revision:
            self.revision = 1
