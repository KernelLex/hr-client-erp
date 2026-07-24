import frappe
from frappe.model.document import Document


class VETransportRecord(Document):
    def before_save(self):
        if self.entry_date:
            d = str(self.entry_date)
            self.period = d[:7]
        # For Labour records, compute total from sub-components if not set explicitly
        if self.source == "Labour":
            sub_total = (
                (self.labour_day_charges or 0)
                + (self.labour_transport or 0)
                + (self.labour_food or 0)
            )
            if sub_total and not self.amount:
                self.amount = sub_total
