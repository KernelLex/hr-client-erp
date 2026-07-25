import frappe
import json
import os
import re
import shutil
from frappe.utils import flt, cint


import datetime

_ADMIN_USERS = {"owais@veraenterprises.in", "Administrator"}
_SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tally_snapshot.json")


def _load_snapshot():
    try:
        with open(_SNAPSHOT_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def _require_admin():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)
    if user not in _ADMIN_USERS and "System Manager" not in frappe.get_roles(user):
        frappe.throw("Not permitted", frappe.PermissionError)


def _current_fy():
    """Returns (fy_start_date, fy_end_date_exclusive, fy_label) for the current Indian financial year."""
    today = datetime.date.today()
    if today.month >= 4:
        start_year = today.year
    else:
        start_year = today.year - 1
    return (
        f"{start_year}-04-01",
        f"{start_year + 1}-04-01",
        f"{start_year}-{str(start_year + 1)[2:]}",
    )


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

    # ── Finance: bank/cash/GST/TDS directly from live DB ──────────
    # Sign convention: closing_balance < 0 = Dr balance (asset: money in account)
    #                  closing_balance > 0 = Cr balance (liability: OD / owe to vendor)
    bank_rows = frappe.db.sql("""
        SELECT ledger_name, closing_balance, parent_group
        FROM `tabVE Tally Ledger`
        WHERE is_bank = 1
        ORDER BY closing_balance
    """, as_dict=True)
    cash_rows = frappe.db.sql("""
        SELECT ledger_name, closing_balance
        FROM `tabVE Tally Ledger`
        WHERE is_cash = 1
        ORDER BY closing_balance DESC
    """, as_dict=True)

    # Dr balance (negative) on ANY bank account = funds available in that account.
    # This covers regular bank accounts AND OD accounts that currently have credit funds.
    bank_credit = sum(abs(flt(r.closing_balance)) for r in bank_rows if r.closing_balance < 0)

    # Cr balance (positive) = OD utilised (amount borrowed from bank, reduces net funds).
    # Virtual/collection accounts with Cr balance are collected customer money — treat as available.
    bank_od = sum(flt(r.closing_balance) for r in bank_rows
                  if r.closing_balance > 0 and "virtual" not in r.ledger_name.lower())
    bank_virtual = sum(flt(r.closing_balance) for r in bank_rows
                       if r.closing_balance > 0 and "virtual" in r.ledger_name.lower())
    bank_total = bank_credit + bank_virtual - bank_od

    # Cash: Dr balance (negative) = physical cash in hand. Take abs to get positive figure.
    cash_total = sum(abs(flt(r.closing_balance)) for r in cash_rows if r.closing_balance < 0)
    liquid_assets = cash_total + bank_credit + bank_virtual

    # GST closing balances — what remains in GST ledger accounts after govt payments
    # Cr (positive) = output GST still owed to govt; Dr (negative) = unrecovered ITC
    gst_rows = frappe.db.sql(
        "SELECT closing_balance FROM `tabVE Tally Ledger` WHERE is_gst = 1", as_dict=True
    )
    output_gst = sum(flt(r.closing_balance) for r in gst_rows if r.closing_balance > 0)
    input_gst  = sum(abs(flt(r.closing_balance)) for r in gst_rows if r.closing_balance < 0)
    net_gst    = output_gst - input_gst

    # Per-voucher GST for the current period (gross collected / claimed on transactions)
    try:
        gst_period = frappe.db.sql(
            """SELECT gst_type, COALESCE(SUM(igst+cgst+sgst),0) as total
               FROM `tabVE GST Ledger Entry`
               GROUP BY gst_type""",
            as_dict=True,
        )
        _gst_map = {r.gst_type: flt(r.total) for r in gst_period}
        period_output_gst = _gst_map.get("Output", 0)
        period_input_gst  = _gst_map.get("Input", 0)
    except Exception:
        period_output_gst = period_input_gst = 0

    # TDS: Cr balance (positive) = TDS payable to govt
    tds_rows = frappe.db.sql(
        "SELECT closing_balance FROM `tabVE Tally Ledger` WHERE is_tds = 1", as_dict=True
    )
    tds_payable = sum(flt(r.closing_balance) for r in tds_rows if r.closing_balance > 0)

    # ── Accounts: debtors/creditors from live DB ───────────────────
    # Debtors with Dr balance (closing_balance < 0) = money owed TO Vera
    dr = frappe.db.sql(
        "SELECT COALESCE(SUM(ABS(closing_balance)),0) as tot FROM `tabVE Tally Ledger` "
        "WHERE is_debtors=1 AND closing_balance < 0", as_dict=True
    )
    debtor_total = flt(dr[0].tot if dr else 0)

    # Creditors with Cr balance (closing_balance > 0) = Vera owes vendor
    cr = frappe.db.sql(
        "SELECT COALESCE(SUM(closing_balance),0) as tot FROM `tabVE Tally Ledger` "
        "WHERE is_creditors=1 AND closing_balance > 0", as_dict=True
    )
    creditor_total = flt(cr[0].tot if cr else 0)

    # Top debtors from live DB (Dr balance debtors, largest first)
    top_debtors_rows = frappe.db.sql("""
        SELECT ledger_name as party, ABS(closing_balance) as amount
        FROM `tabVE Tally Ledger`
        WHERE is_debtors = 1 AND closing_balance < 0
        ORDER BY closing_balance ASC LIMIT 10
    """, as_dict=True)
    top_debtors = [frappe._dict(party=r.party, amount=flt(r.amount)) for r in top_debtors_rows]

    # Top creditors from live DB (Cr balance creditors, largest first)
    top_creditors_rows = frappe.db.sql("""
        SELECT ledger_name as party, closing_balance as amount
        FROM `tabVE Tally Ledger`
        WHERE is_creditors = 1 AND closing_balance > 0
        ORDER BY closing_balance DESC LIMIT 10
    """, as_dict=True)
    top_creditors = [frappe._dict(party=r.party, amount=flt(r.amount)) for r in top_creditors_rows]

    # ── Monthly sales/purchases from VE Tally Voucher ──────────────
    monthly_raw = frappe.db.sql(
        "SELECT DATE_FORMAT(voucher_date, %s) as month, voucher_type, SUM(amount) as total "
        "FROM `tabVE Tally Voucher` "
        "WHERE is_cancelled = 0 AND voucher_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) "
        "AND voucher_type IN ('Sales', 'Purchase', 'Receipt') "
        "GROUP BY month, voucher_type ORDER BY month",
        ('%Y-%m',), as_dict=True
    )

    chart_map = {}
    for row in monthly_raw:
        m = row.month
        if m not in chart_map:
            chart_map[m] = {"month": _parse_month(m), "sales": 0.0, "purchases": 0.0, "collections": 0.0}
        if row.voucher_type == "Sales":
            chart_map[m]["sales"] += flt(row.total) / 100_000
        elif row.voucher_type == "Purchase":
            chart_map[m]["purchases"] += flt(row.total) / 100_000
        elif row.voucher_type == "Receipt":
            chart_map[m]["collections"] += flt(row.total) / 100_000

    chart_data = [{"month": v["month"], "sales": round(v["sales"], 2), "purchases": round(v["purchases"], 2), "collections": round(v["collections"], 2)}
                  for v in chart_map.values()]

    fy_start, fy_end, fy_label = _current_fy()
    fy_totals = frappe.db.sql(
        """
        SELECT voucher_type, SUM(amount) as total
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
          AND voucher_date >= %s AND voucher_date < %s
          AND voucher_type IN ('Sales', 'Purchase', 'Receipt')
        GROUP BY voucher_type
        """,
        (fy_start, fy_end), as_dict=True
    )

    fy_sales = sum(flt(r.total) for r in fy_totals if r.voucher_type == "Sales")
    fy_purch = sum(flt(r.total) for r in fy_totals if r.voucher_type == "Purchase")
    fy_coll = sum(flt(r.total) for r in fy_totals if r.voucher_type == "Receipt")

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

    vtotals = frappe.db.sql("""
        SELECT voucher_type, COUNT(*) as cnt, SUM(amount) as total
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0
        GROUP BY voucher_type
    """, as_dict=True)
    vtotal_map = {r.voucher_type: {"cnt": r.cnt, "total": flt(r.total)} for r in vtotals}

    # ── Format everything ──────────────────────────────────────────
    return {
        "as_of": as_of,
        "finance": {
            "kpis": [
                {"label": "Cash in Hand", "value": _fmt(cash_total), "raw": cash_total},
                {"label": "Bank Funds", "value": _fmt(bank_total), "raw": bank_total},
                {"label": "Net GST Liability", "value": _fmt(net_gst), "raw": net_gst},
                {"label": "TDS Payable", "value": _fmt(tds_payable), "raw": tds_payable},
            ],
            "bank_accounts": [
                {
                    "name": r.ledger_name,
                    # Dr accounts (closing_balance < 0): show abs value as positive (money in bank)
                    # OD accounts (closing_balance > 0): show as positive (amount overdrawn)
                    "balance": abs(flt(r.closing_balance)),
                    "balance_fmt": _fmt(abs(flt(r.closing_balance))) + (" (OD)" if r.closing_balance > 0 else ""),
                    "is_od": r.closing_balance > 0,
                }
                for r in bank_rows
            ],
            "cash_accounts": [
                {"name": r.ledger_name, "balance": abs(flt(r.closing_balance)), "balance_fmt": _fmt(abs(flt(r.closing_balance)))}
                for r in cash_rows
            ],
            "bank_od": round(bank_od, 2),
            "bank_od_fmt": _fmt(bank_od),
            "net_bank": round(bank_total, 2),
            "gst_detail": {
                # Closing balance = net position after govt payments (what's still owed/claimable)
                "output_gst": round(abs(output_gst), 2),
                "input_credit": round(input_gst, 2),
                "net_liability": round(net_gst, 2),
                "output_fmt": _fmt(abs(output_gst)),
                "input_fmt": _fmt(input_gst),
                "net_fmt": _fmt(net_gst),
                # Per-voucher = gross GST billed on transactions this period
                "period_output": round(period_output_gst, 2),
                "period_input": round(period_input_gst, 2),
                "period_output_fmt": _fmt(period_output_gst),
                "period_input_fmt": _fmt(period_input_gst),
            },
        },
        "accounts": {
            "kpis": [
                {"label": "Sundry Debtors", "value": _fmt(debtor_total), "raw": debtor_total},
                {"label": "Sundry Creditors", "value": _fmt(creditor_total), "raw": creditor_total},
                {"label": f"FY Sales ({fy_label})", "value": _fmt(fy_sales), "raw": fy_sales},
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
            "voucher_totals": {
                "sales_total":         round(vtotal_map.get("Sales", {}).get("total", 0), 2),
                "sales_count":         vtotal_map.get("Sales", {}).get("cnt", 0),
                "sales_order_total":   round(vtotal_map.get("Sales Order", {}).get("total", 0), 2),
                "sales_order_count":   vtotal_map.get("Sales Order", {}).get("cnt", 0),
                "purchase_total":      round(vtotal_map.get("Purchase", {}).get("total", 0), 2),
                "purchase_count":      vtotal_map.get("Purchase", {}).get("cnt", 0),
                "performa_total":      round(vtotal_map.get("PERFORMA INVOICE", {}).get("total", 0), 2),
                "performa_count":      vtotal_map.get("PERFORMA INVOICE", {}).get("cnt", 0),
                "credit_note_total":   round(vtotal_map.get("Credit Note", {}).get("total", 0), 2),
                "credit_note_count":   vtotal_map.get("Credit Note", {}).get("cnt", 0),
                "receipt_total":       round(vtotal_map.get("Receipt", {}).get("total", 0), 2),
                "receipt_count":       vtotal_map.get("Receipt", {}).get("cnt", 0),
            },
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
                    "label": "Liquid Assets",
                    "value": _fmt(liquid_assets),
                    "raw": liquid_assets,
                    "delta": f"Bank OD: {_fmt(bank_od)}" if bank_od > 0 else f"Bank: {_fmt(bank_credit)}",
                    "delta_class": "delta-negative" if bank_od > 0 else "delta-neutral",
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


_TALLY_UPLOAD_DIR = "/home/vera/tally_uploads"
_ALLOWED_UPLOAD_EXT = {".xml"}
# Folders scanned for Tally XML files that are already on the server. This is the
# robust import path for large exports (the Masters export is ~119 MB and the full
# Transactions export ~1.5 GB — both exceed the Cloudflare tunnel's request-body
# cap, so they can't be uploaded through the browser over the public domain).
_TALLY_SEARCH_DIRS = ["/home/vera/tally_uploads", "/home/vera"]


def _fmt_size(b):
    b = float(b)
    if b >= 1e9:
        return f"{b / 1e9:.2f} GB"
    if b >= 1e6:
        return f"{b / 1e6:.0f} MB"
    if b >= 1e3:
        return f"{b / 1e3:.0f} KB"
    return f"{int(b)} B"


def _detect_role(path, name):
    """Guess whether an XML is a Masters or Transactions export. Content sniff is
    authoritative (read only the first 64 KB — the files can be gigabytes);
    filename is the tiebreaker."""
    text = ""
    try:
        with open(path, "rb") as f:
            text = f.read(65536).decode("utf-16", errors="ignore")
    except Exception:
        text = ""
    has_voucher = "<VOUCHER" in text
    has_master = ("<LEDGER NAME" in text) or ("<GROUP NAME" in text) or ("<STOCKITEM" in text)
    if has_voucher and not has_master:
        return "transactions"
    if has_master and not has_voucher:
        return "masters"
    lname = (name or "").lower()
    if "transaction" in lname and "master" not in lname:
        return "transactions"
    if "master" in lname:
        return "masters"
    if has_voucher:
        return "transactions"
    if has_master:
        return "masters"
    return "unknown"


def _allowed_root(real_path):
    """True if real_path sits directly inside one of the allowed Tally dirs."""
    for d in _TALLY_SEARCH_DIRS:
        if real_path.startswith(os.path.realpath(d) + os.sep):
            return True
    return False


@frappe.whitelist()
def list_tally_files():
    """List Tally XML files already present on the server, with an auto-detected
    role (masters / transactions) so the UI can pre-select the right pair without
    the admin needing to know which file is which."""
    _require_admin()
    seen = set()
    files = []
    for d in _TALLY_SEARCH_DIRS:
        try:
            entries = os.listdir(d)
        except OSError:
            continue
        for fn in entries:
            if not fn.lower().endswith(".xml"):
                continue
            full = os.path.realpath(os.path.join(d, fn))
            if full in seen or not os.path.isfile(full):
                continue
            seen.add(full)
            try:
                size = os.path.getsize(full)
                mtime = os.path.getmtime(full)
            except OSError:
                continue
            files.append({
                "path":        full,
                "filename":    fn,
                "size":        size,
                "size_fmt":    _fmt_size(size),
                "modified":    datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M"),
                "modified_ts": mtime,
                "role":        _detect_role(full, fn),
            })
    files.sort(key=lambda f: f["modified_ts"], reverse=True)

    # Suggested pair (user can override in the UI):
    #  • Masters: newest file tagged 'masters' that isn't a giant combined export
    #    (a Tally "Transactions with Masters" dump can start with master blocks and
    #    be mis-tagged — exclude anything over 500 MB from the masters guess).
    #  • Transactions: the LARGEST 'transactions' file, i.e. the full history rather
    #    than a small current-FY-only export.
    masters_candidates = [f for f in files if f["role"] == "masters" and f["size"] < 500_000_000]
    masters = masters_candidates[0]["path"] if masters_candidates else None
    trans_candidates = sorted(
        [f for f in files if f["role"] == "transactions"],
        key=lambda f: f["size"], reverse=True,
    )
    trans = trans_candidates[0]["path"] if trans_candidates else None
    return {"files": files, "suggested_masters": masters, "suggested_transactions": trans}


@frappe.whitelist()
def upload_tally_file():
    """
    Accepts a single Tally XML file upload (Masters or Transactions).
    Saves to a writable path and returns the saved path.
    """
    _require_admin()
    os.makedirs(_TALLY_UPLOAD_DIR, exist_ok=True)

    files = frappe.request.files
    if not files:
        frappe.throw("No file uploaded")

    file_key = list(files.keys())[0]
    uploaded = files[file_key]
    filename = uploaded.filename or "tally_upload.xml"

    # Validate extension — only XML accepted
    _, ext = os.path.splitext(filename.lower())
    if ext not in _ALLOWED_UPLOAD_EXT:
        frappe.throw(f"Only .xml files are accepted (got '{ext}')", frappe.ValidationError)

    # Sanitize filename — strip path separators and traversal sequences
    import re as _re
    safe_name = _re.sub(r'[^\w\s\-.]', '_', filename.replace("/", "_").replace("\\", "_"))
    safe_name = safe_name[:200] or "tally_upload.xml"

    dest = os.path.join(_TALLY_UPLOAD_DIR, safe_name)
    # Final guard: ensure dest stays within the upload directory
    if not os.path.realpath(dest).startswith(os.path.realpath(_TALLY_UPLOAD_DIR)):
        frappe.throw("Invalid filename", frappe.ValidationError)

    uploaded.save(dest)
    return {"path": dest, "filename": safe_name, "size": os.path.getsize(dest)}


# ── Chunked upload (works through the Cloudflare tunnel's ~100MB per-request cap) ──
# The Masters (~120MB) and full Transactions (~1.5GB) exports exceed the single-
# request body limit, so the browser slices the file into sub-100MB chunks and
# uploads each as its own request; the server reassembles them here.
_CHUNK_ROOT = os.path.join(_TALLY_UPLOAD_DIR, ".chunks")


def _safe_upload_id(s):
    return re.sub(r"[^a-zA-Z0-9_-]", "", str(s or ""))[:64]


def _safe_xml_name(filename):
    safe = re.sub(r"[^\w\s\-.]", "_", str(filename or "").replace("/", "_").replace("\\", "_"))[:200]
    safe = safe or "tally_upload.xml"
    if not safe.lower().endswith(".xml"):
        frappe.throw("Only .xml files are accepted", frappe.ValidationError)
    return safe


@frappe.whitelist()
def upload_tally_chunk():
    """Receive one chunk of a chunked Tally upload. Each chunk is a separate
    request (kept well under the tunnel's 100MB cap). Stored as an ordered part
    file under a per-upload folder; reassembled by finalize_tally_upload()."""
    _require_admin()
    fd = frappe.form_dict
    upload_id = _safe_upload_id(fd.get("upload_id"))
    index = cint(fd.get("chunk_index"))
    if not upload_id:
        frappe.throw("upload_id required", frappe.ValidationError)

    files = frappe.request.files
    if not files:
        frappe.throw("No chunk uploaded", frappe.ValidationError)
    chunk = files[list(files.keys())[0]]

    chunk_dir = os.path.join(_CHUNK_ROOT, upload_id)
    os.makedirs(chunk_dir, exist_ok=True)
    dest = os.path.join(chunk_dir, f"{index:06d}.part")
    if not os.path.realpath(dest).startswith(os.path.realpath(chunk_dir) + os.sep):
        frappe.throw("Invalid chunk path", frappe.ValidationError)
    chunk.save(dest)
    return {"received": index, "size": os.path.getsize(dest)}


@frappe.whitelist()
def finalize_tally_upload(upload_id, total_chunks, filename):
    """Reassemble all chunks (in order) into the final XML in the upload folder,
    then delete the chunk parts. Returns the path for run_tally_import()."""
    _require_admin()
    upload_id = _safe_upload_id(upload_id)
    total = cint(total_chunks)
    chunk_dir = os.path.join(_CHUNK_ROOT, upload_id)
    if not upload_id or total < 1 or not os.path.isdir(chunk_dir):
        frappe.throw("No chunks found for this upload", frappe.ValidationError)

    # Verify every part is present before assembling
    for i in range(total):
        part = os.path.join(chunk_dir, f"{i:06d}.part")
        if not os.path.isfile(part):
            frappe.throw(f"Missing chunk {i + 1} of {total} — please retry the upload",
                         frappe.ValidationError)

    safe_name = _safe_xml_name(filename)
    os.makedirs(_TALLY_UPLOAD_DIR, exist_ok=True)
    final = os.path.join(_TALLY_UPLOAD_DIR, safe_name)
    if not os.path.realpath(final).startswith(os.path.realpath(_TALLY_UPLOAD_DIR) + os.sep):
        frappe.throw("Invalid filename", frappe.ValidationError)

    with open(final, "wb") as out:
        for i in range(total):
            part = os.path.join(chunk_dir, f"{i:06d}.part")
            with open(part, "rb") as pf:
                shutil.copyfileobj(pf, out, 4 * 1024 * 1024)

    shutil.rmtree(chunk_dir, ignore_errors=True)
    return {"path": final, "filename": safe_name, "size": os.path.getsize(final)}


@frappe.whitelist()
def run_tally_import(masters_path: str, transactions_path: str):
    """
    Enqueue the FULL two-stage Tally import pipeline:
      Stage 1 — parse XML → VE Tally Ledger / Stock Item / Voucher tables
      Stage 2 — transform stored data → all Accounts Dashboard DocTypes
    Status polled via get_import_status().
    """
    _require_admin()

    # Restrict to the allowed Tally directories to prevent path traversal
    for label, path in (("masters", masters_path), ("transactions", transactions_path)):
        real = os.path.realpath(path)
        if not _allowed_root(real):
            frappe.throw(f"Path for {label} must be inside an allowed Tally folder",
                         frappe.PermissionError)
        if not os.path.isfile(real):
            frappe.throw(f"{label.capitalize()} file not found: {path}")

    from hr_client.api import tally_transformer as _tt
    _tt._set("running", 1, "Import queued…")   # immediate feedback

    frappe.enqueue(
        "hr_client.api.tally_transformer.run",
        queue="long",
        timeout=7200,
        masters_path=masters_path,
        transactions_path=transactions_path,
    )
    return {"queued": True}


@frappe.whitelist()
def run_tally_import_auto():
    """Convenience trigger: auto-detect the newest Masters + Transactions XML on
    the server and start the full import. Lets an admin refresh everything with a
    single click once fresh exports have been dropped on the box."""
    _require_admin()
    listing = list_tally_files()
    masters = listing["suggested_masters"]
    trans = listing["suggested_transactions"]
    if not masters or not trans:
        missing = []
        if not masters:
            missing.append("a Masters export")
        if not trans:
            missing.append("a Transactions export")
        frappe.throw(
            "Could not auto-detect " + " and ".join(missing) +
            " in the server Tally folders. Upload the files or place them in "
            "/home/vera/tally_uploads first."
        )
    return run_tally_import(masters, trans)


@frappe.whitelist()
def get_import_status():
    """Poll the live import progress (covers both Stage 1 and Stage 2).
    Normalises the transformer's 'completed' state to 'done' so the frontend
    (which polls for 'done') reliably detects completion."""
    _require_admin()
    from hr_client.api.tally_transformer import get_status
    s = get_status()
    if s.get("status") == "completed":
        s = {**s, "status": "done"}
    return s


@frappe.whitelist()
def get_tally_financial_summary():
    """
    Returns a compact financial summary for use in other pages (Dashboard, Business).
    No heavy computation — reads snapshot + 3 fast DB queries.
    """
    _require_admin()
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
        "AND voucher_type IN ('Sales','Purchase','Receipt','Payment') "
        "GROUP BY month, voucher_type ORDER BY month",
        ('%Y-%m',), as_dict=True
    )
    months_map: dict = {}
    for r in rows:
        m = r.month
        if m not in months_map:
            months_map[m] = {"month": _parse_month(m), "key": m, "sales": 0.0, "purchases": 0.0, "receipts": 0.0, "payments": 0.0}
        if r.voucher_type == "Sales":
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
        "AND v.voucher_type = 'Sales' AND v.is_cancelled = 0 "
        "WHERE l.is_debtors = 1 AND l.closing_balance < 0 "
        "GROUP BY l.ledger_name, l.closing_balance "
        "ORDER BY l.closing_balance ASC",
        as_dict=True
    )

    from datetime import date
    today = date.today()
    buckets = {"current": 0.0, "b30_60": 0.0, "b61_90": 0.0, "b90plus": 0.0, "unknown": 0.0}
    debtors = []

    for r in rows:
        bal = abs(flt(r.closing_balance))  # Dr balance is negative in DB; show as positive
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
        "WHERE l.is_creditors = 1 AND l.closing_balance > 0 "
        "GROUP BY l.ledger_name, l.closing_balance "
        "ORDER BY l.closing_balance DESC LIMIT 50",
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
def get_advance_from_debtors():
    """Debtor ledgers in credit (closing_balance > 0) — customers who have prepaid us.
    Cr balance means the customer has paid us more than what we've invoiced.
    Aged in months since their last sale voucher, mirroring get_debtor_aging's day-based aging."""
    _require_admin()
    rows = frappe.db.sql(
        "SELECT l.ledger_name, l.closing_balance, "
        "MAX(v.voucher_date) as last_sale "
        "FROM `tabVE Tally Ledger` l "
        "LEFT JOIN `tabVE Tally Voucher` v ON v.party_name = l.ledger_name "
        "AND v.voucher_type = 'Sales' AND v.is_cancelled = 0 "
        "WHERE l.is_debtors = 1 AND l.closing_balance > 0 "
        "GROUP BY l.ledger_name, l.closing_balance "
        "ORDER BY l.closing_balance DESC LIMIT 50",
        as_dict=True
    )
    from datetime import date
    today = date.today()
    result = []
    for r in rows:
        months = None
        if r.last_sale:
            months = round((today - r.last_sale).days / 30)
        result.append({
            "party": r.ledger_name,
            "balance": round(abs(flt(r.closing_balance)), 2),
            "balance_fmt": _fmt(abs(flt(r.closing_balance))),
            "last_sale": str(r.last_sale) if r.last_sale else None,
            "months": months,
        })
    return result


@frappe.whitelist()
def get_advance_to_creditors():
    """Creditor ledgers in debit (closing_balance < 0) — vendors we have prepaid.
    Dr balance means the vendor owes us (we overpaid / paid advance).
    Aged in months since our last purchase voucher, mirroring get_creditor_list's day-based aging."""
    _require_admin()
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
        months = None
        if r.last_purchase:
            months = round((today - r.last_purchase).days / 30)
        result.append({
            "party": r.ledger_name,
            "balance": round(abs(flt(r.closing_balance)), 2),
            "balance_fmt": _fmt(abs(flt(r.closing_balance))),
            "last_purchase": str(r.last_purchase) if r.last_purchase else None,
            "months": months,
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


@frappe.whitelist()
def get_financial_summary(fy=None):
    """
    Returns voucher counts + totals from tabVE Tally Voucher.
    fy: None / "all" = all-time; "2025-2026" = Apr 2025 – Mar 2026.
    """
    _require_admin()

    where_parts = ["is_cancelled = 0"]
    params = []

    if fy and fy != "all":
        try:
            parts = fy.split("-")
            start_year = int(parts[0])
            end_year   = int(parts[1])
            where_parts.append("voucher_date >= %s AND voucher_date < %s")
            params = [f"{start_year}-04-01", f"{end_year}-04-01"]
        except (ValueError, IndexError):
            pass

    where = " AND ".join(where_parts)

    rows = frappe.db.sql(
        f"SELECT voucher_type, COUNT(*) as cnt, SUM(amount) as total "
        f"FROM `tabVE Tally Voucher` WHERE {where} GROUP BY voucher_type",
        tuple(params), as_dict=True
    )
    vm = {r.voucher_type: {"cnt": int(r.cnt or 0), "total": flt(r.total or 0)} for r in rows}

    dr = frappe.db.sql(
        f"SELECT MIN(voucher_date) as min_d, MAX(voucher_date) as max_d "
        f"FROM `tabVE Tally Voucher` WHERE {where}",
        tuple(params), as_dict=True
    )

    def _v(vtype):
        v = vm.get(vtype, {"cnt": 0, "total": 0.0})
        return {"cnt": v["cnt"], "total": round(v["total"], 2), "fmt": _fmt(v["total"])}

    return {
        "sales":          _v("Sales"),
        "performa":       _v("PERFORMA INVOICE"),
        "sales_order":    _v("Sales Order"),
        "purchase":       _v("Purchase"),
        "purchase_order": _v("Purchase Order"),
        "receipt":        _v("Receipt"),
        "payment":        _v("Payment"),
        "credit_note":    _v("Credit Note"),
        "debit_note":     _v("Debit Note"),
        "journal":        _v("Journal"),
        "contra":         _v("Contra"),
        "delivery_note":  _v("Delivery Note"),
        "stock_journal":  _v("Stock Journal"),
        "other":          _v("Other"),
        "total_vouchers": sum(v["cnt"] for v in vm.values()),
        "min_date": str(dr[0].min_d) if dr and dr[0].min_d else "",
        "max_date": str(dr[0].max_d) if dr and dr[0].max_d else "",
        "fy": fy or "all",
    }


@frappe.whitelist()
def get_available_financial_years():
    """Returns all FY strings that have tally data, newest first."""
    _require_admin()
    rows = frappe.db.sql("""
        SELECT DISTINCT
          CASE
            WHEN MONTH(voucher_date) >= 4
            THEN CONCAT(YEAR(voucher_date), '-', YEAR(voucher_date)+1)
            ELSE CONCAT(YEAR(voucher_date)-1, '-', YEAR(voucher_date))
          END AS fy
        FROM `tabVE Tally Voucher`
        WHERE is_cancelled = 0 AND voucher_date IS NOT NULL
        ORDER BY fy DESC
    """, as_dict=True)
    return [r.fy for r in rows]


@frappe.whitelist()
def get_voucher_list(voucher_type, fy=None, search=None, page=1, page_size=50, sort="date_desc"):
    """
    Paginated list of Tally vouchers for the Ledger browser.
    Returns all display fields; party_name and narration HTML-decoded.
    """
    _require_admin()
    import html as _html

    where_parts = ["is_cancelled = 0", "voucher_type = %s"]
    params = [voucher_type]

    if fy and fy != "all":
        try:
            parts = fy.split("-")
            sy, ey = int(parts[0]), int(parts[1])
            where_parts.append("voucher_date >= %s AND voucher_date < %s")
            params += [f"{sy}-04-01", f"{ey}-04-01"]
        except (ValueError, IndexError):
            pass

    if search and str(search).strip():
        s = f"%{str(search).strip()}%"
        where_parts.append("(party_name LIKE %s OR narration LIKE %s OR voucher_number LIKE %s)")
        params += [s, s, s]

    where = " AND ".join(where_parts)

    # Total count
    cnt_row = frappe.db.sql(
        f"SELECT COUNT(*) as n FROM `tabVE Tally Voucher` WHERE {where}",
        tuple(params), as_dict=True
    )
    total = int(cnt_row[0].n) if cnt_row else 0

    # Sort order
    sort_map = {
        "date_desc":   "voucher_date DESC, name DESC",
        "date_asc":    "voucher_date ASC,  name ASC",
        "amount_desc": "amount DESC, voucher_date DESC",
        "amount_asc":  "amount ASC,  voucher_date DESC",
    }
    order = sort_map.get(sort or "date_desc", "voucher_date DESC, name DESC")

    # Pagination
    pg      = max(1, int(flt(page)))
    pg_size = max(10, min(100, int(flt(page_size))))
    offset  = (pg - 1) * pg_size

    rows = frappe.db.sql(
        f"SELECT name, voucher_type, voucher_number, voucher_date, party_name, "
        f"amount, narration, debit_ledger, credit_ledger "
        f"FROM `tabVE Tally Voucher` WHERE {where} ORDER BY {order} LIMIT %s OFFSET %s",
        tuple(params) + (pg_size, offset), as_dict=True
    )

    def _clean(s):
        return _html.unescape(str(s or "").replace("&amp;", "&").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">"))

    result = []
    for r in rows:
        result.append({
            "name":           r.name,
            "voucher_type":   r.voucher_type or "",
            "voucher_number": r.voucher_number or "",
            "voucher_date":   str(r.voucher_date) if r.voucher_date else "",
            "party_name":     _clean(r.party_name),
            "amount":         round(float(r.amount or 0), 2),
            "amount_fmt":     _fmt(r.amount),
            "narration":      _clean(r.narration),
            "debit_ledger":   _clean(r.debit_ledger),
            "credit_ledger":  _clean(r.credit_ledger),
        })

    return {
        "data":      result,
        "total":     total,
        "page":      pg,
        "page_size": pg_size,
        "pages":     max(1, -(-total // pg_size)),
    }


@frappe.whitelist()
def get_voucher_summary(voucher_type, fy=None, search=None):
    """
    Aggregate stats for a voucher type over the FULL filtered set (not one page):
    count, total value, date range, per-month series, and top parties by value.
    Powers the summary band on the Journal/Payment/Receipt/Credit/Debit tabs.
    Party falls back to credit/debit ledger when party_name is blank (journals).
    """
    _require_admin()
    import html as _html

    where_parts = ["is_cancelled = 0", "voucher_type = %s"]
    params = [voucher_type]

    if fy and fy != "all":
        try:
            parts = fy.split("-")
            sy, ey = int(parts[0]), int(parts[1])
            where_parts.append("voucher_date >= %s AND voucher_date < %s")
            params += [f"{sy}-04-01", f"{ey}-04-01"]
        except (ValueError, IndexError):
            pass

    if search and str(search).strip():
        s = f"%{str(search).strip()}%"
        where_parts.append("(party_name LIKE %s OR narration LIKE %s OR voucher_number LIKE %s)")
        params += [s, s, s]

    where = " AND ".join(where_parts)
    p = tuple(params)

    agg = frappe.db.sql(
        f"""SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) total,
                   MIN(voucher_date) min_d, MAX(voucher_date) max_d
            FROM `tabVE Tally Voucher` WHERE {where}""",
        p, as_dict=True,
    )[0]

    monthly = frappe.db.sql(
        f"""SELECT DATE_FORMAT(voucher_date, '%%Y-%%m') m,
                   COUNT(*) cnt, COALESCE(SUM(amount),0) total
            FROM `tabVE Tally Voucher` WHERE {where}
            GROUP BY m ORDER BY m""",
        p, as_dict=True,
    )

    # Party falls back to credit/debit ledger name for blank-party journals.
    party_expr = "COALESCE(NULLIF(TRIM(party_name),''), NULLIF(TRIM(credit_ledger),''), NULLIF(TRIM(debit_ledger),''), 'Unspecified')"
    top = frappe.db.sql(
        f"""SELECT {party_expr} party, COUNT(*) cnt, COALESCE(SUM(amount),0) total
            FROM `tabVE Tally Voucher` WHERE {where}
            GROUP BY party ORDER BY total DESC LIMIT 5""",
        p, as_dict=True,
    )

    def _clean(x):
        return _html.unescape(str(x or "").replace("&amp;", "&").replace("&apos;", "'"))

    return {
        "count":     int(agg.cnt or 0),
        "total":     round(flt(agg.total), 2),
        "min_date":  str(agg.min_d) if agg.min_d else "",
        "max_date":  str(agg.max_d) if agg.max_d else "",
        "monthly":   [{"month": r.m, "count": int(r.cnt), "total": round(flt(r.total), 2)} for r in monthly],
        "top_parties": [{"party": _clean(r.party), "count": int(r.cnt), "total": round(flt(r.total), 2)} for r in top],
    }


@frappe.whitelist()
def get_voucher_detail(name):
    """Return full voucher detail including inventory + all ledger entries + party profile."""
    import json as _json
    import html as _html
    _require_admin()

    rows = frappe.db.sql(
        """SELECT v.name, v.voucher_type, v.voucher_number, v.voucher_date, v.party_name,
                  v.amount, v.narration, v.debit_ledger, v.credit_ledger,
                  v.all_ledger_entries, v.inventory_entries,
                  l.mailing_name, l.gstin as party_gstin, l.address as party_address,
                  l.state as party_state, l.pincode as party_pincode,
                  l.phone as party_phone, l.gst_registration_type
           FROM `tabVE Tally Voucher` v
           LEFT JOIN `tabVE Tally Ledger` l ON l.ledger_name = v.party_name
           WHERE v.name = %s LIMIT 1""",
        (name,), as_dict=True
    )
    if not rows:
        frappe.throw("Voucher not found", frappe.DoesNotExistError)

    r = rows[0]

    def _clean(s):
        return _html.unescape(str(s or "").replace("&amp;", "&").replace("&apos;", "'"))

    def _parse_json(s):
        try:
            return _json.loads(s) if s else []
        except Exception:
            return []

    return {
        "name":                  r.name,
        "voucher_type":          r.voucher_type or "",
        "voucher_number":        r.voucher_number or "",
        "voucher_date":          str(r.voucher_date) if r.voucher_date else "",
        "party_name":            _clean(r.party_name),
        "amount":                round(float(r.amount or 0), 2),
        "amount_fmt":            _fmt(r.amount),
        "narration":             _clean(r.narration),
        "debit_ledger":          _clean(r.debit_ledger),
        "credit_ledger":         _clean(r.credit_ledger),
        "all_ledger_entries":    _parse_json(r.all_ledger_entries),
        "inventory_entries":     _parse_json(r.inventory_entries),
        # Party profile from ledger master
        "party_mailing_name":    _clean(r.mailing_name),
        "party_gstin":           _clean(r.party_gstin),
        "party_address":         _clean(r.party_address),
        "party_state":           _clean(r.party_state),
        "party_pincode":         _clean(r.party_pincode),
        "party_phone":           _clean(r.party_phone),
        "party_gst_type":        _clean(r.gst_registration_type),
    }


@frappe.whitelist()
def get_ledger_profile(ledger_name):
    """Return full party profile for a ledger name (address, GSTIN, phone, balance)."""
    _require_admin()
    rows = frappe.db.sql(
        """SELECT ledger_name, mailing_name, parent_group, closing_balance,
                  gstin, pan_number, gst_registration_type, state, pincode, phone, address,
                  is_debtors, is_creditors, is_bank, is_cash
           FROM `tabVE Tally Ledger` WHERE ledger_name = %s LIMIT 1""",
        (ledger_name,), as_dict=True
    )
    if not rows:
        return None
    r = rows[0]
    return {
        "ledger_name":          r.ledger_name,
        "mailing_name":         r.mailing_name or r.ledger_name,
        "parent_group":         r.parent_group or "",
        "closing_balance":      round(float(r.closing_balance or 0), 2),
        "gstin":                r.gstin or "",
        "pan_number":           r.pan_number or "",
        "gst_registration_type": r.gst_registration_type or "",
        "state":                r.state or "",
        "pincode":              r.pincode or "",
        "phone":                r.phone or "",
        "address":              r.address or "",
        "is_debtors":           bool(r.is_debtors),
        "is_creditors":         bool(r.is_creditors),
    }


# ── Bank Accounts list ────────────────────────────────────────────────────────

@frappe.whitelist()
def get_bank_accounts():
    """Return all bank account ledgers with balance summary."""
    _require_admin()
    rows = frappe.db.sql("""
        SELECT ledger_name, closing_balance, parent_group
        FROM `tabVE Tally Ledger`
        WHERE is_bank = 1
        ORDER BY ledger_name
    """, as_dict=True)

    accounts = []
    for r in rows:
        cb = flt(r.closing_balance)
        # Dr balance (negative) = funds available; Cr (positive) = OD drawn / collected funds
        available = abs(cb) if cb < 0 else 0
        od_or_cr   = cb if cb > 0 else 0
        # Guess account type from name
        name_lower = r.ledger_name.lower()
        if "virtual" in name_lower or "suspense" in name_lower:
            acc_type = "Virtual"
        elif "od" in name_lower or "overdraft" in name_lower or "232905" in r.ledger_name:
            acc_type = "OD"
        else:
            acc_type = "Current"

        # Count transactions for this account
        cnt = frappe.db.sql(
            "SELECT COUNT(*) as c FROM `tabVE Tally Voucher` "
            "WHERE is_cancelled=0 AND (debit_ledger=%s OR credit_ledger=%s)",
            (r.ledger_name, r.ledger_name), as_dict=True
        )

        accounts.append({
            "ledger_name": r.ledger_name,
            "closing_balance": round(cb, 2),
            "available": round(available, 2),
            "od_utilised": round(od_or_cr, 2),
            "account_type": acc_type,
            "txn_count": cint(cnt[0].c if cnt else 0),
        })

    return accounts


# ── Ledger / Bank Statement ──────────────────────────────────────────────────
# Uses JSON_TABLE to scan every entry in all_ledger_entries, giving a complete
# per-entry ledger statement instead of only matching the first Dr/Cr pair
# stored in debit_ledger/credit_ledger.  Stock Journals and Other vouchers that
# have no ledger entries (all_ledger_entries IS NULL or '[]') are naturally
# excluded because there are no rows to join on.
#
# Direction convention (bank-statement / depositor view):
#   is_dr = 1  (Dr in Tally — amt < 0)  → asset increases  → Credit column (green)
#   is_dr = 0  (Cr in Tally — amt > 0)  → asset decreases  → Debit  column (red)

_JSON_JOIN = """JOIN JSON_TABLE(
        v.all_ledger_entries, '$[*]' COLUMNS(
            j_ledger VARCHAR(200) PATH '$.ledger',
            j_amount DOUBLE       PATH '$.amount',
            j_is_dr  TINYINT      PATH '$.is_dr'
        )
    ) ale ON ale.j_ledger = %s"""

_JSON_BASE = ("v.is_cancelled = 0",
              "v.all_ledger_entries IS NOT NULL",
              "v.all_ledger_entries NOT IN ('null','[]','')")


def _ledger_txn_query(ledger_name, from_date=None, to_date=None,
                      page=1, page_size=50, search=None):
    page      = cint(page) or 1
    page_size = cint(page_size) or 50

    conds = list(_JSON_BASE)
    vals  = []
    if from_date:
        conds.append("v.voucher_date >= %s"); vals.append(from_date)
    if to_date:
        conds.append("v.voucher_date <= %s"); vals.append(to_date)
    if search:
        conds.append("(v.narration LIKE %s OR v.party_name LIKE %s OR v.voucher_number LIKE %s)")
        vals += [f"%{search}%", f"%{search}%", f"%{search}%"]
    where = " AND ".join(conds)

    count_row = frappe.db.sql(
        f"SELECT COUNT(*) AS c FROM `tabVE Tally Voucher` v {_JSON_JOIN} WHERE {where}",
        [ledger_name] + vals, as_dict=True,
    )
    total = cint(count_row[0].c if count_row else 0)

    rows = frappe.db.sql(
        f"""SELECT v.voucher_type, v.voucher_number, v.voucher_date,
                   v.party_name, v.narration, v.debit_ledger, v.credit_ledger,
                   ale.j_amount AS amount, ale.j_is_dr AS is_dr
            FROM `tabVE Tally Voucher` v {_JSON_JOIN}
            WHERE {where}
            ORDER BY v.voucher_date DESC, v.name DESC
            LIMIT %s OFFSET %s""",
        [ledger_name] + vals + [page_size, (page - 1) * page_size],
        as_dict=True,
    )

    totals_row = frappe.db.sql(
        f"""SELECT
               COALESCE(SUM(CASE WHEN ale.j_is_dr = 1 THEN ale.j_amount ELSE 0 END), 0) AS total_inflow,
               COALESCE(SUM(CASE WHEN ale.j_is_dr = 0 THEN ale.j_amount ELSE 0 END), 0) AS total_outflow
            FROM `tabVE Tally Voucher` v {_JSON_JOIN}
            WHERE {where}""",
        [ledger_name] + vals, as_dict=True,
    )
    total_inflow  = round(flt(totals_row[0].total_inflow  if totals_row else 0), 2)
    total_outflow = round(flt(totals_row[0].total_outflow if totals_row else 0), 2)

    monthly_rows = frappe.db.sql(
        f"""SELECT DATE_FORMAT(v.voucher_date, '%%Y-%%m') m, COUNT(*) cnt,
                   COALESCE(SUM(CASE WHEN ale.j_is_dr = 1 THEN ale.j_amount ELSE 0 END), 0) inflow,
                   COALESCE(SUM(CASE WHEN ale.j_is_dr = 0 THEN ale.j_amount ELSE 0 END), 0) outflow
            FROM `tabVE Tally Voucher` v {_JSON_JOIN}
            WHERE {where} GROUP BY m ORDER BY m""",
        [ledger_name] + vals, as_dict=True,
    )
    monthly = [{
        "month": r.m, "count": int(r.cnt),
        "inflow": round(flt(r.inflow), 2), "outflow": round(flt(r.outflow), 2),
        "total": round(flt(r.inflow) - flt(r.outflow), 2),
    } for r in monthly_rows]

    transactions = []
    for r in rows:
        amt       = flt(r.amount)
        is_inflow = bool(r.is_dr)
        counterparty = r.debit_ledger if is_inflow else r.credit_ledger
        transactions.append({
            "date":           str(r.voucher_date),
            "voucher_type":   r.voucher_type or "",
            "voucher_number": r.voucher_number or "",
            "narration":      (r.narration or "")[:120],
            "party_name":     r.party_name or "",
            "counterparty":   counterparty or "",
            "amount":         round(amt, 2),
            "credit":         round(amt, 2) if is_inflow else 0.0,
            "debit":          0.0 if is_inflow else round(amt, 2),
            "direction":      "credit" if is_inflow else "debit",
        })

    ledger_rows = frappe.db.sql(
        "SELECT closing_balance FROM `tabVE Tally Ledger` WHERE ledger_name = %s",
        (ledger_name,), as_dict=True,
    )
    cb = flt(ledger_rows[0].closing_balance) if ledger_rows else 0.0

    return {
        "ledger_name":   ledger_name,
        "closing_balance": round(cb, 2),
        "total":         total,
        "page":          page,
        "page_size":     page_size,
        "total_inflow":  total_inflow,
        "total_outflow": total_outflow,
        "net":           round(total_inflow - total_outflow, 2),
        "monthly":       monthly,
        "transactions":  transactions,
    }


@frappe.whitelist()
def get_bank_statement(bank_name, from_date=None, to_date=None,
                       page=1, page_size=50, search=None):
    """Kept for the existing AccountingOverview bank-statement viewer — same
    shape as before (`bank_name` key), delegates to the generic query."""
    _require_admin()
    result = _ledger_txn_query(bank_name, from_date, to_date, page, page_size, search)
    result["bank_name"] = result.pop("ledger_name")
    return result


@frappe.whitelist()
def get_ledger_statement(ledger_name, from_date=None, to_date=None,
                         page=1, page_size=50, search=None):
    """General-purpose ledger statement — powers the General Ledger and
    Bank & Cash Book tabs. Works for any VE Tally Ledger, not just banks."""
    _require_admin()
    return _ledger_txn_query(ledger_name, from_date, to_date, page, page_size, search)

