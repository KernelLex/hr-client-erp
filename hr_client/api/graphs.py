"""
graphs.py — Financial Graph Generation API
Endpoints for AI-powered chart generation, preset charts, and saved graph management.
"""
import json
import calendar
import frappe
from frappe.utils import flt, cint
from hr_client.utils.llm import ask_llm_json, is_ollama_running

# ── helpers ──────────────────────────────────────────────────────────────────

def _require_admin():
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)


def _fy_dates(fy: str):
    """Return (start_date, end_date) for a FY string like '2025-26'."""
    try:
        yr = int(fy.split("-")[0])
        return f"{yr}-04-01", f"{yr + 1}-03-31"
    except Exception:
        return "2025-04-01", "2026-03-31"


def _current_fy():
    import datetime
    today = datetime.date.today()
    if today.month >= 4:
        return f"{today.year}-{str(today.year + 1)[2:]}"
    return f"{today.year - 1}-{str(today.year)[2:]}"


def _month_name(yyyymm: str) -> str:
    try:
        yr, mo = int(yyyymm[:4]), int(yyyymm[4:6]) if len(yyyymm) == 6 else int(yyyymm[5:7])
        return f"{calendar.month_abbr[mo]} {yr}"
    except Exception:
        return yyyymm


def _fmt(n):
    return round(float(n or 0), 2)


# ── preset catalogue ─────────────────────────────────────────────────────────

PRESETS = [
    {
        "id": "monthly_sales_purchases",
        "title": "Monthly Sales vs Purchases",
        "description": "Side-by-side bar chart comparing monthly sales and purchase totals",
        "chart_type": "composed",
        "category": "Finance",
        "icon": "TrendingUp",
        "color": "#4F46E5",
        "params_schema": {"months": 12, "fy": None},
    },
    {
        "id": "top_customers",
        "title": "Top Customers by Revenue",
        "description": "Horizontal bar chart of top customers ranked by total sales amount",
        "chart_type": "bar_horizontal",
        "category": "Sales",
        "icon": "Users",
        "color": "#16a34a",
        "params_schema": {"limit": 15, "fy": "current"},
    },
    {
        "id": "top_vendors",
        "title": "Top Vendors by Purchase",
        "description": "Horizontal bar chart of top vendors ranked by total purchase amount",
        "chart_type": "bar_horizontal",
        "category": "Purchase",
        "icon": "Package",
        "color": "#dc2626",
        "params_schema": {"limit": 15, "fy": "current"},
    },
    {
        "id": "voucher_breakdown",
        "title": "Transaction Type Distribution",
        "description": "Pie chart showing proportion of each voucher type by count and value",
        "chart_type": "pie",
        "category": "Finance",
        "icon": "PieChart",
        "color": "#7c3aed",
        "params_schema": {"fy": None},
    },
    {
        "id": "cashflow_trend",
        "title": "Monthly Cash Flow Trend",
        "description": "Area chart showing net cash inflow (receipts minus payments) each month",
        "chart_type": "area",
        "category": "Finance",
        "icon": "Activity",
        "color": "#0891b2",
        "params_schema": {"months": 12},
    },
    {
        "id": "fy_comparison",
        "title": "Year-on-Year FY Comparison",
        "description": "Compare sales, purchases, and collections across two financial years",
        "chart_type": "bar",
        "category": "Finance",
        "icon": "BarChart2",
        "color": "#d97706",
        "params_schema": {"fy1": "2024-25", "fy2": "2025-26"},
    },
    {
        "id": "monthly_collections",
        "title": "Monthly Collections Trend",
        "description": "Line chart of receipt amounts month by month",
        "chart_type": "line",
        "category": "Sales",
        "icon": "TrendingUp",
        "color": "#059669",
        "params_schema": {"months": 12},
    },
    {
        "id": "gst_analysis",
        "title": "GST Position Analysis",
        "description": "Bar chart comparing GST output payable vs input credit available",
        "chart_type": "bar",
        "category": "Finance",
        "icon": "FileText",
        "color": "#b45309",
        "params_schema": {},
    },
    {
        "id": "top_debtors",
        "title": "Top Outstanding Debtors",
        "description": "Horizontal bar chart of parties with highest outstanding receivables",
        "chart_type": "bar_horizontal",
        "category": "Sales",
        "icon": "IndianRupee",
        "color": "#4338ca",
        "params_schema": {"limit": 15},
    },
    {
        "id": "top_creditors",
        "title": "Top Outstanding Creditors",
        "description": "Horizontal bar chart of vendors with highest outstanding payables",
        "chart_type": "bar_horizontal",
        "category": "Purchase",
        "icon": "AlertTriangle",
        "color": "#b91c1c",
        "params_schema": {"limit": 15},
    },
    {
        "id": "sales_growth_rate",
        "title": "Monthly Sales Growth Rate",
        "description": "Line chart showing month-on-month percentage change in sales",
        "chart_type": "line",
        "category": "Sales",
        "icon": "TrendingUp",
        "color": "#7c3aed",
        "params_schema": {"months": 12},
    },
    {
        "id": "stock_value_items",
        "title": "Top Stock Items by Value",
        "description": "Horizontal bar chart of highest-value inventory items",
        "chart_type": "bar_horizontal",
        "category": "Inventory",
        "icon": "Package",
        "color": "#0e7490",
        "params_schema": {"limit": 20},
    },
    {
        "id": "payments_vs_receipts",
        "title": "Payments vs Receipts Monthly",
        "description": "Grouped bar chart comparing cash outflows and inflows each month",
        "chart_type": "bar",
        "category": "Finance",
        "icon": "ArrowLeftRight",
        "color": "#be185d",
        "params_schema": {"months": 12},
    },
    {
        "id": "credit_debit_notes",
        "title": "Credit & Debit Notes Trend",
        "description": "Monthly trend of credit and debit note values",
        "chart_type": "bar",
        "category": "Finance",
        "icon": "FileQuestion",
        "color": "#6d28d9",
        "params_schema": {"months": 12},
    },
    {
        "id": "state_wise_sales",
        "title": "Sales by Customer State",
        "description": "Pie chart showing sales distribution across Indian states",
        "chart_type": "pie",
        "category": "Sales",
        "icon": "MapPin",
        "color": "#0369a1",
        "params_schema": {"fy": "current"},
    },
]


# ── data fetchers ─────────────────────────────────────────────────────────────

def _fetch_monthly_sales_purchases(months=12, fy=None):
    if fy:
        d_from, d_to = _fy_dates(fy)
        date_filter = f"AND voucher_date BETWEEN '{d_from}' AND '{d_to}'"
    else:
        date_filter = f"AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL {int(months)} MONTH)"

    rows = frappe.db.sql(
        f"""
        SELECT DATE_FORMAT(voucher_date, %s) AS month,
               voucher_type,
               COALESCE(SUM(amount), 0) AS total,
               COUNT(*) AS cnt
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0 {date_filter}
          AND voucher_type IN ('Sales','Purchase','Receipt','Payment')
        GROUP BY month, voucher_type
        ORDER BY month
        """,
        ('%Y%m',), as_dict=True
    )
    pivot = {}
    for r in rows:
        m = r["month"]
        if m not in pivot:
            pivot[m] = {"month": _month_name(m), "Sales": 0, "Purchase": 0, "Receipt": 0, "Payment": 0}
        pivot[m][r["voucher_type"]] = _fmt(r["total"])

    data = list(pivot.values())
    return {
        "data": data,
        "x_key": "month",
        "y_keys": ["Sales", "Purchase", "Receipt", "Payment"],
        "colors": {"Sales": "#16a34a", "Purchase": "#dc2626", "Receipt": "#0891b2", "Payment": "#d97706"},
    }


def _fetch_top_parties(voucher_type="Sales", limit=15, fy="current"):
    fy = fy or _current_fy()
    d_from, d_to = _fy_dates(fy if fy != "current" else _current_fy())
    rows = frappe.db.sql(
        """
        SELECT party_name AS party,
               COALESCE(SUM(amount), 0) AS total,
               COUNT(*) AS cnt
        FROM `tabVE Tally Voucher`
        WHERE voucher_type = %s AND is_cancelled = 0
          AND voucher_date BETWEEN %s AND %s
          AND party_name != ''
        GROUP BY party_name
        ORDER BY total DESC
        LIMIT %s
        """,
        (voucher_type, d_from, d_to, cint(limit)), as_dict=True
    )
    data = [{"party": r["party"], "amount": _fmt(r["total"]), "count": int(r["cnt"])} for r in rows]
    return {
        "data": data,
        "x_key": "amount",
        "y_keys": ["party"],
        "value_key": "amount",
        "label_key": "party",
        "colors": {"amount": "#4F46E5"},
    }


def _fetch_voucher_breakdown(fy=None):
    if fy:
        d_from, d_to = _fy_dates(fy)
        date_filter = f"AND voucher_date BETWEEN '{d_from}' AND '{d_to}'"
    else:
        date_filter = ""
    rows = frappe.db.sql(
        f"""
        SELECT voucher_type AS name,
               COUNT(*) AS count,
               COALESCE(SUM(amount), 0) AS value
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0 {date_filter}
        GROUP BY voucher_type
        ORDER BY value DESC
        """,
        as_dict=True
    )
    colors = [
        "#16a34a","#dc2626","#0891b2","#d97706","#7c3aed",
        "#be185d","#0e7490","#b45309","#4338ca","#065f46",
        "#9a3412","#1e3a5f","#4a044e","#064e3b","#1a1a2e",
    ]
    data = [
        {"name": r["name"], "value": _fmt(r["value"]), "count": int(r["count"]), "fill": colors[i % len(colors)]}
        for i, r in enumerate(rows)
    ]
    return {"data": data, "x_key": "name", "value_key": "value", "label_key": "name"}


def _fetch_cashflow_trend(months=12):
    rows = frappe.db.sql(
        """
        SELECT DATE_FORMAT(voucher_date, %s) AS month,
               voucher_type,
               COALESCE(SUM(amount), 0) AS total
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
          AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
          AND voucher_type IN ('Receipt','Payment')
        GROUP BY month, voucher_type
        ORDER BY month
        """,
        ('%Y%m', cint(months)), as_dict=True
    )
    pivot = {}
    for r in rows:
        m = r["month"]
        if m not in pivot:
            pivot[m] = {"month": _month_name(m), "Receipts": 0, "Payments": 0, "Net": 0}
        pivot[m][r["voucher_type"] if r["voucher_type"] == "Receipt" else "Payments"] = _fmt(r["total"])
    for v in pivot.values():
        v["Net"] = round(v["Receipts"] - v["Payments"], 2)
    return {
        "data": list(pivot.values()),
        "x_key": "month",
        "y_keys": ["Receipts", "Payments", "Net"],
        "colors": {"Receipts": "#16a34a", "Payments": "#dc2626", "Net": "#4F46E5"},
    }


def _fetch_fy_comparison(fy1="2024-25", fy2="2025-26"):
    results = {}
    for fy in (fy1, fy2):
        d_from, d_to = _fy_dates(fy)
        rows = frappe.db.sql(
            """
            SELECT voucher_type, COALESCE(SUM(amount), 0) AS total
            FROM `tabVE Tally Voucher`
            WHERE is_cancelled = 0 AND voucher_date BETWEEN %s AND %s
              AND voucher_type IN ('Sales','Purchase','Receipt','Payment')
            GROUP BY voucher_type
            """,
            (d_from, d_to), as_dict=True
        )
        by_type = {r["voucher_type"]: _fmt(r["total"]) for r in rows}
        results[fy] = by_type

    data = []
    for metric in ("Sales", "Purchase", "Receipt", "Payment"):
        data.append({
            "metric": metric,
            f"FY {fy1}": results.get(fy1, {}).get(metric, 0),
            f"FY {fy2}": results.get(fy2, {}).get(metric, 0),
        })
    return {
        "data": data,
        "x_key": "metric",
        "y_keys": [f"FY {fy1}", f"FY {fy2}"],
        "colors": {f"FY {fy1}": "#94a3b8", f"FY {fy2}": "#4F46E5"},
    }


def _fetch_gst_analysis():
    try:
        import os, json as _json
        snap_path = os.path.join(frappe.get_app_path("hr_client"), "tally_snapshot.json")
        with open(snap_path) as f:
            snap = _json.load(f)
    except Exception:
        snap = {}

    gst_payable  = _fmt(snap.get("gst_payable", 0))
    input_credit = _fmt(snap.get("input_gst_credit", 0))
    net_payable  = round(max(0, gst_payable - input_credit), 2)

    data = [
        {"label": "GST Output (Payable)", "amount": gst_payable, "fill": "#dc2626"},
        {"label": "GST Input (Credit)",   "amount": input_credit, "fill": "#16a34a"},
        {"label": "Net GST Payable",       "amount": net_payable, "fill": "#d97706"},
    ]
    return {
        "data": data,
        "x_key": "label",
        "y_keys": ["amount"],
        "colors": {},
    }


def _fetch_ledger_balances(filter_type="debtors", limit=15):
    is_field = "is_debtors" if filter_type == "debtors" else "is_creditors"
    rows = frappe.db.sql(
        f"""
        SELECT ledger_name AS party,
               ABS(closing_balance) AS balance
        FROM `tabVE Tally Ledger`
        WHERE `{is_field}` = 1 AND ABS(closing_balance) > 0
        ORDER BY ABS(closing_balance) DESC
        LIMIT %s
        """,
        (cint(limit),), as_dict=True
    )
    data = [{"party": r["party"], "amount": _fmt(r["balance"])} for r in rows]
    return {
        "data": data,
        "x_key": "amount",
        "value_key": "amount",
        "label_key": "party",
        "colors": {"amount": "#4F46E5" if filter_type == "debtors" else "#dc2626"},
    }


def _fetch_sales_growth(months=12):
    rows = frappe.db.sql(
        """
        SELECT DATE_FORMAT(voucher_date, %s) AS month,
               COALESCE(SUM(amount), 0) AS total
        FROM `tabVE Tally Voucher`
        WHERE voucher_type = 'Sales' AND is_cancelled = 0
          AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        GROUP BY month ORDER BY month
        """,
        ('%Y%m', cint(months)), as_dict=True
    )
    data = []
    prev = None
    for r in rows:
        cur = _fmt(r["total"])
        growth = round(((cur - prev) / prev * 100), 1) if prev and prev > 0 else 0
        data.append({"month": _month_name(r["month"]), "sales": cur, "growth_pct": growth})
        prev = cur
    return {
        "data": data,
        "x_key": "month",
        "y_keys": ["sales", "growth_pct"],
        "colors": {"sales": "#16a34a", "growth_pct": "#7c3aed"},
    }


def _fetch_stock_value(limit=20):
    rows = frappe.db.sql(
        """
        SELECT item_name, standard_rate,
               COALESCE(closing_qty, 0) AS qty,
               COALESCE(closing_value, 0) AS value
        FROM `tabVE Tally Stock Item`
        WHERE closing_value > 0
        ORDER BY closing_value DESC
        LIMIT %s
        """,
        (cint(limit),), as_dict=True
    )
    if not rows:
        rows = frappe.db.sql(
            """
            SELECT item_name, standard_rate,
                   0 AS qty,
                   COALESCE(standard_rate, 0) AS value
            FROM `tabVE Tally Stock Item`
            WHERE standard_rate > 0
            ORDER BY standard_rate DESC
            LIMIT %s
            """,
            (cint(limit),), as_dict=True
        )
    data = [{"item": r["item_name"][:40], "value": _fmt(r["value"]), "qty": _fmt(r["qty"])} for r in rows]
    return {
        "data": data,
        "x_key": "value",
        "value_key": "value",
        "label_key": "item",
        "colors": {"value": "#0e7490"},
    }


def _fetch_payments_receipts(months=12):
    rows = frappe.db.sql(
        """
        SELECT DATE_FORMAT(voucher_date, %s) AS month,
               voucher_type,
               COALESCE(SUM(amount), 0) AS total
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
          AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
          AND voucher_type IN ('Receipt','Payment')
        GROUP BY month, voucher_type ORDER BY month
        """,
        ('%Y%m', cint(months)), as_dict=True
    )
    pivot = {}
    for r in rows:
        m = r["month"]
        if m not in pivot:
            pivot[m] = {"month": _month_name(m), "Receipts": 0, "Payments": 0}
        key = "Receipts" if r["voucher_type"] == "Receipt" else "Payments"
        pivot[m][key] = _fmt(r["total"])
    return {
        "data": list(pivot.values()),
        "x_key": "month",
        "y_keys": ["Receipts", "Payments"],
        "colors": {"Receipts": "#16a34a", "Payments": "#dc2626"},
    }


def _fetch_credit_debit_notes(months=12):
    rows = frappe.db.sql(
        """
        SELECT DATE_FORMAT(voucher_date, %s) AS month,
               voucher_type,
               COALESCE(SUM(amount), 0) AS total
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
          AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
          AND voucher_type IN ('Credit Note','Debit Note')
        GROUP BY month, voucher_type ORDER BY month
        """,
        ('%Y%m', cint(months)), as_dict=True
    )
    pivot = {}
    for r in rows:
        m = r["month"]
        if m not in pivot:
            pivot[m] = {"month": _month_name(m), "Credit Note": 0, "Debit Note": 0}
        pivot[m][r["voucher_type"]] = _fmt(r["total"])
    return {
        "data": list(pivot.values()),
        "x_key": "month",
        "y_keys": ["Credit Note", "Debit Note"],
        "colors": {"Credit Note": "#7c3aed", "Debit Note": "#be185d"},
    }


def _fetch_state_wise_sales(fy="current"):
    fy = fy if fy != "current" else _current_fy()
    d_from, d_to = _fy_dates(fy)
    rows = frappe.db.sql(
        """
        SELECT l.state AS name, COALESCE(SUM(v.amount), 0) AS value
        FROM `tabVE Tally Voucher` v
        JOIN `tabVE Tally Ledger` l ON v.party_name = l.ledger_name
        WHERE v.voucher_type = 'Sales' AND v.is_cancelled = 0
          AND v.voucher_date BETWEEN %s AND %s
          AND l.state != '' AND l.state IS NOT NULL
        GROUP BY l.state ORDER BY value DESC LIMIT 20
        """,
        (d_from, d_to), as_dict=True
    )
    colors = [
        "#4F46E5","#16a34a","#dc2626","#0891b2","#d97706","#7c3aed",
        "#be185d","#0e7490","#b45309","#4338ca","#065f46","#9a3412",
    ]
    data = [
        {"name": r["name"], "value": _fmt(r["value"]), "fill": colors[i % len(colors)]}
        for i, r in enumerate(rows)
    ]
    return {"data": data, "x_key": "name", "value_key": "value", "label_key": "name"}


PRESET_FETCHERS = {
    "monthly_sales_purchases": lambda p: _fetch_monthly_sales_purchases(p.get("months", 12), p.get("fy")),
    "top_customers":           lambda p: _fetch_top_parties("Sales",    p.get("limit", 15), p.get("fy", "current")),
    "top_vendors":             lambda p: _fetch_top_parties("Purchase", p.get("limit", 15), p.get("fy", "current")),
    "voucher_breakdown":       lambda p: _fetch_voucher_breakdown(p.get("fy")),
    "cashflow_trend":          lambda p: _fetch_cashflow_trend(p.get("months", 12)),
    "fy_comparison":           lambda p: _fetch_fy_comparison(p.get("fy1", "2024-25"), p.get("fy2", "2025-26")),
    "monthly_collections":     lambda p: _fetch_payments_receipts(p.get("months", 12)),
    "gst_analysis":            lambda p: _fetch_gst_analysis(),
    "top_debtors":             lambda p: _fetch_ledger_balances("debtors",  p.get("limit", 15)),
    "top_creditors":           lambda p: _fetch_ledger_balances("creditors", p.get("limit", 15)),
    "sales_growth_rate":       lambda p: _fetch_sales_growth(p.get("months", 12)),
    "stock_value_items":       lambda p: _fetch_stock_value(p.get("limit", 20)),
    "payments_vs_receipts":    lambda p: _fetch_payments_receipts(p.get("months", 12)),
    "credit_debit_notes":      lambda p: _fetch_credit_debit_notes(p.get("months", 12)),
    "state_wise_sales":        lambda p: _fetch_state_wise_sales(p.get("fy", "current")),
}


# ── AI query interpretation ───────────────────────────────────────────────────

_GRAPH_SYSTEM = """You are a financial data analyst AI for Vera Enterprises (Indian SME).
Available data:
- VE Tally Voucher: Sales, Purchase, Receipt, Payment, Journal, Contra, Credit Note, Debit Note, Sales Order, Purchase Order
- VE Tally Ledger: ledger balances, debtors, creditors, GSTIN, state
- VE Tally Stock Item: inventory items, HSN codes, stock quantities and values

Always respond with valid JSON only. No extra text."""

_GRAPH_PROMPT_TEMPLATE = """The user wants a financial chart: "{query}"
{date_context}

Return JSON with this exact structure:
{{
  "intent": "monthly_trend|top_parties|voucher_breakdown|cashflow|fy_comparison|gst|ledger_balances|stock|growth_rate|custom",
  "chart_type": "bar|line|area|pie|bar_horizontal|composed",
  "title": "descriptive chart title",
  "description": "one sentence describing what this chart shows",
  "category": "Sales|Purchase|Finance|Inventory|Custom",
  "params": {{
    "voucher_types": ["Sales"],
    "group_by": "month|party|voucher_type|state",
    "limit": 15,
    "months": 12,
    "fy": null,
    "metric": "amount|count"
  }}
}}"""


def _ai_interpret_query(query: str, date_from=None, date_to=None):
    """Use Ollama to interpret a natural language graph query."""
    if date_from and date_to:
        date_context = f"Date range: {date_from} to {date_to}"
    else:
        date_context = f"Use current financial year ({_current_fy()}) unless specified."

    prompt = _GRAPH_PROMPT_TEMPLATE.format(query=query, date_context=date_context)
    result = ask_llm_json(prompt, system=_GRAPH_SYSTEM)
    return result


def _execute_ai_query(interpretation, query, date_from=None, date_to=None):
    """Execute the DB query based on AI interpretation."""
    if not interpretation:
        return None

    intent    = interpretation.get("intent", "custom")
    params    = interpretation.get("params", {})
    months    = cint(params.get("months", 12))
    limit     = cint(params.get("limit", 15))
    fy        = params.get("fy")
    v_types   = params.get("voucher_types", ["Sales"])
    group_by  = params.get("group_by", "month")
    metric    = params.get("metric", "amount")

    # Map intent to fetcher
    if intent == "monthly_trend":
        if set(v_types) & {"Receipt", "Payment"}:
            chart_data = _fetch_cashflow_trend(months)
        else:
            chart_data = _fetch_monthly_sales_purchases(months, fy)
    elif intent in ("top_parties", "top_customers", "top_vendors"):
        vt = v_types[0] if v_types else "Sales"
        chart_data = _fetch_top_parties(vt, limit, fy or "current")
    elif intent == "voucher_breakdown":
        chart_data = _fetch_voucher_breakdown(fy)
    elif intent == "cashflow":
        chart_data = _fetch_cashflow_trend(months)
    elif intent == "fy_comparison":
        chart_data = _fetch_fy_comparison("2024-25", "2025-26")
    elif intent == "gst":
        chart_data = _fetch_gst_analysis()
    elif intent == "ledger_balances":
        filter_type = "creditors" if any(w in query.lower() for w in ("creditor","payable","vendor","purchase")) else "debtors"
        chart_data = _fetch_ledger_balances(filter_type, limit)
    elif intent == "stock":
        chart_data = _fetch_stock_value(limit)
    elif intent == "growth_rate":
        chart_data = _fetch_sales_growth(months)
    else:
        # Custom: group by party or month for a given voucher type
        vt = v_types[0] if v_types else "Sales"
        if date_from and date_to:
            date_filter = f"AND voucher_date BETWEEN '{date_from}' AND '{date_to}'"
        elif fy:
            d_from, d_to = _fy_dates(fy)
            date_filter = f"AND voucher_date BETWEEN '{d_from}' AND '{d_to}'"
        else:
            date_filter = f"AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL {months} MONTH)"

        if group_by == "party":
            rows = frappe.db.sql(
                f"""
                SELECT party_name AS label,
                       {'COUNT(*) AS value' if metric == 'count' else 'COALESCE(SUM(amount),0) AS value'}
                FROM `tabVE Tally Voucher`
                WHERE voucher_type = %s AND is_cancelled = 0 {date_filter}
                  AND party_name != ''
                GROUP BY party_name ORDER BY value DESC LIMIT %s
                """,
                (vt, limit), as_dict=True
            )
            data = [{"party": r["label"], "amount": _fmt(r["value"])} for r in rows]
            chart_data = {"data": data, "label_key": "party", "value_key": "amount",
                          "x_key": "amount", "colors": {"amount": "#4F46E5"}}
        else:
            rows = frappe.db.sql(
                f"""
                SELECT DATE_FORMAT(voucher_date, %s) AS month,
                       {'COUNT(*) AS value' if metric == 'count' else 'COALESCE(SUM(amount),0) AS value'}
                FROM `tabVE Tally Voucher`
                WHERE voucher_type = %s AND is_cancelled = 0 {date_filter}
                GROUP BY month ORDER BY month
                """,
                ('%Y%m', vt), as_dict=True
            )
            data = [{"month": _month_name(r["month"]), "amount": _fmt(r["value"])} for r in rows]
            chart_data = {"data": data, "x_key": "month", "y_keys": ["amount"],
                          "colors": {"amount": "#16a34a"}}

    return chart_data


# ── public endpoints ──────────────────────────────────────────────────────────

@frappe.whitelist()
def get_available_presets():
    _require_admin()
    return {"success": True, "presets": PRESETS}


@frappe.whitelist()
def get_preset_graph(preset_id, params_json=None):
    _require_admin()
    if preset_id not in PRESET_FETCHERS:
        return {"success": False, "error": f"Unknown preset: {preset_id}"}

    params = {}
    if params_json:
        try:
            params = json.loads(params_json)
        except Exception:
            pass

    meta = next((p for p in PRESETS if p["id"] == preset_id), {})
    try:
        chart_data = PRESET_FETCHERS[preset_id](params)
        return {
            "success": True,
            "preset_id": preset_id,
            "title": meta.get("title", preset_id),
            "description": meta.get("description", ""),
            "chart_type": meta.get("chart_type", "bar"),
            "category": meta.get("category", "Custom"),
            **chart_data,
        }
    except Exception as e:
        frappe.log_error(str(e)[:500], f"Graphs: get_preset_graph {preset_id}")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def generate_graph_data(query, chart_type_hint=None, date_from=None, date_to=None, fy=None):
    _require_admin()
    if not query or not query.strip():
        return {"success": False, "error": "Query is required"}

    if not is_ollama_running():
        return {"success": False, "error": "Ollama is not running. Start with: ollama serve"}

    try:
        interpretation = _ai_interpret_query(query, date_from, date_to)
        if not interpretation:
            return {"success": False, "error": "AI could not interpret the query. Try rephrasing."}

        # Override chart type if user specified
        if chart_type_hint and chart_type_hint != "auto":
            interpretation["chart_type"] = chart_type_hint

        # Override fy from params
        if fy:
            interpretation.setdefault("params", {})["fy"] = fy

        chart_data = _execute_ai_query(interpretation, query, date_from, date_to)
        if not chart_data:
            return {"success": False, "error": "No data found for this query."}

        return {
            "success": True,
            "title": interpretation.get("title", query[:60]),
            "description": interpretation.get("description", ""),
            "chart_type": interpretation.get("chart_type", "bar"),
            "category": interpretation.get("category", "Custom"),
            "query_text": query,
            "interpretation": interpretation,
            **chart_data,
        }
    except Exception as e:
        frappe.log_error(str(e)[:500], "Graphs: generate_graph_data")
        return {"success": False, "error": "Failed to generate chart. Check server logs."}


@frappe.whitelist()
def save_graph(title, chart_type, data_json, config_json, query_text=None,
               category="Custom", description="", is_preset=0, preset_id=None, thumbnail_data=None):
    _require_admin()
    try:
        doc = frappe.new_doc("VE Saved Graph")
        doc.title = title
        doc.chart_type = chart_type
        doc.data_json = data_json
        doc.config_json = config_json
        doc.query_text = query_text or ""
        doc.category = category or "Custom"
        doc.description = description or ""
        doc.is_preset = cint(is_preset)
        doc.preset_id = preset_id or ""
        doc.created_by_user = frappe.session.user
        if thumbnail_data:
            doc.thumbnail_data = thumbnail_data
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"success": True, "name": doc.name}
    except Exception as e:
        frappe.log_error(str(e)[:500], "Graphs: save_graph")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_saved_graphs(category=None, page=1, page_size=20):
    _require_admin()
    filters = {}
    if category and category != "All":
        filters["category"] = category

    total = frappe.db.count("VE Saved Graph", filters)
    offset = (cint(page) - 1) * cint(page_size)

    rows = frappe.db.get_all(
        "VE Saved Graph",
        filters=filters,
        fields=["name", "title", "chart_type", "category", "description",
                "query_text", "is_preset", "preset_id", "created_by_user",
                "thumbnail_data", "creation", "modified"],
        order_by="creation desc",
        limit=cint(page_size),
        start=offset,
    )
    return {"success": True, "graphs": rows, "total": total, "page": cint(page)}


@frappe.whitelist()
def get_saved_graph(name):
    _require_admin()
    try:
        doc = frappe.get_doc("VE Saved Graph", name)
        result = doc.as_dict()
        result["data"] = json.loads(doc.data_json or "[]")
        result["config"] = json.loads(doc.config_json or "{}")
        return {"success": True, "graph": result}
    except frappe.DoesNotExistError:
        return {"success": False, "error": "Graph not found"}


@frappe.whitelist()
def delete_graph(name):
    _require_admin()
    try:
        frappe.delete_doc("VE Saved Graph", name, ignore_permissions=True)
        frappe.db.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_graph_csv_data(name):
    _require_admin()
    try:
        doc = frappe.get_doc("VE Saved Graph", name)
        data = json.loads(doc.data_json or "[]")
        if not data:
            return {"success": False, "error": "No data"}
        # Build CSV
        keys = list(data[0].keys()) if data else []
        lines = [",".join(str(k) for k in keys)]
        for row in data:
            lines.append(",".join(str(row.get(k, "")) for k in keys))
        return {"success": True, "csv": "\n".join(lines), "filename": f"{doc.title}.csv"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_graph_stats():
    _require_admin()
    total = frappe.db.count("VE Saved Graph")
    by_category = frappe.db.sql(
        "SELECT category, COUNT(*) AS cnt FROM `tabVE Saved Graph` GROUP BY category",
        as_dict=True
    )
    by_type = frappe.db.sql(
        "SELECT chart_type, COUNT(*) AS cnt FROM `tabVE Saved Graph` GROUP BY chart_type",
        as_dict=True
    )
    return {
        "success": True,
        "total": total,
        "by_category": {r["category"]: r["cnt"] for r in by_category},
        "by_type": {r["chart_type"]: r["cnt"] for r in by_type},
    }
