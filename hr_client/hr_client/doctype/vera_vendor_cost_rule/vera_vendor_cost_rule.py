import frappe
from frappe.model.document import Document


class VeraVendorCostRule(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"
