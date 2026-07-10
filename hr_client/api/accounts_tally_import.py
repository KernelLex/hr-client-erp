"""
Tally XML → VE Accounts DocTypes import pipeline.
Reads Master.xml + Transactions.xml and populates:
  VE Sales Register Entry, VE Purchase Register Entry, VE GST Ledger Entry,
  VE Creditor Ledger, VE Creditor Advance, VE Debtor Ledger, VE Debtor Advance,
  VE Cash Flow Entry, VE Stock Movement Summary

Idempotent: uses tally_guid as unique key — safe to re-run.
Run via: hr_client.api.accounts_tally_import.run(masters_path, transactions_path)
Or via API: trigger_tally_import() in accounts_dashboard.py
"""
import re
import time
import json
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


def _clean(s):
    return (s.strip()
             .replace("&amp;", "&")
             .replace("&apos;", "'")
             .replace("&lt;", "<")
             .replace("&gt;", ">")
             .replace("&#4;", ""))


def _get(tag, text):
    m = re.search(rf'<{tag}>([^<]*)</{tag}>', text)
    return _clean(m.group(1)) if m else ""


def _tally_date(s):
    """Convert YYYYMMDD → YYYY-MM-DD. Returns None on bad input."""
    s = s.strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return None


def _period(date_str):
    """YYYY-MM-DD → YYYY-MM"""
    if date_str and len(date_str) >= 7:
        return date_str[:7]
    return ""


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


def run(masters_path="/home/vera/Master.xml",
        transactions_path="/home/vera/Transactions.xml"):
    """Main import — safe to enqueue as a background job."""
    t0 = time.time()
    _set_status("running", 2, "Loading Master.xml…")

    try:
        with open(masters_path, encoding="utf-16") as f:
            masters = f.read()
        _set_status("running", 10, f"Master loaded ({len(masters)/1e6:.0f} MB). Parsing ledgers…")

        # ── Parse ledger metadata from masters ───────────────────────────────
        group_parents = {}
        for blk in re.finditer(r'<GROUP NAME="([^"]+)".*?</GROUP>', masters, re.DOTALL):
            gname = _clean(blk.group(1))
            gp_m  = re.search(r'<PARENT>([^<]*)</PARENT>', blk.group(0))
            group_parents[gname] = _clean(gp_m.group(1)) if gp_m else ""

        def root_group(name):
            visited, cur, depth = set(), name, 0
            while cur and cur not in visited and depth < 12:
                visited.add(cur)
                cur = group_parents.get(cur, "")
                depth += 1
            return cur or name

        ledger_meta = {}
        for blk in re.finditer(r'<LEDGER NAME="([^"]+)".*?</LEDGER>', masters, re.DOTALL):
            name = _clean(blk.group(1))
            btext = blk.group(0)
            parent = _get("PARENT", btext)
            pg = parent.lower()
            ledger_meta[name] = {
                "parent": parent,
                "root":   root_group(parent),
                "is_debtor":   1 if "debtor" in pg or "receivable" in pg else 0,
                "is_creditor": 1 if "creditor" in pg or "payable" in pg else 0,
                "is_bank":     1 if parent in ("Bank Accounts", "Bank OD A/c") else 0,
                "is_cash":     1 if pg in ("cash-in-hand", "cash") else 0,
                "is_gst":      1 if parent in ("Duties & Taxes", "ITC-GST")
                                       or (parent == "Current Liabilities" and "gst" in name.lower()) else 0,
                "is_sales":    1 if "sales" in pg or root_group(parent).lower() in ("income", "revenue") else 0,
                "is_purchase": 1 if "purchase" in pg or root_group(parent).lower() in ("expense", "expenditure") else 0,
            }

        # Stock items for category/vendor lookup
        stock_vendor = {}
        for blk in re.finditer(r'<STOCKITEM NAME="([^"]+)".*?</STOCKITEM>', masters, re.DOTALL):
            name = _clean(blk.group(1))
            btext = blk.group(0)
            stock_vendor[name] = _get("PARTYNAME", btext) or _get("VENDOR", btext)

        _set_status("running", 20, "Loading Transactions.xml…")
        with open(transactions_path, encoding="utf-16") as f:
            transactions = f.read()
        _set_status("running", 30, f"Transactions loaded ({len(transactions)/1e6:.0f} MB). Processing vouchers…")

        # ── Counters ─────────────────────────────────────────────────────────
        counts = defaultdict(int)
        today_d = datetime.date.today()

        # ── Process each VOUCHER ─────────────────────────────────────────────
        vouchers = list(re.finditer(r'<VOUCHER\b[^>]*>.*?</VOUCHER>', transactions, re.DOTALL))
        total_v = len(vouchers)
        _set_status("running", 35, f"Found {total_v:,} vouchers. Importing…")

        for idx, vm in enumerate(vouchers, 1):
            if idx % 2000 == 0:
                pct = 35 + int((idx / total_v) * 55)
                _set_status("running", pct, f"Processing voucher {idx:,}/{total_v:,}…")
                frappe.db.commit()

            btext = vm.group(0)
            guid  = _get("GUID", btext)
            vtype = _get("VOUCHERTYPENAME", btext)
            vnum  = _get("VOUCHERNUMBER", btext)
            vdate = _tally_date(_get("DATE", btext))
            if not vdate:
                continue

            party = _get("PARTYLEDGERNAME", btext)
            narr  = _get("NARRATION", btext)[:200]
            is_cancelled = _get("ISCANCELLED", btext).lower() == "yes"
            if is_cancelled:
                continue

            period = _period(vdate)

            # ── Collect all ledger entries ────────────────────────────────
            ledger_entries = []
            for le in re.finditer(r'<ALLLEDGERENTRIES\.LIST>(.*?)</ALLLEDGERENTRIES\.LIST>', btext, re.DOTALL):
                lt = le.group(1)
                lname  = _get("LEDGERNAME", lt)
                is_dr  = _get("ISDEEMEDPOSITIVE", lt).lower() == "yes"
                amt_m  = re.search(r'<AMOUNT>([^<]*)</AMOUNT>', lt)
                amt    = flt(amt_m.group(1).strip()) if amt_m else 0.0
                # GST sub-entries
                gst_entries = []
                for ge in re.finditer(r'<CATEGORYALLOCATIONS\.LIST>(.*?)</CATEGORYALLOCATIONS\.LIST>', lt, re.DOTALL):
                    cat_text = ge.group(1)
                    for tax_e in re.finditer(r'<TAXOBJECTALLOCATIONS\.LIST>(.*?)</TAXOBJECTALLOCATIONS\.LIST>', cat_text, re.DOTALL):
                        tx = tax_e.group(1)
                        tax_type = _get("TAXTYPE", tx)
                        tax_amt_m = re.search(r'<AMOUNT>([^<]*)</AMOUNT>', tx)
                        tax_amt = flt(tax_amt_m.group(1)) if tax_amt_m else 0.0
                        gst_entries.append({"type": tax_type, "amount": abs(tax_amt)})
                ledger_entries.append({
                    "name": lname,
                    "is_dr": is_dr,
                    "amount": abs(amt),
                    "gst": gst_entries,
                })

            # ── Inventory entries ─────────────────────────────────────────
            inv_entries = []
            for ie in re.finditer(r'<INVENTORYENTRIES\.LIST>(.*?)</INVENTORYENTRIES\.LIST>', btext, re.DOTALL):
                it = ie.group(1)
                iname = _get("STOCKITEMNAME", it)
                iqty_m = re.search(r'<ACTUALQTY>\s*([\-\d\.]+)', it)
                iamt_m = re.search(r'<AMOUNT>([^<]*)</AMOUNT>', it)
                inv_entries.append({
                    "item": iname,
                    "qty": flt(iqty_m.group(1)) if iqty_m else 0,
                    "amount": abs(flt(iamt_m.group(1))) if iamt_m else 0,
                })

            meta = ledger_meta.get(party, {})

            # ── Sales Invoice → VE Sales Register Entry ───────────────────
            if vtype in ("Sales", "PERFORMA INVOICE", "Sales Invoice"):
                # Total from ledger entries: find the party leg (debit side for sales)
                party_amt = 0
                gst_amt   = 0
                for le in ledger_entries:
                    lm = ledger_meta.get(le["name"], {})
                    if lm.get("is_gst"):
                        gst_amt += le["amount"]
                    elif lm.get("is_debtor") or le["name"] == party:
                        party_amt += le["amount"]

                excl = party_amt - gst_amt if party_amt else sum(e["amount"] for e in inv_entries)
                total = party_amt or excl + gst_amt

                _upsert("VE Sales Register Entry", f"SR-{guid}", {
                    "invoice_no":     vnum or guid[:20],
                    "invoice_date":   vdate,
                    "period":         period,
                    "customer":       party[:140],
                    "project":        narr[:100],
                    "amount_excl_gst": excl,
                    "gst_amount":     gst_amt,
                    "total":          total,
                })
                counts["sales"] += 1

            # ── Purchase Invoice → VE Purchase Register Entry ─────────────
            elif vtype in ("Purchase", "Purchase Invoice"):
                gst_amt = 0
                total   = 0
                for le in ledger_entries:
                    lm = ledger_meta.get(le["name"], {})
                    if lm.get("is_gst"):
                        gst_amt += le["amount"]
                    elif lm.get("is_creditor") or le["name"] == party:
                        total += le["amount"]

                excl = total - gst_amt

                # Infer category from parent group of purchase ledger
                category = ""
                for le in ledger_entries:
                    lm = ledger_meta.get(le["name"], {})
                    if lm.get("is_purchase") and le["name"] != party:
                        category = ledger_meta.get(le["name"], {}).get("parent", "")[:60]
                        break

                _upsert("VE Purchase Register Entry", f"PR-{guid}", {
                    "bill_no":         vnum or guid[:20],
                    "bill_date":       vdate,
                    "period":          period,
                    "vendor":          party[:140],
                    "category":        category,
                    "amount_excl_gst": excl,
                    "itc_amount":      gst_amt,
                    "total":           total,
                })
                counts["purchase"] += 1

            # ── Receipt with advance → VE Debtor Advance ──────────────────
            elif vtype == "Receipt":
                # Check if narration/party is debtor
                pm = ledger_meta.get(party, {})
                if pm.get("is_debtor"):
                    amt = sum(le["amount"] for le in ledger_entries
                              if ledger_meta.get(le["name"], {}).get("is_bank")
                              or ledger_meta.get(le["name"], {}).get("is_cash"))
                    if amt > 0 and "advance" in narr.lower():
                        _upsert("VE Debtor Advance", f"DA-{guid}", {
                            "client_name":    party[:140],
                            "advance_amount": amt,
                            "advance_date":   vdate,
                            "project":        narr[:100],
                        })
                        counts["debtor_advance"] += 1

            # ── Payment with advance → VE Creditor Advance ────────────────
            elif vtype == "Payment":
                pm = ledger_meta.get(party, {})
                if pm.get("is_creditor"):
                    amt = sum(le["amount"] for le in ledger_entries
                              if ledger_meta.get(le["name"], {}).get("is_bank")
                              or ledger_meta.get(le["name"], {}).get("is_cash"))
                    if amt > 0 and "advance" in narr.lower():
                        _upsert("VE Creditor Advance", f"CA-{guid}", {
                            "vendor_name":    party[:140],
                            "advance_amount": amt,
                            "advance_date":   vdate,
                        })
                        counts["creditor_advance"] += 1

            # ── Journal → Cash Flow Entry ──────────────────────────────────
            elif vtype in ("Journal", "Contra"):
                for le in ledger_entries:
                    lm = ledger_meta.get(le["name"], {})
                    root = lm.get("root", "").lower()
                    if lm.get("is_bank") or lm.get("is_cash"):
                        continue
                    if "income" in root or "revenue" in root or "sales" in root:
                        activity = "Operating"
                    elif "fixed asset" in root or "investment" in root:
                        activity = "Investing"
                    elif "loan" in root or "capital" in root or "equity" in root:
                        activity = "Financing"
                    else:
                        activity = "Operating"

                    inflow  = le["amount"] if le["is_dr"] else 0
                    outflow = le["amount"] if not le["is_dr"] else 0

                    if le["amount"] > 0:
                        entry_guid = f"CF-{guid}-{le['name'][:20]}"
                        _upsert("VE Cash Flow Entry", entry_guid, {
                            "activity_type": activity,
                            "period":        period,
                            "line_item":     le["name"][:140],
                            "inflow":        inflow,
                            "outflow":       outflow,
                        })
                        counts["cash_flow"] += 1

            # ── GST ledger entries ─────────────────────────────────────────
            for le in ledger_entries:
                lm = ledger_meta.get(le["name"], {})
                if not lm.get("is_gst") or le["amount"] == 0:
                    continue
                lname_lower = le["name"].lower()
                if "igst" in lname_lower:
                    gtype = "Output" if "output" in lname_lower or vtype == "Sales" else "Input"
                    igst, cgst, sgst = le["amount"], 0, 0
                elif "cgst" in lname_lower:
                    gtype = "Output" if vtype == "Sales" else "Input"
                    igst, cgst, sgst = 0, le["amount"], 0
                elif "sgst" in lname_lower or "utgst" in lname_lower:
                    gtype = "Output" if vtype == "Sales" else "Input"
                    igst, cgst, sgst = 0, 0, le["amount"]
                else:
                    continue

                g_guid = f"GL-{guid}-{le['name'][:15]}"
                _upsert("VE GST Ledger Entry", g_guid, {
                    "gst_type":            gtype,
                    "period":              period,
                    "hsn_code":            "",
                    "igst":                igst,
                    "cgst":                cgst,
                    "sgst":                sgst,
                    "gstr2b_match_status": "Pending",
                })
                counts["gst"] += 1

        frappe.db.commit()
        _set_status("running", 90, "Vouchers done. Building debtor/creditor ledgers from balances…")

        # ── Build outstanding ledger from closing balances in Masters ─────
        # Find LEDGER closing balance blocks (in Transactions for balances)
        # These appear as <LEDGER NAME="..."> inside the transactions feed
        for blk in re.finditer(r'<LEDGER NAME="([^"]+)".*?</LEDGER>', transactions, re.DOTALL):
            lname = _clean(blk.group(1))
            btext = blk.group(0)
            meta  = ledger_meta.get(lname, {})

            cb_m  = re.search(r'<CLOSINGBALANCE>([^<]*)</CLOSINGBALANCE>', btext)
            if not cb_m:
                continue
            balance = flt(cb_m.group(1).strip())
            if balance == 0:
                continue

            cb_date_m = re.search(r'<DATE>([^<]*)</DATE>', btext)
            cb_date   = _tally_date(cb_date_m.group(1)) if cb_date_m else today_d.isoformat()

            if meta.get("is_debtor") and balance > 0:
                aging = (today_d - datetime.date.fromisoformat(cb_date)).days if cb_date else 0
                status = "Overdue" if aging > 60 else "Outstanding"
                _upsert("VE Debtor Ledger", f"DL-{lname[:40]}", {
                    "client_name":  lname[:140],
                    "due_amount":   balance,
                    "invoice_date": cb_date,
                    "status":       status,
                })
                counts["debtor_ledger"] += 1

            elif meta.get("is_creditor") and balance > 0:
                aging = (today_d - datetime.date.fromisoformat(cb_date)).days if cb_date else 0
                status = "Overdue" if aging > 60 else "Outstanding"
                _upsert("VE Creditor Ledger", f"CL-{lname[:40]}", {
                    "vendor_name":  lname[:140],
                    "due_amount":   balance,
                    "invoice_date": cb_date,
                    "status":       status,
                })
                counts["creditor_ledger"] += 1

        # ── Stock Movement Summary from inventory vouchers ─────────────────
        stock_agg = defaultdict(lambda: {"sold": 0.0, "on_hand": 0.0, "last_period": ""})
        for blk in re.finditer(r'<STOCKITEM NAME="([^"]+)".*?</STOCKITEM>', transactions, re.DOTALL):
            sname = _clean(blk.group(1))
            btext = blk.group(0)
            qty_m = re.search(r'<CLOSINGBALANCE>\s*([\-\d\.]+)', btext)
            if qty_m:
                stock_agg[sname]["on_hand"] = flt(qty_m.group(1))

        # Aggregate sold qty from Sales vouchers inventory entries
        for vm in vouchers:
            btext = vm.group(0)
            vtype = _get("VOUCHERTYPENAME", btext)
            vdate = _tally_date(_get("DATE", btext))
            if vtype not in ("Sales", "Delivery Note", "PERFORMA INVOICE") or not vdate:
                continue
            period = _period(vdate)
            for ie in re.finditer(r'<INVENTORYENTRIES\.LIST>(.*?)</INVENTORYENTRIES\.LIST>', btext, re.DOTALL):
                it = ie.group(1)
                iname = _get("STOCKITEMNAME", it)
                iqty_m = re.search(r'<ACTUALQTY>\s*([\-\d\.]+)', it)
                if iqty_m and iname:
                    stock_agg[iname]["sold"] += abs(flt(iqty_m.group(1)))
                    stock_agg[iname]["last_period"] = period

        today_period = today_d.strftime("%Y-%m")
        for iname, agg in stock_agg.items():
            if agg["sold"] == 0 and agg["on_hand"] == 0:
                continue
            sold     = agg["sold"]
            on_hand  = agg["on_hand"]
            period   = agg["last_period"] or today_period

            # Classify movement
            if sold == 0 and on_hand == 0:
                cat = "Dead"
            elif sold == 0:
                cat = "Low"
            else:
                turnover = (on_hand / sold * 30) if sold > 0 else 999
                if turnover <= 30:
                    cat = "Fast"
                elif turnover <= 60:
                    cat = "Mid"
                elif turnover <= 90:
                    cat = "Slow"
                else:
                    cat = "Dead"

            reorder = sold * 1.5 if sold > 0 else 0
            if on_hand <= reorder:
                cat = "Reorder"

            _upsert("VE Stock Movement Summary", f"SM-{iname[:50]}", {
                "item_code":        iname[:140],
                "item_description": iname[:140],
                "period":           period,
                "movement_category": cat,
                "units_sold":       sold,
                "stock_on_hand":    on_hand,
                "turnover_days":    round((on_hand / sold * 30) if sold > 0 else 0, 1),
                "safety_level":     round(sold * 0.5, 2),
                "reorder_level":    round(reorder, 2),
                "suggested_po_qty": round(max(reorder - on_hand, 0), 2),
                "vendor":           stock_vendor.get(iname, "")[:140],
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
