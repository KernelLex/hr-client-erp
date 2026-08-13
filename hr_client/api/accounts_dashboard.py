"""
Accounts Dashboard API — all 11 whitelisted endpoints.
Data source: VE Accounts DocTypes (populated by accounts_tally_import.run()).
Manual-entry DocTypes: VE Bank Account Balance, VE Virtual Account Balance, VE OD Account Balance.
"""
import datetime
import json
import frappe
from frappe.utils import flt, cint, today

from hr_client.api.utils import require_admin, handle_api_error, COMPANY_NAME


# ── Period helpers ────────────────────────────────────────────────────────────

def _period_bounds(period: str, custom_start: str = None, custom_end: str = None):
    """Return (start_date, end_date) strings for the given period key."""
    t = datetime.date.today()

    if period == "today":
        d = t.isoformat()
        return d, d

    if period == "mtd":
        return t.replace(day=1).isoformat(), t.isoformat()

    if period == "ytd":
        # Indian FY: April 1
        fy_start_year = t.year if t.month >= 4 else t.year - 1
        return f"{fy_start_year}-04-01", t.isoformat()

    if period == "last_year":
        fy_start_year = (t.year if t.month >= 4 else t.year - 1) - 1
        return f"{fy_start_year}-04-01", f"{fy_start_year + 1}-03-31"

    if period == "all":
        # Cumulative — from before any Tally data to today.
        return "2000-04-01", t.isoformat()

    if period == "custom":
        return (custom_start or t.replace(day=1).isoformat()), (custom_end or t.isoformat())

    # default: MTD
    return t.replace(day=1).isoformat(), t.isoformat()


def _prev_period_bounds(period: str, custom_start: str = None, custom_end: str = None):
    """Return the equivalent prior-year period for YoY comparison."""
    start, end = _period_bounds(period, custom_start, custom_end)
    s = datetime.date.fromisoformat(start)
    e = datetime.date.fromisoformat(end)
    days = (e - s).days
    prev_s = (s.replace(year=s.year - 1) if period in ("ytd", "last_year")
              else s - datetime.timedelta(days=days + 1))
    prev_e = (e.replace(year=e.year - 1) if period in ("ytd", "last_year")
              else e - datetime.timedelta(days=days + 1))
    return prev_s.isoformat(), prev_e.isoformat()


# ── 1. Available Funds Summary ────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_available_funds_summary():
    """Bank / Cash / Virtual / OD totals + per-account breakdown.

    Sourced from the canonical finance layer (VE Tally Ledger), which matches the
    client's Tally to the rupee. Previously read empty manual DocTypes and showed
    ₹0 for every account.
    """
    frappe.has_permission("VE Tally Ledger", ptype="read", throw=True)
    from hr_client.api import finance_core

    return finance_core.funds_summary()


# ── 2. Accounts Summary ───────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_accounts_summary(period="ytd", custom_start=None, custom_end=None):
    """Sales / Purchase summary — canonical source (VE Tally Voucher via
    finance_core), so the figures match Funds / GST / every other page exactly.

    Previously read the derived VE Sales/Purchase Register tables, which had
    dropped ~74 sales rows and disagreed on counts with the voucher source.
    """
    frappe.has_permission("VE Tally Voucher", ptype="read", throw=True)
    from hr_client.api import finance_core

    start, end = _period_bounds(period, custom_start, custom_end)
    prev_start, prev_end = _prev_period_bounds(period, custom_start, custom_end)

    cur = finance_core.accounts_summary(start, end)
    prev_sales = finance_core.txn_summary("sales", prev_start, prev_end)
    prev_purch = finance_core.txn_summary("purchase", prev_start, prev_end)

    def _yoy(cur_v, prev_v):
        if not prev_v or flt(prev_v) == 0:
            return None
        return round((flt(cur_v) - flt(prev_v)) / flt(prev_v) * 100, 1)

    s, p = cur["sales"], cur["purchase"]
    return {
        "period": {"start": start, "end": end},
        "sales": {
            "total": s["total"],
            "excl_gst": s["excl_gst"],
            "gst": s["gst"],
            "invoice_count": s["invoice_count"],
            "returns": s["returns"],
            "net_total": s["net_total"],
            "yoy_pct": _yoy(s["total"], prev_sales["value"]),
        },
        "purchase": {
            "total": p["total"],
            "excl_gst": p["excl_gst"],
            "itc": p["gst"],
            "bill_count": p["bill_count"],
            "returns": p["returns"],
            "net_total": p["net_total"],
            "yoy_pct": _yoy(p["total"], prev_purch["value"]),
        },
        "monthly_sales": cur["monthly_sales"],
        "monthly_purchase": cur["monthly_purchase"],
        "source": "VE Tally Voucher",
    }


# ── 3. GST Summary ────────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_gst_summary(period="ytd", custom_start=None, custom_end=None):
    """GST output/input/net for the period.

    Sourced from the canonical finance layer, which reads each voucher's own tax
    lines (Output = tax on Sales, Input = tax on Purchases) so Credit/Debit notes
    and GST-payment journals never contaminate the figure. The old aggregation
    over VE GST Ledger Entry mis-signed returns and produced negative net IGST.
    """
    frappe.has_permission("VE GST Ledger Entry", ptype="read", throw=True)
    from hr_client.api import finance_core

    start, end = _period_bounds(period, custom_start, custom_end)
    g = finance_core.gst_summary(start=start, end=end)

    # Next due date: 20th of next month for monthly filers
    today_d = datetime.date.today()
    if today_d.day <= 20:
        due = today_d.replace(day=20)
    elif today_d.month == 12:
        due = today_d.replace(year=today_d.year + 1, month=1, day=20)
    else:
        due = today_d.replace(month=today_d.month + 1, day=20)

    return {
        "period": {"start": start, "end": end},
        "output": g["output"],
        "input": g["input"],
        "net": g["net"],
        "next_due_date": due.isoformat(),
        "gstr2b_mismatches": frappe.db.count("VE GST Ledger Entry", {"gstr2b_match_status": "Mismatched"}),
    }


# ── 4. Receivables & Payables Summary ────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_receivables_payables_summary(period="ytd", custom_start=None, custom_end=None):
    frappe.has_permission("VE Debtor Ledger", ptype="read", throw=True)

    today_str = today()

    def _aging_buckets(doctype, date_col, amount_col):
        rows = frappe.db.sql(
            f"""SELECT {amount_col},
                       DATEDIFF(%s, {date_col}) as days
                FROM `tab{doctype}`
                WHERE status NOT IN ('Cleared')""",
            (today_str,), as_dict=True,
        )
        buckets = {"0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
        total = 0
        for r in rows:
            amt = flt(r[amount_col])
            d = cint(r.days) if r.days is not None else 0
            total += amt
            if d <= 30:
                buckets["0_30"] += amt
            elif d <= 60:
                buckets["31_60"] += amt
            elif d <= 90:
                buckets["61_90"] += amt
            else:
                buckets["90_plus"] += amt
        return total, buckets

    def _advance_total(doctype, amount_col):
        r = frappe.db.sql(
            f"SELECT COALESCE(SUM({amount_col}),0) as total FROM `tab{doctype}`",
            as_dict=True,
        )
        return flt(r[0].total) if r else 0

    debtor_total, debtor_buckets = _aging_buckets("VE Debtor Ledger", "invoice_date", "due_amount")
    creditor_total, creditor_buckets = _aging_buckets("VE Creditor Ledger", "invoice_date", "due_amount")
    debtor_adv = _advance_total("VE Debtor Advance", "advance_amount")
    creditor_adv = _advance_total("VE Creditor Advance", "advance_amount")

    return {
        "debtors": {
            "total_outstanding": debtor_total,
            "advance_received": debtor_adv,
            "net": debtor_total - debtor_adv,
            "aging": debtor_buckets,
        },
        "creditors": {
            "total_outstanding": creditor_total,
            "advance_paid": creditor_adv,
            "net": creditor_total - creditor_adv,
            "aging": creditor_buckets,
        },
    }


# ── 5. Creditors Report ───────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_creditors_report(search=None, aging_filter=None, sort_by="invoice_date",
                         sort_order="desc", page=1, page_size=50):
    frappe.has_permission("VE Creditor Ledger", ptype="read", throw=True)

    page, page_size = cint(page) or 1, cint(page_size) or 50
    today_str = today()
    filters = ["status NOT IN ('Cleared')"]
    values = []

    if search:
        filters.append("vendor_name LIKE %s")
        values.append(f"%{search}%")

    where = " AND ".join(filters)
    safe_sort = sort_by if sort_by in ("invoice_date", "due_amount", "vendor_name") else "invoice_date"
    safe_order = "DESC" if sort_order.lower() == "desc" else "ASC"

    rows = frappe.db.sql(
        f"""SELECT name, vendor_name, due_amount, invoice_date, status,
                   DATEDIFF(%s, invoice_date) as aging_days
            FROM `tabVE Creditor Ledger`
            WHERE {where}
            ORDER BY {safe_sort} {safe_order}
            LIMIT %s OFFSET %s""",
        [today_str] + values + [page_size, (page - 1) * page_size],
        as_dict=True,
    )

    total_count = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Creditor Ledger` WHERE {where}",
        values, as_dict=True,
    )

    result = []
    for r in rows:
        d = dict(r)
        d["aging_days"] = cint(r.aging_days) if r.aging_days is not None else 0
        if d["aging_days"] > 90:
            d["aging_category"] = "90_plus"
        elif d["aging_days"] > 60:
            d["aging_category"] = "61_90"
        elif d["aging_days"] > 30:
            d["aging_category"] = "31_60"
        else:
            d["aging_category"] = "0_30"
        result.append(d)

    if aging_filter and aging_filter in ("0_30", "31_60", "61_90", "90_plus"):
        result = [r for r in result if r["aging_category"] == aging_filter]

    return {
        "data": result,
        "total": cint(total_count[0].cnt) if total_count else 0,
        "page": page,
        "page_size": page_size,
    }


# ── 6. Creditors Advance Report ───────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_creditors_advance_report(search=None, sort_by="advance_date",
                                 sort_order="desc", page=1, page_size=50):
    frappe.has_permission("VE Creditor Advance", ptype="read", throw=True)

    page, page_size = cint(page) or 1, cint(page_size) or 50
    today_str = today()
    values = []
    where = "1=1"

    if search:
        where = "vendor_name LIKE %s"
        values.append(f"%{search}%")

    safe_sort = sort_by if sort_by in ("advance_date", "advance_amount", "vendor_name") else "advance_date"
    safe_order = "DESC" if sort_order.lower() == "desc" else "ASC"

    rows = frappe.db.sql(
        f"""SELECT name, vendor_name, advance_amount, advance_date,
                   TIMESTAMPDIFF(MONTH, advance_date, %s) as aging_months
            FROM `tabVE Creditor Advance`
            WHERE {where}
            ORDER BY {safe_sort} {safe_order}
            LIMIT %s OFFSET %s""",
        [today_str] + values + [page_size, (page - 1) * page_size],
        as_dict=True,
    )

    count_rows = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Creditor Advance` WHERE {where}",
        values, as_dict=True,
    )

    return {
        "data": [dict(r) for r in rows],
        "total": cint(count_rows[0].cnt) if count_rows else 0,
        "page": page,
        "page_size": page_size,
    }


# ── 7. Debtors Report ────────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_debtors_report(search=None, aging_filter=None, sort_by="invoice_date",
                       sort_order="desc", page=1, page_size=50):
    frappe.has_permission("VE Debtor Ledger", ptype="read", throw=True)

    page, page_size = cint(page) or 1, cint(page_size) or 50
    today_str = today()
    filters = ["status NOT IN ('Cleared')"]
    values = []

    if search:
        filters.append("client_name LIKE %s")
        values.append(f"%{search}%")

    where = " AND ".join(filters)
    safe_sort = sort_by if sort_by in ("invoice_date", "due_amount", "client_name") else "invoice_date"
    safe_order = "DESC" if sort_order.lower() == "desc" else "ASC"

    rows = frappe.db.sql(
        f"""SELECT name, client_name, due_amount, invoice_date, status,
                   DATEDIFF(%s, invoice_date) as aging_days
            FROM `tabVE Debtor Ledger`
            WHERE {where}
            ORDER BY {safe_sort} {safe_order}
            LIMIT %s OFFSET %s""",
        [today_str] + values + [page_size, (page - 1) * page_size],
        as_dict=True,
    )

    count_rows = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Debtor Ledger` WHERE {where}",
        values, as_dict=True,
    )

    result = []
    for r in rows:
        d = dict(r)
        d["aging_days"] = cint(r.aging_days) if r.aging_days is not None else 0
        if d["aging_days"] > 90:
            d["aging_category"] = "90_plus"
        elif d["aging_days"] > 60:
            d["aging_category"] = "61_90"
        elif d["aging_days"] > 30:
            d["aging_category"] = "31_60"
        else:
            d["aging_category"] = "0_30"
        result.append(d)

    if aging_filter and aging_filter in ("0_30", "31_60", "61_90", "90_plus"):
        result = [r for r in result if r["aging_category"] == aging_filter]

    return {
        "data": result,
        "total": cint(count_rows[0].cnt) if count_rows else 0,
        "page": page,
        "page_size": page_size,
    }


# ── 8. Debtors Advance Report ─────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_debtors_advance_report(search=None, sort_by="advance_date",
                               sort_order="desc", page=1, page_size=50):
    frappe.has_permission("VE Debtor Advance", ptype="read", throw=True)

    page, page_size = cint(page) or 1, cint(page_size) or 50
    today_str = today()
    values = []
    where = "1=1"

    if search:
        where = "client_name LIKE %s"
        values.append(f"%{search}%")

    safe_sort = sort_by if sort_by in ("advance_date", "advance_amount", "client_name") else "advance_date"
    safe_order = "DESC" if sort_order.lower() == "desc" else "ASC"

    rows = frappe.db.sql(
        f"""SELECT name, client_name, advance_amount, advance_date, project,
                   TIMESTAMPDIFF(MONTH, advance_date, %s) as aging_months
            FROM `tabVE Debtor Advance`
            WHERE {where}
            ORDER BY {safe_sort} {safe_order}
            LIMIT %s OFFSET %s""",
        [today_str] + values + [page_size, (page - 1) * page_size],
        as_dict=True,
    )

    count_rows = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Debtor Advance` WHERE {where}",
        values, as_dict=True,
    )

    return {
        "data": [dict(r) for r in rows],
        "total": cint(count_rows[0].cnt) if count_rows else 0,
        "page": page,
        "page_size": page_size,
    }


# ── 9. Cash Flow Statement ────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_cash_flow_statement(period="ytd", custom_start=None, custom_end=None):
    """Real (direct-method) cash flow — net change in cash & bank for the period,
    from the canonical source (finance_core, VE Tally Voucher). Replaces the old
    reading of the accrual-classified VE Cash Flow Entry table, which reported
    income/expense (~₹34cr) rather than actual cash movement.
    """
    frappe.has_permission("VE Tally Voucher", ptype="read", throw=True)
    from hr_client.api import finance_core

    start, end = _period_bounds(period, custom_start, custom_end)
    cf = finance_core.cash_flow_statement(start=start, end=end)
    return {
        "period": {"start": start, "end": end},
        "sections": cf["sections"],
        "grand_total": cf["grand_total"],
        "monthly_series": cf["monthly_series"],
        "source": cf["source"],
    }


# ── 10. Inventory Summary ─────────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_inventory_summary():
    frappe.has_permission("VE Stock Movement Summary", ptype="read", throw=True)

    # Count by category
    cat_rows = frappe.db.sql(
        """SELECT movement_category, COUNT(*) as sku_count,
                  COALESCE(SUM(stock_on_hand),0) as total_stock
           FROM `tabVE Stock Movement Summary`
           GROUP BY movement_category""",
        as_dict=True,
    )

    # Negative stock
    neg_stock = frappe.db.count("VE Stock Movement Summary", {"stock_on_hand": ["<", 0]})

    # Reorder alerts
    reorder_count = frappe.db.count("VE Stock Movement Summary", {"movement_category": "Reorder"})

    return {
        "by_category": [dict(r) for r in cat_rows],
        "negative_stock_count": neg_stock,
        "reorder_alert_count": reorder_count,
        "total_sku_count": frappe.db.count("VE Stock Movement Summary"),
    }


# ── 11. Stock Movement Report ─────────────────────────────────────────────────

@frappe.whitelist()
@handle_api_error
def get_stock_movement_report(category=None, search=None, sort_by="item_code",
                              sort_order="asc", page=1, page_size=50):
    frappe.has_permission("VE Stock Movement Summary", ptype="read", throw=True)

    page, page_size = cint(page) or 1, cint(page_size) or 50
    filters = []
    values = []

    if category and category in ("Fast", "Mid", "Slow", "Dead", "Low", "Reorder"):
        filters.append("movement_category = %s")
        values.append(category)

    if search:
        filters.append("(item_code LIKE %s OR item_description LIKE %s)")
        values += [f"%{search}%", f"%{search}%"]

    where = " AND ".join(filters) if filters else "1=1"
    safe_sort = sort_by if sort_by in (
        "item_code", "item_description", "units_sold", "stock_on_hand",
        "turnover_days", "movement_category",
    ) else "item_code"
    safe_order = "DESC" if sort_order.lower() == "desc" else "ASC"

    rows = frappe.db.sql(
        f"""SELECT name, item_code, item_description, period, movement_category,
                   units_sold, stock_on_hand, turnover_days,
                   safety_level, reorder_level, suggested_po_qty, vendor
            FROM `tabVE Stock Movement Summary`
            WHERE {where}
            ORDER BY {safe_sort} {safe_order}
            LIMIT %s OFFSET %s""",
        values + [page_size, (page - 1) * page_size],
        as_dict=True,
    )

    count_rows = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Stock Movement Summary` WHERE {where}",
        values, as_dict=True,
    )

    return {
        "data": [dict(r) for r in rows],
        "total": cint(count_rows[0].cnt) if count_rows else 0,
        "page": page,
        "page_size": page_size,
    }


# ── Import trigger (admin only) ───────────────────────────────────────────────

MASTERS_PATH      = "/home/vera/Master.xml"
# Full transaction history (25k+ vouchers), not just the current-FY export —
# switched from Transactions.xml (1,098 vouchers, current FY only) so General
# Ledger / voucher tabs / Financial Statements aren't missing prior years.
# CONFIRM this exact filename exists on the server (`ls /home/vera/`) before
# triggering an import — case/spacing must match exactly.
TRANSACTIONS_PATH = "/home/vera/All Transactions.xml"


@frappe.whitelist()
@handle_api_error
def trigger_tally_import():
    """
    Full pipeline: XML parse → VE Tally tables → Dashboard DocTypes → cache clear.
    Enqueued on the long queue; poll get_import_status() for progress.
    """
    require_admin()
    import os
    missing = [p for p in (MASTERS_PATH, TRANSACTIONS_PATH) if not os.path.isfile(p)]
    if missing:
        frappe.throw(f"File(s) not found on server: {', '.join(missing)}")

    frappe.enqueue(
        "hr_client.api.tally_transformer.run",
        masters_path=MASTERS_PATH,
        transactions_path=TRANSACTIONS_PATH,
        queue="long",
        timeout=7200,
    )
    return {"message": "Import started. Poll get_import_status for live progress."}


@frappe.whitelist()
@handle_api_error
def get_import_status():
    """Return live status of the running (or last) Tally import pipeline."""
    require_admin()
    import hr_client.api.tally_transformer as t
    return t.get_status()


@frappe.whitelist()
@handle_api_error
def get_reconciliation_report():
    """
    Compare source VE Tally Voucher/Ledger data vs derived Dashboard DocTypes.
    Returns per-section status: ok / warn (≤5% delta) / error (>5% delta or large count gap).
    Run after every import to catch drift before it reaches the dashboard.
    """
    require_admin()
    from hr_client.api import accounts_tally_import as ati
    return ati.reconcile()
