import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class VeraDelivery(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		# POD presence is the single source of truth for the "POD Received" flag.
		self.pod_received = 1 if self.pod_document else 0

		# A delivery may only be marked Delivered once a proof-of-delivery document
		# is attached — this is the business rule the logistics team relies on.
		if self.status == "Delivered" and not self.pod_document:
			frappe.throw(
				"Attach a Proof of Delivery document before marking this delivery as Delivered."
			)

		if self.status == "Delivered" and not self.delivered_on:
			self.delivered_on = now_datetime()
		if self.status != "Delivered":
			self.delivered_on = None
