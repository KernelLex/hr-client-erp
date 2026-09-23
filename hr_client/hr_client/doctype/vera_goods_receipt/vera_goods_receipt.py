import frappe
from frappe.model.document import Document
from frappe.utils import flt


class VeraGoodsReceipt(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		total = 0.0
		for r in self.get("lines") or []:
			r.amount = flt(r.received_qty) * flt(r.rate)
			total += r.amount
		self.total = total
