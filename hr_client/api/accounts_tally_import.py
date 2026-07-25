"""
Tally → VE Accounts DocTypes import pipeline.
Sources data from already-imported VE Tally Voucher / VE Tally Ledger tables
(populated by the existing tally_import_job.py pipeline) and re-classifies
into the Accounts Dashboard DocTypes.

Run via: hr_client.api.accounts_tally_import.run()
Or via API: trigger_tally_import() in accounts_dashboard.py
"""
import json
import time
import datetime
from collections import defaultdict

import frappe
from frappe.utils import flt, cint

_STATUS_KEY = "accounts_tally_import_status"


def _set_status(status, progress, message):
    frappe.cache().set_value(_STATUS_KEY, json.dumps({
        "status": status,
        "progress": progress,
        "message": message,
        "ts": time.time(),
    }), expires_in_sec=7200)


def get_status():
    raw = frappe.cache().get_value(_STATUS_KEY)
    if not raw:
        return {"status": "idle", "progress": 0, "message": "No import running"}
    return json.loads(raw)


def _upsert(doctype, tally_guid, data):
    """Insert or update a record identified by tally_guid."""
    existing = frappe.db.get_value(doctype, {"tally_guid": tally_guid}, "name")
    if existing:
        frappe.db.set_value(doctype, existing, data)
    else:
        doc = frappe.new_doc(doctype)
        doc.tally_guid = tally_guid
        for k, v in data.items():
            setattr(doc, k, v)
        doc.insert(ignore_permissions=True)


def run(masters_path=None, transactions_path=None):
    """
    Populate VE Accounts DocTypes from existing VE Tally Voucher + VE Tally Ledger tables.
    masters_path / transactions_path kept as args for API compatibility but are unused —
    data comes from the already-imported Frappe tables.
    """
    t0 = time.time()
    _set_status("running", 5, "Reading VE Tally Voucher table…")
    counts = defaultdict(int)
    today_d = datetime.date.today()

    try:
        # ── 0. Full rebuild — wipe all derived DocTypes before re-inserting ───
        # VE Tally Voucher is fully deleted + re-inserted by tally_import_job each run,
        # so all downstream derived tables must also be rebuilt from scratch to avoid
        # stale rows from previous imports (e.g. old GST Input entries from Receipt/
        # Payment vouchers, orphaned Cash Flow entries, etc.)
        _set_status("running", 6, "Clearing derived DocTypes for full rebuild…")
        for _dt in (
            "VE Sales Register Entry", "VE Purchase Register Entry",
            "VE GST Ledger Entry", "VE Cash Flow Entry",
            "VE Stock Movement Summary", "VE Debtor Advance", "VE Creditor Advance",
        ):
            frappe.db.sql(f"DELETE FROM `tab{_dt}`")
        frappe.db.commit()

        # ── 1. Sales Register: Sales vouchers only ────────────────────────────
        # Matches Tally's Sales Register exactly (no PERFORMA, no Credit Notes).
        _set_status("running", 10, "Building Sales Register…")
        sales_vouchers = frappe.db.sql(
            """SELECT tally_guid, voucher_number, voucher_date, party_name,
                      amount, all_ledger_entries, narration
               FROM `tabVE Tally Voucher`
               WHERE voucher_type = 'Sales'
                 AND is_cancelled=0""",
            as_dict=True,
        )

        for v in sales_vouchers:
            guid  = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            period = vdate[:7] if len(vdate) >= 7 else ""

            gst_amt = 0.0
            try:
                entries = json.loads(v.all_ledger_entries) if v.all_ledger_entries else []
            except Exception:
                entries = []

            for e in entries:
                lname = e.get("ledger", "")
                eamt  = abs(flt(e.get("amount", 0)))
                if any(x in lname.upper() for x in ("CGST", "SGST", "IGST", "UTGST")):
                    gst_amt += eamt

            total    = abs(flt(v.amount))
            excl_gst = total - gst_amt

            _upsert("VE Sales Register Entry", f"SR-{guid}", {
                "invoice_no":      (v.voucher_number or guid[:20])[:140],
                "invoice_date":    vdate,
                "period":          period,
                "customer":        (v.party_name or "")[:140],
                "project":         (v.narration or "")[:100],
                "amount_excl_gst": excl_gst,
                "gst_amount":      gst_amt,
                "total":           total,
            })
            counts["sales"] += 1

        frappe.db.commit()
        _set_status("running", 25, f"Sales: {counts['sales']}. Building Purchase Register…")

        # ── 2. Purchase Register — Purchase vouchers only ────────────────────
        # Debit Notes (purchase returns) are a separate register in Tally.
        # They are NOT included here, matching Tally's Purchase Register total.
        purchase_vouchers = frappe.db.sql(
            """SELECT tally_guid, voucher_number, voucher_date, party_name,
                      amount, all_ledger_entries, narration, debit_ledger
               FROM `tabVE Tally Voucher`
               WHERE voucher_type = 'Purchase'
                 AND is_cancelled=0""",
            as_dict=True,
        )

        for v in purchase_vouchers:
            guid = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            period = vdate[:7] if len(vdate) >= 7 else ""

            itc_amt = 0.0
            category = ""
            try:
                entries = json.loads(v.all_ledger_entries) if v.all_ledger_entries else []
            except Exception:
                entries = []

            for e in entries:
                lname = e.get("ledger", "")
                eamt  = abs(flt(e.get("amount", 0)))
                lname_up = lname.upper()
                if any(x in lname_up for x in ("CGST", "SGST", "IGST", "ITC", "INPUT TAX")):
                    itc_amt += eamt
                elif not category and "PURCHASE" in lname_up:
                    category = lname[:60]

            total    = abs(flt(v.amount))
            excl_gst = total - itc_amt

            _upsert("VE Purchase Register Entry", f"PR-{guid}", {
                "bill_no":         (v.voucher_number or guid[:20])[:140],
                "bill_date":       vdate,
                "period":          period,
                "vendor":          (v.party_name or "")[:140],
                "category":        category[:60] if category else (v.debit_ledger or "")[:60],
                "amount_excl_gst": excl_gst,
                "itc_amount":      itc_amt,
                "total":           total,
            })
            counts["purchase"] += 1

        frappe.db.commit()
        _set_status("running", 40, f"Purchase: {counts['purchase']}. Building GST Ledger…")

        # ── 3. GST Ledger from all vouchers ──────────────────────────────────
        all_vouchers = frappe.db.sql(
            """SELECT tally_guid, voucher_type, voucher_date, all_ledger_entries
               FROM `tabVE Tally Voucher`
               WHERE is_cancelled=0 AND all_ledger_entries IS NOT NULL
                 AND all_ledger_entries NOT IN ('null','[]','')""",
            as_dict=True,
        )

        for v in all_vouchers:
            guid = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            period = vdate[:7] if len(vdate) >= 7 else ""
            vtype  = v.voucher_type

            # Only Sales vouchers → Output GST; Purchase vouchers → Input GST.
            # Receipt, Payment, Journal, Contra are cash/bank movements, NOT tax entries.
            # Including them caused Input GST count/value to be 2-3x too high.
            if vtype not in ("Sales", "Purchase"):
                continue
            is_output = vtype == "Sales"
            gst_sign  = 1

            try:
                entries = json.loads(v.all_ledger_entries)
            except Exception:
                continue

            for idx, e in enumerate(entries):
                lname = e.get("ledger", "")
                eamt  = abs(flt(e.get("amount", 0)))
                if eamt == 0:
                    continue

                lname_up = lname.upper()
                igst = cgst = sgst = 0.0

                if "IGST" in lname_up:
                    gst_type = "Output" if is_output else "Input"
                    igst = gst_sign * eamt
                elif "CGST" in lname_up:
                    gst_type = "Output" if is_output else "Input"
                    cgst = gst_sign * eamt
                elif "SGST" in lname_up or "UTGST" in lname_up:
                    gst_type = "Output" if is_output else "Input"
                    sgst = gst_sign * eamt
                else:
                    continue

                g_guid = f"GL-{guid}-{idx}"
                _upsert("VE GST Ledger Entry", g_guid, {
                    "gst_type":            gst_type,
                    "period":              period,
                    "hsn_code":            "",
                    "igst":                igst,
                    "cgst":                cgst,
                    "sgst":                sgst,
                    "gstr2b_match_status": "Pending",
                })
                counts["gst"] += 1

        frappe.db.commit()
        _set_status("running", 55, f"GST: {counts['gst']}. Building Cash Flow…")

        # ── 4. Cash Flow from Receipt/Payment/Journal/Contra vouchers ────────
        cf_vouchers = frappe.db.sql(
            """SELECT tally_guid, voucher_type, voucher_date, party_name,
                      amount, all_ledger_entries, narration
               FROM `tabVE Tally Voucher`
               WHERE voucher_type IN ('Receipt','Payment','Journal','Contra')
                 AND is_cancelled=0""",
            as_dict=True,
        )

        for v in cf_vouchers:
            guid  = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            period = vdate[:7] if len(vdate) >= 7 else ""
            amt   = abs(flt(v.amount))
            party = v.party_name or v.narration or "Unclassified"

            if v.voucher_type == "Receipt":
                activity, inflow, outflow = "Operating", amt, 0.0
                line_item = f"Receipt – {party}"
            elif v.voucher_type == "Payment":
                activity, inflow, outflow = "Operating", 0.0, amt
                line_item = f"Payment – {party}"
            elif v.voucher_type == "Contra":
                activity, inflow, outflow = "Operating", amt, 0.0
                line_item = f"Contra – {party}"
            else:  # Journal
                # Classify by debit ledger name
                dl = (v.all_ledger_entries or "").upper()
                if "FIXED ASSET" in dl or "CAPITAL" in dl:
                    activity = "Investing"
                elif "LOAN" in dl or "EQUITY" in dl:
                    activity = "Financing"
                else:
                    activity = "Operating"
                inflow  = amt
                outflow = 0.0
                line_item = f"Journal – {party}"

            _upsert("VE Cash Flow Entry", f"CF-{guid}", {
                "activity_type": activity,
                "period":        period,
                "line_item":     line_item[:140],
                "inflow":        inflow,
                "outflow":       outflow,
            })
            counts["cash_flow"] += 1

        frappe.db.commit()
        _set_status("running", 70, f"Cash Flow: {counts['cash_flow']}. Building Advances…")

        # ── 5. Debtor Advances from Receipt vouchers with "advance" narration ─
        adv_receipts = frappe.db.sql(
            """SELECT tally_guid, voucher_date, party_name, amount, narration
               FROM `tabVE Tally Voucher`
               WHERE voucher_type='Receipt' AND is_cancelled=0
                 AND LOWER(narration) LIKE '%advance%'""",
            as_dict=True,
        )
        for v in adv_receipts:
            guid  = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            _upsert("VE Debtor Advance", f"DA-{guid}", {
                "client_name":    (v.party_name or "")[:140],
                "advance_amount": abs(flt(v.amount)),
                "advance_date":   vdate,
                "project":        (v.narration or "")[:100],
            })
            counts["debtor_advance"] += 1

        # ── 6. Creditor Advances from Payment vouchers with "advance" narration
        adv_payments = frappe.db.sql(
            """SELECT tally_guid, voucher_date, party_name, amount, narration
               FROM `tabVE Tally Voucher`
               WHERE voucher_type='Payment' AND is_cancelled=0
                 AND LOWER(narration) LIKE '%advance%'""",
            as_dict=True,
        )
        for v in adv_payments:
            guid  = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            _upsert("VE Creditor Advance", f"CA-{guid}", {
                "vendor_name":    (v.party_name or "")[:140],
                "advance_amount": abs(flt(v.amount)),
                "advance_date":   vdate,
            })
            counts["creditor_advance"] += 1

        frappe.db.commit()
        _set_status("running", 80, "Building Debtor/Creditor Ledgers from VE Tally Ledger…")

        # Truncate both ledger tables before rebuild — Python hash() is session-random
        # so _upsert's tally_guid lookup never finds existing rows and would insert
        # duplicates on every run. Full delete + re-insert is safe (fully derived data).
        frappe.db.sql("DELETE FROM `tabVE Debtor Ledger`")
        frappe.db.sql("DELETE FROM `tabVE Creditor Ledger`")
        frappe.db.commit()

        # ── 7. Debtor Ledger from VE Tally Ledger closing balances ───────────
        # Sign convention: closing_balance < 0 = Dr = money owed TO Vera (receivable)
        debtor_rows = frappe.db.sql(
            """SELECT ledger_name, closing_balance
               FROM `tabVE Tally Ledger`
               WHERE is_debtors=1 AND closing_balance < 0""",
            as_dict=True,
        )
        for r in debtor_rows:
            lname = r.ledger_name or ""
            bal   = abs(flt(r.closing_balance))
            last_sale = frappe.db.sql(
                """SELECT MAX(voucher_date) as ld FROM `tabVE Tally Voucher`
                   WHERE voucher_type='Sales' AND party_name=%s""",
                (lname,), as_dict=True,
            )
            inv_date = str(last_sale[0].ld)[:10] if last_sale and last_sale[0].ld else today_d.isoformat()
            aging = (today_d - datetime.date.fromisoformat(inv_date)).days
            status = "Overdue" if aging > 60 else "Outstanding"
            doc = frappe.new_doc("VE Debtor Ledger")
            doc.client_name  = lname[:140]
            doc.due_amount   = bal
            doc.invoice_date = inv_date
            doc.status       = status
            doc.insert(ignore_permissions=True)
            counts["debtor_ledger"] += 1

        # ── 8. Creditor Ledger from VE Tally Ledger closing balances ─────────
        # Sign convention: closing_balance > 0 = Cr = Vera owes vendors (payable)
        creditor_rows = frappe.db.sql(
            """SELECT ledger_name, closing_balance
               FROM `tabVE Tally Ledger`
               WHERE is_creditors=1 AND closing_balance > 0""",
            as_dict=True,
        )
        for r in creditor_rows:
            lname = r.ledger_name or ""
            bal   = flt(r.closing_balance)
            last_bill = frappe.db.sql(
                """SELECT MAX(voucher_date) as ld FROM `tabVE Tally Voucher`
                   WHERE voucher_type='Purchase' AND party_name=%s""",
                (lname,), as_dict=True,
            )
            bill_date = str(last_bill[0].ld)[:10] if last_bill and last_bill[0].ld else today_d.isoformat()
            aging = (today_d - datetime.date.fromisoformat(bill_date)).days
            status = "Overdue" if aging > 60 else "Outstanding"
            doc = frappe.new_doc("VE Creditor Ledger")
            doc.vendor_name  = lname[:140]
            doc.due_amount   = bal
            doc.invoice_date = bill_date
            doc.status       = status
            doc.insert(ignore_permissions=True)
            counts["creditor_ledger"] += 1

        frappe.db.commit()
        _set_status("running", 92, "Building Stock Movement from VE Tally Voucher inventory entries…")

        # ── 9. Stock Movement from Sales voucher inventory entries ────────────
        stock_agg = defaultdict(lambda: {"sold_value": 0.0, "last_period": ""})

        inv_vouchers = frappe.db.sql(
            """SELECT voucher_date, inventory_entries
               FROM `tabVE Tally Voucher`
               WHERE voucher_type IN ('Sales','Delivery Note')
                 AND is_cancelled=0
                 AND inventory_entries IS NOT NULL
                 AND inventory_entries NOT IN ('null','[]','')""",
            as_dict=True,
        )

        for v in inv_vouchers:
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            period = vdate[:7] if len(vdate) >= 7 else ""
            try:
                entries = json.loads(v.inventory_entries)
            except Exception:
                continue
            for e in (entries or []):
                iname = e.get("name", e.get("item", ""))   # tally_import_job stores as "name"
                amt   = abs(flt(e.get("amount", 0)))
                if iname and amt > 0:
                    stock_agg[iname]["sold_value"] += amt
                    if period > stock_agg[iname]["last_period"]:
                        stock_agg[iname]["last_period"] = period

        # Classify by sold_value percentile (top 20% = Fast, etc.)
        today_period = today_d.strftime("%Y-%m")
        vals = sorted((a["sold_value"] for a in stock_agg.values() if a["sold_value"] > 0), reverse=True)
        p80 = vals[int(len(vals) * 0.20)] if vals else 1
        p50 = vals[int(len(vals) * 0.50)] if vals else 1
        p20 = vals[int(len(vals) * 0.80)] if vals else 1

        for iname, agg in stock_agg.items():
            sv = agg["sold_value"]
            if sv == 0:
                continue
            period = agg["last_period"] or today_period
            cat = "Fast" if sv >= p80 else "Mid" if sv >= p50 else "Slow" if sv >= p20 else "Dead"

            _upsert("VE Stock Movement Summary", f"SM-{iname[:50]}", {
                "item_code":         iname[:140],
                "item_description":  iname[:140],
                "period":            period,
                "movement_category": cat,
                "units_sold":        round(sv, 2),
                "stock_on_hand":     0.0,
                "turnover_days":     0.0,
                "safety_level":      0.0,
                "reorder_level":     0.0,
                "suggested_po_qty":  0.0,
                "vendor":            "",
            })
            counts["stock"] += 1

        frappe.db.commit()
        elapsed = round(time.time() - t0, 1)
        summary = (
            f"Done in {elapsed}s — "
            f"Sales:{counts['sales']}, Purchase:{counts['purchase']}, "
            f"GST:{counts['gst']}, DebtorLedger:{counts['debtor_ledger']}, "
            f"CreditorLedger:{counts['creditor_ledger']}, "
            f"DebtorAdv:{counts['debtor_advance']}, CreditorAdv:{counts['creditor_advance']}, "
            f"CashFlow:{counts['cash_flow']}, Stock:{counts['stock']}"
        )
        _set_status("completed", 100, summary)
        return dict(counts)

    except Exception:
        frappe.log_error(frappe.get_traceback(), "accounts_tally_import.run")
        _set_status("error", 0, "Import failed — see Error Log")
        raise


# ── Reconciliation ───────────────────────────────────────────────────────────

def _rec_compare(src_cnt, src_val, drv_cnt, drv_val, val_threshold=0.01, count_mismatch_ok=False):
    """Return a reconciliation dict for one section."""
    val_delta_pct = (abs(src_val - drv_val) / max(abs(src_val), 1)) if src_val else None
    cnt_ok = count_mismatch_ok or abs(src_cnt - drv_cnt) <= 2
    val_ok = val_delta_pct is None or val_delta_pct <= val_threshold
    if cnt_ok and val_ok:
        status = "ok"
    elif val_delta_pct is not None and val_delta_pct < 0.05:
        status = "warn"
    else:
        status = "error"
    return {
        "source":        {"cnt": src_cnt, "val": round(src_val, 2)},
        "derived":       {"cnt": drv_cnt, "val": round(drv_val, 2)},
        "val_delta_pct": round(val_delta_pct * 100, 2) if val_delta_pct is not None else None,
        "cnt_delta":     drv_cnt - src_cnt,
        "status":        status,
    }


def reconcile():
    """
    Compare VE Tally Voucher source vs Dashboard DocType derived data.
    Call after run() to verify the import produced consistent numbers.
    Returns a dict keyed by section with status "ok"/"warn"/"error".
    """

    def _q(sql, params=()):
        rows = frappe.db.sql(sql, params, as_dict=True)
        r = rows[0] if rows else {}
        return int(r.get("cnt") or 0), flt(r.get("val") or 0)

    # ── Sales Register ───────────────────────────────────────────────────────
    src_sc, src_sv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) val FROM `tabVE Tally Voucher` "
        "WHERE voucher_type='Sales' AND is_cancelled=0"
    )
    drv_sc, drv_sv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(total),0) val FROM `tabVE Sales Register Entry`"
    )

    # ── Purchase Register ────────────────────────────────────────────────────
    src_pc, src_pv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) val FROM `tabVE Tally Voucher` "
        "WHERE voucher_type='Purchase' AND is_cancelled=0"
    )
    drv_pc, drv_pv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(total),0) val FROM `tabVE Purchase Register Entry`"
    )

    # ── GST Output ───────────────────────────────────────────────────────────
    # Source: sum of gst_amount on Sales Register entries (CGST+SGST+IGST per invoice)
    # Derived: VE GST Ledger Entry (one row per GST component) → count intentionally differs
    src_goc, src_gov = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(gst_amount),0) val FROM `tabVE Sales Register Entry`"
    )
    drv_goc, drv_gov = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(igst+cgst+sgst),0) val "
        "FROM `tabVE GST Ledger Entry` WHERE gst_type='Output'"
    )

    # ── GST Input ────────────────────────────────────────────────────────────
    src_gic, src_giv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(itc_amount),0) val FROM `tabVE Purchase Register Entry`"
    )
    drv_gic, drv_giv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(igst+cgst+sgst),0) val "
        "FROM `tabVE GST Ledger Entry` WHERE gst_type='Input'"
    )

    # ── Debtor Ledger ────────────────────────────────────────────────────────
    # Source: VE Tally Ledger Dr-balance debtors (live); Derived: VE Debtor Ledger (imported)
    src_dc, src_dv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(ABS(closing_balance)),0) val "
        "FROM `tabVE Tally Ledger` WHERE is_debtors=1 AND closing_balance < 0"
    )
    drv_dc, drv_dv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(due_amount),0) val FROM `tabVE Debtor Ledger`"
    )

    # ── Creditor Ledger ──────────────────────────────────────────────────────
    src_cc, src_cv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(closing_balance),0) val "
        "FROM `tabVE Tally Ledger` WHERE is_creditors=1 AND closing_balance > 0"
    )
    drv_cc, drv_cv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(due_amount),0) val FROM `tabVE Creditor Ledger`"
    )

    # ── Cash Flow ────────────────────────────────────────────────────────────
    src_cfc, src_cfv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) val FROM `tabVE Tally Voucher` "
        "WHERE voucher_type IN ('Receipt','Payment','Journal','Contra') AND is_cancelled=0"
    )
    # Compare GROSS movement (inflow+outflow), not net: each voucher maps to one
    # cash-flow entry with either inflow OR outflow = abs(amount), so gross derived
    # == source SUM(amount). Comparing net (inflow-outflow) against gross source is
    # apples-to-oranges and always mismatches once there are any payments.
    drv_cfc, drv_cfv = _q(
        "SELECT COUNT(*) cnt, COALESCE(SUM(inflow+outflow),0) val FROM `tabVE Cash Flow Entry`"
    )

    # ── Stock Movement ───────────────────────────────────────────────────────
    src_stc, _ = _q(
        "SELECT COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(ie.value,'$.name'))) cnt, 0 val "
        "FROM `tabVE Tally Voucher` v "
        "JOIN JSON_TABLE(v.inventory_entries,'$[*]' COLUMNS(value JSON PATH '$')) ie "
        "WHERE v.voucher_type IN ('Sales','Delivery Note') AND v.is_cancelled=0"
        "  AND v.inventory_entries NOT IN ('null','[]','') AND v.inventory_entries IS NOT NULL"
    )
    drv_stc, _ = _q("SELECT COUNT(*) cnt, 0 val FROM `tabVE Stock Movement Summary`")

    result = {
        "sales_register":   _rec_compare(src_sc, src_sv, drv_sc, drv_sv),
        "purchase_register": _rec_compare(src_pc, src_pv, drv_pc, drv_pv),
        "gst_output":       _rec_compare(src_goc, src_gov, drv_goc, drv_gov, count_mismatch_ok=True),
        "gst_input":        _rec_compare(src_gic, src_giv, drv_gic, drv_giv, count_mismatch_ok=True),
        "debtors":          _rec_compare(src_dc, src_dv, drv_dc, drv_dv),
        "creditors":        _rec_compare(src_cc, src_cv, drv_cc, drv_cv),
        "cash_flow":        _rec_compare(src_cfc, src_cfv, drv_cfc, drv_cfv, count_mismatch_ok=True),
        "stock_movement":   _rec_compare(src_stc, 0, drv_stc, 0, count_mismatch_ok=True),
    }

    errors = [k for k, v in result.items() if v["status"] == "error"]
    warns  = [k for k, v in result.items() if v["status"] == "warn"]
    if errors or warns:
        frappe.log_error(
            f"Tally reconciliation: {len(errors)} errors, {len(warns)} warnings\n"
            + json.dumps(result, indent=2),
            "accounts_tally_import.reconcile"
        )

    return result
