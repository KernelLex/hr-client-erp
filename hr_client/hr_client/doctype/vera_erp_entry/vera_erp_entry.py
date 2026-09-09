import frappe
from frappe.model.document import Document


class VeraERPEntry(Document):
    """ERP-native financial/document record (Phase 2 spec §2.3).

    These are voided, never hard-deleted, so the original values are preserved
    in the audit log. `source` is permanently ERP — this DocType is never
    populated by the Tally sync.
    """

    def before_insert(self):
        # Provenance is fixed at creation and can never change.
        self.source = "ERP"
        if not self.created_by_user:
            self.created_by_user = frappe.session.user

    def on_trash(self):
        # Void, don't delete — preserve the audit trail. Only allow a hard
        # delete when explicitly forced by an administrator cleanup flag.
        if not frappe.flags.get("allow_erp_entry_delete"):
            frappe.throw(
                "ERP Entries are voided, not deleted. Set status to 'Voided' "
                "with a reason instead.",
                frappe.PermissionError,
            )

    def void(self, reason: str):
        if not reason:
            frappe.throw("A reason is required to void an entry.")
        self.status = "Voided"
        self.void_reason = reason
        self.voided_by = frappe.session.user
        self.voided_on = frappe.utils.now_datetime()
        self.save(ignore_permissions=True)
