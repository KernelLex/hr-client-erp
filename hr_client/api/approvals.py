# hr_client/api/approvals.py
# ---------------------------------------------------------------------------
# Workflow Approvals — one action queue that aggregates everything awaiting the
# admin's decision (pending leave, expense claims and CRM stage pushes) and lets
# them approve/reject in place. Dispatches to the existing per-module endpoints
# so the business logic stays in one place.
# ---------------------------------------------------------------------------
import frappe
from frappe.utils import flt

from hr_client.api.utils import require_admin, handle_api_error
from hr_client.api import leave as leave_api
from hr_client.api import expenses as expense_api
from hr_client.api import crm as crm_api


@frappe.whitelist()
@handle_api_error
def get_pending_approvals():
    """All items awaiting approval, across leave, expenses and CRM."""
    require_admin()

    rows = []

    for l in frappe.get_all(
        "Vera Leave Application",
        filters={"status": "Pending"},
        fields=["name", "employee_name", "leave_type", "from_date", "to_date", "total_days", "applied_on"],
        order_by="applied_on desc",
    ):
        rows.append(
            {
                "id": l.name,
                "type": "Leave",
                "raised_by": l.employee_name or "—",
                "detail": f"{l.leave_type} · {l.from_date} → {l.to_date}",
                "value": f"{flt(l.total_days):g} days",
                "status": "Pending",
                "_kind": "leave",
            }
        )

    for c in frappe.get_all(
        "Vera Expense Claim",
        filters={"status": "Pending"},
        fields=["name", "employee_name", "claim_type", "amount", "purpose", "claim_date"],
        order_by="claim_date desc",
    ):
        rows.append(
            {
                "id": c.name,
                "type": "Expense",
                "raised_by": c.employee_name or "—",
                "detail": f"{c.claim_type} · {(c.purpose or '')[:40]}",
                "value": frappe.utils.fmt_money(c.amount, currency="INR"),
                "status": "Pending",
                "_kind": "expense",
            }
        )

    if frappe.db.exists("DocType", "Vera CRM Approval Request"):
        for a in frappe.get_all(
            "Vera CRM Approval Request",
            filters={"approval_status": "Pending"},
            fields=["name", "requested_by_name", "lead_title", "current_stage", "requested_stage"],
            order_by="creation desc",
        ):
            rows.append(
                {
                    "id": a.name,
                    "type": "CRM Stage",
                    "raised_by": a.requested_by_name or "—",
                    "detail": f"{a.lead_title}: {a.current_stage} → {a.requested_stage}",
                    "value": "—",
                    "status": "Pending",
                    "_kind": "crm",
                }
            )

    by_type = {}
    for r in rows:
        by_type[r["type"]] = by_type.get(r["type"], 0) + 1

    kpis = [
        {"label": "Awaiting You", "value": str(len(rows)), "tone": "warn" if rows else "good"},
        {"label": "Leave", "value": str(by_type.get("Leave", 0))},
        {"label": "Expenses", "value": str(by_type.get("Expense", 0))},
        {"label": "CRM", "value": str(by_type.get("CRM Stage", 0))},
    ]
    columns = [
        {"key": "type", "header": "Type", "align": "center", "kind": "status"},
        {"key": "raised_by", "header": "Raised By"},
        {"key": "detail", "header": "Detail"},
        {"key": "value", "header": "Qty / Amount", "align": "right"},
        {"key": "status", "header": "Status", "align": "center", "kind": "status"},
    ]
    return {
        "kpis": kpis,
        "columns": columns,
        "rows": rows,
        "note": "Workflow Approvals — everything waiting on your decision in one place. Approve or reject; the source document updates instantly.",
    }


@frappe.whitelist(methods=["POST"])
@handle_api_error
def act(kind, id, action, reason=None):
    """Approve or reject a queued item by dispatching to its module endpoint."""
    require_admin()
    reason = (reason or "").strip()

    if kind == "leave":
        if action == "approve":
            return leave_api.approve_leave(id, admin_remarks=reason or None)
        return leave_api.reject_leave(id, admin_remarks=reason or "Rejected")

    if kind == "expense":
        if action == "approve":
            return expense_api.approve_claim(id, admin_notes=reason)
        return expense_api.reject_claim(id, rejection_reason=reason or "Rejected")

    if kind == "crm":
        if action == "approve":
            return crm_api.approve_stage(id, admin_notes=reason)
        return crm_api.reject_stage(id, rejection_reason=reason or "Rejected")

    frappe.throw("Unknown approval type")
