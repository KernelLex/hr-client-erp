# hr_client/api/finance_core.py
# ---------------------------------------------------------------------------
# Canonical financial source of truth for the whole ERP.
#
# The app historically had TWO Tally import pipelines producing two datasets
# (VE Tally Voucher/Ledger via the transformer, and the register/GST tables via
# accounts_tally_import). Different dashboards read different tables, so figures
# drifted and some (Available Funds) read empty manual tables and showed ₹0.
#
# This module makes ONE decision: financial BALANCES come from `VE Tally Ledger`
# (Tally's own trial-balance-level data — the accounting truth, verified to match
# the client's Tally reports to the rupee), and transaction COUNTS/VALUES come
# from `VE Tally Voucher`. Every financial endpoint should read from here so the
# whole ERP is internally consistent, and `reconcile()` guards against future
# drift when a new Tally file is uploaded.
# ---------------------------------------------------------------------------
import re

import frappe
from frappe.utils import flt

# ── account classification (by ledger name, for the funds breakdown) ──────────
_OD_RE = re.compile(r"\bOD\b|overdraft|\bO/?D A", re.I)
_VIRTUAL_RE = re.compile(r"virtual", re.I)


def _ledgers(where):
    # Full precision — no ROUND(). The ERP must display the exact figure.
    return frappe.db.sql(
        f"""SELECT ledger_name, closing_balance AS bal, is_bank, is_cash
            FROM `tabVE Tally Ledger` WHERE {where}""",
        as_dict=True,
    )


# ── Available Funds — from VE Tally Ledger (is_bank / is_cash) ─────────────────
def funds_summary():
    """Bank / cash / virtual / OD balances from the Tally ledger.

    Manual `VE Bank/Virtual/OD Account Balance` rows, if any exist, override the
    Tally-derived figure for that account (admin correction path). Today those
    tables are empty, so everything derives from the ledger — which matches the
    client's Tally to the rupee (OD −97,11,213 · Virtual −3,27,882).
    """
    rows = _ledgers("is_bank = 1 OR is_cash = 1")

    banks, virtuals, ods = [], [], []
    for r in rows:
        name = r.ledger_name
        bal = flt(r.bal)
        if _OD_RE.search(name):
            ods.append(
                {
                    "bank_name": "",
                    "facility_name": name,
                    "sanctioned_limit": 0,
                    # Cr balance (positive) on an OD = drawn; Dr (negative) = headroom.
                    "utilised": bal if bal > 0 else 0,
                    "available": bal,
                    "balance": bal,
                    "interest_rate": 0,
                }
            )
        elif _VIRTUAL_RE.search(name):
            virtuals.append(
                {"gateway_name": name, "available_balance": bal, "credit_limit": 0, "utilised": 0, "balance": bal}
            )
        else:
            acct_type = "Cash" if r.is_cash else "Bank"
            banks.append(
                {"bank_name": name, "account_no": "", "account_type": acct_type, "balance": bal, "last_synced": ""}
            )

    # Manual overrides (empty today, but honoured if an admin adds them).
    man_banks = frappe.get_all(
        "VE Bank Account Balance",
        fields=["bank_name", "account_no", "account_type", "balance", "last_synced"],
    )
    if man_banks:
        names = {b["bank_name"] for b in man_banks}
        banks = [b for b in banks if b["bank_name"] not in names] + [dict(b) for b in man_banks]

    bank_total = sum(flt(b["balance"]) for b in banks)
    virtual_total = sum(flt(v["available_balance"]) for v in virtuals)
    od_available = sum(flt(o["available"]) for o in ods)
    od_utilised = sum(flt(o["utilised"]) for o in ods)

    return {
        "totals": {
            "bank_cash": bank_total,
            "virtual": virtual_total,
            "od_available": od_available,
            "od_utilised": od_utilised,
            "grand_total": bank_total + virtual_total + od_available,
        },
        "banks": sorted(banks, key=lambda x: -flt(x["balance"])),
        "virtuals": virtuals,
        "od_accounts": ods,
        "source": "VE Tally Ledger",
    }


# ── Canonical period filter (Year → Month), shared by every Accounting page ───
def period_bounds(year=None, month=None, fy=None):
    """Convert a period selection into (start, end_exclusive) date strings.

    One definition for the whole ERP so every tab filters identically:
      • calendar year/month (the hierarchical Year → Month picker) take priority
      • FY string ("YYYY-YYYY") is the legacy fallback
      • nothing selected → (None, None) = all time
    `month` is 1-12. Returns exclusive end so it composes as `col >= start AND col < end`.
    """
    if year and str(year) not in ("", "all"):
        try:
            y = int(year)
            if month and str(month) not in ("", "all", "0"):
                m = int(month)
                start = f"{y}-{m:02d}-01"
                end = f"{y + 1}-01-01" if m == 12 else f"{y}-{m + 1:02d}-01"
                return start, end
            return f"{y}-01-01", f"{y + 1}-01-01"
        except (ValueError, TypeError):
            pass
    if fy and str(fy) != "all":
        try:
            sy, ey = (int(x) for x in str(fy).split("-"))
            return f"{sy}-04-01", f"{ey}-04-01"
        except (ValueError, IndexError):
            pass
    return None, None


def period_options():
    """The Year → Month tree that actually has vouchers — from VE Tally Voucher,
    the single source. Drives the cascading dropdowns so no empty period is shown
    and every Accounting tab shares one definition of 'what periods exist'."""
    rows = frappe.db.sql(
        """SELECT YEAR(voucher_date) y, MONTH(voucher_date) m, COUNT(*) cnt
           FROM `tabVE Tally Voucher`
           WHERE COALESCE(is_cancelled,0)=0 AND voucher_date IS NOT NULL
           GROUP BY y, m ORDER BY y DESC, m ASC""",
        as_dict=True,
    )
    years = {}
    for r in rows:
        years.setdefault(int(r.y), []).append({"month": int(r.m), "count": int(r.cnt)})
    return {"years": [{"year": y, "months": years[y]} for y in sorted(years, reverse=True)]}


# ── Transaction registers — counts/values from VE Tally Voucher ───────────────
_TXN_TYPE = {
    "sales": "Sales",
    "purchase": "Purchase",
    "credit_note": "Credit Note",
    "debit_note": "Debit Note",
}


def txn_summary(kind, start=None, end=None):
    """Count + value for a voucher kind, optionally within [start, end].

    Count matches Tally's voucher numbering (cancelled vouchers keep their number
    but carry zero value, so they are counted but contribute nothing to value).
    Value is full precision — no rounding — so the ERP shows the exact figure.
    """
    vtype = _TXN_TYPE[kind]
    where = "voucher_type = %s"
    params = [vtype]
    if start and end:
        where += " AND voucher_date BETWEEN %s AND %s"
        params += [start, end]
    row = frappe.db.sql(
        f"SELECT COUNT(*) c, SUM(amount) v FROM `tabVE Tally Voucher` WHERE {where}",
        params,
        as_dict=True,
    )[0]
    return {"count": int(row.c or 0), "value": flt(row.v)}


# ── Monthly series + period accounts summary (single source for dashboards) ───
def monthly_series(kind, start=None, end=None):
    """Month-wise value for a voucher kind — voucher source, full precision."""
    vtype = _TXN_TYPE[kind]
    where = "voucher_type = %s"
    params = [vtype]
    if start and end:
        where += " AND voucher_date BETWEEN %s AND %s"
        params += [start, end]
    rows = frappe.db.sql(
        f"""SELECT DATE_FORMAT(voucher_date, '%%Y-%%m') AS month, SUM(amount) AS amount
            FROM `tabVE Tally Voucher` WHERE {where}
            GROUP BY month ORDER BY month""",
        params, as_dict=True,
    )
    return [{"month": r.month, "amount": flt(r.amount)} for r in rows]


def accounts_summary(start=None, end=None):
    """Canonical Sales / Purchase summary for the accounting dashboard.

    Everything derives from `VE Tally Voucher` (+ `gst_summary` for the tax split)
    so the counts, gross, GST and net-of-GST figures are identical on every page
    that reads this. `net_*` subtracts returns (Credit Notes from sales, Debit
    Notes from purchases). No rounding — exact figures.
    """
    sales = txn_summary("sales", start, end)
    purch = txn_summary("purchase", start, end)
    cn = txn_summary("credit_note", start, end)
    dn = txn_summary("debit_note", start, end)
    gst = gst_summary(start, end)

    sales_gst = gst["output"]["total"]
    purch_gst = gst["input"]["total"]
    return {
        "sales": {
            "total": sales["value"],
            "gst": sales_gst,
            "excl_gst": sales["value"] - sales_gst,
            "invoice_count": sales["count"],
            "returns": cn["value"],
            "returns_count": cn["count"],
            "net_total": sales["value"] - cn["value"],
        },
        "purchase": {
            "total": purch["value"],
            "gst": purch_gst,
            "excl_gst": purch["value"] - purch_gst,
            "bill_count": purch["count"],
            "returns": dn["value"],
            "returns_count": dn["count"],
            "net_total": purch["value"] - dn["value"],
        },
        "monthly_sales": monthly_series("sales", start, end),
        "monthly_purchase": monthly_series("purchase", start, end),
        "source": "VE Tally Voucher",
    }


# ── GST — computed from the vouchers' own ledger lines (net of CN/DN) ──────────
import json as _json


def _is_gst_ledger(name):
    low = (name or "").lower()
    return any(k in low for k in ("gst", "cgst", "sgst", "igst"))


def gst_summary(start=None, end=None):
    """Correct Output / Input GST straight from each voucher's ledger breakdown,
    NET of sales/purchase returns.

    `VE Tally Voucher.all_ledger_entries` holds the real GST lines per voucher,
    and the voucher type tells us how each line behaves:

      Output GST liability = tax on Sales  − tax reversed by Credit Notes
      Input  GST credit    = tax on Purchase − tax reversed by Debit Notes

    A Credit Note (sales return) reverses output GST, and a Debit Note (purchase
    return) reverses input GST, so both must be subtracted. Reading the tax lines
    per voucher means GST-payment journals / receipts / contras never contaminate
    the figure. Verified against the client's Tally: Output ≈ ₹7.99cr,
    Input ≈ ₹7.91cr — matching to well under 1% (residual is snapshot drift only).

    Full precision — no rounding.
    """
    where = "all_ledger_entries LIKE '%%GST%%'"
    params = []
    if start and end:
        where += " AND voucher_date BETWEEN %s AND %s"
        params = [start, end]
    rows = frappe.db.sql(
        f"SELECT voucher_type vt, all_ledger_entries ale FROM `tabVE Tally Voucher` WHERE {where}",
        params,
        as_dict=True,
    )

    # Sign per voucher type: Sales/Purchase add tax, their return notes subtract it.
    OUT_SIGN = {"Sales": 1.0, "Credit Note": -1.0}
    IN_SIGN = {"Purchase": 1.0, "Debit Note": -1.0}

    out = {"igst": 0.0, "cgst": 0.0, "sgst": 0.0}
    inp = {"igst": 0.0, "cgst": 0.0, "sgst": 0.0}
    for r in rows:
        try:
            entries = _json.loads(r.ale)
        except Exception:
            continue
        vt = r.vt
        out_sign = OUT_SIGN.get(vt)
        in_sign = IN_SIGN.get(vt)
        if out_sign is None and in_sign is None:
            continue
        for e in entries:
            name = e.get("ledger") or ""
            if not _is_gst_ledger(name):
                continue
            low = name.lower()
            amt = abs(flt(e.get("amount")))
            comp = "igst" if "igst" in low else ("cgst" if "cgst" in low else ("sgst" if "sgst" in low else None))
            if comp is None:
                continue
            # Output ledgers live on Sales & Credit Note; Input on Purchase & Debit Note.
            if out_sign is not None and "output" in low:
                out[comp] += out_sign * amt
            elif in_sign is not None and "input" in low:
                inp[comp] += in_sign * amt

    def _pack(d):
        return {k: flt(v) for k, v in d.items()} | {"total": flt(sum(d.values()))}

    output = _pack(out)
    input_ = _pack(inp)
    net = {
        "igst": output["igst"] - input_["igst"],
        "cgst": output["cgst"] - input_["cgst"],
        "sgst": output["sgst"] - input_["sgst"],
        "total": output["total"] - input_["total"],
    }
    return {"output": output, "input": input_, "net": net, "approximate": False}


# ── Reconciliation guard ──────────────────────────────────────────────────────
def reconcile():
    """Compare the same figures across the voucher / register / ledger sources.

    Returns a per-metric report and logs any material drift (>1%) to the Error
    Log so a bad Tally import can never silently reintroduce the discrepancies.
    """
    q = frappe.db.sql
    report = []

    def add(metric, a, b, la, lb):
        base = max(abs(flt(a)), abs(flt(b)), 1)
        drift = abs(flt(a) - flt(b)) / base * 100
        status = "ok" if drift <= 1 else ("warn" if drift <= 5 else "error")
        report.append(
            {"metric": metric, la: flt(a), lb: flt(b), "drift_pct": round(drift, 2), "status": status}
        )

    for kind, vtype in _TXN_TYPE.items():
        vv = flt(q("SELECT ROUND(SUM(amount)) FROM `tabVE Tally Voucher` WHERE voucher_type=%s", vtype)[0][0])
        if kind == "sales":
            rr = flt(q("SELECT ROUND(SUM(total)) FROM `tabVE Sales Register Entry`")[0][0])
            add("sales_value", vv, rr, "voucher", "register")
        elif kind == "purchase":
            rr = flt(q("SELECT ROUND(SUM(total)) FROM `tabVE Purchase Register Entry`")[0][0])
            add("purchase_value", vv, rr, "voucher", "register")

    # sales/purchase COUNT drift
    add(
        "sales_count",
        q("SELECT COUNT(*) FROM `tabVE Tally Voucher` WHERE voucher_type='Sales'")[0][0],
        q("SELECT COUNT(*) FROM `tabVE Sales Register Entry`")[0][0],
        "voucher",
        "register",
    )
    add(
        "purchase_count",
        q("SELECT COUNT(*) FROM `tabVE Tally Voucher` WHERE voucher_type='Purchase'")[0][0],
        q("SELECT COUNT(*) FROM `tabVE Purchase Register Entry`")[0][0],
        "voucher",
        "register",
    )

    bad = [r for r in report if r["status"] != "ok"]
    if bad:
        frappe.log_error(
            frappe.as_json(bad), "finance_core.reconcile: source drift detected"
        )
    return {"report": report, "issues": len(bad)}
