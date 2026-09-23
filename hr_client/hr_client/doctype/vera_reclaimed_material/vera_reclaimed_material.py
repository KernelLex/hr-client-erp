import frappe
from frappe.model.document import Document


class VeraReclaimedMaterial(Document):
	def before_insert(self):
		if not self.get("source"):
			self.source = "ERP"

	def validate(self):
		# Exactly one primary image; default the first when none flagged.
		primaries = [r for r in self.images if r.is_primary]
		if not primaries and self.images:
			self.images[0].is_primary = 1
		elif len(primaries) > 1:
			for r in primaries[1:]:
				r.is_primary = 0
