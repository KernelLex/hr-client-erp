import frappe
from frappe.model.document import Document


class VeraDataEntryRequest(Document):
    """A non-admin's request to create an ERP-native entry (Phase 2 spec §2.4).

    Lifecycle: Draft → Submitted → Under Review → Approved / Rejected /
    Returned for Info. On approval an admin materialises a Vera ERP Entry from
    this request's data and the two are linked permanently (see
    hr_client.api.erp_entries.approve_request).
    """

    def before_insert(self):
        if not self.requested_by:
            self.requested_by = frappe.session.user
        if not self.requested_by_name:
            self.requested_by_name = frappe.db.get_value(
                "User", frappe.session.user, "full_name"
            ) or frappe.session.user
