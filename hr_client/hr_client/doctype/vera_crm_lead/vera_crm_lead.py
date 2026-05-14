import frappe
from frappe.model.document import Document


class VeraCRMLead(Document):
    def validate(self):
        if self.email and "@" not in self.email:
            frappe.throw("Please enter a valid email address")

    def before_insert(self):
        if not self.assigned_to:
            self.assigned_to = frappe.session.user
