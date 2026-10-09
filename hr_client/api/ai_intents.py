"""
Intent router for the Vera AI chat.

Instead of stuffing the whole company digest into the LLM prompt (slow on a CPU
box) and asking the model to both FIND and REASON, we map a plain-English
question to one of a set of KNOWN intents, each backed by a safe, hand-written
query (mostly the already-tested aggregates in get_business_snapshot /
company_brain). The exact numbers are computed in Python; the LLM only phrases
the answer from the verified facts — a tiny prompt + short output, so it's fast.

No LLM-written SQL ever touches the DB. Questions that match no intent fall back
to the slower whole-company context chat (handled in ai.chat), so nothing is lost.
"""

import frappe
from collections import Counter
from hr_client.api.utils import current_company, company_sql


def _inr(n) -> str:
    try:
        n = float(n or 0)
    except Exception:
        n = 0.0
    if abs(n) >= 1e7:
        return f"₹{n / 1e7:.2f} Cr"
    if abs(n) >= 1e5:
        return f"₹{n / 1e5:.2f} L"
    return f"₹{n:,.0f}"


def _has(text: str, *words: str) -> bool:
    return any(w in text for w in words)


def route_question(message: str):
    """Return a compact 'verified facts' string for a recognised question, or
    None if nothing matches. The caller (ai.chat) decides how to phrase it."""
    q = (message or "").lower().strip()
    if not q:
        return None

    # Lazily load the snapshot only when an intent needs it.
    _cache = {}

    def S():
        if "snap" not in _cache:
            from hr_client.api.ai import get_business_snapshot
            _cache["snap"] = get_business_snapshot() or {}
        return _cache["snap"]

    # Helper: top parties by voucher volume (Sales → customers, Purchase → vendors).
    def _party_totals(vtype, n=6):
        co = current_company()
        rows = frappe.db.sql(
            "SELECT party_name, SUM(amount) t FROM `tabVE Tally Voucher` "
            "WHERE voucher_type=%(vt)s AND is_cancelled=0 AND party_name!=''"
            + company_sql(co) + " GROUP BY party_name ORDER BY t DESC LIMIT %(n)s",
            {"vt": vtype, "company": co, "n": n}, as_dict=True)
        return [(r.party_name, float(r.t or 0)) for r in rows]

    # ── Overdue / ageing of receivables (checked before plain receivables) ────
    if _has(q, "overdue", "aging", "ageing", "aged", "past due", "oldest", "how old",
            "days overdue", "90 day", "60 day", "30 day", "ageing of", "aging of"):
        try:
            from hr_client.api.operations import get_debtor_aging
            ag = get_debtor_aging(); b = ag["buckets"]
            od = sorted([d for d in ag.get("debtors", []) if (d.get("days") or 0) > 90],
                        key=lambda d: -(d.get("amount") or 0))[:5]
            names = "; ".join(f"{d['party']} ({int(d['days'])}d)" for d in od) if od else "none beyond 90 days"
            return ("Receivables ageing (by invoice date — Tally carries no bill-wise due date, so this "
                    f"is FIFO-approximated). 0–30d {b['current']['fmt']}; 31–60d {b['b30_60']['fmt']}; "
                    f"61–90d {b['b61_90']['fmt']}; 90+ d {b['b90plus']['fmt']}; opening/journals (unaged) "
                    f"{b['unknown']['fmt']}. Most overdue customers: {names}. (Per-invoice ageing by party "
                    "is on the Payables & Receivables page.)")
        except Exception:
            return None

    # ── GST (before payables so "gst payable" isn't swallowed as a payable) ───
    if _has(q, "gst", "igst", "cgst", "sgst", "input credit", "input tax", "tax payable",
            "gstr", "tax liability"):
        net = max(0.0, float(S().get("gst_payable") or 0) - float(S().get("input_gst_credit") or 0))
        return (f"GST output payable {_inr(S().get('gst_payable'))}, input credit "
                f"{_inr(S().get('input_gst_credit'))}, net payable {_inr(net)}.")

    # ── Cash / bank / liquidity ──────────────────────────────────────────────
    if _has(q, "cash", "bank balance", "liquidity", "funds", "money in bank", "cash position"):
        cb = float(S().get("cash_in_hand") or 0) + float(S().get("bank_balance") or 0)
        return (f"Cash in hand {_inr(S().get('cash_in_hand'))}, bank balance "
                f"{_inr(S().get('bank_balance'))} (total {_inr(cb)}).")

    # ── Top customers by SALES volume (distinct from outstanding debtors) ─────
    if _has(q, "top customer", "biggest customer", "best customer", "largest customer",
            "top client", "biggest client", "who buys the most", "biggest buyer", "top buyer"):
        try:
            rows = _party_totals("Sales")
            if rows:
                return "Top customers by sales (all-time): " + "; ".join(f"{n} {_inr(v)}" for n, v in rows) + "."
        except Exception:
            pass
        return None

    # ── Top vendors by PURCHASE volume (before payables; different concept) ───
    if _has(q, "top vendor", "biggest vendor", "largest vendor", "top supplier",
            "biggest supplier", "largest supplier", "buy the most", "most purchases from",
            "who do we buy"):
        try:
            rows = _party_totals("Purchase")
            if rows:
                return "Top vendors by purchase (all-time): " + "; ".join(f"{n} {_inr(v)}" for n, v in rows) + "."
        except Exception:
            pass
        return None

    # ── Payables / vendor pending payments (outstanding balances) ─────────────
    if _has(q, "payable", "creditor", "we owe", "owe to", "pending payment",
            "pending payments", "pending vendor", "vendor", "vendors", "supplier",
            "suppliers", "bills to pay", "bill to pay", "whom to pay", "who to pay",
            "which vendor", "which supplier", "dues to", "outstanding payment",
            "whom do we owe", "who do we owe", "money to pay"):
        c = S().get("top_creditors") or {}
        total = _inr(S().get("sundry_creditors"))
        cnt = int(S().get("creditor_count") or 0)
        if c:
            lst = "; ".join(f"{n} {_inr(v)}" for n, v in list(c.items())[:10])
            return (f"Vendor payments pending (payables) — {total} outstanding across "
                    f"{cnt} vendors/creditors. By vendor, largest first: {lst}.")
        return f"Payables {total} across {cnt} creditors."

    # ── Receivables / who owes us (outstanding balances) ──────────────────────
    if _has(q, "receivable", "debtor", "owes us", "owe us", "who owes", "owed to us",
            "outstanding from client", "outstanding from customer", "collect from",
            "which customer", "which client", "customers owe", "clients owe",
            "pending from customer", "pending receipt", "top debtor", "biggest debtor",
            "largest debtor", "money owed to us"):
        d = S().get("top_debtors") or {}
        total = _inr(S().get("sundry_debtors"))
        cnt = int(S().get("debtor_count") or 0)
        if d:
            lst = "; ".join(f"{n} {_inr(v)}" for n, v in list(d.items())[:10])
            return (f"Receivables — {total} outstanding across {cnt} customers. "
                    f"By customer, largest first: {lst}.")
        return f"Receivables {total} outstanding across {cnt} customers."

    # ── Sales / purchases / collections ──────────────────────────────────────
    if _has(q, "sales", "revenue", "turnover", "sold", "how much did we sell"):
        return (f"FY sales {_inr(S().get('fy_sales'))} across "
                f"{int(S().get('sales_count') or 0)} sales vouchers. "
                f"All-time sales {_inr(S().get('total_sales'))}.")

    if _has(q, "purchase", "bought", "procure", "how much did we buy"):
        return (f"FY purchases {_inr(S().get('fy_purchases'))} across "
                f"{int(S().get('purchase_count') or 0)} purchase vouchers.")

    if _has(q, "collection", "receipt", "collected", "money received"):
        return (f"FY collections {_inr(S().get('fy_collections'))} across "
                f"{int(S().get('receipt_count') or 0)} receipts.")

    # ── Profit / margin (rough) ──────────────────────────────────────────────
    if _has(q, "profit", "margin", "gross"):
        gp = float(S().get("fy_sales") or 0) - float(S().get("fy_purchases") or 0)
        return (f"FY sales {_inr(S().get('fy_sales'))} minus purchases "
                f"{_inr(S().get('fy_purchases'))} ≈ gross {_inr(gp)} (purchase-based COGS proxy).")

    # ── Expenses / overheads (top expense ledgers; YTD Tally balances) ────────
    if _has(q, "expense", "overhead", "opex", "operating cost", "spending on", "spend on",
            "cost of running", "overheads"):
        try:
            co = current_company()
            rows = frappe.db.sql(
                "SELECT ledger_name, ABS(closing_balance) amt FROM `tabVE Tally Ledger` "
                "WHERE (parent_group LIKE '%%Expense%%' OR parent_group LIKE '%%Indirect Exp%%' "
                "OR parent_group LIKE '%%Direct Exp%%') AND closing_balance <> 0"
                + company_sql(co) + " ORDER BY amt DESC LIMIT 8",
                {"company": co}, as_dict=True)
            if rows:
                lst = "; ".join(f"{r.ledger_name} {_inr(r.amt)}" for r in rows)
                return (f"Top expense ledgers (Tally, year-to-date balances): {lst}. "
                        "Period-specific opex (incl. expense claims + transport) is on the Accounting → Opex card.")
        except Exception:
            pass
        return None

    # ── Stock / inventory (before counts so "stock"/"sku" land here) ──────────
    if _has(q, "stock value", "inventory value", "stock on hand", "inventory",
            "stock level", "low stock", "out of stock", "reorder", "how much stock",
            "sku", "stock item", "fast moving", "slow moving", "dead stock"):
        n = int(S().get("stock_item_count") or 0)
        return (f"{n:,} stock items (SKUs) are tracked. Live quantities, fast/slow/dead-stock and "
                "valuation are on the Inventory page — the Tally feed carries item masters and movement, "
                "not a single snapshot stock value here.")

    # ── Top products (honest: the Tally feed has no per-item voucher lines) ───
    if _has(q, "top product", "best selling", "best-selling", "which product", "product sells",
            "top item", "fastest moving", "most sold", "top selling"):
        return ("Product-level sales ranking isn't available: the Tally feed records vouchers at header "
                "level (no per-item lines), so sales can't be ranked by product. I can rank top customers "
                "by sales or vendors by purchase, and the Inventory page has per-SKU movement.")

    # ── Counts (vouchers / ledgers) ──────────────────────────────────────────
    if _has(q, "how many voucher", "voucher count", "total voucher", "how many ledger", "ledger count"):
        return (f"{int(S().get('total_vouchers') or 0):,} vouchers, "
                f"{int(S().get('total_ledgers') or 0):,} ledgers, "
                f"{int(S().get('stock_item_count') or 0):,} stock items.")

    # ── Employees / headcount ────────────────────────────────────────────────
    if _has(q, "employee", "headcount", "staff", "team size", "how many people", "workforce"):
        try:
            from hr_client.api.company_brain import _load_employees
            emps = _load_employees(current_company())
            depts = Counter((e.get("department") or "—") for e in emps)
            dept_str = ", ".join(f"{d}: {n}" for d, n in depts.most_common(6))
            return f"{len(emps)} active employees. By department — {dept_str}."
        except Exception:
            return None

    # ── Open job openings ────────────────────────────────────────────────────
    if _has(q, "job opening", "vacanc", "hiring", "open position", "recruit"):
        try:
            from hr_client.api.company_brain import _load_open_jobs
            jobs = _load_open_jobs(current_company())
            if not jobs:
                return "There are no open job openings right now."
            titles = "; ".join(j.get("job_title", "?") for j in jobs[:8])
            return f"{len(jobs)} open job opening(s): {titles}."
        except Exception:
            return None

    # ── Overall health / summary ─────────────────────────────────────────────
    if _has(q, "how are we doing", "overall", "summary", "health", "overview", "how is the business"):
        try:
            from hr_client.api.ai import _compute_insights
            ci = _compute_insights()
            return (f"Health score {ci['health_score']}/100 ({ci['health_label']}). "
                    + " ".join(ci["insights"][:3]))
        except Exception:
            return None

    return None
