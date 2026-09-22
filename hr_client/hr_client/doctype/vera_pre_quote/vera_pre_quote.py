import frappe
from frappe.model.document import Document


class VeraPreQuote(Document):
    """Pre-Quote — quick requirement capture + budgetary estimate (spec "ERP
    Pre-Quote Form"). Front of the funnel: Lead/Enquiry → Pre-Quote → Site
    Measurement → BOQ → Cost Sheet → Final Quotation. Converts to a Vera CRM
    Opportunity that the quotation chain builds from. ERP-native, company-scoped."""

    def before_insert(self):
        self.source = "ERP"
        if not self.salesperson:
            self.salesperson = frappe.session.user
