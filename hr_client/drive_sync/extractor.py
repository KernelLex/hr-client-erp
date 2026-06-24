"""
Content-based AI extraction for VE Drive files.
Downloads each file from Google Drive, extracts text, then uses Ollama LLM
with a strict structured prompt to populate VE DocType records accurately.
"""
import io
import re
import json
import frappe
from hr_client.utils.llm import ask_llm_json, is_ollama_running

# ── Text extraction ──────────────────────────────────────────────────────────

def _extract_text_from_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text)
        return "\n".join(pages)
    except Exception as e:
        frappe.log_error(str(e), "PDF text extraction failed")
        return ""


def _extract_text_from_excel(content: bytes) -> str:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        rows = []
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                cells = [str(c) for c in row if c is not None and str(c).strip()]
                if cells:
                    rows.append("  ".join(cells))
        return "\n".join(rows[:200])  # cap at 200 rows
    except Exception as e:
        frappe.log_error(str(e), "Excel text extraction failed")
        return ""


_SKIP_MIME_PREFIXES = ("image/", "video/", "audio/")


def _download_content(service, drive_file_id: str, mime_type: str, timeout: int = 30) -> str:
    """Download one file using an already-built Drive service and extract text."""
    import socket
    from googleapiclient.http import MediaIoBaseDownload

    if mime_type.startswith(_SKIP_MIME_PREFIXES):
        return ""

    old_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(timeout)
    try:
        meta = service.files().get(
            fileId=drive_file_id, fields="name,mimeType,size", supportsAllDrives=True
        ).execute()
        mime = mime_type or meta.get("mimeType", "")
        size = int(meta.get("size") or 0)

        if size > 20 * 1024 * 1024:
            return ""

        if "google-apps.document" in mime:
            req = service.files().export_media(fileId=drive_file_id, mimeType="text/plain")
        elif "google-apps.spreadsheet" in mime:
            req = service.files().export_media(
                fileId=drive_file_id, mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        else:
            req = service.files().get_media(fileId=drive_file_id, supportsAllDrives=True)

        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        content = buf.getvalue()

        fname = meta.get("name", "")
        if "pdf" in mime or fname.lower().endswith(".pdf"):
            return _extract_text_from_pdf(content)
        elif "spreadsheet" in mime or "excel" in mime or fname.lower().endswith((".xlsx", ".xls")):
            return _extract_text_from_excel(content)
        elif "text" in mime:
            return content.decode("utf-8", errors="ignore")
        else:
            try:
                return _extract_text_from_pdf(content)
            except Exception:
                pass
            try:
                return _extract_text_from_excel(content)
            except Exception:
                pass
            return ""
    finally:
        socket.setdefaulttimeout(old_timeout)


def download_and_extract_text(drive_file_id: str, mime_type: str = "") -> str:
    """Download a file from Google Drive and return its text content."""
    from hr_client.drive_sync.utils import get_drive_service

    if mime_type.startswith(_SKIP_MIME_PREFIXES):
        return ""

    try:
        service = get_drive_service()
    except Exception as e:
        frappe.log_error(str(e), "Drive service init failed")
        return ""

    try:
        return _download_content(service, drive_file_id, mime_type)
    except Exception as e:
        frappe.log_error(str(e), f"Drive download failed: {drive_file_id}")
        return ""


def parallel_download_texts(rows: list, creds_info) -> dict:
    """
    Download Drive file texts in parallel using a thread pool.
    creds_info is passed directly (not from frappe.conf) so threads don't need frappe.local.
    Returns {drive_file_name: text_str}.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

    def _build_service():
        if isinstance(creds_info, str):
            creds = service_account.Credentials.from_service_account_file(creds_info, scopes=SCOPES)
        else:
            creds = service_account.Credentials.from_service_account_info(creds_info, scopes=SCOPES)
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    def _download_one(row):
        name = row["name"]
        drive_file_id = row.get("drive_file_id", "")
        mime_type = row.get("mime_type") or ""
        file_name = row.get("file_name", "")
        if not drive_file_id:
            return name, f"Filename: {file_name}"
        try:
            service = _build_service()
            text = _download_content(service, drive_file_id, mime_type)
            if not text or len(text.strip()) < 20:
                return name, f"Filename: {file_name}"
            return name, text
        except Exception:
            return name, f"Filename: {file_name}"

    results = {}
    executor = ThreadPoolExecutor(max_workers=8)
    futures = {executor.submit(_download_one, row): row["name"] for row in rows}
    try:
        for future in as_completed(futures, timeout=90):
            try:
                name, text = future.result()
                results[name] = text
            except Exception:
                pass
    except Exception:
        pass
    finally:
        executor.shutdown(wait=False)  # don't block on stuck threads
    return results


# ── LLM prompts per doc type ─────────────────────────────────────────────────

_BASE_SYSTEM = """You are a financial document parser for Vera Enterprises, an Indian SME.
Extract data from the document text below. Output ONLY valid JSON with the exact keys specified.
For missing values use null. Amounts are in INR (numbers only, no ₹ symbol, no commas).
Dates in YYYY-MM-DD format. GSTIN is a 15-character alphanumeric code."""


def _prompt_sales_invoice(text: str) -> dict | None:
    prompt = f"""Extract from this Sales Invoice document:

{text[:4000]}

Return JSON with keys:
- invoice_number: invoice/bill number
- invoice_date: date of invoice (YYYY-MM-DD)
- due_date: payment due date (YYYY-MM-DD or null)
- client_name: buyer/client company name
- client_gstin: buyer GSTIN (15 chars or null)
- subtotal: amount before tax
- cgst: CGST amount
- sgst: SGST amount
- igst: IGST amount (for inter-state, else 0)
- total_tax: total tax (cgst+sgst+igst)
- total_amount: final invoice total including tax
- payment_terms: payment terms (e.g. "Net 30") or null
- payment_status: one of Pending/Paid/Overdue (default Pending)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_purchase_invoice(text: str) -> dict | None:
    prompt = f"""Extract from this Purchase Invoice/Bill document:

{text[:4000]}

Return JSON with keys:
- invoice_number: invoice/bill number
- invoice_date: date of invoice (YYYY-MM-DD)
- due_date: payment due date (YYYY-MM-DD or null)
- vendor_name: seller/supplier company name
- vendor_gstin: supplier GSTIN (15 chars or null)
- cgst: CGST amount
- sgst: SGST amount
- igst: IGST amount
- total_tax: total tax amount
- total_amount: final total including tax
- tds_amount: TDS deducted (0 if not applicable)
- tds_applicable: 1 if TDS applied else 0
- payment_status: one of Pending/Paid/Overdue (default Pending)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_purchase_order(text: str) -> dict | None:
    prompt = f"""Extract from this Purchase Order document:

{text[:4000]}

Return JSON with keys:
- po_number: PO number/reference
- po_date: date of PO (YYYY-MM-DD)
- vendor_name: supplier/vendor name
- delivery_date: expected delivery date (YYYY-MM-DD or null)
- total_value: total order value (before or after tax, whatever is on the document)
- payment_terms: payment terms or null
- status: one of Open/Received/Cancelled (default Open)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_quotation(text: str) -> dict | None:
    prompt = f"""Extract from this Quotation/Quote document:

{text[:4000]}

Return JSON with keys:
- quote_number: quotation number/reference
- quote_date: date of quotation (YYYY-MM-DD)
- client_name: customer/client name
- service_description: brief description of services/goods quoted
- total_value: total quoted amount
- validity_days: validity in days (integer or null)
- status: one of Draft/Sent/Won/Lost/Expired (default Draft)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_sales_order(text: str) -> dict | None:
    prompt = f"""Extract from this Sales Order document:

{text[:4000]}

Return JSON with keys:
- so_number: sales order number
- so_date: order date (YYYY-MM-DD)
- client_name: customer/client name
- total_amount: total order value
- delivery_date: delivery date (YYYY-MM-DD or null)
- status: one of Draft/Confirmed/Delivered/Cancelled (default Draft)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_credit_note(text: str) -> dict | None:
    prompt = f"""Extract from this Credit Note document:

{text[:4000]}

Return JSON with keys:
- cn_number: credit note number/reference
- cn_date: date of credit note (YYYY-MM-DD)
- client_name: customer/client name
- original_invoice: original invoice number being adjusted (or null)
- reason: reason for credit note (short description or null)
- total_amount: total credit amount including tax
- cgst: CGST amount
- sgst: SGST amount
- igst: IGST amount
- status: one of Pending/Applied/Cancelled (default Pending)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_debit_note(text: str) -> dict | None:
    prompt = f"""Extract from this Debit Note document:

{text[:4000]}

Return JSON with keys:
- dn_number: debit note number/reference
- dn_date: date of debit note (YYYY-MM-DD)
- vendor_name: vendor/supplier name
- original_invoice: original invoice number being adjusted (or null)
- reason: reason for debit note (short description or null)
- total_amount: total debit amount including tax
- cgst: CGST amount
- sgst: SGST amount
- igst: IGST amount
- status: one of Pending/Applied/Cancelled (default Pending)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_receipt(text: str) -> dict | None:
    prompt = f"""Extract from this Receipt Voucher document:

{text[:4000]}

Return JSON with keys:
- receipt_number: voucher or receipt reference number
- receipt_date: date of receipt (YYYY-MM-DD)
- amount: total amount received (number only)
- party_name: name of the party who made the payment
- payment_mode: one of Cash/Cheque/NEFT/RTGS/UPI/Bank Transfer/Other
- reference_doc: related invoice or document number being settled (or null)
- narration: brief description of the transaction (or null)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_payment_record(text: str) -> dict | None:
    prompt = f"""Extract from this Payment Voucher / Receipt Voucher document:

{text[:4000]}

Return JSON with keys:
- payment_number: voucher or payment reference number
- payment_date: date of payment (YYYY-MM-DD)
- amount: total payment amount (number only)
- party_name: name of the party paid to or received from
- payment_type: one of Received/Made (Received = money came in, Made = money went out)
- reference_doc: related invoice or document number being paid (or null)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_grn(text: str) -> dict | None:
    prompt = f"""Extract from this GRN (Goods Receipt Note) or Delivery Certificate document:

{text[:4000]}

Return JSON with keys:
- grn_number: GRN/receipt number
- grn_date: date (YYYY-MM-DD)
- vendor_name: supplier name
- po_reference: related PO number or null
- total_value: total value of goods received"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_financial_report(text: str, report_type: str = "") -> dict | None:
    prompt = f"""Extract from this Financial Report ({report_type}) document:

{text[:4000]}

Return JSON with keys:
- report_type: type (Profit & Loss / Balance Sheet / Trial Balance / Ledger / Bank Reconciliation)
- period: reporting period (e.g. "April 2025 - March 2026")
- total_revenue: total revenue/income (for P&L) or null
- total_expenses: total expenses (for P&L) or null
- net_profit: net profit/loss (for P&L) or null
- opening_balance: opening balance (for Ledger/Bank Recon) or null
- closing_balance: closing balance (for Ledger/Bank Recon) or null"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


def _prompt_salary_record(text: str) -> dict | None:
    prompt = f"""Extract from this Salary Slip or Payroll document:

{text[:4000]}

Return JSON with keys:
- employee_name: employee full name
- salary_month: month-year of salary (e.g. "March 2026")
- basic_salary: basic salary amount
- allowances: total allowances (HRA, DA, etc.)
- total_deductions: total deductions (PF, TDS, PT, etc.)
- net_salary: net take-home salary (basic + allowances - deductions)"""
    return ask_llm_json(prompt, system=_BASE_SYSTEM, temperature=0.05)


# ── DocType mapping ──────────────────────────────────────────────────────────

_DOC_TYPE_CONFIG = {
    "SalesInvoice":  ("VE Sales Invoice",  _prompt_sales_invoice),
    "Receipt":       ("VE Receipt",        _prompt_receipt),
    "SalesOrder":    ("VE Sales Order",    _prompt_sales_order),
    "DeliveryNote":  ("VE Sales Order",    _prompt_sales_order),
    "CreditNote":    ("VE Credit Note",    _prompt_credit_note),
    "PurchaseInvoice": ("VE Purchase Invoice", _prompt_purchase_invoice),
    "PurchaseOrder": ("VE Purchase Order", _prompt_purchase_order),
    "DebitNote":     ("VE Debit Note",     _prompt_debit_note),
    "Payment":       ("VE Payment Record", _prompt_payment_record),
    "GRN":           ("VE GRN",            _prompt_grn),
    "DeliveryCert":  ("VE GRN",            _prompt_grn),
    "Quotation":     ("VE Quotation",      _prompt_quotation),
    "Ledger":        ("VE Financial Report", lambda t: _prompt_financial_report(t, "Ledger")),
    "TrialBalance":  ("VE Financial Report", lambda t: _prompt_financial_report(t, "Trial Balance")),
    "ProfitLoss":    ("VE Financial Report", lambda t: _prompt_financial_report(t, "Profit & Loss")),
    "BalanceSheet":  ("VE Financial Report", lambda t: _prompt_financial_report(t, "Balance Sheet")),
    "BankRecon":     ("VE Financial Report", lambda t: _prompt_financial_report(t, "Bank Reconciliation")),
    "SalarySlip":    ("VE Salary Record",  _prompt_salary_record),
    "PayrollSummary":("VE Salary Record",  _prompt_salary_record),
}

# Fields per target DocType
_FIELD_MAP = {
    "VE Sales Invoice": [
        "invoice_number", "invoice_date", "due_date", "client_name", "client_gstin",
        "subtotal", "cgst", "sgst", "igst", "total_tax", "total_amount",
        "payment_terms", "payment_status",
    ],
    "VE Purchase Invoice": [
        "invoice_number", "invoice_date", "due_date", "vendor_name", "vendor_gstin",
        "cgst", "sgst", "igst", "total_tax", "total_amount",
        "tds_amount", "tds_applicable", "payment_status",
    ],
    "VE Purchase Order": [
        "po_number", "po_date", "vendor_name", "delivery_date",
        "total_value", "payment_terms", "status",
    ],
    "VE Quotation": [
        "quote_number", "quote_date", "client_name", "service_description",
        "total_value", "validity_days", "status",
    ],
    "VE Sales Order": [
        "so_number", "so_date", "client_name", "total_amount", "delivery_date", "status",
    ],
    "VE Receipt": [
        "receipt_number", "receipt_date", "amount", "party_name",
        "payment_mode", "reference_doc", "narration",
    ],
    "VE Payment Record": [
        "payment_number", "payment_date", "amount", "party_name", "payment_type", "reference_doc",
    ],
    "VE GRN": [
        "grn_number", "grn_date", "vendor_name", "po_reference", "total_value",
    ],
    "VE Financial Report": [
        "report_type", "period", "total_revenue", "total_expenses", "net_profit",
        "opening_balance", "closing_balance",
    ],
    "VE Salary Record": [
        "employee_name", "salary_month", "basic_salary", "allowances",
        "total_deductions", "net_salary",
    ],
    "VE Credit Note": [
        "cn_number", "cn_date", "client_name", "original_invoice", "reason",
        "total_amount", "cgst", "sgst", "igst", "status",
    ],
    "VE Debit Note": [
        "dn_number", "dn_date", "vendor_name", "original_invoice", "reason",
        "total_amount", "cgst", "sgst", "igst", "status",
    ],
}


def _clean_amount(val) -> float:
    """Parse a value that might be string with commas/₹ into float."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace(",", "").replace("₹", "").replace("Rs.", "").replace("Rs", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def _clean_date(val) -> str | None:
    if not val:
        return None
    from datetime import datetime
    s = str(val).strip()
    # Already YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        d = datetime.strptime(s, "%Y-%m-%d")
        # Fix 2-digit year misparse: if year < 2000, bump to 2000+
        if d.year < 2000:
            d = d.replace(year=d.year + 2000)
        return d.strftime("%Y-%m-%d")
    # 2-digit year formats common in Indian docs (e.g. "2-May-26", "01/06/26")
    for fmt in ("%d-%b-%y", "%d %b %y", "%d/%m/%y", "%d-%m-%y", "%d.%m.%y"):
        try:
            d = datetime.strptime(s, fmt)
            if d.year < 2000:
                d = d.replace(year=d.year + 2000)
            return d.strftime("%Y-%m-%d")
        except ValueError:
            continue
    # 4-digit year formats
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%B %d, %Y", "%b %d, %Y",
                "%d %B %Y", "%d %b %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _apply_extracted(doc, extracted: dict, fields: list):
    """Write extracted values onto a Frappe document object."""
    amount_fields = {
        "subtotal", "cgst", "sgst", "igst", "total_tax", "total_amount",
        "tds_amount", "total_value", "total_revenue", "total_expenses", "net_profit",
        "opening_balance", "closing_balance", "basic_salary", "allowances",
        "total_deductions", "net_salary", "amount",
    }
    date_fields = {"invoice_date", "due_date", "po_date", "delivery_date", "quote_date",
                   "grn_date", "so_date", "cn_date", "dn_date", "payment_date", "receipt_date"}
    int_fields = {"validity_days", "tds_applicable"}

    for field in fields:
        val = extracted.get(field)
        if val is None:
            continue
        if field in amount_fields:
            setattr(doc, field, _clean_amount(val))
        elif field in date_fields:
            setattr(doc, field, _clean_date(val))
        elif field in int_fields:
            try:
                setattr(doc, field, int(val))
            except (ValueError, TypeError):
                pass
        else:
            setattr(doc, field, str(val).strip() if val else None)


# ── Stub record creation ─────────────────────────────────────────────────────

def create_stub_record(target_doctype: str, drive_file_id: str) -> bool:
    """
    Create a zero-confidence VE record so this file is not re-attempted next batch.
    Called when LLM completely fails after all retries.
    """
    try:
        existing = frappe.db.get_value(target_doctype, {"drive_file": drive_file_id}, "name")
        if existing:
            return True
        doc = frappe.new_doc(target_doctype)
        doc.drive_file = drive_file_id
        doc.extraction_method = "stub_failed"
        doc.confidence_score = 0
        doc.flags.ignore_mandatory = True
        doc.flags.ignore_links = True
        doc.flags.ignore_validate = True
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return True
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"create_stub_record: {drive_file_id}")
        return False


# ── Main extraction function ─────────────────────────────────────────────────

def extract_and_save(drive_file_doc, prefetched_text: str | None = None, create_stub_on_fail: bool = False) -> dict:
    """
    Extract financial data from a VE Drive File and save to the appropriate VE DocType.
    prefetched_text: pass already-downloaded text to skip the Drive download.
    create_stub_on_fail: if True and LLM fails, creates a zero-confidence stub record so
                         the file won't be re-attempted in future batch runs.
    Returns {"success": bool, "doctype": str, "docname": str, "confidence": int, "reason": str}
    """
    doc_type = drive_file_doc.doc_type
    drive_file_id = drive_file_doc.drive_file_id
    file_name = drive_file_doc.file_name

    if not doc_type or doc_type not in _DOC_TYPE_CONFIG:
        return {"success": False, "skipped": True, "reason": f"No extractor for doc_type '{doc_type}'"}

    if not is_ollama_running():
        return {"success": False, "reason": "Ollama not running — start with: ollama serve"}

    target_doctype, prompt_fn = _DOC_TYPE_CONFIG[doc_type]
    fields = _FIELD_MAP.get(target_doctype, [])

    # Check if a record already exists for this drive file
    existing = frappe.db.get_value(target_doctype, {"drive_file": drive_file_id}, "name")

    # Use pre-fetched text if provided, otherwise download now
    if prefetched_text is not None:
        text = prefetched_text
    else:
        text = download_and_extract_text(drive_file_id, drive_file_doc.mime_type or "")
    if not text or len(text.strip()) < 20:
        text = f"Filename: {file_name}"

    # Call LLM — retry once with filename-only if full text fails
    extracted = prompt_fn(text)
    if not extracted and text != f"Filename: {file_name}":
        extracted = prompt_fn(f"Filename: {file_name}")
    if not extracted:
        if create_stub_on_fail:
            create_stub_record(target_doctype, drive_file_id)
        return {"success": False, "reason": "LLM did not return valid JSON"}

    # Compute a simple confidence score based on how many key fields were filled
    key_amount_fields = [f for f in fields if f in {"total_amount", "total_value", "net_salary", "net_profit", "total_revenue"}]
    filled_amounts = sum(1 for f in key_amount_fields if extracted.get(f) and _clean_amount(extracted.get(f)) > 0)
    filled_total = sum(1 for f in fields if extracted.get(f) is not None)
    confidence = min(100, int((filled_total / max(len(fields), 1)) * 70) + (filled_amounts * 10))

    # Save to VE DocType
    def _do_save(doc, existing):
        if existing:
            doc.save(ignore_permissions=True)
            return existing
        else:
            doc.insert(ignore_permissions=True)
            return doc.name

    try:
        if existing:
            doc = frappe.get_doc(target_doctype, existing)
        else:
            doc = frappe.new_doc(target_doctype)
            doc.drive_file = drive_file_id
            doc.extraction_method = "llm_content"

        _apply_extracted(doc, extracted, fields)
        doc.confidence_score = confidence
        doc.extraction_method = doc.extraction_method or "llm_content"

        try:
            docname = _do_save(doc, existing)
        except frappe.exceptions.ValidationError as ve:
            # Select field value from LLM doesn't match DocType options — clear it and retry
            if "cannot be" in str(ve) and "should be one of" in str(ve):
                if hasattr(doc, "status"):
                    doc.status = None
                if hasattr(doc, "payment_status"):
                    doc.payment_status = None
                docname = _do_save(doc, existing)
            else:
                raise

        frappe.db.commit()
        return {
            "success": True,
            "doctype": target_doctype,
            "docname": docname,
            "confidence": confidence,
            "extracted_fields": {k: extracted.get(k) for k in fields if extracted.get(k) is not None},
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"extract_and_save: {drive_file_id}")
        if create_stub_on_fail:
            create_stub_record(target_doctype, drive_file_id)
        return {"success": False, "reason": str(e)}
