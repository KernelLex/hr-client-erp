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
        # ── 1. Sales Register from Sales vouchers ────────────────────────────
        _set_status("running", 10, "Building Sales Register…")
        sales_vouchers = frappe.db.sql(
            """SELECT tally_guid, voucher_number, voucher_date, party_name,
                      amount, all_ledger_entries, narration
               FROM `tabVE Tally Voucher`
               WHERE voucher_type IN ('Sales','PERFORMA INVOICE')
                 AND is_cancelled=0""",
            as_dict=True,
        )

        for v in sales_vouchers:
            guid = v.tally_guid or ""
            vdate = str(v.voucher_date)[:10] if v.voucher_date else ""
            period = vdate[:7] if len(vdate) >= 7 else ""

            # Parse ledger entries to extract GST vs base amount
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

        # ── 2. Purchase Register from Purchase vouchers ──────────────────────
        purchase_vouchers = frappe.db.sql(
            """SELECT tally_guid, voucher_number, voucher_date, party_name,
                      amount, all_ledger_entries, narration, debit_ledger
               FROM `tabVE Tally Voucher`
               WHERE voucher_type IN ('Purchase','Debit Note')
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
            is_sales = v.voucher_type in ("Sales", "PERFORMA INVOICE")

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
                    gst_type = "Output" if is_sales else "Input"
                    igst = eamt
                elif "CGST" in lname_up:
                    gst_type = "Output" if is_sales else "Input"
                    cgst = eamt
                elif "SGST" in lname_up or "UTGST" in lname_up:
                    gst_type = "Output" if is_sales else "Input"
                    sgst = eamt
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

        # ── 7. Debtor Ledger from VE Tally Ledger closing balances ───────────
        debtor_rows = frappe.db.sql(
            """SELECT ledger_name, closing_balance
               FROM `tabVE Tally Ledger`
               WHERE is_debtors=1 AND closing_balance > 0""",
            as_dict=True,
        )
        for r in debtor_rows:
            lname = r.ledger_name or ""
            bal   = flt(r.closing_balance)
            last_sale = frappe.db.sql(
                """SELECT MAX(voucher_date) as ld FROM `tabVE Tally Voucher`
                   WHERE voucher_type IN ('Sales','PERFORMA INVOICE') AND party_name=%s""",
                (lname,), as_dict=True,
            )
            inv_date = str(last_sale[0].ld)[:10] if last_sale and last_sale[0].ld else today_d.isoformat()
            aging = (today_d - datetime.date.fromisoformat(inv_date)).days
            status = "Overdue" if aging > 60 else "Outstanding"
            _upsert("VE Debtor Ledger", f"DL-{lname[:40]}", {
                "client_name":  lname[:140],
                "due_amount":   bal,
                "invoice_date": inv_date,
                "status":       status,
            })
            counts["debtor_ledger"] += 1

        # ── 8. Creditor Ledger from VE Tally Ledger closing balances ─────────
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
                   WHERE voucher_type IN ('Purchase','Debit Note') AND party_name=%s""",
                (lname,), as_dict=True,
            )
            bill_date = str(last_bill[0].ld)[:10] if last_bill and last_bill[0].ld else today_d.isoformat()
            aging = (today_d - datetime.date.fromisoformat(bill_date)).days
            status = "Overdue" if aging > 60 else "Outstanding"
            _upsert("VE Creditor Ledger", f"CL-{lname[:40]}", {
                "vendor_name":  lname[:140],
                "due_amount":   bal,
                "invoice_date": bill_date,
                "status":       status,
            })
            counts["creditor_ledger"] += 1

        frappe.db.commit()
        _set_status("running", 92, "Building Stock Movement from VE Tally Voucher inventory entries…")

        # ── 9. Stock Movement from Sales voucher inventory entries ────────────
        stock_agg = defaultdict(lambda: {"sold_value": 0.0, "last_period": ""})

        inv_vouchers = frappe.db.sql(
            """SELECT voucher_date, inventory_entries
               FROM `tabVE Tally Voucher`
               WHERE voucher_type IN ('Sales','PERFORMA INVOICE','Delivery Note')
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
                iname = e.get("item", "")
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
