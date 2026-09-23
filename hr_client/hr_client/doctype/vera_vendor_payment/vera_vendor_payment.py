import frappe
from frappe.model.document import Document


class VeraVendorPayment(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"
		if not self.get("payment_date"):
			self.payment_date = frappe.utils.today()
