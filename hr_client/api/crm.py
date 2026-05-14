import frappe
import json
from datetime import datetime

ADMIN_USERS = {"Administrator", "owais@veraenterprises.in"}
STAGE_ORDER = ["Lead", "Discussion", "Quotation", "Order", "Delivery", "Success"]


def _is_admin():
    return (
        frappe.session.user in ADMIN_USERS
        or "System Manager" in frappe.get_roles(frappe.session.user)
    )


def _get_lead_or_throw(lead_id):
    try:
        return frappe.get_doc("Vera CRM Lead", lead_id)
    except frappe.DoesNotExistError:
        frappe.throw(f"Lead {lead_id} not found", frappe.DoesNotExistError)


# ---------------------------------------------------------------------------
# 1. get_all_leads
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_all_leads():
    user = frappe.session.user
    if _is_admin():
        filters = {}
    else:
        filters = {"assigned_to": user}

    leads = frappe.get_all(
        "Vera CRM Lead",
        filters=filters,
        fields=[
            "name",
            "lead_title",
            "company_name",
            "contact_person",
            "phone",
            "email",
            "service_interest",
            "source",
            "status",
            "approval_status",
            "current_stage_requested",
            "assigned_to",
            "approved_by",
            "creation",
            "modified",
        ],
        order_by="creation desc",
    )
    return {"leads": leads}


# ---------------------------------------------------------------------------
# 2. get_lead
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_lead(lead_id):
    doc = _get_lead_or_throw(lead_id)
    if not _is_admin() and doc.assigned_to != frappe.session.user:
        frappe.throw("Permission denied", frappe.PermissionError)

    lead_data = doc.as_dict()

    # Fetch approval history
    approvals = frappe.get_all(
        "Vera CRM Approval Request",
        filters={"lead": lead_id},
        fields=[
            "name",
            "requested_by",
            "requested_stage",
            "current_stage",
            "approval_status",
            "admin_notes",
            "quotation",
            "creation",
            "modified",
        ],
        order_by="creation desc",
    )
    lead_data["approval_history"] = approvals

    # Fetch quotation if any
    quotation = frappe.db.get_value(
        "Vera CRM Quotation",
        {"lead": lead_id},
        ["name", "quotation_number", "status", "total", "pdf_attachment"],
        as_dict=True,
    )
    lead_data["quotation"] = quotation

    return {"lead": lead_data}


# ---------------------------------------------------------------------------
# 3. create_lead
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def create_lead(data):
    if isinstance(data, str):
        data = json.loads(data)

    required = ["lead_title", "company_name", "contact_person", "phone", "email", "service_interest"]
    for field in required:
        if not data.get(field):
            frappe.throw(f"Field '{field}' is required")

    doc = frappe.new_doc("Vera CRM Lead")
    for key, val in data.items():
        setattr(doc, key, val)

    doc.status = "Lead"
    doc.approval_status = "Pending"
    if not doc.assigned_to:
        doc.assigned_to = frappe.session.user

    doc.insert(ignore_permissions=False)
    frappe.db.commit()
    return {"success": True, "lead_id": doc.name}


# ---------------------------------------------------------------------------
# 4. update_lead
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def update_lead(lead_id, data):
    if isinstance(data, str):
        data = json.loads(data)

    doc = _get_lead_or_throw(lead_id)
    if not _is_admin() and doc.assigned_to != frappe.session.user:
        frappe.throw("Permission denied", frappe.PermissionError)

    # Never allow direct status change via update_lead — only via approval flow
    data.pop("status", None)
    data.pop("approval_status", None)

    for key, val in data.items():
        setattr(doc, key, val)

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# 5. request_stage_advance
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def request_stage_advance(lead_id, target_stage, notes=""):
    doc = _get_lead_or_throw(lead_id)

    current = doc.status
    if current == "Failed":
        frappe.throw("Cannot advance a failed lead")
    if current == "Success":
        frappe.throw("Lead is already at Success stage")
    if target_stage not in STAGE_ORDER:
        frappe.throw(f"Invalid stage: {target_stage}")

    current_idx = STAGE_ORDER.index(current) if current in STAGE_ORDER else 0
    target_idx = STAGE_ORDER.index(target_stage)
    if target_idx <= current_idx:
        frappe.throw(f"Cannot move to stage '{target_stage}' — it is not an advance from '{current}'")

    # Check if there's already a pending approval
    existing_pending = frappe.db.get_value(
        "Vera CRM Approval Request",
        {"lead": lead_id, "approval_status": "Pending"},
        "name",
    )
    if existing_pending:
        frappe.throw("There is already a pending approval request for this lead")

    # Snapshot of lead
    lead_snapshot = json.dumps(doc.as_dict(), default=str)

    approval = frappe.new_doc("Vera CRM Approval Request")
    approval.lead = lead_id
    approval.requested_by = frappe.session.user
    approval.requested_stage = target_stage
    approval.current_stage = current
    approval.approval_status = "Pending"
    approval.lead_snapshot = lead_snapshot
    if notes:
        approval.admin_notes = f"Requester notes: {notes}"
    approval.insert(ignore_permissions=True)

    # Update lead to show pending
    doc.approval_status = "Pending"
    doc.current_stage_requested = target_stage
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Send email notification to Owais
    try:
        frappe.sendmail(
            recipients=["owais@veraenterprises.in"],
            subject=f"[CRM] Stage Advance Request: {doc.lead_title} → {target_stage}",
            message=f"""
<p>A stage advance request has been submitted for lead <strong>{doc.lead_title}</strong>.</p>
<ul>
  <li><strong>Company:</strong> {doc.company_name}</li>
  <li><strong>Current Stage:</strong> {current}</li>
  <li><strong>Requested Stage:</strong> {target_stage}</li>
  <li><strong>Requested By:</strong> {frappe.session.user}</li>
  <li><strong>Notes:</strong> {notes or "None"}</li>
</ul>
<p>Approval ID: {approval.name}</p>
            """,
        )
    except Exception:
        pass  # Don't fail the request if email fails

    return {"success": True, "approval_id": approval.name}


# ---------------------------------------------------------------------------
# 6. approve_stage
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def approve_stage(approval_id, admin_notes=""):
    if frappe.session.user not in ADMIN_USERS and "System Manager" not in frappe.get_roles(frappe.session.user):
        frappe.throw("Only administrators can approve stage transitions", frappe.PermissionError)

    try:
        approval = frappe.get_doc("Vera CRM Approval Request", approval_id)
    except frappe.DoesNotExistError:
        frappe.throw(f"Approval request {approval_id} not found")

    if approval.approval_status != "Pending":
        frappe.throw(f"Approval request is already {approval.approval_status}")

    approval.approval_status = "Approved"
    if admin_notes:
        approval.admin_notes = admin_notes
    approval.save(ignore_permissions=True)

    # Advance the lead
    lead = frappe.get_doc("Vera CRM Lead", approval.lead)
    lead.status = approval.requested_stage
    lead.approval_status = "Approved"
    lead.approved_by = frappe.session.user
    lead.current_stage_requested = None
    lead.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "new_stage": approval.requested_stage}


# ---------------------------------------------------------------------------
# 7. reject_stage
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def reject_stage(approval_id, rejection_reason="", admin_notes=""):
    if frappe.session.user not in ADMIN_USERS and "System Manager" not in frappe.get_roles(frappe.session.user):
        frappe.throw("Only administrators can reject stage transitions", frappe.PermissionError)

    try:
        approval = frappe.get_doc("Vera CRM Approval Request", approval_id)
    except frappe.DoesNotExistError:
        frappe.throw(f"Approval request {approval_id} not found")

    if approval.approval_status != "Pending":
        frappe.throw(f"Approval request is already {approval.approval_status}")

    approval.approval_status = "Rejected"
    notes = admin_notes
    if rejection_reason:
        notes = f"Rejection reason: {rejection_reason}" + (f"\n{admin_notes}" if admin_notes else "")
    approval.admin_notes = notes
    approval.save(ignore_permissions=True)

    # Update lead — stays at current stage
    lead = frappe.get_doc("Vera CRM Lead", approval.lead)
    lead.approval_status = "Rejected"
    lead.rejection_reason = rejection_reason
    lead.current_stage_requested = None
    lead.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True}


# ---------------------------------------------------------------------------
# 8. mark_failed
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def mark_failed(lead_id, reason):
    if not _is_admin():
        frappe.throw("Only administrators can mark leads as failed", frappe.PermissionError)

    doc = _get_lead_or_throw(lead_id)
    doc.status = "Failed"
    doc.rejection_reason = reason
    doc.approval_status = "Rejected"
    doc.current_stage_requested = None
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# 9. create_quotation
# ---------------------------------------------------------------------------
@frappe.whitelist(methods=["POST"])
def create_quotation(lead_id, items, terms="", validity_days=30, tax_percent=18):
    doc = _get_lead_or_throw(lead_id)

    if isinstance(items, str):
        items = json.loads(items)
    validity_days = int(validity_days)
    tax_percent = float(tax_percent)

    # Build quotation doc
    quot_doc = frappe.new_doc("Vera CRM Quotation")
    quot_doc.lead = lead_id
    quot_doc.terms_and_conditions = terms
    quot_doc.validity_days = validity_days
    quot_doc.tax_percent = tax_percent
    quot_doc.status = "Draft"

    subtotal = 0.0
    for item in items:
        qty = float(item.get("quantity", 1))
        price = float(item.get("unit_price", 0))
        amount = qty * price
        subtotal += amount
        quot_doc.append(
            "items",
            {
                "item_description": item.get("item_description", ""),
                "quantity": qty,
                "unit_price": price,
                "amount": amount,
            },
        )

    quot_doc.subtotal = subtotal
    quot_doc.total = subtotal + (subtotal * tax_percent / 100)
    quot_doc.insert(ignore_permissions=True)

    # Set quotation_number to the doc name for display
    quot_doc.quotation_number = quot_doc.name
    quot_doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Generate PDF
    try:
        _generate_quotation_pdf(quot_doc, doc)
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "CRM Quotation PDF Generation Failed")

    return {"success": True, "quotation_id": quot_doc.name}


def _generate_quotation_pdf(quot_doc, lead_doc):
    """Generate a PDF for the quotation and attach it."""
    items_rows = ""
    for item in quot_doc.get("items") or []:
        items_rows += f"""
        <tr>
          <td>{item.item_description}</td>
          <td style="text-align:right">{item.quantity}</td>
          <td style="text-align:right">₹{item.unit_price:,.2f}</td>
          <td style="text-align:right">₹{item.amount:,.2f}</td>
        </tr>"""

    html_content = f"""
<html><head><style>
  body {{ font-family: Arial, sans-serif; margin: 40px; color: #333; }}
  .header {{ text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; }}
  h1 {{ color: #1e3a5f; margin: 0 0 5px 0; }}
  .meta {{ color: #666; font-size: 14px; }}
  .section {{ margin: 20px 0; }}
  .section h3 {{ color: #1e3a5f; border-bottom: 1px solid #ddd; padding-bottom: 5px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
  th, td {{ border: 1px solid #ddd; padding: 10px; text-align: left; }}
  th {{ background: #1e3a5f; color: white; }}
  .subtotal-row td {{ background: #f9f9f9; }}
  .tax-row td {{ background: #f9f9f9; }}
  .total-row td {{ font-weight: bold; background: #e8f0fe; font-size: 16px; }}
  .lead-info {{ background: #f5f7fa; padding: 15px; border-radius: 5px; margin: 15px 0; }}
  .lead-info p {{ margin: 5px 0; }}
  .terms {{ font-size: 12px; color: #666; margin-top: 30px; }}
  .footer {{ margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }}
</style></head>
<body>
  <div class="header">
    <h1>Vera Enterprises</h1>
    <p class="meta">Quotation #{quot_doc.quotation_number}</p>
    <p class="meta">Date: {datetime.now().strftime('%d %b %Y')}</p>
    <p class="meta">Valid for {quot_doc.validity_days} days</p>
  </div>

  <div class="lead-info">
    <p><strong>To:</strong> {lead_doc.company_name}</p>
    <p><strong>Attn:</strong> {lead_doc.contact_person}</p>
    <p><strong>Service:</strong> {lead_doc.service_interest}</p>
  </div>

  <div class="section">
    <h3>Items</h3>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items_rows}
        <tr class="subtotal-row">
          <td colspan="3" style="text-align:right"><strong>Subtotal</strong></td>
          <td style="text-align:right">₹{quot_doc.subtotal:,.2f}</td>
        </tr>
        <tr class="tax-row">
          <td colspan="3" style="text-align:right"><strong>Tax ({quot_doc.tax_percent}%)</strong></td>
          <td style="text-align:right">₹{(quot_doc.subtotal * quot_doc.tax_percent / 100):,.2f}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3" style="text-align:right">TOTAL</td>
          <td style="text-align:right">₹{quot_doc.total:,.2f}</td>
        </tr>
      </tbody>
    </table>
  </div>

  {f'<div class="section"><h3>Terms &amp; Conditions</h3><p>{quot_doc.terms_and_conditions}</p></div>' if quot_doc.terms_and_conditions else ''}

  <div class="footer">
    Vera Enterprises | Authorized by Owais Ahmed Khan<br/>
    This quotation is valid for {quot_doc.validity_days} days from the date of issue.
  </div>
</body></html>"""

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_content).write_pdf()
    except ImportError:
        from frappe.utils.pdf import get_pdf
        pdf_bytes = get_pdf(html_content)

    import base64
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": f"Quotation-{quot_doc.quotation_number}.pdf",
        "content": base64.b64encode(pdf_bytes).decode(),
        "is_private": 0,
        "attached_to_doctype": "Vera CRM Quotation",
        "attached_to_name": quot_doc.name,
        "decode": True,
    })
    file_doc.insert(ignore_permissions=True)
    quot_doc.pdf_attachment = file_doc.file_url
    quot_doc.save(ignore_permissions=True)
    frappe.db.commit()


# ---------------------------------------------------------------------------
# 10. get_quotation
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_quotation(quotation_id):
    try:
        quot = frappe.get_doc("Vera CRM Quotation", quotation_id)
    except frappe.DoesNotExistError:
        frappe.throw(f"Quotation {quotation_id} not found", frappe.DoesNotExistError)

    data = quot.as_dict()
    return {"quotation": data}
