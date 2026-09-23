import frappe
from frappe.model.document import Document


class VeraHardwarePackage(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		# Per-line amount = qty × rate; package price auto-sums when auto_price is on.
		total = 0.0
		for row in self.get("items") or []:
			row.amount = (row.qty or 0) * (row.rate or 0)
			total += row.amount
		if self.auto_price:
			self.package_price = total
