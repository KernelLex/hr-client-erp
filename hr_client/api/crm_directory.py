"""
CRM directory & activity screens (Phase 2 spec §3.2):
  * Customer Contacts   — multiple contacts per customer
  * Sales Team          — team structure + approval authority (feeds §4.6)
  * Follow-ups          — task list against leads / enquiries / opportunities

All ERP-native. List endpoints return the ModulePayload envelope for SystemPage.
"""

import frappe

from hr_client.api.utils import require_login, require_admin, handle_api_error

_CONTACT_FIELDS = ("contact_name", "customer", "role", "phone", "email", "whatsapp", "preferred_channel", "notes")
_TEAM_FIELDS = ("member", "territory", "reports_to", "approval_authority", "status")
_FOLLOWUP_FIELDS = ("subject", "linked_type", "linked_name", "due_date", "assigned_to", "outcome", "next_action")


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


# ── Customer Contacts ─────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_contacts_page():
    require_login()
    rows = frappe.get_all(
        "Vera CRM Contact",
        fields=["name", "contact_name", "customer", "role", "phone", "email", "preferred_channel", "source"],
        order_by="modified desc",
    )
    for r in rows:
        r["customer"] = r["customer"] or "—"
        r["source"] = r["source"] or "ERP"
    return {
        "kpis": [{"label": "Contacts", "value": str(len(rows))}],
        "columns": [
            {"key": "contact_name", "header": "Contact"},
            {"key": "customer", "header": "Customer"},
            {"key": "role", "header": "Role"},
            {"key": "phone", "header": "Phone"},
            {"key": "preferred_channel", "header": "Preferred", "kind": "status"},
        ],
        "rows": rows,
        "note": "Customer contacts — multiple per customer, with the preferred channel.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_contact(payload):
    require_login()
    data = _clean(payload, _CONTACT_FIELDS)
    if not data.get("contact_name"):
        frappe.throw("A contact name is required.")
    doc = frappe.new_doc("Vera CRM Contact")
    doc.update(data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── Sales Team ────────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_team_page():
    require_login()
    rows = frappe.get_all(
        "Vera Sales Team Member",
        fields=["name", "full_name", "member", "territory", "approval_authority", "status", "source"],
        order_by="full_name asc",
    )
    for r in rows:
        r["full_name"] = r["full_name"] or r["member"]
        r["territory"] = r["territory"] or "—"
        r["source"] = r["source"] or "ERP"
    active = sum(1 for r in rows if r["status"] == "Active")
    return {
        "kpis": [
            {"label": "Members", "value": str(len(rows))},
            {"label": "Active", "value": str(active), "tone": "good"},
        ],
        "columns": [
            {"key": "full_name", "header": "Member"},
            {"key": "territory", "header": "Territory"},
            {"key": "approval_authority", "header": "Approval Authority", "kind": "status"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Sales team structure. Approval authority feeds the quotation "
                "approval engine (spec §4.6).",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_team_member(payload):
    require_admin()
    data = _clean(payload, _TEAM_FIELDS)
    if not data.get("member"):
        frappe.throw("Select a user for the team member.")
    if frappe.db.exists("Vera Sales Team Member", {"member": data["member"]}):
        frappe.throw("That user is already on the sales team.")
    doc = frappe.new_doc("Vera Sales Team Member")
    doc.update(data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist()
@handle_api_error
def get_user_options():
    """User options for the team-member picker (admin only)."""
    require_admin()
    users = frappe.get_all(
        "User",
        filters={"user_type": "System User", "enabled": 1, "name": ["not in", ["Guest", "Administrator"]]},
        fields=["name", "full_name"],
        order_by="full_name asc",
    )
    return {"options": [{"value": u.name, "label": u.full_name or u.name} for u in users]}


# ── Follow-ups ────────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_followups_page():
    require_login()
    rows = frappe.get_all(
        "Vera CRM Followup",
        fields=["name", "subject", "linked_type", "linked_name", "due_date", "status", "source"],
        order_by="status asc, due_date asc",
    )
    for r in rows:
        r["linked_type"] = r["linked_type"] or "—"
        r["linked_name"] = r["linked_name"] or "—"
        r["source"] = r["source"] or "ERP"
    open_count = sum(1 for r in rows if r["status"] == "Open")
    overdue = sum(
        1 for r in rows
        if r["status"] == "Open" and r["due_date"] and str(r["due_date"]) < frappe.utils.today()
    )
    return {
        "kpis": [
            {"label": "Open", "value": str(open_count), "tone": "warn" if open_count else "good"},
            {"label": "Overdue", "value": str(overdue), "tone": "bad" if overdue else "good"},
            {"label": "Total", "value": str(len(rows))},
        ],
        "columns": [
            {"key": "subject", "header": "Follow-up"},
            {"key": "linked_type", "header": "Against"},
            {"key": "linked_name", "header": "Record"},
            {"key": "due_date", "header": "Due", "kind": "date"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Follow-up tasks against leads, enquiries and opportunities.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_followup(payload):
    require_login()
    data = _clean(payload, _FOLLOWUP_FIELDS)
    if not data.get("subject"):
        frappe.throw("A subject is required.")
    doc = frappe.new_doc("Vera CRM Followup")
    doc.update(data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def complete_followup(name: str, outcome: str = None, next_action: str = None):
    require_login()
    doc = frappe.get_doc("Vera CRM Followup", name)
    doc.status = "Done"
    if outcome:
        doc.outcome = outcome
    if next_action:
        doc.next_action = next_action
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name, "status": doc.status}
