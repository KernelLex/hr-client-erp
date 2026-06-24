"""
Tally XML import pipeline — callable as a Frappe background job or inline.
Parses All Masters + Transactions XMLs and populates:
  - tabVE Tally Ledger
  - tabVE Tally Stock Item
  - tabVE Tally Voucher
Also regenerates tally_snapshot.json for aggregate KPIs.
"""
import re
import os
import json
import time
from collections import defaultdict

import frappe
from frappe.utils import flt

_SNAPSHOT_PATH = os.path.join(os.path.dirname(__file__), "..", "tally_snapshot.json")
_STATUS_KEY = "tally_import_status"


def _set_status(status: str, progress: int, message: str):
    frappe.cache().set_value(_STATUS_KEY, json.dumps({
        "status": status,
        "progress": progress,
        "message": message,
        "ts": time.time(),
    }), expires_in_sec=3600)


def get_status():
    raw = frappe.cache().get_value(_STATUS_KEY)
    if not raw:
        return {"status": "idle", "progress": 0, "message": "No import running"}
    return json.loads(raw)


def run(masters_path: str, transactions_path: str):
    """Main import function. Call via frappe.enqueue or directly."""
    t0 = time.time()
    _set_status("running", 2, "Loading All Masters XML…")

    try:
        # ── Step 1: Parse All Masters ─────────────────────────────
        with open(masters_path, encoding="utf-16") as f:
            masters = f.read()

        group_parents = {}
        for block in re.finditer(r'<GROUP NAME="([^"]+)".*?</GROUP>', masters, re.DOTALL):
            gname = block.group(1).replace("&amp;", "&")
            gparent_m = re.search(r'<PARENT>([^<]*)</PARENT>', block.group(0))
            gparent = gparent_m.group(1).strip().replace("&amp;", "&") if gparent_m else ''
            group_parents[gname] = gparent

        ledger_data = {}
        for block in re.finditer(r'<LEDGER NAME="([^"]+)".*?</LEDGER>', masters, re.DOTALL):
            name = block.group(1).replace("&amp;", "&")
            parent_m = re.search(r'<PARENT>([^<]*)</PARENT>', block.group(0))
            parent = parent_m.group(1).strip().replace("&amp;", "&") if parent_m else ''
            ledger_data[name] = {
                "parent": parent,
                "is_debtor":   1 if 'Sundry Debtors' in parent else 0,
                "is_creditor": 1 if parent == 'Sundry Creditors' else 0,
                "is_bank":     1 if parent in ('Bank Accounts', 'Bank OD A/c') else 0,
                "is_cash":     1 if parent == 'Cash-in-Hand' else 0,
                "is_gst":      1 if any(kw in name.upper() for kw in ('CGST', 'SGST', 'IGST')) else 0,
                "is_tds":      1 if 'TDS' in name.upper() else 0,
            }

        stock_data = []
        seen_items = set()
        for block in re.finditer(r'<STOCKITEM NAME="([^"]+)".*?</STOCKITEM>', masters, re.DOTALL):
            name = block.group(1).replace("&amp;", "&")
            if name in seen_items:
                continue
            seen_items.add(name)
            parent_m = re.search(r'<PARENT>([^<]*)</PARENT>', block.group(0))
            hsn_m    = re.search(r'<HSNCODE>([^<]*)</HSNCODE>', block.group(0))
            rate_m   = re.search(r'<STANDARDCOST\.LIST>.*?<RATE>([^<]*)</RATE>', block.group(0), re.DOTALL)
            unit_m   = re.search(r'<BASEUNITS>([^<]*)</BASEUNITS>', block.group(0))
            stock_data.append({
                "item_name":    name[:140],
                "stock_group": (parent_m.group(1).strip().replace("&amp;", "&") if parent_m else '')[:140],
                "hsn_code":    (hsn_m.group(1).strip() if hsn_m else '')[:20],
                "unit":        (unit_m.group(1).strip() if unit_m else '')[:20],
                "standard_rate": float(rate_m.group(1).split('/')[0].strip()) if rate_m and rate_m.group(1).strip() else 0.0,
            })

        _set_status("running", 20, f"Masters loaded: {len(ledger_data)} ledgers, {len(stock_data)} SKUs. Parsing transactions…")

        # ── Step 2: Parse Transactions ────────────────────────────
        ledger_balances = defaultdict(float)
        monthly_sales   = defaultdict(float)
        monthly_purch   = defaultdict(float)
        monthly_receipt = defaultdict(float)
        vouchers = []
        CHUNK = 2 * 1024 * 1024
        buffer = ''
        VALID_TYPES = {'Sales','Purchase','Receipt','Payment','Journal','Contra',
                       'Debit Note','Credit Note','Stock Journal','PERFORMA INVOICE',
                       'Delivery Note','Purchase Order','Sales Order'}

        with open(transactions_path, encoding="utf-16") as f:
            while True:
                chunk = f.read(CHUNK)
                if not chunk:
                    break
                buffer += chunk
                while True:
                    vs = buffer.find('<VOUCHER ')
                    ve = buffer.find('</VOUCHER>')
                    if vs == -1 or ve == -1 or vs > ve:
                        break
                    vtext  = buffer[vs:ve+10]
                    buffer = buffer[ve+10:]

                    cancelled_m = re.search(r'<ISCANCELLED>([^<]+)</ISCANCELLED>', vtext)
                    deleted_m   = re.search(r'<ISDELETED>([^<]+)</ISDELETED>', vtext)
                    is_cancelled = bool(cancelled_m and cancelled_m.group(1).strip() == 'Yes')
                    is_deleted   = bool(deleted_m   and deleted_m.group(1).strip()   == 'Yes')

                    guid_m   = re.search(r'<GUID>([^<]+)</GUID>', vtext)
                    vtype_m  = re.search(r'<VOUCHERTYPENAME>([^<]+)</VOUCHERTYPENAME>', vtext)
                    date_m   = re.search(r'<DATE>(\d{8})</DATE>', vtext)
                    party_m  = re.search(r'<PARTYLEDGERNAME>([^<]*)</PARTYLEDGERNAME>', vtext)
                    vno_m    = re.search(r'<VOUCHERNUMBER>([^<]*)</VOUCHERNUMBER>', vtext)
                    narr_m   = re.search(r'<NARRATION>([^<]*)</NARRATION>', vtext)

                    guid       = guid_m.group(1).strip()[:100]  if guid_m  else ''
                    vtype      = vtype_m.group(1).strip()        if vtype_m else 'Other'
                    date_str   = date_m.group(1)                 if date_m  else ''
                    party      = party_m.group(1).strip().replace("&amp;", "&")[:140] if party_m else ''
                    vno        = vno_m.group(1).strip()[:50]     if vno_m   else ''
                    narr       = (narr_m.group(1).strip().replace("&amp;", "&")[:200] if narr_m else '')

                    if not date_str or not guid:
                        continue

                    voucher_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
                    month_key = date_str[:6]

                    debit_ledger = credit_ledger = ''
                    amount = 0.0

                    for pattern in (
                        r'<ALLLEDGERENTRIES\.LIST>(.*?)</ALLLEDGERENTRIES\.LIST>',
                        r'<LEDGERENTRIES\.LIST>(.*?)</LEDGERENTRIES\.LIST>',
                    ):
                        for le in re.finditer(pattern, vtext, re.DOTALL):
                            letext = le.group(1)
                            lname_m  = re.search(r'<LEDGERNAME>([^<]+)</LEDGERNAME>', letext)
                            amounts  = re.findall(r'<AMOUNT>([^<]+)</AMOUNT>', letext)
                            if not lname_m or not amounts:
                                continue
                            lname = lname_m.group(1).strip().replace("&amp;", "&")
                            amt   = float(amounts[-1])
                            if not is_cancelled and not is_deleted:
                                ledger_balances[lname] += amt
                            if amt > 0 and not debit_ledger:
                                debit_ledger = lname[:140]
                            elif amt < 0 and not credit_ledger:
                                credit_ledger = lname[:140]
                            if abs(amt) > abs(amount):
                                amount = abs(amt)

                    # Monthly aggregates via party ledger (LEDGERENTRIES.LIST for Sales/Purchase)
                    if not is_cancelled and not is_deleted and month_key:
                        for le in re.finditer(r'<LEDGERENTRIES\.LIST>(.*?)</LEDGERENTRIES\.LIST>', vtext, re.DOTALL):
                            letext   = le.group(1)
                            isparty  = re.search(r'<ISPARTYLEDGER>([^<]+)</ISPARTYLEDGER>', letext)
                            amounts  = re.findall(r'<AMOUNT>([^<]+)</AMOUNT>', letext)
                            if isparty and isparty.group(1).strip() == 'Yes' and amounts:
                                amt = float(amounts[0])
                                if vtype in ('Sales', 'PERFORMA INVOICE'):
                                    monthly_sales[month_key] += abs(amt)
                                elif vtype == 'Purchase':
                                    monthly_purch[month_key] += abs(amt)
                                break
                        # Receipts from ALLLEDGERENTRIES
                        if vtype == 'Receipt':
                            for le in re.finditer(r'<ALLLEDGERENTRIES\.LIST>(.*?)</ALLLEDGERENTRIES\.LIST>', vtext, re.DOTALL):
                                letext  = le.group(1)
                                isparty = re.search(r'<ISPARTYLEDGER>([^<]+)</ISPARTYLEDGER>', letext)
                                pg = ledger_data.get(
                                    re.search(r'<LEDGERNAME>([^<]+)</LEDGERNAME>', letext).group(1).strip()
                                    if re.search(r'<LEDGERNAME>([^<]+)</LEDGERNAME>', letext) else '', {}
                                ).get("is_bank", 0) or ledger_data.get(
                                    re.search(r'<LEDGERNAME>([^<]+)</LEDGERNAME>', letext).group(1).strip()
                                    if re.search(r'<LEDGERNAME>([^<]+)</LEDGERNAME>', letext) else '', {}
                                ).get("is_cash", 0)
                                amounts = re.findall(r'<AMOUNT>([^<]+)</AMOUNT>', letext)
                                if pg and amounts:
                                    monthly_receipt[month_key] += abs(float(amounts[-1]))
                                    break

                    vtype_norm = vtype if vtype in VALID_TYPES else 'Other'
                    vouchers.append({
                        'tally_guid':    guid,
                        'voucher_type':  vtype_norm,
                        'voucher_number': vno,
                        'voucher_date':  voucher_date,
                        'party_name':    party,
                        'amount':        round(amount, 2),
                        'narration':     narr,
                        'debit_ledger':  debit_ledger,
                        'credit_ledger': credit_ledger,
                        'is_cancelled':  1 if is_cancelled or is_deleted else 0,
                    })

        _set_status("running", 60, f"Transactions parsed: {len(vouchers)} vouchers. Writing to database…")

        # ── Step 3: Compute snapshot aggregates ───────────────────
        cash_total   = sum(v for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_cash'))
        bank_total   = sum(v for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_bank'))
        debtor_total = sum(v for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_debtor') and v > 0)
        cred_total   = sum(abs(v) for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_creditor') and v < 0)
        gst_out      = sum(abs(v) for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_gst') and v < 0)
        gst_in       = sum(v for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_gst') and v > 0)
        tds_pay      = sum(abs(v) for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_tds') and v < 0)

        fy_sales  = sum(v for m, v in monthly_sales.items()   if m >= '202504')
        fy_purch  = sum(v for m, v in monthly_purch.items()   if m >= '202504')
        fy_coll   = sum(v for m, v in monthly_receipt.items() if m >= '202504')

        top_debtors   = {k: round(v, 2) for k, v in sorted(
            ((k, v) for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_debtor') and v > 0),
            key=lambda x: -x[1])[:50]}
        top_creditors = {k: round(abs(v), 2) for k, v in sorted(
            ((k, v) for k, v in ledger_balances.items() if ledger_data.get(k, {}).get('is_creditor') and v < 0),
            key=lambda x: x[1])[:50]}

        snapshot = {
            "cash_in_hand":       round(cash_total, 2),
            "bank_balance":       round(bank_total, 2),
            "total_cash_bank":    round(cash_total + bank_total, 2),
            "sundry_debtors":     round(debtor_total, 2),
            "sundry_creditors":   round(cred_total, 2),
            "gst_payable":        round(gst_out, 2),
            "input_gst_credit":   round(gst_in, 2),
            "tds_payable":        round(tds_pay, 2),
            "fy_sales":           round(fy_sales, 2),
            "fy_purchases":       round(fy_purch, 2),
            "fy_collections":     round(fy_coll, 2),
            "total_sales_alltime": round(sum(monthly_sales.values()), 2),
            "stock_item_count":   len(stock_data),
            "voucher_count":      len(vouchers),
            "top_debtors":        top_debtors,
            "top_creditors":      top_creditors,
            "monthly_sales":      {k: round(v, 2) for k, v in sorted(monthly_sales.items())[-12:]},
            "monthly_purchases":  {k: round(v, 2) for k, v in sorted(monthly_purch.items())[-12:]},
            "monthly_collections":{k: round(v, 2) for k, v in sorted(monthly_receipt.items())[-12:]},
            "cash_ledgers": {k: round(ledger_balances.get(k, 0), 2)
                             for k, d in ledger_data.items() if d['is_cash']},
            "bank_ledgers":  {k: round(ledger_balances.get(k, 0), 2)
                              for k, d in ledger_data.items() if d['is_bank']},
            "date_range": ["", ""],
        }

        # Save snapshot
        with open(_SNAPSHOT_PATH, "w") as f:
            json.dump(snapshot, f, indent=2)

        # ── Step 4: Bulk insert to Frappe DB ──────────────────────
        NOW   = frappe.utils.now()
        OWNER = "Administrator"
        BATCH = 500

        frappe.db.sql("DELETE FROM `tabVE Tally Ledger`")
        frappe.db.sql("DELETE FROM `tabVE Tally Stock Item`")
        frappe.db.sql("DELETE FROM `tabVE Tally Voucher`")
        frappe.db.commit()

        # Ledgers
        ledger_rows = []
        for name, d in ledger_data.items():
            closing = round(ledger_balances.get(name, 0.0), 2)
            ledger_rows.append((
                name[:140], name[:140], d['parent'][:140], '',
                0.0, closing,
                d['is_debtor'], d['is_creditor'], d['is_bank'], d['is_cash'], d['is_gst'], d['is_tds'],
                NOW, NOW, OWNER, OWNER, 1, 0,
            ))
        for i in range(0, len(ledger_rows), BATCH):
            batch = ledger_rows[i:i+BATCH]
            ph = ','.join(['(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'] * len(batch))
            frappe.db.sql(f"INSERT INTO `tabVE Tally Ledger` (name,ledger_name,parent_group,root_group,opening_balance,closing_balance,is_debtors,is_creditors,is_bank,is_cash,is_gst,is_tds,creation,modified,owner,modified_by,docstatus,idx) VALUES {ph}", [x for row in batch for x in row])
        frappe.db.commit()

        # Stock items
        stock_rows = [(d['item_name'], d['item_name'], d['stock_group'], d['hsn_code'],
                       0.0, d['unit'], d['standard_rate'], NOW, NOW, OWNER, OWNER, 1, 0)
                      for d in stock_data]
        for i in range(0, len(stock_rows), BATCH):
            batch = stock_rows[i:i+BATCH]
            ph = ','.join(['(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'] * len(batch))
            frappe.db.sql(f"INSERT INTO `tabVE Tally Stock Item` (name,item_name,stock_group,hsn_code,gst_rate,unit,standard_rate,creation,modified,owner,modified_by,docstatus,idx) VALUES {ph}", [x for row in batch for x in row])
        frappe.db.commit()

        _set_status("running", 80, f"Ledgers + stock items saved. Inserting {len(vouchers)} vouchers…")

        # Vouchers
        seen_guids = set()
        v_rows = []
        counter = 1
        for v in vouchers:
            if v['tally_guid'] in seen_guids:
                continue
            seen_guids.add(v['tally_guid'])
            v_rows.append((
                f"VTV-{counter:05d}", v['tally_guid'], v['voucher_type'], v['voucher_number'],
                v['voucher_date'], v['party_name'], v['amount'], v['narration'],
                v['debit_ledger'], v['credit_ledger'], v['is_cancelled'],
                NOW, NOW, OWNER, OWNER, 1, 0,
            ))
            counter += 1

        VBATCH = 1000
        for i in range(0, len(v_rows), VBATCH):
            batch = v_rows[i:i+VBATCH]
            ph = ','.join(['(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'] * len(batch))
            frappe.db.sql(f"INSERT INTO `tabVE Tally Voucher` (name,tally_guid,voucher_type,voucher_number,voucher_date,party_name,amount,narration,debit_ledger,credit_ledger,is_cancelled,creation,modified,owner,modified_by,docstatus,idx) VALUES {ph}", [x for row in batch for x in row])
        frappe.db.commit()

        elapsed = round(time.time() - t0, 1)
        _set_status("done", 100, f"Import complete in {elapsed}s — {len(ledger_data):,} ledgers, {len(stock_data):,} SKUs, {len(v_rows):,} vouchers.")

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Tally Import Error")
        _set_status("error", 0, f"Import failed: {str(e)[:300]}")
        raise
