import frappe
from frappe.model.document import Document


class VeraInternalPO(Document):
    """An inter-company purchase order (Phase 7 §3 — the Quotation Studio payoff).

    Auto-generated when a Sales Order is confirmed and one or more of its lines
    are supplied by a sibling company (line.supplying_company != the SO's own
    company). One PO is raised per supplying company, lives in that supplying
    company's books, is tagged inter-company for the Phase 8 group-console
    elimination, and — if its total clears the §4.6 threshold — routes through
    the supplying company's approval ladder before it is Approved."""

    def before_insert(self):
        if not self.po_date:
            self.po_date = frappe.utils.today()
        self.is_intercompany = 1
        if not self.counterparty_company:
            self.counterparty_company = self.buying_company

    def validate(self):
        # Total is always the sum of the lines — never trusted from the client.
        self.total = round(sum(frappe.utils.flt(ln.amount) for ln in self.lines), 2)
