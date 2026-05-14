import frappe
from frappe.model.document import Document


class VeraCRMQuotation(Document):
    def validate(self):
        self._calculate_totals()

    def _calculate_totals(self):
        subtotal = 0.0
        for row in self.get("items") or []:
            row.amount = (row.quantity or 0) * (row.unit_price or 0)
            subtotal += row.amount
        self.subtotal = subtotal
        tax = (self.tax_percent or 0) / 100
        self.total = subtotal + (subtotal * tax)
