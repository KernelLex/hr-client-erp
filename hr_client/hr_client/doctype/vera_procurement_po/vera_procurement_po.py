import frappe
from frappe.model.document import Document


class VeraProcurementPO(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		total = 0.0
		for r in self.get("lines") or []:
			r.amount = round((r.qty or 0) * (r.rate or 0), 2)
			total += r.amount
		self.total = round(total, 2)
