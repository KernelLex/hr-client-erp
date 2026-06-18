"""
Filename parser for Vera Enterprises Drive.

Supports two formats:
  Old convention (VE naming standard):
    Outgoing: YYYYMMDD_DocName_VE_ClientName.ext
    Incoming: YYYYMMDD_DocName_SenderName_VE.ext
    Internal: YYYYMMDD_DocName_VE.ext

  New convention (real business files):
    TypeLabel_YYYY.MM.DD_Vera Enterprises_PartyName.ext
    e.g. "Tax Invoice_2026.06.03_Vera Enterprises_Schones Leben.pdf"
"""
import re
from datetime import datetime

# Canonical DocType identifiers (case-insensitive match for old convention)
_DOC_TYPE_MAP = {
    "quotation": "Quotation",
    "salesorder": "SalesOrder",
    "salesinvoice": "SalesInvoice",
    "taxinvoice": "SalesInvoice",
    "deliverynote": "DeliveryNote",
    "receipt": "Receipt",
    "receiptvoucher": "Receipt",
    "purchaseorder": "PurchaseOrder",
    "purchaseinvoice": "PurchaseInvoice",
    "grn": "GRN",
    "deliverycert": "DeliveryCert",
    "payment": "Payment",
    "paymentvoucher": "Payment",
    "ledger": "Ledger",
    "trialbalance": "TrialBalance",
    "profitloss": "ProfitLoss",
    "balancesheet": "BalanceSheet",
    "bankrecon": "BankRecon",
    "salaryslip": "SalarySlip",
    "attendance": "Attendance",
    "payrollsummary": "PayrollSummary",
    "transportdoc": "TransportDoc",
    "packinglist": "PackingList",
    "creditnote": "CreditNote",
    "debitnote": "DebitNote",
    "performainvoice": "Quotation",
    "performa": "Quotation",
    "invoice": "PurchaseInvoice",
    "debitnote": "DebitNote",
    "saleorder": "SalesOrder",
    "salesorder": "SalesOrder",
}

_INTERNAL_DOC_TYPES = {
    "Ledger", "TrialBalance", "ProfitLoss", "BalanceSheet", "BankRecon",
    "SalarySlip", "Attendance", "PayrollSummary", "Payment", "Receipt",
}

# ── New Drive folder structure ──────────────────────────────────────────────
# Root: "Vera doc" → main_file/ → Category/ → Year/ → [Month/] → files
# Paths built relative to root: "main_file/Sale Invoice/Sale Invoice 2026-2027/Sale Invoice June 2026"
# Second segment (index 1, after "main_file") is the category folder.
# Sale Invoice has an extra month-level depth; all other categories are 2-level (Year → files).
# 9 categories: Sale Invoice, Sale Order, Performa Invoice, Credit Note (Sales)
#               Purchase Invoice, Purchase Order, Debit Note (Purchase)
#               Receipt Voucher, Payment Voucher (Accounts)

_FOLDER_TO_MODULE = {
    "Sale Invoice":      "Sales",
    "Sale Order":        "Sales",
    "Performa Invoice":  "Sales",
    "Credit Note":       "Sales",
    "Purchase Invoice":  "Purchase",
    "Purchase Order":    "Purchase",
    "Debit Note":        "Purchase",
    "Receipt Voucher":   "Accounts",
    "Payment Voucher":   "Accounts",
}

_FOLDER_TO_DOC_TYPE = {
    "Sale Invoice":      "SalesInvoice",
    "Sale Order":        "SalesOrder",
    "Performa Invoice":  "Quotation",
    "Credit Note":       "CreditNote",
    "Purchase Invoice":  "PurchaseInvoice",
    "Purchase Order":    "PurchaseOrder",
    "Debit Note":        "DebitNote",
    "Receipt Voucher":   "Receipt",
    "Payment Voucher":   "Payment",
}

_FOLDER_TO_DIRECTION = {
    "Sale Invoice":      "Outgoing",
    "Sale Order":        "Outgoing",
    "Performa Invoice":  "Outgoing",
    "Credit Note":       "Outgoing",
    "Purchase Invoice":  "Incoming",
    "Purchase Order":    "Outgoing",
    "Debit Note":        "Outgoing",
    "Receipt Voucher":   "Internal",
    "Payment Voucher":   "Internal",
}

# ── Old Drive folder structure ──────────────────────────────────────────────
_OLD_FOLDER_TO_MODULE = {
    "01_Sales":      "Sales",
    "02_Purchase":   "Purchase",
    "03_Accounts":   "Accounts",
    "04_HR_Payroll": "HR_Payroll",
    "05_Logistics":  "Logistics",
}

# Detect new date format: YYYY.MM.DD
_NEW_DATE_RE = re.compile(r"^(\d{4})\.(\d{2})\.(\d{2})$")


def folder_path_to_module(folder_path: str) -> str:
    """Derive module from folder_path. Handles both old and new Drive structures."""
    if not folder_path:
        return "Unknown"
    parts = [p.strip() for p in folder_path.split("/")]
    # New: "main_file /Sale Invoice/..."
    if parts[0].lower().startswith("main_file") and len(parts) > 1:
        return _FOLDER_TO_MODULE.get(parts[1], "Unknown")
    # Old: "01_Sales/..."
    return _OLD_FOLDER_TO_MODULE.get(parts[0], "Unknown")


def folder_path_to_doc_type(folder_path: str) -> str | None:
    """Derive canonical DocType from folder_path (new Drive structure only)."""
    if not folder_path:
        return None
    parts = [p.strip() for p in folder_path.split("/")]
    if parts[0].lower().startswith("main_file") and len(parts) > 1:
        return _FOLDER_TO_DOC_TYPE.get(parts[1])
    return None


def folder_path_to_direction(folder_path: str) -> str | None:
    """Derive direction from folder_path (new Drive structure only)."""
    if not folder_path:
        return None
    parts = [p.strip() for p in folder_path.split("/")]
    if parts[0].lower().startswith("main_file") and len(parts) > 1:
        return _FOLDER_TO_DIRECTION.get(parts[1])
    return None


def parse_filename(name: str) -> dict:
    """
    Parse a Drive filename. Returns dict with keys:
      date, doc_type, party, direction, module, naming_valid
    """
    result = {
        "date": None,
        "doc_type": None,
        "party": None,
        "direction": "Unknown",
        "module": "Unknown",
        "naming_valid": False,
    }

    stem = name.rsplit(".", 1)[0] if "." in name else name
    parts = stem.split("_")

    if len(parts) < 2:
        return result

    # ── Try new format: TypeLabel_YYYY.MM.DD_Vera Enterprises_PartyName ────
    if len(parts) >= 2:
        date_m = _NEW_DATE_RE.match(parts[1].strip())
        if date_m:
            try:
                parsed_date = datetime(
                    int(date_m.group(1)),
                    int(date_m.group(2)),
                    int(date_m.group(3)),
                ).date()
                result["date"] = str(parsed_date)
            except ValueError:
                pass

            # Doc type from the first token (type label)
            type_label = parts[0].strip()
            doc_type = _normalize_doc_type(type_label)
            result["doc_type"] = doc_type

            # Party name: parts[3:], joined, strip trailing sequence numbers like "_2"
            if len(parts) >= 4:
                party_raw = "_".join(parts[3:]).strip()
                # Strip trailing " 2", " 3" etc. (sequence duplicates)
                party_raw = re.sub(r"\s+\d+$", "", party_raw).strip()
                result["party"] = party_raw or None

            # Direction: since Vera Enterprises is sender, these are Outgoing
            # (overridden by folder_path_to_direction later in _upsert_file)
            result["direction"] = "Outgoing"
            result["naming_valid"] = result["date"] is not None

            return result

    # ── Try old VE convention: YYYYMMDD_DocType_VE_ClientName ────────────────
    try:
        parsed_date = datetime.strptime(parts[0], "%Y%m%d").date()
        result["date"] = str(parsed_date)
    except ValueError:
        return result

    ve_positions = [i for i, p in enumerate(parts) if p.upper() == "VE"]
    if not ve_positions:
        return result

    first_ve = ve_positions[0]
    last_ve = ve_positions[-1]

    if last_ve == len(parts) - 1 and len(parts) >= 4:
        doc_type = _normalize_doc_type(parts[1])
        sender_parts = parts[2:last_ve]
        result["doc_type"] = doc_type
        result["direction"] = "Incoming"
        result["party"] = "_".join(sender_parts) if sender_parts else None
        result["naming_valid"] = doc_type is not None
    elif first_ve == len(parts) - 1:
        doc_type_raw = "_".join(parts[1:first_ve])
        doc_type = _normalize_doc_type(doc_type_raw)
        result["doc_type"] = doc_type
        result["direction"] = "Internal"
        result["naming_valid"] = doc_type is not None
    else:
        doc_type_raw = "_".join(parts[1:first_ve])
        doc_type = _normalize_doc_type(doc_type_raw)
        name_parts = parts[first_ve + 1:]
        result["doc_type"] = doc_type
        if doc_type in _INTERNAL_DOC_TYPES:
            result["direction"] = "Internal"
        else:
            result["direction"] = "Outgoing"
        result["party"] = "_".join(name_parts) if name_parts else None
        result["naming_valid"] = doc_type is not None

    return result


def _normalize_doc_type(raw: str) -> str | None:
    key = raw.lower().replace("_", "").replace(" ", "")
    return _DOC_TYPE_MAP.get(key)


# Keep for backward compat — module now derived from folder in _upsert_file
TOP_FOLDER_TO_MODULE = _OLD_FOLDER_TO_MODULE
