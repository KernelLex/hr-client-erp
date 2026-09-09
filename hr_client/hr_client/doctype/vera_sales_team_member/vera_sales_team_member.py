import frappe
from frappe.model.document import Document


class VeraSalesTeamMember(Document):
    """Sales team member (Phase 2 spec §3.2). Carries the approval authority
    used by the quotation approval engine (§4.6). ERP-native."""

    def before_insert(self):
        self.source = "ERP"

    def before_save(self):
        if self.member and not self.full_name:
            self.full_name = frappe.db.get_value("User", self.member, "full_name") or self.member
