"""
Quotation Studio — Terms & Conditions (Phase 2 spec §4.10).

A modular clause library plus versioned templates that assemble clause sets per
quotation category. Templates are versioned with an effective date; an approved
quotation keeps the clause version in force at approval time, so reprinting an
old quotation reproduces the original terms. ERP-native.
"""

import frappe

from hr_client.api.utils import require_login, handle_api_error

_CLAUSE_FIELDS = ("code", "title", "category", "applies_to_scope", "mandatory",
                  "status", "customer_text")
_TEMPLATE_FIELDS = ("code", "template_name", "category", "version",
                    "effective_date", "status")


def _clean(payload, allowed):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    return {k: payload.get(k) for k in allowed if payload.get(k) is not None}


# ── Clause library ────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_clauses_page():
    require_login()
    rows = frappe.get_all(
        "Vera Terms Clause",
        fields=["name", "code", "title", "category", "applies_to_scope", "mandatory", "status"],
        order_by="category asc, title asc",
    )
    for r in rows:
        r["mandatory"] = "Yes" if r["mandatory"] else "—"
    return {
        "kpis": [
            {"label": "Clauses", "value": str(len(rows))},
            {"label": "Mandatory", "value": str(sum(1 for r in rows if r["mandatory"] == "Yes"))},
        ],
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "title", "header": "Title"},
            {"key": "category", "header": "Category"},
            {"key": "applies_to_scope", "header": "Applies To"},
            {"key": "mandatory", "header": "Mandatory", "kind": "status"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "The clause library. Assemble clauses into versioned templates "
                "per quotation category.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_clause(payload):
    require_login()
    data = _clean(payload, _CLAUSE_FIELDS)
    if not data.get("code") or not data.get("title"):
        frappe.throw("Code and title are required.")
    if frappe.db.exists("Vera Terms Clause", data["code"]):
        frappe.throw(f"Clause '{data['code']}' already exists.")
    doc = frappe.new_doc("Vera Terms Clause")
    doc.update(data)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── Templates ─────────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_templates_page():
    require_login()
    rows = frappe.get_all(
        "Vera Terms Template",
        fields=["name", "code", "template_name", "category", "version",
                "effective_date", "status"],
        order_by="template_name asc, version desc",
    )
    for r in rows:
        r["version"] = f"V{r['version']}"
    return {
        "kpis": [
            {"label": "Templates", "value": str(len(rows))},
            {"label": "Active", "value": str(sum(1 for r in rows if r["status"] == "Active")), "tone": "good"},
        ],
        "columns": [
            {"key": "code", "header": "Code"},
            {"key": "template_name", "header": "Template"},
            {"key": "category", "header": "Category"},
            {"key": "version", "header": "Version"},
            {"key": "effective_date", "header": "Effective", "kind": "date"},
            {"key": "status", "header": "Status", "kind": "status"},
        ],
        "rows": rows,
        "note": "Versioned clause sets per quotation category. An approved "
                "quotation retains the version in force at approval time.",
    }


@frappe.whitelist()
@handle_api_error
def get_terms_template(name: str):
    require_login()
    doc = frappe.get_doc("Vera Terms Template", name)
    return {"success": True, "template": {
        "name": doc.name, "code": doc.code, "template_name": doc.template_name,
        "category": doc.category, "version": doc.version,
        "effective_date": doc.effective_date, "status": doc.status,
        "clauses": [c.as_dict() for c in doc.clauses],
    }}


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_terms_template(payload, clauses=None):
    """Create a template and snapshot the chosen clauses' text into it."""
    require_login()
    data = _clean(payload, _TEMPLATE_FIELDS)
    if not data.get("code") or not data.get("template_name"):
        frappe.throw("Code and template name are required.")
    if frappe.db.exists("Vera Terms Template", data["code"]):
        frappe.throw(f"Template '{data['code']}' already exists.")
    doc = frappe.new_doc("Vera Terms Template")
    doc.update(data)
    if clauses:
        codes = clauses if isinstance(clauses, list) else frappe.parse_json(clauses)
        for code in codes:
            c = frappe.get_doc("Vera Terms Clause", code)
            doc.append("clauses", {
                "clause": c.name, "title": c.title,
                "mandatory": c.mandatory, "customer_text": c.customer_text,
            })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


@frappe.whitelist()
@handle_api_error
def get_active_templates():
    """Active templates — options a quotation picks its terms from."""
    require_login()
    return frappe.get_all(
        "Vera Terms Template",
        filters={"status": "Active"},
        fields=["name", "template_name", "category", "version"],
        order_by="template_name asc",
    )


@frappe.whitelist()
@handle_api_error
def assemble_terms(name: str):
    """Concatenate a template's clause text into a ready-to-stamp T&C block."""
    require_login()
    doc = frappe.get_doc("Vera Terms Template", name)
    parts = []
    for i, c in enumerate(doc.clauses, start=1):
        title = c.title or ""
        text = c.customer_text or ""
        star = " *" if c.mandatory else ""
        parts.append(f"{i}. {title}{star}\n{text}".strip())
    return {"success": True, "text": "\n\n".join(parts),
            "template": doc.name, "version": doc.version}
