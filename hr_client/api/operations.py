import frappe
import json
import os
from frappe.utils import flt


_ADMIN_USERS = {"owais@veraenterprises.in", "Administrator"}
_SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tally_snapshot.json")


def _load_snapshot():
    try:
        with open(_SNAPSHOT_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def _require_admin():
    if frappe.session.user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)


def _fmt(amount, decimals=2):
    if amount is None:
        return "—"
    v = flt(amount)
    if abs(v) >= 10_000_000:
        return f"₹ {v / 10_000_000:.{decimals}f} Cr"
    elif abs(v) >= 100_000:
        return f"₹ {v / 100_000:.{decimals}f} L"
    elif abs(v) >= 1_000:
        return f"₹ {v / 1_000:.1f}K"
    return f"₹ {v:.0f}"


def _parse_month(m):
    months = {
        "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
        "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
        "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
    }
    if len(m) == 7:  # YYYY-MM
        return f"{months.get(m[5:7], m[5:7])} {m[2:4]}"
    return m


@frappe.whitelist()
def get_operations_data():
    _require_admin()

    # Load pre-computed snapshot for accurate financial aggregates
    # (Tally XML sign conventions differ between voucher types; these are computed correctly)
    snap = _load_snapshot()

    # ── Finance: bank/cash from DB (per-account breakdown) ─────────
    bank_rows = frappe.db.sql("""
        SELECT ledger_name, closing_balance
        FROM `tabVE Tally Ledger`
        WHERE is_bank = 1
        ORDER BY closing_balance DESC
    """, as_dict=True)
    cash_rows = frappe.db.sql("""
        SELECT ledger_name, closing_balance
        FROM `tabVE Tally Ledger`
        WHERE is_cash = 1
        ORDER BY closing_balance DESC
    """, as_dict=True)

    # Use snapshot for correct aggregate totals
    cash_total = flt(snap.get("cash_in_hand", 0))
    bank_total = flt(snap.get("bank_balance", 0))
    total_cash_bank = flt(snap.get("total_cash_bank", 0))

    gst_payable_raw = flt(snap.get("gst_payable", 0))
    input_gst = flt(snap.get("input_gst_credit", 0))
    net_gst = gst_payable_raw - input_gst
    tds_payable = flt(snap.get("tds_payable", 0))
    output_gst = gst_payable_raw

    # ── Accounts: snapshot aggregates + DB for individual names ────
    debtor_total = flt(snap.get("sundry_debtors", 0))
    creditor_total = flt(snap.get("sundry_creditors", 0))

    # Top debtors/creditors from snapshot (pre-sorted by amount)
    top_debtors_snap = snap.get("top_debtors", {})
    top_creditors_snap = snap.get("top_creditors", {})

    top_debtors = [
        frappe._dict(party=k, amount=v)
        for k, v in sorted(top_debtors_snap.items(), key=lambda x: -x[1])[:10]
    ]
    top_creditors = [
        frappe._dict(party=k, amount=v)
        for k, v in sorted(top_creditors_snap.items(), key=lambda x: -x[1])[:10]
    ]

    # ── Monthly sales/purchases from VE Tally Voucher ──────────────
    monthly_raw = frappe.db.sql(
        "SELECT DATE_FORMAT(voucher_date, %s) as month, voucher_type, SUM(amount) as total "
        "FROM `tabVE Tally Voucher` "
        "WHERE is_cancelled = 0 AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) "
        "AND voucher_type IN ('Sales', 'Purchase', 'Receipt', 'PERFORMA INVOICE') "
        "GROUP BY month, voucher_type ORDER BY month",
        ('%Y-%m',), as_dict=True
    )

    chart_map = {}
    for row in monthly_raw:
        m = row.month
        if m not in chart_map:
            chart_map[m] = {"month": _parse_month(m), "sales": 0.0, "purchases": 0.0, "collections": 0.0}
        if row.voucher_type in ("Sales", "PERFORMA INVOICE"):
            chart_map[m]["sales"] += flt(row.total) / 100_000
        elif row.voucher_type == "Purchase":
            chart_map[m]["purchases"] += flt(row.total) / 100_000
        elif row.voucher_type == "Receipt":
            chart_map[m]["collections"] += flt(row.total) / 100_000

    chart_data = [{"month": v["month"], "sales": round(v["sales"], 2), "purchases": round(v["purchases"], 2), "collections": round(v["collections"], 2)}
                  for v in chart_map.values()]

    fy_totals = frappe.db.sql("""
        SELECT voucher_type, SUM(amount) as total
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
          AND voucher_date >= '2025-04-01'
          AND voucher_type IN ('Sales', 'PERFORMA INVOICE', 'Purchase', 'Receipt')
        GROUP BY voucher_type
    """, as_dict=True)

    fy_sales = sum(flt(r.total) for r in fy_totals if r.voucher_type in ("Sales", "PERFORMA INVOICE"))
    fy_purch = sum(flt(r.total) for r in fy_totals if r.voucher_type == "Purchase")
    fy_coll = sum(flt(r.total) for r in fy_totals if r.voucher_type == "Receipt")

    # Fall back to snapshot FY figures if DB shows zero (sign issue in import)
    if fy_sales < 1000:
        fy_sales = flt(snap.get("fy_sales", 0))
    if fy_purch < 1000:
        fy_purch = flt(snap.get("fy_purchases", 0))
    if fy_coll < 1000:
        fy_coll = flt(snap.get("fy_collections", 0))

    # ── Latest voucher date ─────────────────────────────────────────
    latest = frappe.db.sql("""
        SELECT MAX(voucher_date) as latest FROM `tabVE Tally Voucher`
    """, as_dict=True)
    as_of = str(latest[0].latest).replace("-", "") if latest and latest[0].latest else ""

    # ── HR from Frappe ─────────────────────────────────────────────
    total_employees = frappe.db.count("Employee", {"status": "Active"})
    open_positions = frappe.db.count("Job Opening", {"status": "Open"})
    pending_leaves = frappe.db.count("Vera Leave Application", {"status": "Pending"})

    # ── CRM from Frappe ────────────────────────────────────────────
    try:
        crm_leads = frappe.get_all(
            "Vera CRM Lead",
            fields=["name", "lead_title", "company_name", "status", "assigned_to"],
            filters={"status": ["not in", ["Failed"]]},
            order_by="creation desc",
            limit=50,
        )
        active_leads = len(crm_leads)
        crm_by_stage = {}
        for lead in crm_leads:
            crm_by_stage[lead.status] = crm_by_stage.get(lead.status, 0) + 1
    except Exception:
        active_leads = 0
        crm_by_stage = {}
        crm_leads = []

    pipeline_value = 0
    try:
        rows = frappe.db.sql("SELECT SUM(total) as t FROM `tabVera CRM Quotation`", as_dict=True)
        pipeline_value = flt(rows[0].t if rows else 0)
    except Exception:
        pass

    # ── Inventory from VE Tally Stock Item ─────────────────────────
    stock_count = frappe.db.count("VE Tally Stock Item")
    stock_groups = frappe.db.sql("""
        SELECT DISTINCT stock_group
        FROM `tabVE Tally Stock Item`
        WHERE stock_group != ''
        ORDER BY stock_group
        LIMIT 30
    """, as_dict=True)
    brand_names = [r.stock_group.replace("&amp;", "&") for r in stock_groups]

    vtypes = frappe.db.sql("""
        SELECT voucher_type, COUNT(*) as cnt
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
        GROUP BY voucher_type
    """, as_dict=True)
    vtype_map = {r.voucher_type: r.cnt for r in vtypes}

    # ── Format everything ──────────────────────────────────────────
    return {
        "as_of": as_of,
        "finance": {
            "kpis": [
                {"label": "Cash in Hand", "value": _fmt(max(0, cash_total)), "raw": cash_total},
                {"label": "Bank Balance (Net)", "value": _fmt(bank_total), "raw": bank_total},
                {"label": "Net GST Liability", "value": _fmt(net_gst), "raw": net_gst},
                {"label": "TDS Payable", "value": _fmt(tds_payable), "raw": tds_payable},
            ],
            "bank_accounts": [
                {"name": r.ledger_name, "balance": flt(r.closing_balance), "balance_fmt": _fmt(r.closing_balance)}
                for r in bank_rows
            ],
            "cash_accounts": [
                {"name": r.ledger_name, "balance": flt(r.closing_balance), "balance_fmt": _fmt(r.closing_balance)}
                for r in cash_rows
            ],
            "gst_detail": {
                "output_gst": round(abs(output_gst), 2),
                "input_credit": round(input_gst, 2),
                "net_liability": round(net_gst, 2),
                "output_fmt": _fmt(abs(output_gst)),
                "input_fmt": _fmt(input_gst),
                "net_fmt": _fmt(net_gst),
            },
        },
        "accounts": {
            "kpis": [
                {"label": "Sundry Debtors", "value": _fmt(debtor_total), "raw": debtor_total},
                {"label": "Sundry Creditors", "value": _fmt(creditor_total), "raw": creditor_total},
                {"label": "FY Sales (2025-26)", "value": _fmt(fy_sales), "raw": fy_sales},
                {"label": "FY Collections", "value": _fmt(fy_coll), "raw": fy_coll},
            ],
            "top_debtors": [
                {"party": r.party, "amount": flt(r.amount), "amount_fmt": _fmt(r.amount)}
                for r in top_debtors
            ],
            "top_creditors": [
                {"party": r.party, "amount": flt(r.amount), "amount_fmt": _fmt(r.amount)}
                for r in top_creditors
            ],
            "chart": chart_data,
            "fy_sales": round(fy_sales, 2),
            "fy_purchases": round(fy_purch, 2),
            "fy_collections": round(fy_coll, 2),
            "fy_sales_fmt": _fmt(fy_sales),
            "fy_purchases_fmt": _fmt(fy_purch),
        },
        "hr": {
            "kpis": [
                {"label": "Active Employees", "value": str(total_employees), "raw": total_employees},
                {"label": "Open Positions", "value": str(open_positions), "raw": open_positions},
                {"label": "Leave Requests", "value": str(pending_leaves), "raw": pending_leaves},
            ],
            "headcount": total_employees,
            "open_positions": open_positions,
            "pending_leaves": pending_leaves,
        },
        "crm": {
            "kpis": [
                {"label": "Active Leads", "value": str(active_leads), "raw": active_leads},
                {"label": "Pipeline Value", "value": _fmt(pipeline_value), "raw": pipeline_value},
                {"label": "At Order Stage", "value": str(crm_by_stage.get("Order", 0)), "raw": crm_by_stage.get("Order", 0)},
            ],
            "by_stage": crm_by_stage,
            "recent_leads": [
                {
                    "name": l.name,
                    "title": l.lead_title or l.company_name or "—",
                    "status": l.status,
                    "assigned_to": l.assigned_to,
                }
                for l in crm_leads[:8]
            ],
        },
        "inventory": {
            "kpis": [
                {"label": "Total SKUs", "value": f"{stock_count:,}", "raw": stock_count},
                {"label": "Brand Groups", "value": str(len(brand_names)), "raw": len(brand_names)},
                {"label": "Sales Vouchers", "value": f"{vtype_map.get('Sales', 0):,}", "raw": vtype_map.get("Sales", 0)},
                {"label": "Purchase Vouchers", "value": f"{vtype_map.get('Purchase', 0):,}", "raw": vtype_map.get("Purchase", 0)},
            ],
            "brands": brand_names,
            "voucher_summary": {
                "sales": vtype_map.get("Sales", 0),
                "purchases": vtype_map.get("Purchase", 0),
                "receipts": vtype_map.get("Receipt", 0),
                "payments": vtype_map.get("Payment", 0),
                "purchase_orders": vtype_map.get("Purchase Order", 0),
                "sales_orders": vtype_map.get("Sales Order", 0),
                "credit_notes": vtype_map.get("Credit Note", 0),
                "debit_notes": vtype_map.get("Debit Note", 0),
            },
        },
        "executive": {
            "kpis": [
                {
                    "label": "Cash + Bank",
                    "value": _fmt(total_cash_bank),
                    "raw": total_cash_bank,
                    "delta": f"Bank: {_fmt(bank_total)}",
                    "delta_class": "delta-neutral",
                },
                {
                    "label": "Receivables",
                    "value": _fmt(debtor_total),
                    "raw": debtor_total,
                    "delta": f"FY Sales: {_fmt(fy_sales)}",
                    "delta_class": "delta-positive",
                },
                {
                    "label": "Payables",
                    "value": _fmt(creditor_total),
                    "raw": creditor_total,
                    "delta": f"FY Purchases: {_fmt(fy_purch)}",
                    "delta_class": "delta-negative",
                },
                {
                    "label": "Active Leads",
                    "value": str(active_leads),
                    "raw": active_leads,
                    "delta": f"Pipeline: {_fmt(pipeline_value)}",
                    "delta_class": "delta-positive",
                },
            ]
        },
    }


@frappe.whitelist()
def upload_tally_file():
    """
    Accepts a single Tally XML file upload (Masters or Transactions).
    Saves to a writable path and returns the saved path.
    """
    _require_admin()
    upload_dir = "/home/vera/tally_uploads"
    os.makedirs(upload_dir, exist_ok=True)

    files = frappe.request.files
    if not files:
        frappe.throw("No file uploaded")

    file_key = list(files.keys())[0]
    uploaded = files[file_key]
    filename = uploaded.filename or "tally_upload.xml"

    # Sanitize filename
    safe_name = filename.replace(" ", "_").replace("/", "_")
    dest = os.path.join(upload_dir, safe_name)
    uploaded.save(dest)

    return {"path": dest, "filename": safe_name, "size": os.path.getsize(dest)}


@frappe.whitelist()
def run_tally_import(masters_path: str, transactions_path: str):
    """
    Enqueue the full Tally import as a background job.
    masters_path and transactions_path are absolute paths on the server.
    """
    _require_admin()

    if not os.path.exists(masters_path):
        frappe.throw(f"Masters file not found: {masters_path}")
    if not os.path.exists(transactions_path):
        frappe.throw(f"Transactions file not found: {transactions_path}")

    from hr_client.api import tally_import_job
    import json as _json
    frappe.cache().set_value("tally_import_status", _json.dumps({
        "status": "running", "progress": 1, "message": "Import queued…",
    }), expires_in_sec=3600)

    frappe.enqueue(
        "hr_client.api.tally_import_job.run",
        queue="long",
        timeout=1800,
        masters_path=masters_path,
        transactions_path=transactions_path,
    )
    return {"queued": True}


@frappe.whitelist()
def get_import_status():
    """Poll the import progress."""
    _require_admin()
    from hr_client.api.tally_import_job import get_status
    return get_status()


@frappe.whitelist()
def get_tally_financial_summary():
    """
    Returns a compact financial summary for use in other pages (Dashboard, Business).
    No heavy computation — reads snapshot + 3 fast DB queries.
    """
    snap = _load_snapshot()
    if not snap:
        return None
    as_of_row = frappe.db.sql("SELECT MAX(voucher_date) as d FROM `tabVE Tally Voucher`", as_dict=True)
    as_of = str(as_of_row[0].d) if as_of_row and as_of_row[0].d else ""
    return {
        "cash_bank":      _fmt(flt(snap.get("total_cash_bank", 0))),
        "cash_bank_raw":  flt(snap.get("total_cash_bank", 0)),
        "receivables":    _fmt(flt(snap.get("sundry_debtors", 0))),
        "recv_raw":       flt(snap.get("sundry_debtors", 0)),
        "payables":       _fmt(flt(snap.get("sundry_creditors", 0))),
        "pay_raw":        flt(snap.get("sundry_creditors", 0)),
        "fy_sales":       _fmt(flt(snap.get("fy_sales", 0))),
        "fy_sales_raw":   flt(snap.get("fy_sales", 0)),
        "fy_purchases":   _fmt(flt(snap.get("fy_purchases", 0))),
        "fy_purch_raw":   flt(snap.get("fy_purchases", 0)),
        "net_gst":        _fmt(flt(snap.get("gst_payable", 0)) - flt(snap.get("input_gst_credit", 0))),
        "stock_skus":     snap.get("stock_item_count", 0),
        "as_of":          as_of,
    }


@frappe.whitelist()
def get_cashflow_trend():
    """12-month cashflow: sales, purchases, receipts, payments per month."""
    _require_admin()
    rows = frappe.db.sql(
        "SELECT DATE_FORMAT(voucher_date, %s) as month, voucher_type, SUM(amount) as total "
        "FROM `tabVE Tally Voucher` "
        "WHERE is_cancelled = 0 AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL 13 MONTH) "
        "AND voucher_type IN ('Sales','PERFORMA INVOICE','Purchase','Receipt','Payment') "
        "GROUP BY month, voucher_type ORDER BY month",
        ('%Y-%m',), as_dict=True
    )
    months_map: dict = {}
    for r in rows:
        m = r.month
        if m not in months_map:
            months_map[m] = {"month": _parse_month(m), "key": m, "sales": 0.0, "purchases": 0.0, "receipts": 0.0, "payments": 0.0}
        if r.voucher_type in ("Sales", "PERFORMA INVOICE"):
            months_map[m]["sales"] += flt(r.total) / 100_000
        elif r.voucher_type == "Purchase":
            months_map[m]["purchases"] += flt(r.total) / 100_000
        elif r.voucher_type == "Receipt":
            months_map[m]["receipts"] += flt(r.total) / 100_000
        elif r.voucher_type == "Payment":
            months_map[m]["payments"] += flt(r.total) / 100_000

    result = []
    for v in months_map.values():
        net = round(v["receipts"] - v["payments"], 2)
        result.append({
            "month": v["month"],
            "key": v["key"],
            "sales":     round(v["sales"], 2),
            "purchases": round(v["purchases"], 2),
            "receipts":  round(v["receipts"], 2),
            "payments":  round(v["payments"], 2),
            "net":       net,
        })
    return result


@frappe.whitelist()
def get_debtor_aging():
    """Debtors with outstanding balance bucketed by days since last invoice."""
    _require_admin()
    rows = frappe.db.sql(
        "SELECT l.ledger_name, l.closing_balance, "
        "MAX(v.voucher_date) as last_sale "
        "FROM `tabVE Tally Ledger` l "
        "LEFT JOIN `tabVE Tally Voucher` v ON v.party_name = l.ledger_name "
        "AND v.voucher_type IN ('Sales','PERFORMA INVOICE') AND v.is_cancelled = 0 "
        "WHERE l.is_debtors = 1 AND l.closing_balance > 0 "
        "GROUP BY l.ledger_name, l.closing_balance "
        "ORDER BY l.closing_balance DESC",
        as_dict=True
    )

    from datetime import date
    today = date.today()
    buckets = {"current": 0.0, "b30_60": 0.0, "b61_90": 0.0, "b90plus": 0.0, "unknown": 0.0}
    debtors = []

    for r in rows:
        bal = flt(r.closing_balance)
        if r.last_sale:
            days = (today - r.last_sale).days
        else:
            days = None

        if days is None:
            bucket = "unknown"
        elif days <= 30:
            bucket = "current"
        elif days <= 60:
            bucket = "b30_60"
        elif days <= 90:
            bucket = "b61_90"
        else:
            bucket = "b90plus"

        buckets[bucket] += bal
        debtors.append({
            "party": r.ledger_name,
            "balance": round(bal, 2),
            "balance_fmt": _fmt(bal),
            "last_sale": str(r.last_sale) if r.last_sale else None,
            "days": days,
            "bucket": bucket,
        })

    total = sum(buckets.values())
    return {
        "debtors": debtors[:50],
        "total": round(total, 2),
        "total_fmt": _fmt(total),
        "buckets": {
            "current":  {"amount": round(buckets["current"], 2),  "fmt": _fmt(buckets["current"]),  "label": "0–30 days",  "color": "emerald"},
            "b30_60":   {"amount": round(buckets["b30_60"], 2),   "fmt": _fmt(buckets["b30_60"]),   "label": "31–60 days", "color": "yellow"},
            "b61_90":   {"amount": round(buckets["b61_90"], 2),   "fmt": _fmt(buckets["b61_90"]),   "label": "61–90 days", "color": "orange"},
            "b90plus":  {"amount": round(buckets["b90plus"], 2),  "fmt": _fmt(buckets["b90plus"]),  "label": "90+ days",   "color": "red"},
            "unknown":  {"amount": round(buckets["unknown"], 2),  "fmt": _fmt(buckets["unknown"]),  "label": "Unknown age","color": "gray"},
        },
    }


@frappe.whitelist()
def get_party_statement(party_name: str, limit: int = 50):
    """All vouchers for a party, newest first, with running balance."""
    _require_admin()
    if not party_name:
        frappe.throw("party_name required")

    ledger = frappe.db.get_value(
        "VE Tally Ledger", {"ledger_name": party_name},
        ["ledger_name", "closing_balance", "is_debtors", "is_creditors", "parent_group"],
        as_dict=True,
    )

    vouchers = frappe.db.sql(
        "SELECT voucher_type, voucher_number, voucher_date, amount, narration "
        "FROM `tabVE Tally Voucher` "
        "WHERE party_name = %s AND is_cancelled = 0 "
        "ORDER BY voucher_date DESC, name DESC LIMIT %s",
        (party_name, int(limit)), as_dict=True
    )

    rows = []
    for v in vouchers:
        rows.append({
            "type":    v.voucher_type,
            "number":  v.voucher_number,
            "date":    str(v.voucher_date),
            "amount":  flt(v.amount),
            "amount_fmt": _fmt(flt(v.amount)),
            "narration": (v.narration or "").strip(),
        })

    return {
        "party": party_name,
        "balance": round(flt(ledger.closing_balance if ledger else 0), 2),
        "balance_fmt": _fmt(flt(ledger.closing_balance if ledger else 0)),
        "group": ledger.parent_group if ledger else "",
        "is_debtor": bool(ledger and ledger.is_debtors),
        "is_creditor": bool(ledger and ledger.is_creditors),
        "transactions": rows,
    }


@frappe.whitelist()
def search_tally(query: str = "", voucher_type: str = "", from_date: str = "", to_date: str = "", page: int = 1):
    """Search vouchers by party name or narration."""
    _require_admin()
    query = (query or "").strip()
    if len(query) < 2 and not voucher_type and not from_date:
        return {"results": [], "total": 0}

    conds = ["is_cancelled = 0"]
    params: list = []

    if query:
        conds.append("(party_name LIKE %s OR narration LIKE %s OR voucher_number LIKE %s)")
        params += [f"%{query}%", f"%{query}%", f"%{query}%"]
    if voucher_type:
        conds.append("voucher_type = %s")
        params.append(voucher_type)
    if from_date:
        conds.append("voucher_date >= %s")
        params.append(from_date)
    if to_date:
        conds.append("voucher_date <= %s")
        params.append(to_date)

    where = " AND ".join(conds)
    page = max(1, int(page))
    offset = (page - 1) * 50

    count_row = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Tally Voucher` WHERE {where}",
        params, as_dict=True
    )
    total = count_row[0].cnt if count_row else 0

    results = frappe.db.sql(
        f"SELECT voucher_type, voucher_number, voucher_date, party_name, amount, narration "
        f"FROM `tabVE Tally Voucher` WHERE {where} "
        f"ORDER BY voucher_date DESC LIMIT 50 OFFSET %s",
        params + [offset], as_dict=True
    )

    return {
        "total": total,
        "page": page,
        "results": [
            {
                "type": r.voucher_type,
                "number": r.voucher_number,
                "date": str(r.voucher_date),
                "party": r.party_name,
                "amount": flt(r.amount),
                "amount_fmt": _fmt(flt(r.amount)),
                "narration": (r.narration or "").strip()[:80],
            }
            for r in results
        ],
    }


@frappe.whitelist()
def get_creditor_list():
    """Top creditors with balance."""
    _require_admin()
    snap = _load_snapshot()
    top = snap.get("top_creditors", {})
    rows = frappe.db.sql(
        "SELECT l.ledger_name, l.closing_balance, "
        "MAX(v.voucher_date) as last_purchase "
        "FROM `tabVE Tally Ledger` l "
        "LEFT JOIN `tabVE Tally Voucher` v ON v.party_name = l.ledger_name "
        "AND v.voucher_type = 'Purchase' AND v.is_cancelled = 0 "
        "WHERE l.is_creditors = 1 AND l.closing_balance < 0 "
        "GROUP BY l.ledger_name, l.closing_balance "
        "ORDER BY l.closing_balance ASC LIMIT 50",
        as_dict=True
    )
    from datetime import date
    today = date.today()
    result = []
    for r in rows:
        days = (today - r.last_purchase).days if r.last_purchase else None
        result.append({
            "party": r.ledger_name,
            "balance": round(abs(flt(r.closing_balance)), 2),
            "balance_fmt": _fmt(abs(flt(r.closing_balance))),
            "last_purchase": str(r.last_purchase) if r.last_purchase else None,
            "days": days,
        })
    return result


@frappe.whitelist()
def get_tally_ledgers(group=None, search=None, limit=50):
    """Query VE Tally Ledger table - usable by other parts of the app."""
    _require_admin()
    filters = {}
    if group:
        filters["parent_group"] = group
    if search:
        return frappe.db.sql("""
            SELECT ledger_name, parent_group, closing_balance, is_debtors, is_creditors
            FROM `tabVE Tally Ledger`
            WHERE ledger_name LIKE %s
            ORDER BY ABS(closing_balance) DESC
            LIMIT %s
        """, (f"%{search}%", int(limit)), as_dict=True)
    return frappe.get_all(
        "VE Tally Ledger",
        fields=["ledger_name", "parent_group", "closing_balance", "is_debtors", "is_creditors"],
        filters=filters,
        order_by="ABS(closing_balance) DESC",
        limit=int(limit),
    )


@frappe.whitelist()
def get_tally_vouchers(party=None, voucher_type=None, from_date=None, to_date=None, limit=50):
    """Query VE Tally Voucher table - usable by other parts of the app."""
    _require_admin()
    conditions = ["is_cancelled = 0"]
    params = []
    if party:
        conditions.append("party_name LIKE %s")
        params.append(f"%{party}%")
    if voucher_type:
        conditions.append("voucher_type = %s")
        params.append(voucher_type)
    if from_date:
        conditions.append("voucher_date >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("voucher_date <= %s")
        params.append(to_date)
    params.append(int(limit))
    where = " AND ".join(conditions)
    return frappe.db.sql(f"""
        SELECT name, tally_guid, voucher_type, voucher_number, voucher_date,
               party_name, amount, narration, debit_ledger, credit_ledger
        FROM `tabVE Tally Voucher`
        WHERE {where}
        ORDER BY voucher_date DESC
        LIMIT %s
    """, params, as_dict=True)


@frappe.whitelist()
def get_tally_stock_items(group=None, search=None, limit=100):
    """Query VE Tally Stock Item table."""
    _require_admin()
    if search:
        return frappe.db.sql("""
            SELECT item_name, stock_group, hsn_code, gst_rate, unit, standard_rate
            FROM `tabVE Tally Stock Item`
            WHERE item_name LIKE %s OR stock_group LIKE %s
            ORDER BY item_name
            LIMIT %s
        """, (f"%{search}%", f"%{search}%", int(limit)), as_dict=True)
    filters = {}
    if group:
        filters["stock_group"] = group
    return frappe.get_all(
        "VE Tally Stock Item",
        fields=["item_name", "stock_group", "hsn_code", "gst_rate", "unit", "standard_rate"],
        filters=filters,
        order_by="item_name",
        limit=int(limit),
    )
