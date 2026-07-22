import frappe
from frappe.model.document import Document


class VEJobDescription(Document):
    def before_save(self):
        self.jd_title = f"{self.designation} - {self.department} - {self.company}"
