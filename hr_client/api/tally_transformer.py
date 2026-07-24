"""
Tally Full-Pipeline Transformer
================================
Single source of truth for how Tally XML data maps to every dashboard field.

PIPELINE
--------
Stage 1 (0-55%)  : tally_import_job.run()
                   Master.xml  → tabVE Tally Ledger, tabVE Tally Group, tabVE Tally Stock Item
                   All Transactions.xml (full history) → tabVE Tally Voucher

Stage 2 (55-95%) : accounts_tally_import.run()
                   VE Tally tables → Accounts Dashboard DocTypes
                   (Sales Register, Purchase Register, GST Ledger, Cash Flow,
                    Debtor Ledger, Creditor Ledger, Stock Movement Summary)

Stage 3 (95-100%): frappe.clear_cache()

SIGN CONVENTION (Tally XML → DB)
---------------------------------
closing_balance < 0  = Dr balance  = ASSET  (money in bank, receivable from customer)
closing_balance > 0  = Cr balance  = LIABILITY (overdraft used, payable to vendor/govt)

FIELD-BY-FIELD MAPPING (what each dashboard field shows and why)
----------------------------------------------------------------

FINANCE SECTION (reads live from tabVE Tally Ledger)
  Cash in Hand       = SUM(ABS(closing_balance)) WHERE is_cash=1 AND closing_balance < 0
                       Dr balance = physical cash held. MUST take ABS (Dr is negative in DB).
                       WRONG if: you sum raw (negative) values — gives negative or zero.

  Bank Funds (net)   = (Dr bank accounts) + (Virtual acct Cr) − (true OD Cr)
                       Dr accounts (cb < 0)  → abs = money in account (ICICI, OD-with-funds)
                       Virtual accounts (Cr) → collected customer money, treat as available
                       True OD Cr (cb > 0, name NOT 'virtual') → borrowed, subtract
                       WRONG if: you filter by parent_group="Bank Accounts" only — misses
                       accounts in "Bank OD A/c" group that currently have Dr balance.

  Net GST Liability  = SUM(positive cb) − SUM(ABS(negative cb)) from is_gst=1 ledgers
                       Vera's Tally uses INVERTED naming convention:
                         "Input CGST/SGST/IGST"  → Cr (positive) = collected from customers
                         "Output CGST/SGST/IGST" → Dr (negative) = ITC paid to suppliers
                       Positive result = net liability to govt
                       Negative result = net ITC surplus (claimable from govt)

  TDS Payable        = SUM(closing_balance) WHERE is_tds=1 AND closing_balance > 0
                       Cr balance = TDS deducted and still payable to Income Tax Dept

ACCOUNTS SECTION (reads from tabVE Tally Voucher directly)
  FY Sales           = SUM(amount) WHERE voucher_type='Sales' AND is_cancelled=0
                         AND voucher_date IN current FY (Apr 1 → Mar 31)
                       EXCLUDES: PERFORMA INVOICE (pre-billing, not in Tally Sales Register)
                       EXCLUDES: Credit Note (separate register)
                       amount field uses party_ledger_amount from XML for Sales type.

  FY Purchase        = SUM(amount) WHERE voucher_type='Purchase' AND is_cancelled=0
                       EXCLUDES: Debit Note (separate register)

  FY Collections     = SUM(amount) WHERE voucher_type='Receipt' AND is_cancelled=0

  Sundry Debtors     = SUM(ABS(closing_balance)) WHERE is_debtors=1 AND closing_balance < 0
                       Dr balance = customer owes Vera. MUST take ABS.

  Sundry Creditors   = SUM(closing_balance) WHERE is_creditors=1 AND closing_balance > 0
                       Cr balance = Vera owes vendor.

ACCOUNTS DASHBOARD DocTypes (reads from VE Sales/Purchase Register Entry etc.)
  These are populated by Stage 2 (accounts_tally_import.run()).
  Sales Register     = 'Sales' vouchers only (no PERFORMA, no Credit Note deduction)
  Purchase Register  = 'Purchase' vouchers only (no Debit Note deduction)
  GST Ledger Output  = Sales voucher GST amounts (CGST+SGST+IGST from all_ledger_entries)
  GST Ledger Input   = Purchase + other non-Sales/PERFORMA/CreditNote voucher GST
  Debtors            = DELETE + re-insert each run (Python hash() is session-random,
                       so _upsert cannot de-dup; always full rebuild)
  Creditors          = Same — DELETE + re-insert each run
  Stock Movement     = inventory_entries JSON, key is "name" (not "item")

VOUCHER TYPE REFERENCE
-----------------------
  Sales              → Customer invoices (included in Sales Register, Sales KPI)
  PERFORMA INVOICE   → Pro-forma invoices (NOT in Sales Register — shown separately)
  Credit Note        → Sales returns (separate register — NOT deducted from Sales)
  Purchase           → Supplier bills (included in Purchase Register)
  Debit Note         → Purchase returns (separate register — NOT deducted from Purchase)
  Receipt            → Money received from customers
  Payment            → Money paid to vendors
  Contra             → Inter-bank/cash transfers
  Journal            → Adjustment entries
  Sales Order        → Order confirmations (NOT sales)
  Purchase Order     → Purchase orders (NOT purchases)
  Stock Journal      → Stock adjustments (no monetary value)
"""
import json
import time

import frappe

_STATUS_KEY = "tally_transformer_status"


def _set(status: str, progress: int, message: str, error: str = ""):
    frappe.cache().set_value(_STATUS_KEY, json.dumps({
        "status":   status,
        "progress": progress,
        "message":  message,
        "error":    error,
        "ts":       time.time(),
    }), expires_in_sec=7200)


def get_status():
    raw = frappe.cache().get_value(_STATUS_KEY)
    if not raw:
        return {"status": "idle", "progress": 0, "message": "No import has run yet", "error": ""}
    return json.loads(raw)


def run(masters_path: str = "/home/vera/Master.xml",
        transactions_path: str = "/home/vera/All Transactions.xml"):
    """
    Full two-stage pipeline. Safe to frappe.enqueue or call directly.
    Both XML files must be UTF-16 encoded Tally exports.
    """
    import os
    t0 = time.time()

    # ── Pre-flight ────────────────────────────────────────────────────────────
    for path, label in [(masters_path, "Master"), (transactions_path, "Transactions")]:
        if not os.path.isfile(path):
            msg = f"{label} file not found: {path}"
            _set("error", 0, msg, error=msg)
            frappe.log_error(msg, "tally_transformer.run")
            return {"success": False, "error": msg}

    _set("running", 2, "Starting Stage 1 — parsing XML files…")

    # ── Stage 1: XML → VE Tally tables ───────────────────────────────────────
    try:
        from hr_client.api import tally_import_job

        orig_set = tally_import_job._set_status

        def _s1(status, progress, message):
            _set("running", 2 + int(progress * 0.53), f"[XML parse] {message}")

        tally_import_job._set_status = _s1
        try:
            result1 = tally_import_job.run(masters_path, transactions_path)
        finally:
            tally_import_job._set_status = orig_set

    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "tally_transformer — Stage 1")
        msg = f"Stage 1 failed (XML parsing): {str(exc)[:300]}"
        _set("error", 0, msg, error=msg)
        return {"success": False, "error": msg}

    _set("running", 56, "Stage 1 complete. Building dashboard data…")

    # ── Stage 2: VE Tally tables → Dashboard DocTypes ────────────────────────
    try:
        from hr_client.api import accounts_tally_import as ati

        orig_ati = ati._set_status

        def _s2(status, progress, message):
            _set("running", 56 + int(progress * 0.39), f"[Dashboard] {message}")

        ati._set_status = _s2
        try:
            result2 = ati.run()
        finally:
            ati._set_status = orig_ati

    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "tally_transformer — Stage 2")
        msg = f"Stage 2 failed (dashboard build): {str(exc)[:300]}"
        _set("error", 55, msg, error=msg)
        return {"success": False, "error": msg}

    # ── Stage 3: Reconciliation check ────────────────────────────────────────
    _set("running", 96, "Running reconciliation check…")
    recon = {}
    try:
        from hr_client.api import accounts_tally_import as _ati_recon
        recon = _ati_recon.reconcile()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "tally_transformer — reconcile")

    # ── Stage 4: Clear cache ──────────────────────────────────────────────────
    _set("running", 98, "Clearing cache…")
    try:
        frappe.clear_cache()
    except Exception:
        pass

    elapsed = round(time.time() - t0, 1)
    counts = result2 or {}
    recon_errors = [k for k, v in recon.items() if v.get("status") == "error"]
    recon_summary = f" | Recon errors: {recon_errors}" if recon_errors else " | Recon: OK"
    summary = (
        f"Done in {elapsed}s — "
        f"Sales:{counts.get('sales',0)}, "
        f"Purchase:{counts.get('purchase',0)}, "
        f"GST:{counts.get('gst',0)}, "
        f"Debtors:{counts.get('debtor_ledger',0)}, "
        f"Creditors:{counts.get('creditor_ledger',0)}, "
        f"CashFlow:{counts.get('cash_flow',0)}, "
        f"Stock:{counts.get('stock',0)}"
        f"{recon_summary}"
    )
    _set("completed", 100, summary)
    return {"success": True, "elapsed": elapsed, "stage2": counts, "reconciliation": recon}
