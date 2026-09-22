"""Customer-facing quotation Print Format (owner spec: "ERP Quotation Print
Format Specification" — Detailed Commercial). Registers a Frappe Print Format
for Vera Sales Quotation that shows only customer-visible data — line items
grouped by section with section totals, summary totals with CGST/SGST split,
amount in words, and the coded T&C — and HIDES every internal field (cost, GP,
margin, minimum rate, source-line ids). Deploy: bench execute
hr_client.api.quotation_print.seed_print_format
"""

import frappe

FORMAT_NAME = "Vera Quotation - Customer"

# Jinja rendered by Frappe's print engine. `doc` = the Vera Sales Quotation.
_HTML = r"""
<div class="ve-quote">
<style>
  .ve-quote{font-family:'Helvetica Neue',Arial,sans-serif;color:#1f2d24;font-size:12px}
  .ve-quote h1,.ve-quote h2,.ve-quote h3{margin:0}
  .ve-head{display:flex;justify-content:space-between;border-bottom:3px solid #C6A15B;padding-bottom:10px;margin-bottom:14px}
  .ve-brand{font-size:22px;font-weight:700;color:#22432f;letter-spacing:.5px}
  .ve-brand small{display:block;font-size:11px;font-weight:400;color:#6b7a70;letter-spacing:0}
  .ve-doc{text-align:right}
  .ve-doc .t{font-size:16px;font-weight:700;color:#22432f}
  .ve-meta{width:100%;border-collapse:collapse;margin-bottom:14px}
  .ve-meta td{padding:2px 6px;vertical-align:top}
  .ve-meta .k{color:#6b7a70;width:120px}
  table.ve-lines{width:100%;border-collapse:collapse;margin-bottom:8px}
  table.ve-lines th{background:#22432f;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
  table.ve-lines td{padding:6px 8px;border-bottom:1px solid #e5eae6;vertical-align:top}
  table.ve-lines td.n,table.ve-lines th.n{text-align:right;white-space:nowrap}
  .ve-sec{background:#f3f0e6;font-weight:700;color:#22432f}
  .ve-sectot td{background:#faf7ef;font-weight:700;border-top:1px solid #C6A15B}
  .ve-tot{width:340px;margin-left:auto;border-collapse:collapse;margin-top:10px}
  .ve-tot td{padding:4px 8px}
  .ve-tot td.n{text-align:right;white-space:nowrap}
  .ve-tot tr.grand td{background:#22432f;color:#fff;font-size:14px;font-weight:700}
  .ve-words{margin:8px 0 16px;font-style:italic;color:#3a4a40}
  .ve-terms{margin-top:18px;border-top:1px solid #e5eae6;padding-top:10px}
  .ve-terms h3{color:#22432f;margin-bottom:6px}
  .ve-terms pre{white-space:pre-wrap;font-family:inherit;font-size:11px;color:#3a4a40;margin:0}
  .ve-wm{position:fixed;top:40%;left:20%;font-size:80px;color:rgba(198,161,91,.12);transform:rotate(-28deg);z-index:0}
</style>

{% if doc.status not in ("Approved",) %}<div class="ve-wm">{{ doc.status|upper }}</div>{% endif %}

<div class="ve-head">
  <div>
    <div class="ve-brand">{{ frappe.db.get_value("Company", doc.company, "company_name") or "Vera Enterprises" }}
      <small>Modular Interiors &middot; Trading &middot; Projects</small></div>
  </div>
  <div class="ve-doc">
    <div class="t">QUOTATION</div>
    <div>{{ doc.name }}{% if doc.revision %} &middot; Rev {{ doc.revision }}{% endif %}</div>
    <div>Date: {{ frappe.utils.formatdate(doc.creation, "dd MMM yyyy") }}</div>
    <div>Status: {{ doc.status }}</div>
  </div>
</div>

<table class="ve-meta"><tr>
  <td><table class="ve-meta">
    <tr><td class="k">Customer</td><td>{{ doc.company_name or "" }}</td></tr>
    <tr><td class="k">Title</td><td>{{ doc.quotation_title or "" }}</td></tr>
    <tr><td class="k">Prepared by</td><td>{{ doc.prepared_by or "" }}</td></tr>
  </table></td>
  <td><table class="ve-meta">
    <tr><td class="k">Payment</td><td>{{ doc.credit_terms or ("Standard" if doc.credit_terms_standard else "As agreed") }}</td></tr>
    {% if doc.advance_received %}<tr><td class="k">Advance</td><td>{{ doc.advance_received }}%</td></tr>{% endif %}
  </table></td>
</tr></table>

<table class="ve-lines">
  <thead><tr>
    <th style="width:26px">#</th><th>Description</th><th>Measurement</th>
    <th class="n">Qty</th><th>UOM</th><th class="n">Rate</th><th class="n">Amount</th>
  </tr></thead>
  <tbody>
  {% set ns = namespace(i=0) %}
  {% for section, rows in doc.lines|groupby("section") %}
    <tr class="ve-sec"><td colspan="7">{{ section or "Items" }}</td></tr>
    {% for r in rows %}
      {% set ns.i = ns.i + 1 %}
      <tr>
        <td class="n">{{ ns.i }}</td>
        <td>{{ r.specification or r.section or "" }}</td>
        <td>{{ r.measurement or "" }}</td>
        <td class="n">{{ "%.2f"|format(r.quantity or 0) }}</td>
        <td>{{ r.uom or "" }}</td>
        <td class="n">{{ frappe.utils.fmt_money(r.rate or 0, currency="INR") }}</td>
        <td class="n">{{ frappe.utils.fmt_money(r.gross_amount or 0, currency="INR") }}</td>
      </tr>
    {% endfor %}
    <tr class="ve-sectot"><td colspan="6">Section Total — {{ section or "Items" }}</td>
      <td class="n">{{ frappe.utils.fmt_money(rows|sum(attribute="gross_amount"), currency="INR") }}</td></tr>
  {% endfor %}
  </tbody>
</table>

<table class="ve-tot">
  <tr><td>Sub Total</td><td class="n">{{ frappe.utils.fmt_money(doc.gross_total or 0, currency="INR") }}</td></tr>
  {% if doc.discount_amount %}<tr><td>Discount{% if doc.discount_percent %} ({{ doc.discount_percent }}%){% endif %}</td>
    <td class="n">- {{ frappe.utils.fmt_money(doc.discount_amount or 0, currency="INR") }}</td></tr>{% endif %}
  {% if doc.adjustment %}<tr><td>Adjustment</td><td class="n">{{ frappe.utils.fmt_money(doc.adjustment or 0, currency="INR") }}</td></tr>{% endif %}
  <tr><td>Taxable Value</td><td class="n">{{ frappe.utils.fmt_money(doc.net_before_gst or 0, currency="INR") }}</td></tr>
  {% set half = (doc.gst_percent or 0) / 2 %}
  {% set gsthalf = (doc.gst_amount or 0) / 2 %}
  <tr><td>CGST @ {{ "%.1f"|format(half) }}%</td><td class="n">{{ frappe.utils.fmt_money(gsthalf, currency="INR") }}</td></tr>
  <tr><td>SGST @ {{ "%.1f"|format(half) }}%</td><td class="n">{{ frappe.utils.fmt_money(gsthalf, currency="INR") }}</td></tr>
  <tr class="grand"><td>Grand Total</td><td class="n">{{ frappe.utils.fmt_money(doc.grand_total or 0, currency="INR") }}</td></tr>
</table>

<div class="ve-words">Amount in words: {{ frappe.utils.money_in_words(doc.grand_total or 0) }}</div>

{% if doc.terms_and_conditions %}
<div class="ve-terms"><h3>Terms &amp; Conditions</h3><pre>{{ doc.terms_and_conditions }}</pre></div>
{% endif %}
</div>
"""


def seed_print_format():
    """Create/update the customer Print Format (idempotent)."""
    existing = frappe.db.exists("Print Format", FORMAT_NAME)
    doc = frappe.get_doc("Print Format", FORMAT_NAME) if existing else frappe.new_doc("Print Format")
    doc.update({
        "name": FORMAT_NAME,
        "doc_type": "Vera Sales Quotation",
        "module": "Hr Client",
        "print_format_type": "Jinja",
        "standard": "No",
        "custom_format": 1,
        "disabled": 0,
        "html": _HTML,
    })
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return {"print_format": FORMAT_NAME, "created": not existing}
