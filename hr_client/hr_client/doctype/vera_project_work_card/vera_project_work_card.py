import frappe
from frappe.model.document import Document


class VeraProjectWorkCard(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		if self.status == "Done" and not self.completed_on:
			self.completed_on = frappe.utils.today()
