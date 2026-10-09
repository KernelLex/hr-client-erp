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
from hr_client.api.utils import current_company


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

    # ── Payables / vendor pending payments (creditors) — always list parties ──
    # Checked BEFORE receivables because "which vendors have pending payments"
    # is a payables question that must not be captured by a generic "payment".
    if _has(q, "payable", "creditor", "we owe", "owe to", "to pay", "pending payment",
            "pending payments", "pending vendor", "vendor", "vendors", "supplier",
            "suppliers", "bills to pay", "bill to pay", "whom to pay", "who to pay",
            "which vendor", "which supplier", "dues to", "outstanding payment",
            "top creditor", "biggest creditor", "largest creditor", "whom do we owe",
            "who do we owe", "money to pay"):
        c = S().get("top_creditors") or {}
        total = _inr(S().get("sundry_creditors"))
        cnt = int(S().get("creditor_count") or 0)
        if c:
            lst = "; ".join(f"{n} {_inr(v)}" for n, v in list(c.items())[:10])
            return (f"Vendor payments pending (payables) — {total} outstanding across "
                    f"{cnt} vendors/creditors. By vendor, largest first: {lst}.")
        return (f"Payables {total} across {cnt} creditors "
                "(no per-vendor breakdown available in the current snapshot).")

    # ── Receivables / who owes us (debtors) — always list parties ─────────────
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
        return (f"Receivables {total} outstanding across {cnt} customers "
                "(no per-customer breakdown available in the current snapshot).")

    # ── Sales / purchases / collections ──────────────────────────────────────
    if _has(q, "sales", "revenue", "turnover", "sold", "how much did we sell"):
        return (f"FY sales {_inr(S().get('fy_sales'))} across "
                f"{int(S().get('sales_count') or 0)} sales vouchers. "
                f"All-time sales {_inr(S().get('total_sales'))}.")

    if _has(q, "purchase", "bought", "spend", "procure", "how much did we buy"):
        return (f"FY purchases {_inr(S().get('fy_purchases'))} across "
                f"{int(S().get('purchase_count') or 0)} purchase vouchers.")

    if _has(q, "collection", "receipt", "collected", "money received"):
        return (f"FY collections {_inr(S().get('fy_collections'))} across "
                f"{int(S().get('receipt_count') or 0)} receipts.")

    # ── GST ──────────────────────────────────────────────────────────────────
    if _has(q, "gst", "tax payable", "input credit", "igst", "cgst", "sgst"):
        net = max(0.0, float(S().get("gst_payable") or 0) - float(S().get("input_gst_credit") or 0))
        return (f"GST output payable {_inr(S().get('gst_payable'))}, input credit "
                f"{_inr(S().get('input_gst_credit'))}, net payable {_inr(net)}.")

    # ── Cash / bank / liquidity ──────────────────────────────────────────────
    if _has(q, "cash", "bank balance", "liquidity", "funds", "money in bank", "cash position"):
        cb = float(S().get("cash_in_hand") or 0) + float(S().get("bank_balance") or 0)
        return (f"Cash in hand {_inr(S().get('cash_in_hand'))}, bank balance "
                f"{_inr(S().get('bank_balance'))} (total {_inr(cb)}).")

    # ── Profit / margin (rough) ──────────────────────────────────────────────
    if _has(q, "profit", "margin", "gross"):
        gp = float(S().get("fy_sales") or 0) - float(S().get("fy_purchases") or 0)
        return (f"FY sales {_inr(S().get('fy_sales'))} minus purchases "
                f"{_inr(S().get('fy_purchases'))} ≈ gross {_inr(gp)} (purchase-based COGS proxy).")

    # ── Counts (vouchers / ledgers / SKUs) ───────────────────────────────────
    if _has(q, "how many voucher", "voucher count", "total voucher", "ledger", "sku", "stock item"):
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
