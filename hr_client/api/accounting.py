"""
Accounting API — whitelisted endpoints for the Accounting React page.
Uses native ERPNext Account DocType (no custom DocType for COA).
"""
import frappe
from frappe.utils import flt, cint
from hr_client.api.utils import handle_api_error, require_login, require_admin


# ── Chart of Accounts ─────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_chart_of_accounts(company="Vera Enterprises"):
    """Return the full Chart of Accounts for a company as a nested tree.

    Each node includes: name, account_name, account_number, parent_account,
    account_type, root_type, is_group, currency, disabled, balance, children[].
    Balance = SUM(debit - credit) from GL Entry (Dr positive, Cr negative).
    """
    require_login()

    accounts = frappe.db.get_all(
        "Account",
        filters={"company": company},
        fields=[
            "name", "account_name", "account_number", "parent_account",
            "account_type", "root_type", "is_group", "currency", "disabled",
        ],
        order_by="lft asc",
    )

    # Single aggregate query for all balances (debit - credit = Dr balance)
    try:
        gl_rows = frappe.db.sql(
            """
            SELECT account, SUM(debit - credit) AS balance
            FROM `tabGL Entry`
            WHERE company = %s AND is_cancelled = 0
            GROUP BY account
            """,
            company,
            as_dict=True,
        )
        balance_map = {r["account"]: flt(r["balance"]) for r in gl_rows}
    except Exception:
        balance_map = {}

    for acc in accounts:
        acc["balance"] = balance_map.get(acc["name"], 0.0)

    # Build nested tree keyed by parent_account
    children_map: dict = {}
    roots = []
    for acc in accounts:
        parent = acc.get("parent_account") or ""
        if parent:
            children_map.setdefault(parent, []).append(acc)
        else:
            roots.append(acc)

    def build_tree(node: dict) -> dict:
        node["children"] = [build_tree(c) for c in children_map.get(node["name"], [])]
        return node

    return [build_tree(r) for r in roots]


@frappe.whitelist()
@handle_api_error
def get_account_groups(company="Vera Enterprises"):
    """Return all group accounts — used to populate the Parent Account dropdown."""
    require_login()

    return frappe.db.get_all(
        "Account",
        filters={"company": company, "is_group": 1, "disabled": 0},
        fields=["name", "account_name", "root_type"],
        order_by="lft asc",
    )


@frappe.whitelist(methods=["POST"])
@handle_api_error
def create_account(
    account_name,
    parent_account,
    root_type,
    account_type="",
    is_group=0,
    company="Vera Enterprises",
):
    """Create a new Account in the Chart of Accounts.

    Only logged-in users can call this; ERPNext's own permission system
    controls who can actually insert Account docs (typically System Manager).
    """
    require_login()

    if not (account_name and account_name.strip()):
        frappe.throw("Account Name is required")
    if not parent_account:
        frappe.throw("Parent Account is required")
    if not root_type:
        frappe.throw("Root Type is required")

    doc = frappe.new_doc("Account")
    doc.account_name = account_name.strip()
    doc.parent_account = parent_account
    doc.root_type = root_type
    doc.account_type = account_type or ""
    doc.is_group = cint(is_group)
    doc.company = company
    doc.insert()
    frappe.db.commit()

    return {"success": True, "name": doc.name, "account_name": doc.account_name}
