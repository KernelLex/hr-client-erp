"""
Filename parser implementing the 3 Vera Enterprises naming rules:
  Outgoing (VE → client):  YYYYMMDD_DocName_VE_ClientName.ext
  Incoming (vendor → VE):  YYYYMMDD_DocName_SenderName_VE.ext
  Internal (accounts/HR):  YYYYMMDD_DocName_VE.ext  OR  YYYYMMDD_DocName_VE_SubName.ext
"""
from datetime import datetime

# Canonical DocType identifiers (case-insensitive match after stripping _ and spaces)
_DOC_TYPE_MAP = {
    "quotation": "Quotation",
    "salesorder": "SalesOrder",
    "salesinvoice": "SalesInvoice",
    "deliverynote": "DeliveryNote",
    "receipt": "Receipt",
    "purchaseorder": "PurchaseOrder",
    "purchaseinvoice": "PurchaseInvoice",
    "grn": "GRN",
    "deliverycert": "DeliveryCert",
    "payment": "Payment",
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
}

# These doc types are always Internal — they are never sent to/from external parties
_INTERNAL_DOC_TYPES = {
    "Ledger", "TrialBalance", "ProfitLoss", "BalanceSheet", "BankRecon",
    "SalarySlip", "Attendance", "PayrollSummary",
}

TOP_FOLDER_TO_MODULE = {
    "01_Sales": "Sales",
    "02_Purchase": "Purchase",
    "03_Accounts": "Accounts",
    "04_HR_Payroll": "HR_Payroll",
    "05_Logistics": "Logistics",
}


def parse_filename(name: str) -> dict:
    """
    Parse a Drive filename and return:
      date        (str YYYY-MM-DD | None)
      doc_type    (str canonical name | None)
      party       (str | None)
      direction   ('Outgoing'|'Incoming'|'Internal'|'Unknown')
      module      (str | 'Unknown')
      naming_valid (bool)
    """
    result = {
        "date": None,
        "doc_type": None,
        "party": None,
        "direction": "Unknown",
        "module": "Unknown",
        "naming_valid": False,
    }

    # Strip extension
    stem = name.rsplit(".", 1)[0] if "." in name else name
    parts = stem.split("_")

    if len(parts) < 3:
        return result

    # --- Date ---
    try:
        parsed_date = datetime.strptime(parts[0], "%Y%m%d").date()
        result["date"] = str(parsed_date)
    except ValueError:
        return result

    # --- Locate VE token positions ---
    ve_positions = [i for i, p in enumerate(parts) if p.upper() == "VE"]
    if not ve_positions:
        return result

    first_ve = ve_positions[0]
    last_ve = ve_positions[-1]

    # --- Determine pattern ---
    # Incoming: YYYYMMDD_DocType_Sender_VE (>= 4 parts, VE last)
    # Pure Internal: YYYYMMDD_DocType_VE (exactly 3 parts, VE last)
    # Both Outgoing and Internal-with-Sub: VE NOT last
    if last_ve == len(parts) - 1 and len(parts) >= 4:
        # Last token is VE with at least one sender token → Incoming
        # DocType is always a single token at position 1; sender fills positions 2..last_ve-1
        doc_type = _normalize_doc_type(parts[1])
        actual_sender_parts = parts[2:last_ve]
        result["doc_type"] = doc_type
        result["direction"] = "Incoming"
        result["party"] = "_".join(actual_sender_parts) if actual_sender_parts else None
        result["naming_valid"] = doc_type is not None

    elif first_ve == len(parts) - 1:
        # VE is the last token with no sender → Internal: YYYYMMDD_DocName_VE
        doc_type_raw = "_".join(parts[1:first_ve])
        doc_type = _normalize_doc_type(doc_type_raw)
        result["doc_type"] = doc_type
        result["direction"] = "Internal"
        result["naming_valid"] = doc_type is not None

    else:
        # VE is in the middle: YYYYMMDD_DocName_VE_Name
        doc_type_raw = "_".join(parts[1:first_ve])
        doc_type = _normalize_doc_type(doc_type_raw)
        name_parts = parts[first_ve + 1:]
        result["doc_type"] = doc_type

        if doc_type in _INTERNAL_DOC_TYPES:
            # Always Internal regardless of trailing name (SubName pattern)
            result["direction"] = "Internal"
            result["party"] = "_".join(name_parts) if name_parts else None
        else:
            # Outgoing: VE is sender, trailing part is ClientName
            result["direction"] = "Outgoing"
            result["party"] = "_".join(name_parts) if name_parts else None

        result["naming_valid"] = doc_type is not None

    return result


def folder_path_to_module(folder_path: str) -> str:
    """Derive module from the top-level segment of folder_path."""
    if not folder_path:
        return "Unknown"
    top = folder_path.split("/")[0]
    return TOP_FOLDER_TO_MODULE.get(top, "Unknown")


def _normalize_doc_type(raw: str) -> str | None:
    """Return canonical DocType name or None if unrecognized."""
    key = raw.lower().replace("_", "").replace(" ", "")
    return _DOC_TYPE_MAP.get(key)
