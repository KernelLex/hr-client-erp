import frappe
import json
from frappe.utils import now_datetime
from datetime import date, timedelta

OWAIS_USERS = {"owais@veraenterprises.in", "Administrator"}
STAGE_ORDER = ["Lead", "Discussion", "Quotation", "Order", "Delivery", "Success"]


def _is_owais():
    return frappe.session.user in OWAIS_USERS


def _next_stage(current):
    try:
        idx = STAGE_ORDER.index(current)
    except ValueError:
        return None
    if idx >= len(STAGE_ORDER) - 1:
        return None
    return STAGE_ORDER[idx + 1]


def _user_full_name(user):
    return frappe.db.get_value("User", user, "full_name") or user


@frappe.whitelist()
def get_all_leads():
    frappe.has_permission("Vera CRM Lead", ptype="read", throw=True)
    leads = frappe.get_all(
        "Vera CRM Lead",
        fields=[
            "name", "lead_title", "company_name", "contact_person", "phone",
            "email", "service_interest", "source", "notes", "status",
            "rejection_reason", "assigned_to", "approval_status",
            "stage_push_requested", "creation", "modified",
        ],
        order_by="creation desc",
    )
    for lead in leads:
        lead["assigned_to_name"] = _user_full_name(lead["assigned_to"]) if lead.get("assigned_to") else ""
        pending = frappe.get_all(
            "Vera CRM Approval Request",
            filters={"lead": lead["name"], "approval_status": "Pending"},
            fields=["name", "requested_stage", "requested_by", "requested_by_name", "creation"],
            limit=1,
            order_by="creation desc",
        )
        lead["pending_approval"] = pending[0] if pending else None
    return {"success": True, "leads": leads}


@frappe.whitelist()
def get_lead(lead_id):
    frappe.has_permission("Vera CRM Lead", ptype="read", throw=True)
    try:
        lead = frappe.get_doc("Vera CRM Lead", lead_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Lead not found"}

    data = lead.as_dict()
    data["assigned_to_name"] = _user_full_name(lead.assigned_to) if lead.assigned_to else ""

    approvals = frappe.get_all(
        "Vera CRM Approval Request",
        filters={"lead": lead_id},
        fields=[
            "name", "lead_title", "company_name", "contact_person", "phone",
            "email", "service_interest", "current_stage", "requested_stage",
            "requested_by", "requested_by_name", "request_notes",
            "approval_status", "admin_notes", "reviewed_by", "reviewed_on", "creation",
        ],
        order_by="creation desc",
    )
    data["approval_history"] = approvals
    pending = [a for a in approvals if a.get("approval_status") == "Pending"]
    data["pending_approval"] = pending[0] if pending else None

    quotations = frappe.get_all(
        "Vera CRM Quotation",
        filters={"lead": lead_id},
        fields=["name"],
        limit=1,
        order_by="creation desc",
    )
    if quotations:
        q = frappe.get_doc("Vera CRM Quotation", quotations[0]["name"])
        data["quotation"] = q.as_dict()
    else:
        data["quotation"] = None

    return {"success": True, "lead": data}


@frappe.whitelist(methods=["POST"])
def create_lead(lead_title, company_name, contact_person, phone, email,
                service_interest, source=None, notes=None):
    frappe.has_permission("Vera CRM Lead", ptype="create", throw=True)
    doc = frappe.new_doc("Vera CRM Lead")
    doc.lead_title = lead_title
    doc.company_name = company_name
    doc.contact_person = contact_person
    doc.phone = phone
    doc.email = email
    doc.service_interest = service_interest
    doc.source = source or ""
    doc.notes = notes or ""
    doc.status = "Lead"
    doc.approval_status = "Approved"
    doc.stage_push_requested = 0
    doc.assigned_to = frappe.session.user
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "lead": doc.as_dict()}


@frappe.whitelist(methods=["POST"])
def update_lead(lead_id, data):
    frappe.has_permission("Vera CRM Lead", ptype="write", throw=True)
    if isinstance(data, str):
        data = json.loads(data)
    try:
        doc = frappe.get_doc("Vera CRM Lead", lead_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Lead not found"}

    if not _is_owais() and doc.assigned_to != frappe.session.user:
        return {"success": False, "error": "Not authorized to update this lead"}

    allowed = {"lead_title", "company_name", "contact_person", "phone", "email",
               "service_interest", "source", "notes"}
    for k, v in data.items():
        if k in allowed:
            setattr(doc, k, v)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "lead": doc.as_dict()}


@frappe.whitelist(methods=["POST"])
def request_next_stage(lead_id, request_notes=""):
    frappe.has_permission("Vera CRM Lead", ptype="read", throw=True)
    try:
        lead = frappe.get_doc("Vera CRM Lead", lead_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Lead not found"}

    if lead.status in ("Failed", "Success"):
        return {"success": False, "error": "Cannot advance a completed lead"}

    next_stage = _next_stage(lead.status)
    if not next_stage:
        return {"success": False, "error": "Lead is already at the final stage"}

    existing = frappe.get_all(
        "Vera CRM Approval Request",
        filters={"lead": lead_id, "approval_status": "Pending"},
        limit=1,
    )
    if existing:
        return {"success": False, "error": "An approval request is already pending for this lead"}

    approval = frappe.new_doc("Vera CRM Approval Request")
    approval.lead = lead_id
    approval.lead_title = lead.lead_title
    approval.company_name = lead.company_name
    approval.contact_person = lead.contact_person
    approval.phone = lead.phone
    approval.email = lead.email
    approval.service_interest = lead.service_interest
    approval.current_stage = lead.status
    approval.requested_stage = next_stage
    approval.requested_by = frappe.session.user
    approval.requested_by_name = _user_full_name(frappe.session.user)
    approval.request_notes = request_notes or ""
    approval.approval_status = "Pending"
    approval.insert(ignore_permissions=True)

    lead.stage_push_requested = 1
    lead.approval_status = "Pending"
    lead.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "approval": approval.as_dict()}


@frappe.whitelist(methods=["POST"])
def approve_stage(approval_id, admin_notes=""):
    if frappe.session.user not in OWAIS_USERS:
        return {"success": False, "error": "Not authorized"}

    try:
        approval = frappe.get_doc("Vera CRM Approval Request", approval_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Approval request not found"}

    if approval.approval_status != "Pending":
        return {"success": False, "error": "This request has already been reviewed"}

    approval.approval_status = "Approved"
    approval.admin_notes = admin_notes or ""
    approval.reviewed_by = frappe.session.user
    approval.reviewed_on = now_datetime()
    approval.save(ignore_permissions=True)

    lead = frappe.get_doc("Vera CRM Lead", approval.lead)
    lead.status = approval.requested_stage
    lead.approval_status = "Approved"
    lead.stage_push_requested = 0
    lead.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "lead": lead.as_dict()}


@frappe.whitelist(methods=["POST"])
def reject_stage(approval_id, rejection_reason, admin_notes=""):
    if frappe.session.user not in OWAIS_USERS:
        return {"success": False, "error": "Not authorized"}

    try:
        approval = frappe.get_doc("Vera CRM Approval Request", approval_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Approval request not found"}

    if approval.approval_status != "Pending":
        return {"success": False, "error": "This request has already been reviewed"}

    approval.approval_status = "Rejected"
    approval.admin_notes = admin_notes or ""
    approval.reviewed_by = frappe.session.user
    approval.reviewed_on = now_datetime()
    approval.save(ignore_permissions=True)

    lead = frappe.get_doc("Vera CRM Lead", approval.lead)
    lead.rejection_reason = rejection_reason
    lead.approval_status = "Rejected"
    lead.stage_push_requested = 0
    lead.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "lead": lead.as_dict()}


@frappe.whitelist(methods=["POST"])
def mark_failed(lead_id, reason):
    frappe.has_permission("Vera CRM Lead", ptype="write", throw=True)
    try:
        lead = frappe.get_doc("Vera CRM Lead", lead_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Lead not found"}

    lead.status = "Failed"
    lead.rejection_reason = reason
    lead.stage_push_requested = 0
    lead.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def get_pending_approvals():
    if frappe.session.user not in OWAIS_USERS:
        return {"success": False, "error": "Not authorized"}

    approvals = frappe.get_all(
        "Vera CRM Approval Request",
        filters={"approval_status": "Pending"},
        fields=[
            "name", "lead", "lead_title", "company_name", "contact_person",
            "phone", "email", "service_interest", "current_stage", "requested_stage",
            "requested_by", "requested_by_name", "request_notes", "creation",
        ],
        order_by="creation asc",
    )
    for approval in approvals:
        row = frappe.db.get_value(
            "Vera CRM Lead", approval["lead"], ["notes", "creation"], as_dict=True
        )
        if row:
            approval["lead_notes"] = row.get("notes") or ""
            approval["lead_created"] = str(row.get("creation") or "")
        else:
            approval["lead_notes"] = ""
            approval["lead_created"] = ""

    return {"success": True, "approvals": approvals, "count": len(approvals)}


@frappe.whitelist(methods=["POST"])
def create_quotation(lead_id, items, terms="", validity_days=30, tax_percent=18):
    frappe.has_permission("Vera CRM Lead", ptype="read", throw=True)
    if isinstance(items, str):
        items = json.loads(items)

    try:
        lead = frappe.get_doc("Vera CRM Lead", lead_id)
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Lead not found"}

    subtotal = sum(float(i.get("quantity", 0)) * float(i.get("unit_price", 0)) for i in items)
    tax_pct = float(tax_percent)
    total = subtotal + subtotal * tax_pct / 100

    existing = frappe.get_all("Vera CRM Quotation", filters={"lead": lead_id}, limit=1)
    if existing:
        frappe.delete_doc("Vera CRM Quotation", existing[0]["name"], ignore_permissions=True)

    q = frappe.new_doc("Vera CRM Quotation")
    q.lead = lead_id
    q.quotation_number = f"Q-{lead_id}-{frappe.utils.now_datetime().strftime('%Y%m%d')}"
    q.subtotal = subtotal
    q.tax_percent = tax_pct
    q.total = total
    q.validity_days = int(validity_days)
    q.terms_and_conditions = terms or ""

    for item in items:
        amount = float(item.get("quantity", 0)) * float(item.get("unit_price", 0))
        q.append("items", {
            "item_description": item.get("item_description", ""),
            "quantity": float(item.get("quantity", 0)),
            "unit_price": float(item.get("unit_price", 0)),
            "amount": amount,
        })

    q.insert(ignore_permissions=True)
    pdf_url = _generate_quotation_pdf(q, lead)
    if pdf_url:
        q.pdf_attachment = pdf_url
        q.save(ignore_permissions=True)

    frappe.db.commit()
    return {"success": True, "quotation": q.as_dict(), "pdf_url": pdf_url}


def _generate_quotation_pdf(q, lead):
    from frappe.utils.pdf import get_pdf

    valid_until = (date.today() + timedelta(days=int(q.validity_days))).strftime("%B %d, %Y")
    items_html = "".join(
        f"<tr><td>{item.item_description}</td>"
        f"<td style='text-align:center'>{item.quantity}</td>"
        f"<td style='text-align:right'>&#8377;{item.unit_price:,.2f}</td>"
        f"<td style='text-align:right'>&#8377;{item.amount:,.2f}</td></tr>"
        for item in q.items
    )
    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{{font-family:Arial,sans-serif;color:#333;margin:0;padding:40px}}
.hdr{{background:#1e293b;color:#fff;padding:24px 32px;margin:-40px -40px 32px}}
.hdr h1{{margin:0;font-size:22px}}.hdr p{{margin:4px 0 0;opacity:.7;font-size:13px}}
.meta{{display:flex;gap:40px;margin-bottom:20px}}
.mb label{{font-size:11px;text-transform:uppercase;color:#888}}
.mb p{{margin:2px 0 0;font-weight:600;font-size:14px}}
table{{width:100%;border-collapse:collapse;margin:20px 0}}
th{{background:#f1f5f9;padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase}}
td{{padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:13px}}
.tot{{text-align:right;margin-top:8px}}
.tot table{{width:260px;margin-left:auto}}
.tot td{{border:none;padding:3px 8px}}
.tr-total td{{font-weight:700;font-size:15px;border-top:2px solid #1e293b}}
.terms{{margin-top:20px;padding:14px;background:#f8fafc;border-radius:6px;font-size:12px;color:#666}}
.footer{{margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#888;display:flex;justify-content:space-between}}
</style></head><body>
<div class="hdr"><h1>Vera Enterprises</h1><p>Quotation — {q.quotation_number}</p></div>
<div class="meta">
<div class="mb"><label>Date</label><p>{date.today().strftime("%B %d, %Y")}</p></div>
<div class="mb"><label>Valid Until</label><p>{valid_until}</p></div>
<div class="mb"><label>Prepared For</label><p>{lead.company_name}</p></div>
<div class="mb"><label>Contact</label><p>{lead.contact_person}</p></div>
</div>
<table><thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>{items_html}</tbody></table>
<div class="tot"><table>
<tr><td>Subtotal</td><td>&#8377;{q.subtotal:,.2f}</td></tr>
<tr><td>Tax ({q.tax_percent}%)</td><td>&#8377;{q.subtotal * q.tax_percent / 100:,.2f}</td></tr>
<tr class="tr-total"><td>Total</td><td>&#8377;{q.total:,.2f}</td></tr>
</table></div>
{f'<div class="terms"><strong>Terms &amp; Conditions</strong><br>{q.terms_and_conditions}</div>' if q.terms_and_conditions else ''}
<div class="footer"><span>Vera Enterprises | {lead.email}</span><span>Authorized by Owais Ahmed Khan</span></div>
</body></html>"""

    try:
        pdf_content = get_pdf(html)
        file_doc = frappe.get_doc({
            "doctype": "File",
            "file_name": f"quotation_{q.name}.pdf",
            "content": pdf_content,
            "attached_to_doctype": "Vera CRM Quotation",
            "attached_to_name": q.name,
            "attached_to_field": "pdf_attachment",
            "is_private": 0,
        })
        file_doc.insert(ignore_permissions=True)
        return file_doc.file_url
    except Exception:
        frappe.log_error(frappe.get_traceback(), "CRM PDF Generation Failed")
        return None


@frappe.whitelist()
def get_quotation(lead_id):
    frappe.has_permission("Vera CRM Lead", ptype="read", throw=True)
    quotations = frappe.get_all(
        "Vera CRM Quotation",
        filters={"lead": lead_id},
        fields=["name"],
        limit=1,
        order_by="creation desc",
    )
    if not quotations:
        return {"success": True, "quotation": None}
    q = frappe.get_doc("Vera CRM Quotation", quotations[0]["name"])
    return {"success": True, "quotation": q.as_dict()}
