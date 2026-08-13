"""
Accounting API — whitelisted endpoints for the Accounting React page.

All data is sourced from the Tally-derived custom DocTypes (VE Tally Group,
VE Tally Ledger, VE Tally Voucher, VE Sales/Purchase Register Entry, ...).
Native ERPNext Account / GL Entry are NOT used here — this app never posts
to GL Entry, so a COA built on it would always show empty/zero balances.
"""
import json
from collections import defaultdict

import frappe
from frappe.utils import flt, cint

from hr_client.api.utils import handle_api_error, require_admin


# ── Sign convention helper ──────────────────────────────────────────────────
# VE Tally Ledger.closing_balance uses Tally's raw sign: Dr < 0, Cr > 0.
# For a human-readable Chart of Accounts / Financial Statements, each root
# type is shown in its "normal balance" direction: Assets & Expenses positive
# when Dr (so flipped), Liabilities/Equity/Income positive when Cr (as-is).
def _display_balance(closing_balance, root_type: str) -> float:
    bal = flt(closing_balance)
    if root_type in ("Asset", "Expense"):
        return -bal
    return bal


# ── Chart of Accounts (Tally Group + Ledger tree) ───────────────────────────

@frappe.whitelist()
@handle_api_error
def get_tally_chart_of_accounts():
    """Return the Tally-derived Chart of Accounts as a nested tree.

    Group nodes come from VE Tally Group (is_group=1, balance = rolled-up sum
    of descendant ledgers). Leaf nodes come from VE Tally Ledger (is_group=0,
    balance = that ledger's own closing_balance). Both use the same shape:
    {name, account_name, parent_account, root_type, is_group, balance, children[]}.
    """
    require_admin()

    groups = frappe.db.get_all(
        "VE Tally Group",
        fields=["group_name", "parent_group", "root_group", "is_primary"],
    )
    ledgers = frappe.db.get_all(
        "VE Tally Ledger",
        fields=["ledger_name", "mailing_name", "parent_group", "root_group", "closing_balance"],
    )

    nodes: dict = {}
    for g in groups:
        nodes[g.group_name] = {
            "name": g.group_name,
            "account_name": g.group_name,
            "parent_account": g.parent_group or "",
            "root_type": g.root_group or "",
            "is_group": 1,
            "balance": 0.0,
            "children": [],
        }

    for l in ledgers:
        bal = _display_balance(l.closing_balance, l.root_group or "")
        nodes[l.ledger_name] = {
            "name": l.ledger_name,
            "account_name": l.mailing_name or l.ledger_name,
            "parent_account": l.parent_group or "",
            "root_type": l.root_group or "",
            "is_group": 0,
            "balance": round(bal, 2),
            "children": [],
        }

    # Attach each node to its parent; anything whose parent isn't a known
    # group (orphaned/renamed Tally primary group) becomes a root.
    roots = []
    for name, node in nodes.items():
        parent = node["parent_account"]
        if parent and parent in nodes and nodes[parent]["is_group"]:
            nodes[parent]["children"].append(node)
        else:
            roots.append(node)

    def _rollup(node: dict) -> float:
        if not node["is_group"]:
            return node["balance"]
        total = sum(_rollup(c) for c in node["children"])
        node["balance"] = round(total, 2)
        return total

    for r in roots:
        _rollup(r)

    def _sort(node: dict):
        node["children"].sort(key=lambda c: (0 if c["is_group"] else 1, c["account_name"]))
        for c in node["children"]:
            _sort(c)

    roots.sort(key=lambda c: (0 if c["is_group"] else 1, c["account_name"]))
    for r in roots:
        _sort(r)

    return roots


# ── Sales Invoices / Purchase Bills ─────────────────────────────────────────
# Read from the derived Sales/Purchase Register (clean excl-GST/GST/total split,
# built once per import by accounts_tally_import.py) rather than raw vouchers.

def _fy_bounds(fy):
    """Parse a 'YYYY-YYYY' FY string into (start_date, end_date_exclusive)."""
    parts = str(fy).split("-")
    sy, ey = int(parts[0]), int(parts[1])
    return f"{sy}-04-01", f"{ey}-04-01"


def _register_list(doctype, date_col, party_col, no_col, extra_cols, fy, search, page, page_size, sort, sort_map,
                   year=None, month=None):
    from hr_client.api import finance_core
    where = ["1=1"]
    values = []
    start, end = finance_core.period_bounds(year=year, month=month, fy=fy)
    if start and end:
        where.append(f"{date_col} >= %s AND {date_col} < %s")
        values += [start, end]
    if search and str(search).strip():
        s = f"%{str(search).strip()}%"
        where.append(f"({party_col} LIKE %s OR {no_col} LIKE %s)")
        values += [s, s]
    where_sql = " AND ".join(where)

    page = cint(page) or 1
    # Cap raised so the UI can pull a whole year (or all years) in one request and
    # show every month as a collapsible group on a single page.
    page_size = max(10, min(100000, cint(page_size) or 50))
    order = sort_map.get(sort or "date_desc", sort_map["date_desc"])

    total_row = frappe.db.sql(f"SELECT COUNT(*) AS c FROM `tab{doctype}` WHERE {where_sql}", values, as_dict=True)
    total = cint(total_row[0].c) if total_row else 0

    cols = ", ".join(["name", "tally_guid", no_col, date_col, party_col] + extra_cols)
    rows = frappe.db.sql(
        f"SELECT {cols} FROM `tab{doctype}` WHERE {where_sql} "
        f"ORDER BY {order} LIMIT %s OFFSET %s",
        values + [page_size, (page - 1) * page_size], as_dict=True,
    )
    return {"data": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
@handle_api_error
def get_sales_invoices(fy="all", year=None, month=None, search=None, page=1, page_size=50, sort="date_desc"):
    require_admin()
    sort_map = {
        "date_desc":   "invoice_date DESC, name DESC",
        "date_asc":    "invoice_date ASC, name ASC",
        "amount_desc": "total DESC, invoice_date DESC",
        "amount_asc":  "total ASC, invoice_date DESC",
    }
    return _register_list(
        "VE Sales Register Entry", "invoice_date", "customer", "invoice_no",
        ["amount_excl_gst", "gst_amount", "total"],
        fy, search, page, page_size, sort, sort_map, year=year, month=month,
    )


@frappe.whitelist()
@handle_api_error
def get_purchase_bills(fy="all", year=None, month=None, search=None, page=1, page_size=50, sort="date_desc"):
    require_admin()
    sort_map = {
        "date_desc":   "bill_date DESC, name DESC",
        "date_asc":    "bill_date ASC, name ASC",
        "amount_desc": "total DESC, bill_date DESC",
        "amount_asc":  "total ASC, bill_date DESC",
    }
    return _register_list(
        "VE Purchase Register Entry", "bill_date", "vendor", "bill_no",
        ["amount_excl_gst", "itc_amount", "total"],
        fy, search, page, page_size, sort, sort_map, year=year, month=month,
    )


@frappe.whitelist()
@handle_api_error
def get_register_summary(kind="sales", fy="all", year=None, month=None, search=None):
    """Aggregate stats for the Sales/Purchase register over the FULL filtered set:
    count, total, excl-GST + GST/ITC breakdown, date range, monthly series, top
    parties. Powers the summary band on the Sales Invoices / Purchase Bills tabs."""
    require_admin()
    import html as _html
    from hr_client.api import finance_core

    if kind == "purchase":
        doctype, date_col, party_col, no_col, gst_col = (
            "VE Purchase Register Entry", "bill_date", "vendor", "bill_no", "itc_amount")
    else:
        doctype, date_col, party_col, no_col, gst_col = (
            "VE Sales Register Entry", "invoice_date", "customer", "invoice_no", "gst_amount")

    where = ["1=1"]
    values = []
    start, end = finance_core.period_bounds(year=year, month=month, fy=fy)
    if start and end:
        where.append(f"{date_col} >= %s AND {date_col} < %s")
        values += [start, end]
    if search and str(search).strip():
        s = f"%{str(search).strip()}%"
        where.append(f"({party_col} LIKE %s OR {no_col} LIKE %s)")
        values += [s, s]
    where_sql = " AND ".join(where)
    p = tuple(values)

    agg = frappe.db.sql(
        f"""SELECT COUNT(*) cnt, COALESCE(SUM(total),0) total,
                   COALESCE(SUM(amount_excl_gst),0) excl, COALESCE(SUM({gst_col}),0) gst,
                   MIN({date_col}) min_d, MAX({date_col}) max_d
            FROM `tab{doctype}` WHERE {where_sql}""",
        p, as_dict=True,
    )[0]

    monthly = frappe.db.sql(
        f"""SELECT DATE_FORMAT({date_col}, '%%Y-%%m') m,
                   COUNT(*) cnt, COALESCE(SUM(total),0) total
            FROM `tab{doctype}` WHERE {where_sql}
            GROUP BY m ORDER BY m""",
        p, as_dict=True,
    )

    top = frappe.db.sql(
        f"""SELECT {party_col} party, COUNT(*) cnt, COALESCE(SUM(total),0) total
            FROM `tab{doctype}` WHERE {where_sql}
            GROUP BY {party_col} ORDER BY total DESC LIMIT 5""",
        p, as_dict=True,
    )

    def _clean(x):
        return _html.unescape(str(x or "").replace("&amp;", "&").replace("&apos;", "'"))

    return {
        "count":       int(agg.cnt or 0),
        "total":       round(flt(agg.total), 2),
        "excl_gst":    round(flt(agg.excl), 2),
        "gst":         round(flt(agg.gst), 2),
        "gst_label":   "ITC" if kind == "purchase" else "GST",
        "min_date":    str(agg.min_d) if agg.min_d else "",
        "max_date":    str(agg.max_d) if agg.max_d else "",
        "monthly":     [{"month": r.m, "count": int(r.cnt), "total": round(flt(r.total), 2)} for r in monthly],
        "top_parties": [{"party": _clean(r.party), "count": int(r.cnt), "total": round(flt(r.total), 2)} for r in top],
    }


# ── Ledger picker (General Ledger / Bank & Cash Book tabs) ──────────────────

@frappe.whitelist()
@handle_api_error
def search_ledgers(search=None, scope=None, limit=30):
    """Ledger picker for the General Ledger / Bank & Cash Book tabs.
    scope: None (all), 'bank_cash' (is_bank=1 OR is_cash=1), 'fixed_assets'
    (root_group='Asset' under the Fixed Assets group)."""
    require_admin()
    where = ["1=1"]
    values = []
    if search and str(search).strip():
        where.append("ledger_name LIKE %s")
        values.append(f"%{str(search).strip()}%")
    if scope == "bank_cash":
        where.append("(is_bank=1 OR is_cash=1)")
    elif scope == "fixed_assets":
        where.append("root_group='Asset' AND parent_group LIKE %s")
        values.append("%Fixed Assets%")

    # When no search query, sort by balance magnitude so the most active
    # accounts appear first in the picker dropdown.
    order = "ledger_name ASC" if (search and str(search).strip()) else "ABS(closing_balance) DESC, ledger_name ASC"
    rows = frappe.db.sql(
        f"""SELECT ledger_name, parent_group, root_group, closing_balance, is_bank, is_cash
            FROM `tabVE Tally Ledger` WHERE {' AND '.join(where)}
            ORDER BY {order} LIMIT %s""",
        values + [cint(limit) or 30], as_dict=True,
    )
    return [dict(r) for r in rows]


# ── Financial Statements (P&L + Balance Sheet) ──────────────────────────────

def _group_and_serialize(tree: dict) -> list:
    """tree: {group_name: {ledger_name: net_amount}} -> sorted list of
    {group, amount, ledgers:[{ledger, amount}]}, largest magnitude first."""
    groups = []
    for g, ledgers in tree.items():
        total = sum(ledgers.values())
        groups.append({
            "group": g,
            "amount": round(total, 2),
            "ledgers": sorted(
                [{"ledger": l, "amount": round(a, 2)} for l, a in ledgers.items()],
                key=lambda x: -abs(x["amount"]),
            ),
        })
    return sorted(groups, key=lambda x: -abs(x["amount"]))


@frappe.whitelist()
@handle_api_error
def get_profit_and_loss(from_date=None, to_date=None):
    """Period P&L — built from actual voucher ledger-entry movement in range
    (not static closing_balance), so it's period-aware like the rest of the app."""
    require_admin()
    if not from_date or not to_date:
        frappe.throw("from_date and to_date are required")

    rg_map = {
        r.ledger_name: (r.root_group, r.parent_group)
        for r in frappe.db.get_all("VE Tally Ledger", fields=["ledger_name", "root_group", "parent_group"])
    }

    vouchers = frappe.db.sql(
        """SELECT all_ledger_entries FROM `tabVE Tally Voucher`
           WHERE is_cancelled=0 AND voucher_date BETWEEN %s AND %s
             AND all_ledger_entries IS NOT NULL AND all_ledger_entries NOT IN ('null','[]','')""",
        (from_date, to_date), as_dict=True,
    )

    income_tree = defaultdict(lambda: defaultdict(float))
    expense_tree = defaultdict(lambda: defaultdict(float))

    for v in vouchers:
        try:
            entries = json.loads(v.all_ledger_entries)
        except Exception:
            continue
        for e in entries:
            lname = e.get("ledger", "")
            amt = flt(e.get("amount", 0))
            is_dr = bool(e.get("is_dr"))
            root, parent = rg_map.get(lname, (None, None))
            if root == "Income":
                # Normal balance is Cr — Cr increases income, Dr (e.g. sales return) reduces it.
                income_tree[parent or "Other Income"][lname] += (-amt if is_dr else amt)
            elif root == "Expense":
                # Normal balance is Dr — Dr increases expense, Cr (e.g. discount received) reduces it.
                expense_tree[parent or "Other Expenses"][lname] += (amt if is_dr else -amt)

    income_groups = _group_and_serialize(income_tree)
    expense_groups = _group_and_serialize(expense_tree)
    total_income = sum(g["amount"] for g in income_groups)
    total_expense = sum(g["amount"] for g in expense_groups)

    return {
        "period": {"start": from_date, "end": to_date},
        "income": {"total": round(total_income, 2), "groups": income_groups},
        "expense": {"total": round(total_expense, 2), "groups": expense_groups},
        "net_profit": round(total_income - total_expense, 2),
    }


@frappe.whitelist()
@handle_api_error
def get_balance_sheet():
    """Current-snapshot Balance Sheet from VE Tally Ledger.closing_balance —
    Tally only gives us live closing balances, not historical point-in-time
    ones, so this always reflects the most recent import, not `as_of` a
    chosen date."""
    require_admin()

    ledgers = frappe.db.get_all(
        "VE Tally Ledger",
        fields=["ledger_name", "parent_group", "root_group", "closing_balance"],
    )

    trees = {"Asset": defaultdict(lambda: defaultdict(float)),
             "Liability": defaultdict(lambda: defaultdict(float)),
             "Equity": defaultdict(lambda: defaultdict(float))}

    for l in ledgers:
        if l.root_group not in trees:
            continue
        bal = _display_balance(l.closing_balance, l.root_group)
        if bal == 0:
            continue
        trees[l.root_group][l.parent_group or "Other"][l.ledger_name] += bal

    assets = _group_and_serialize(trees["Asset"])
    liabilities = _group_and_serialize(trees["Liability"])
    equity = _group_and_serialize(trees["Equity"])
    total_assets = sum(g["amount"] for g in assets)
    total_liabilities = sum(g["amount"] for g in liabilities)
    total_equity = sum(g["amount"] for g in equity)

    return {
        "as_of": frappe.utils.today(),
        "assets": {"total": round(total_assets, 2), "groups": assets},
        "liabilities": {"total": round(total_liabilities, 2), "groups": liabilities},
        "equity": {"total": round(total_equity, 2), "groups": equity},
        # Non-zero mainly reflects current-year P&L / retained earnings not yet
        # posted to an Equity ledger in Tally — not necessarily a data error.
        "balance_check": round(total_assets - (total_liabilities + total_equity), 2),
    }


# ── Depreciation (best-effort — filtered journal-entry search) ──────────────
# Not a computed depreciation schedule (no per-asset acquisition date/useful
# life exists in the Tally export) — just recorded journal entries that
# mention "depreciation" anywhere in a ledger name.

@frappe.whitelist()
@handle_api_error
def get_depreciation_entries(fy="all", page=1, page_size=100000):
    require_admin()
    where = [
        "is_cancelled = 0", "voucher_type = 'Journal'",
        "(debit_ledger LIKE %s OR credit_ledger LIKE %s OR all_ledger_entries LIKE %s)",
    ]
    values = ["%depreciation%", "%depreciation%", "%depreciation%"]

    if fy and fy != "all":
        try:
            start, end = _fy_bounds(fy)
            where.append("voucher_date >= %s AND voucher_date < %s")
            values += [start, end]
        except (ValueError, IndexError):
            pass

    where_sql = " AND ".join(where)
    page = cint(page) or 1
    page_size = max(10, min(100000, cint(page_size) or 50))

    total_row = frappe.db.sql(f"SELECT COUNT(*) AS c FROM `tabVE Tally Voucher` WHERE {where_sql}", values, as_dict=True)
    total = cint(total_row[0].c) if total_row else 0

    rows = frappe.db.sql(
        f"""SELECT name, voucher_number, voucher_date, party_name, amount, narration,
                   debit_ledger, credit_ledger
            FROM `tabVE Tally Voucher` WHERE {where_sql}
            ORDER BY voucher_date DESC, name DESC LIMIT %s OFFSET %s""",
        values + [page_size, (page - 1) * page_size], as_dict=True,
    )
    return {"data": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
@handle_api_error
def resolve_voucher_by_guid(guid):
    """Drill-down helper: Sales/Purchase Register rows store tally_guid as
    'SR-<guid>' / 'PR-<guid>' (accounts_tally_import.py's _upsert key). Strip the
    prefix, find the source VE Tally Voucher, and return its full detail."""
    require_admin()
    if not guid:
        frappe.throw("guid required")
    original_guid = guid[3:] if guid[:3] in ("SR-", "PR-") else guid
    voucher_name = frappe.db.get_value("VE Tally Voucher", {"tally_guid": original_guid}, "name")
    if not voucher_name:
        frappe.throw("Source voucher not found", frappe.DoesNotExistError)
    from hr_client.api import operations
    return operations.get_voucher_detail(voucher_name)
