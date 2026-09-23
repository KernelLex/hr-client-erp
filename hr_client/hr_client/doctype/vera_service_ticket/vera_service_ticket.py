import frappe
from frappe.model.document import Document


class VeraServiceTicket(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"
		if not self.get("reported_on"):
			self.reported_on = frappe.utils.today()

	def validate(self):
		if self.status in ("Resolved", "Closed") and not self.resolved_on:
			self.resolved_on = frappe.utils.today()
