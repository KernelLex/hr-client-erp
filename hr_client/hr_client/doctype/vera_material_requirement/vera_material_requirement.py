import frappe
from frappe.model.document import Document


class VeraMaterialRequirement(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		for r in self.get("lines") or []:
			r.est_amount = round((r.qty or 0) * (r.est_rate or 0), 2)
