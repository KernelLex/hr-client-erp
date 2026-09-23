import frappe
from frappe.model.document import Document


class VeraProject(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		# Received rolls up from milestones when any are marked Received.
		received = sum((r.received_amount or 0) for r in self.get("payment_milestones") or []
		               if r.status == "Received")
		if received:
			self.advance_received = received
		self.outstanding = (self.contract_value or 0) - (self.advance_received or 0)
