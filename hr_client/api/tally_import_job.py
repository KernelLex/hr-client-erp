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


def _has_ancestor(group: str, target: str, group_parents: dict, max_depth: int = 15) -> bool:
    """Return True if `target` is `group` itself or any ancestor up to max_depth levels."""
    current = group
    for _ in range(max_depth):
        if not current:
            break
        if current == target:
            return True
        current = group_parents.get(current, "")
    return False


# Tally's fixed set of primary (parentless) groups, mapped to accounting root type.
# Every custom group ultimately descends from one of these — used to classify any
# ledger/group as Asset/Liability/Equity/Income/Expense for the Chart of Accounts
# and Financial Statements, since Tally itself doesn't export a root-type field.
PRIMARY_GROUP_ROOT_MAP = {
    "Branch / Divisions":       "Asset",
    "Capital Account":          "Equity",
    "Current Assets":           "Asset",
    "Current Liabilities":      "Liability",
    "Direct Expenses":          "Expense",
    "Direct Expense":           "Expense",
    "Direct Incomes":           "Income",
    "Direct Income":            "Income",
    "Fixed Assets":             "Asset",
    "Indirect Expenses":        "Expense",
    "Indirect Expense":         "Expense",
    "Indirect Incomes":         "Income",
    "Indirect Income":          "Income",
    "Investments":              "Asset",
    "Loans (Liability)":        "Liability",
    "Misc. Expenses (Asset)":   "Asset",
    "Misc. Expenses (ASSET)":   "Asset",
    "Purchase Accounts":        "Expense",
    "Sales Accounts":           "Income",
    "Suspense A/c":             "Asset",
}


def _root_type_for_group(group: str, group_parents: dict, max_depth: int = 20) -> str:
    """Walk `group` up to its ultimate primary group and return the mapped root type.
    Returns '' if the chain doesn't resolve (e.g. a renamed/custom primary group)."""
    current = group
    for _ in range(max_depth):
        if not current:
            return ""
        if current in PRIMARY_GROUP_ROOT_MAP:
            return PRIMARY_GROUP_ROOT_MAP[current]
        current = group_parents.get(current, "")
    return ""


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

        # Snapshot the full Group hierarchy (name/parent/root type) for persistence —
        # needed so the Chart of Accounts / Financial Statements can rebuild a real
        # nested tree instead of only having flat ledger rows. group_parents itself
        # is otherwise discarded at the end of this function.
        group_data = {
            gname: {
                "parent_group": gparent,
                "root_group":   _root_type_for_group(gname, group_parents),
                "is_primary":   1 if not gparent else 0,
            }
            for gname, gparent in group_parents.items()
        }

        def _clean(s):
            return s.strip().replace("&amp;", "&").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">")

        ledger_data = {}
        for block in re.finditer(r'<LEDGER NAME="([^"]+)".*?</LEDGER>', masters, re.DOTALL):
            raw_name = block.group(1).replace("&amp;", "&")
            btext    = block.group(0)
            parent_m = re.search(r'<PARENT>([^<]*)</PARENT>', btext)
            parent   = _clean(parent_m.group(1)) if parent_m else ''

            # Mailing name + address from LEDMAILINGDETAILS.LIST (use last/most-recent entry)
            mailing_name = raw_name
            address = ''
            state   = ''
            pincode = ''
            for md in re.finditer(r'<LEDMAILINGDETAILS\.LIST>(.*?)</LEDMAILINGDETAILS\.LIST>', btext, re.DOTALL):
                mdtext = md.group(1)
                mn_m = re.search(r'<MAILINGNAME>([^<]*)</MAILINGNAME>', mdtext)
                if mn_m and mn_m.group(1).strip():
                    mailing_name = _clean(mn_m.group(1))
                # Address is multi-line: collect all <ADDRESS> elements
                addr_lines = [_clean(a.group(1)) for a in re.finditer(r'<ADDRESS>([^<]+)</ADDRESS>', mdtext) if a.group(1).strip()]
                if addr_lines:
                    address = ', '.join(addr_lines)
                st_m  = re.search(r'<STATE>([^<]*)</STATE>', mdtext)
                pin_m = re.search(r'<PINCODE>([^<]*)</PINCODE>', mdtext)
                if st_m  and st_m.group(1).strip():  state   = _clean(st_m.group(1))
                if pin_m and pin_m.group(1).strip():  pincode = _clean(pin_m.group(1))

            # GSTIN — from LEDGSTREGDETAILS.LIST (take last/most-recent entry)
            gstin = ''
            partygstin_m = re.search(r'<PARTYGSTIN>([^<]*)</PARTYGSTIN>', btext)
            if partygstin_m and partygstin_m.group(1).strip():
                gstin = _clean(partygstin_m.group(1))
            for gd in re.finditer(r'<LEDGSTREGDETAILS\.LIST>(.*?)</LEDGSTREGDETAILS\.LIST>', btext, re.DOTALL):
                g_m = re.search(r'<GSTIN>([^<]*)</GSTIN>', gd.group(1))
                if g_m and g_m.group(1).strip():
                    gstin = _clean(g_m.group(1))

            # Phone — from CONTACTDETAILS.LIST or direct LEDGERMOBILE scalar
            phone = ''
            mobile_m = re.search(r'<LEDGERMOBILE>([^<]*)</LEDGERMOBILE>', btext)
            if mobile_m and mobile_m.group(1).strip():
                phone = _clean(mobile_m.group(1))
            for cd in re.finditer(r'<CONTACTDETAILS\.LIST>(.*?)</CONTACTDETAILS\.LIST>', btext, re.DOTALL):
                ph_m = re.search(r'<PHONENUMBER>([^<]*)</PHONENUMBER>', cd.group(1))
                if ph_m and ph_m.group(1).strip():
                    phone = _clean(ph_m.group(1)); break

            # PAN
            pan_m = re.search(r'<INCOMETAXNUMBER>([^<]*)</INCOMETAXNUMBER>', btext)
            pan   = _clean(pan_m.group(1)) if pan_m and pan_m.group(1).strip() else ''

            # GST registration type
            grtype_m = re.search(r'<GSTREGISTRATIONTYPE>([^<]*)</GSTREGISTRATIONTYPE>', btext)
            grt = _clean(grtype_m.group(1)) if grtype_m and grtype_m.group(1).strip() else ''

            # State fallback from PRIORSTATENAME
            if not state:
                psn_m = re.search(r'<PRIORSTATENAME>([^<]*)</PRIORSTATENAME>', btext)
                if psn_m and psn_m.group(1).strip():
                    state = _clean(psn_m.group(1))

            ledger_data[raw_name] = {
                "parent":              parent,
                "mailing_name":        mailing_name[:200],
                "address":             address[:500],
                "state":               state[:100],
                "pincode":             pincode[:20],
                "gstin":               gstin[:20],
                "pan_number":          pan[:20],
                "gst_registration_type": grt[:50],
                "phone":               phone[:30],
                # Walk full group hierarchy — catches ledgers in sub-groups of Sundry Debtors/Creditors
                "is_debtor":   1 if _has_ancestor(parent, 'Sundry Debtors', group_parents) else 0,
                "is_creditor": 1 if (
                    _has_ancestor(parent, 'Sundry Creditors', group_parents) or
                    _has_ancestor(parent, 'Creditor For Expenses', group_parents)
                ) else 0,
                "is_bank":     1 if parent in ('Bank Accounts', 'Bank OD A/c') else 0,
                "is_cash":     1 if parent == 'Cash-in-Hand' else 0,
                "is_gst":      1 if any(kw in raw_name.upper() for kw in ('CGST', 'SGST', 'IGST')) else 0,
                "is_tds":      1 if 'TDS' in raw_name.upper() else 0,
                "root_group":  _root_type_for_group(parent, group_parents),
            }

        stock_data = []
        seen_items = set()
        for block in re.finditer(r'<STOCKITEM NAME="([^"]+)".*?</STOCKITEM>', masters, re.DOTALL):
            name = block.group(1).replace("&amp;", "&")
            if name in seen_items:
                continue
            seen_items.add(name)
            btext    = block.group(0)
            parent_m = re.search(r'<PARENT>([^<]*)</PARENT>', btext)
            unit_m   = re.search(r'<BASEUNITS>([^<]*)</BASEUNITS>', btext)

            # HSN code: stored inside HSNDETAILS.LIST as HSNCLASSIFICATIONNAME like "83024900 Gst @ 18%"
            # Also check GSTDETAILS.LIST HSNMASTERNAME as fallback
            hsn_code = ''
            rate_pct = 0.0
            for hd in re.finditer(r'<HSNDETAILS\.LIST>(.*?)</HSNDETAILS\.LIST>', btext, re.DOTALL):
                hcn_m = re.search(r'<HSNCLASSIFICATIONNAME>([^<]*)</HSNCLASSIFICATIONNAME>', hd.group(1))
                if hcn_m and hcn_m.group(1).strip():
                    raw_hsn = hcn_m.group(1).strip()
                    parts = raw_hsn.split()
                    if parts and re.match(r'^\d{4,8}$', parts[0]):
                        hsn_code = parts[0]; break
            if not hsn_code:
                for gd in re.finditer(r'<GSTDETAILS\.LIST>(.*?)</GSTDETAILS\.LIST>', btext, re.DOTALL):
                    hmn_m = re.search(r'<HSNMASTERNAME>([^<]*)</HSNMASTERNAME>', gd.group(1))
                    if hmn_m and hmn_m.group(1).strip():
                        raw_hsn = hmn_m.group(1).strip()
                        parts = raw_hsn.split()
                        if parts and re.match(r'^\d{4,8}$', parts[0]):
                            hsn_code = parts[0]; break

            # GST rate: from GSTDETAILS.LIST → STATEWISEDETAILS.LIST → RATEDETAILS.LIST (CGST rate × 2)
            for gd in re.finditer(r'<GSTDETAILS\.LIST>(.*?)</GSTDETAILS\.LIST>', btext, re.DOTALL):
                for rd in re.finditer(r'<RATEDETAILS\.LIST>(.*?)</RATEDETAILS\.LIST>', gd.group(1), re.DOTALL):
                    rdtext = rd.group(1)
                    duty_m = re.search(r'<GSTRATEDUTYHEAD>([^<]*)</GSTRATEDUTYHEAD>', rdtext)
                    rate_m = re.search(r'<GSTRATE>\s*([0-9.]+)</GSTRATE>', rdtext)
                    if duty_m and rate_m and 'CGST' in duty_m.group(1).upper():
                        try:
                            rate_pct = float(rate_m.group(1)) * 2  # CGST + SGST
                            break
                        except ValueError:
                            pass
                if rate_pct:
                    break

            # Standard rate: from STANDARDPRICE.LIST → RATE (selling price), fallback STANDARDCOST
            std_rate = 0.0
            for sp in re.finditer(r'<STANDARDPRICE\.LIST>(.*?)</STANDARDPRICE\.LIST>', btext, re.DOTALL):
                rm = re.search(r'<RATE>([^<]+)</RATE>', sp.group(1))
                if rm and rm.group(1).strip():
                    try: std_rate = abs(float(rm.group(1).split('/')[0].strip())); break
                    except ValueError: pass
            if not std_rate:
                for sc in re.finditer(r'<STANDARDCOST\.LIST>(.*?)</STANDARDCOST\.LIST>', btext, re.DOTALL):
                    rm = re.search(r'<RATE>([^<]+)</RATE>', sc.group(1))
                    if rm and rm.group(1).strip():
                        try: std_rate = abs(float(rm.group(1).split('/')[0].strip())); break
                        except ValueError: pass

            stock_data.append({
                "item_name":    name[:140],
                "stock_group": (_clean(parent_m.group(1)) if parent_m else '')[:140],
                "hsn_code":    hsn_code[:20],
                "gst_rate":    rate_pct,
                "unit":        (_clean(unit_m.group(1)) if unit_m else '')[:20],
                "standard_rate": std_rate,
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
                    party_ledger_amount = 0.0  # party-facing amount (more accurate for financial totals)
                    all_ledger_list = []

                    for pattern in (
                        r'<ALLLEDGERENTRIES\.LIST>(.*?)</ALLLEDGERENTRIES\.LIST>',
                        r'<LEDGERENTRIES\.LIST>(.*?)</LEDGERENTRIES\.LIST>',
                    ):
                        for le in re.finditer(pattern, vtext, re.DOTALL):
                            letext = le.group(1)
                            lname_m   = re.search(r'<LEDGERNAME>([^<]+)</LEDGERNAME>', letext)
                            amounts   = re.findall(r'<AMOUNT>([^<]+)</AMOUNT>', letext)
                            isparty_m = re.search(r'<ISPARTYLEDGER>([^<]+)</ISPARTYLEDGER>', letext)
                            if not lname_m or not amounts:
                                continue
                            lname = lname_m.group(1).strip().replace("&amp;", "&")
                            # Use first <AMOUNT> (main entry).  amounts[-1] was used historically
                            # but picks up nested sub-entry amounts (TAXOBJECTALLOCATIONS etc.)
                            # that are 10x the actual invoice amount for Purchase creditor entries.
                            amt   = float(amounts[0])
                            if not is_cancelled and not is_deleted:
                                ledger_balances[lname] += -amt
                            if amt > 0 and not debit_ledger:
                                debit_ledger = lname[:140]
                            elif amt < 0 and not credit_ledger:
                                credit_ledger = lname[:140]
                            if abs(amt) > abs(amount):
                                amount = abs(amt)
                            # Capture party-ledger amount for transactional vouchers
                            if isparty_m and isparty_m.group(1).strip() == 'Yes' \
                               and party_ledger_amount == 0 and amounts:
                                party_ledger_amount = abs(float(amounts[0]))
                            # Tally sign: amt > 0 = Credit, amt < 0 = Debit
                            all_ledger_list.append({
                                "ledger": lname[:140],
                                "amount": round(abs(amt), 2),
                                "is_dr": amt < 0,
                                "is_party": bool(isparty_m and isparty_m.group(1).strip() == 'Yes'),
                            })

                    # Extract inventory line items
                    inv_list = []
                    for inv in re.finditer(r'<ALLINVENTORYENTRIES\.LIST>(.*?)</ALLINVENTORYENTRIES\.LIST>', vtext, re.DOTALL):
                        itext = inv.group(1)
                        iname_m = re.search(r'<STOCKITEMNAME>([^<]+)</STOCKITEMNAME>', itext)
                        if not iname_m:
                            continue
                        rate_m  = re.search(r'<RATE>([^<]+)</RATE>', itext)
                        disc_m  = re.search(r'<DISCOUNT>([^<]*)</DISCOUNT>', itext)
                        amt_m   = re.search(r'<AMOUNT>([^<]+)</AMOUNT>', itext)
                        qty_m   = re.search(r'<BILLEDQTY>([^<]+)</BILLEDQTY>', itext)
                        hsn_m   = re.search(r'<GSTHSNNAME>([^<]*)</GSTHSNNAME>', itext)
                        # Parse rate "126900.00/PCS" → (126900.0, "PCS")
                        rate_val, rate_unit = 0.0, ""
                        if rate_m:
                            rp = rate_m.group(1).strip().split("/")
                            try: rate_val = abs(float(rp[0].strip()))
                            except: pass
                            if len(rp) > 1: rate_unit = rp[1].strip()
                        # Parse qty " 1.00 PCS" → (1.0, "PCS")
                        qty_val, qty_unit = 0.0, ""
                        if qty_m:
                            qp = qty_m.group(1).strip().split()
                            try: qty_val = abs(float(qp[0]))
                            except: pass
                            if len(qp) > 1: qty_unit = qp[1]
                        inv_list.append({
                            "name": iname_m.group(1).strip().replace("&amp;", "&")[:200],
                            "hsn": (hsn_m.group(1).strip() if hsn_m else ""),
                            "rate": rate_val,
                            "rate_unit": rate_unit,
                            "discount": float(disc_m.group(1).strip()) if disc_m and disc_m.group(1).strip() else 0.0,
                            "amount": round(abs(float(amt_m.group(1))), 2) if amt_m else 0.0,
                            "qty": qty_val,
                            "qty_unit": qty_unit,
                        })

                    # Use party-ledger amount when available — it matches Tally's own AR/AP figures
                    # and eliminates the systematic discrepancy caused by using max-ledger-line amount
                    _PARTY_AMOUNT_TYPES = {
                        'Sales', 'PERFORMA INVOICE', 'Sales Order',
                        'Purchase', 'Purchase Order',
                        'Credit Note', 'Debit Note',
                        'Receipt', 'Payment', 'Delivery Note',
                    }
                    if party_ledger_amount > 0 and vtype in _PARTY_AMOUNT_TYPES:
                        amount = party_ledger_amount

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
                        'tally_guid':         guid,
                        'voucher_type':        vtype_norm,
                        'voucher_number':      vno,
                        'voucher_date':        voucher_date,
                        'party_name':          party,
                        'amount':              round(amount, 2),
                        'narration':           narr,
                        'debit_ledger':        debit_ledger,
                        'credit_ledger':       credit_ledger,
                        'is_cancelled':        1 if is_cancelled or is_deleted else 0,
                        'all_ledger_entries':  json.dumps(all_ledger_list, ensure_ascii=False),
                        'inventory_entries':   json.dumps(inv_list, ensure_ascii=False),
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

        # Compute current FY month bounds (format YYYYMM)
        import datetime as _dt
        _today = _dt.date.today()
        _fy_yr = _today.year if _today.month >= 4 else _today.year - 1
        _fy_start = f"{_fy_yr}04"
        _fy_end   = f"{_fy_yr + 1}03"
        fy_sales  = sum(v for m, v in monthly_sales.items()   if _fy_start <= m <= _fy_end)
        fy_purch  = sum(v for m, v in monthly_purch.items()   if _fy_start <= m <= _fy_end)
        fy_coll   = sum(v for m, v in monthly_receipt.items() if _fy_start <= m <= _fy_end)

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

        frappe.db.sql("DELETE FROM `tabVE Tally Group`")
        frappe.db.sql("DELETE FROM `tabVE Tally Ledger`")
        frappe.db.sql("DELETE FROM `tabVE Tally Stock Item`")
        frappe.db.sql("DELETE FROM `tabVE Tally Voucher`")
        frappe.db.commit()

        # Groups (full hierarchy — needed to render a real nested Chart of Accounts)
        group_rows = [
            (
                gname[:140], gname[:140],
                d["parent_group"][:140], d["root_group"][:20], d["is_primary"],
                NOW, NOW, OWNER, OWNER, 1, 0,
            )
            for gname, d in group_data.items()
        ]
        for i in range(0, len(group_rows), BATCH):
            batch = group_rows[i:i+BATCH]
            ph = ','.join(['(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'] * len(batch))
            frappe.db.sql(
                f"INSERT INTO `tabVE Tally Group` "
                f"(name,group_name,parent_group,root_group,is_primary,"
                f"creation,modified,owner,modified_by,docstatus,idx) VALUES {ph}",
                [x for row in batch for x in row]
            )
        frappe.db.commit()

        # Ledgers (with enriched party data)
        ledger_rows = []
        for name, d in ledger_data.items():
            closing = round(ledger_balances.get(name, 0.0), 2)
            ledger_rows.append((
                name[:140], name[:140],
                d.get('mailing_name', name)[:200],
                d['parent'][:140], d.get('root_group', '')[:20],
                0.0, closing,
                d['is_debtor'], d['is_creditor'], d['is_bank'], d['is_cash'], d['is_gst'], d['is_tds'],
                d.get('gstin', '')[:20],
                d.get('pan_number', '')[:20],
                d.get('gst_registration_type', '')[:50],
                d.get('state', '')[:100],
                d.get('pincode', '')[:20],
                d.get('phone', '')[:30],
                d.get('address', '')[:500],
                NOW, NOW, OWNER, OWNER, 1, 0,
            ))
        for i in range(0, len(ledger_rows), BATCH):
            batch = ledger_rows[i:i+BATCH]
            ph = ','.join(['(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'] * len(batch))
            frappe.db.sql(
                f"INSERT INTO `tabVE Tally Ledger` "
                f"(name,ledger_name,mailing_name,parent_group,root_group,opening_balance,closing_balance,"
                f"is_debtors,is_creditors,is_bank,is_cash,is_gst,is_tds,"
                f"gstin,pan_number,gst_registration_type,state,pincode,phone,address,"
                f"creation,modified,owner,modified_by,docstatus,idx) VALUES {ph}",
                [x for row in batch for x in row]
            )
        frappe.db.commit()

        # Stock items (with fixed HSN + GST rate)
        stock_rows = [(d['item_name'], d['item_name'], d['stock_group'], d['hsn_code'],
                       d.get('gst_rate', 0.0), d['unit'], d['standard_rate'],
                       NOW, NOW, OWNER, OWNER, 1, 0)
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
                v.get('all_ledger_entries', '[]'), v.get('inventory_entries', '[]'),
                NOW, NOW, OWNER, OWNER, 1, 0,
            ))
            counter += 1

        VBATCH = 500
        for i in range(0, len(v_rows), VBATCH):
            batch = v_rows[i:i+VBATCH]
            ph = ','.join(['(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'] * len(batch))
            frappe.db.sql(f"INSERT INTO `tabVE Tally Voucher` (name,tally_guid,voucher_type,voucher_number,voucher_date,party_name,amount,narration,debit_ledger,credit_ledger,is_cancelled,all_ledger_entries,inventory_entries,creation,modified,owner,modified_by,docstatus,idx) VALUES {ph}", [x for row in batch for x in row])
        frappe.db.commit()

        # Remove enrichments whose voucher no longer exists (cancelled/deleted in Tally)
        frappe.db.sql("""
            DELETE e FROM `tabVE Tally Enrichment` e
            LEFT JOIN `tabVE Tally Voucher` v ON v.tally_guid = e.name
            WHERE v.name IS NULL
        """)
        frappe.db.commit()

        elapsed = round(time.time() - t0, 1)
        _set_status("done", 100, f"Import complete in {elapsed}s — {len(ledger_data):,} ledgers, {len(stock_data):,} SKUs, {len(v_rows):,} vouchers.")
        # NOTE: Stage 2 (accounts_tally_import.run) is intentionally NOT chained here.
        # tally_transformer.run() calls it explicitly as Stage 2, so chaining here caused
        # accounts_tally_import.run() to execute twice per import cycle.

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Tally Import Error")
        _set_status("error", 0, f"Import failed: {str(e)[:300]}")
        raise
