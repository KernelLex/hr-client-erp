"""
Frontend-facing API for the drive sync feature.
Provides stats, file listing, and a sync trigger endpoint.
"""
import frappe
from frappe.utils import now_datetime


@frappe.whitelist()
def get_drive_stats():
    """Return counts and last-sync time for the dashboard."""
    total = frappe.db.count("VE Drive File", {"sync_status": "Synced"})
    pending = frappe.db.count("VE Drive File", {"sync_status": "Pending"})
    error = frappe.db.count("VE Drive File", {"sync_status": "Error"})

    # Last synced = most recent last_synced across all records
    last_sync = frappe.db.sql(
        "SELECT MAX(last_synced) FROM `tabVE Drive File`"
    )
    last_sync_val = (last_sync[0][0] if last_sync and last_sync[0][0] else None)

    return {
        "total": total,
        "pending": pending,
        "error": error,
        "last_sync": str(last_sync_val) if last_sync_val else "Never",
    }


@frappe.whitelist()
def get_files(module="All", direction=None, naming_valid=None, doc_type=None, page=1, page_length=100):
    """
    Return VE Drive File records with optional filtering.
    module: All | Sales | Purchase | Accounts | HR_Payroll | Logistics
    """
    filters = {}
    if module and module != "All":
        filters["module"] = module
    if direction:
        filters["direction"] = direction
    if naming_valid is not None:
        filters["naming_valid"] = frappe.utils.cint(naming_valid)
    if doc_type and doc_type != "All":
        filters["doc_type"] = doc_type

    page = frappe.utils.cint(page) or 1
    page_length = min(frappe.utils.cint(page_length) or 100, 500)

    files = frappe.get_all(
        "VE Drive File",
        filters=filters,
        fields=[
            "name", "drive_file_id", "file_name", "folder_path", "module",
            "doc_type", "party_name", "doc_date", "direction",
            "mime_type", "web_view_link", "thumbnail_link",
            "sync_status", "last_synced", "naming_valid",
            "uploaded_by_name", "uploaded_by_email",
        ],
        order_by="doc_date desc, last_synced desc",
        start=(page - 1) * page_length,
        page_length=page_length,
    )
    return files


@frappe.whitelist(methods=["POST"])
def backfill_uploaders():
    """Backfill uploaded_by_name/email for existing VE Drive File records from Google Drive API."""
    from hr_client.drive_sync.utils import get_drive_service
    service = get_drive_service()
    records = frappe.db.get_all("VE Drive File", fields=["name", "drive_file_id"])
    updated = 0
    errors = 0
    for r in records:
        try:
            meta = service.files().get(
                fileId=r["drive_file_id"],
                fields="lastModifyingUser(emailAddress,displayName)",
                supportsAllDrives=True,
            ).execute()
            lmu = meta.get("lastModifyingUser") or {}
            if lmu:
                frappe.db.set_value("VE Drive File", r["name"], {
                    "uploaded_by_name": lmu.get("displayName", ""),
                    "uploaded_by_email": lmu.get("emailAddress", ""),
                })
                updated += 1
        except Exception as e:
            errors += 1
            frappe.log_error(str(e)[:200], f"backfill_uploaders: {r['drive_file_id']}")
    frappe.db.commit()
    return {"updated": updated, "errors": errors, "total": len(records)}


@frappe.whitelist(methods=["POST"])
def trigger_sync():
    """Enqueue a delta sync (or full sync if delta is not yet initialised)."""
    settings = frappe.get_single("VE Drive Settings")

    if not settings.page_token:
        # Delta not initialised yet — run full sync
        frappe.enqueue(
            "hr_client.drive_sync.full_sync.run_full_sync",
            queue="long",
            is_async=True,
            job_id="ve_drive_full_sync",
        )
        return {"status": "enqueued", "type": "full_sync"}

    frappe.enqueue(
        "hr_client.drive_sync.delta_sync.run_delta_sync",
        queue="short",
        is_async=True,
        job_id="ve_drive_delta_sync",
    )
    return {"status": "enqueued", "type": "delta_sync"}


@frappe.whitelist()
def get_folder_counts():
    """Return file counts grouped by module and doc_type for folder-navigation UI."""
    rows = frappe.db.sql(
        """SELECT module, doc_type, COUNT(*) as cnt
           FROM `tabVE Drive File`
           WHERE sync_status != 'Error'
           GROUP BY module, doc_type""",
        as_dict=True,
    )
    result: dict = {}
    for row in rows:
        mod = row["module"] or "Unknown"
        dt = row["doc_type"] or "Unknown"
        cnt = row["cnt"]
        if mod not in result:
            result[mod] = {"total": 0}
        result[mod]["total"] = result[mod].get("total", 0) + cnt
        result[mod][dt] = cnt
    return result


@frappe.whitelist()
def get_naming_issues():
    """Return all files where naming_valid = 0, for QA review."""
    files = frappe.get_all(
        "VE Drive File",
        filters={"naming_valid": 0},
        fields=["name", "file_name", "folder_path", "module", "web_view_link"],
        order_by="last_synced desc",
    )
    return files


# ---------------------------------------------------------------------------
# Business Dashboard endpoints
# ---------------------------------------------------------------------------

_DOC_TYPE_TO_BUCKET = {
    "SalesInvoice":    "sales_invoices",
    "Receipt":         "receipt_records",
    "SalesOrder":      "sales_invoices",
    "DeliveryNote":    "sales_invoices",
    "Quotation":       "quotations",
    "CreditNote":      "credit_notes",
    "PurchaseInvoice": "purchase_invoices",
    "PurchaseOrder":   "purchase_orders",
    "DebitNote":       "debit_notes",
    "GRN":            "grns",
    "DeliveryCert":   "grns",
    "TransportDoc":   "grns",
    "PackingList":    "grns",
    "Ledger":         "financial_reports",
    "TrialBalance":   "financial_reports",
    "ProfitLoss":     "financial_reports",
    "BalanceSheet":   "financial_reports",
    "BankRecon":      "financial_reports",
    "StockReport":    "financial_reports",
    "SalarySlip":     "salary_records",
    "PayrollSummary": "salary_records",
    "Attendance":     "attendance_records",
    "Payment":        "payment_records",
}

_FINANCIAL_REPORT_TYPE = {
    "ProfitLoss":   "Profit & Loss",
    "BalanceSheet": "Balance Sheet",
    "TrialBalance": "Trial Balance",
    "Ledger":       "Ledger",
    "BankRecon":    "Bank Reconciliation",
}


def _get_drive_link(drive_file_id):
    """Resolve a Google Drive file ID to its web_view_link and file_name from VE Drive File."""
    if not drive_file_id:
        return None, None
    row = frappe.db.get_value(
        "VE Drive File",
        {"drive_file_id": drive_file_id},
        ["web_view_link", "file_name", "doc_date", "party_name", "direction"],
        as_dict=True,
    )
    return row or {}


@frappe.whitelist()
def get_structured_data():
    """Return AI-extracted financial records from VE structured DocTypes for the Business Dashboard."""

    # --- Sales Invoices (VE Sales Invoice) ---
    si_rows = frappe.db.sql("""
        SELECT si.name, si.invoice_number, si.invoice_date, si.client_name,
               si.total_amount, si.cgst, si.sgst, si.igst, si.total_tax,
               si.payment_status, si.confidence_score, si.drive_file,
               df.web_view_link, df.file_name, df.direction, df.party_name as df_party
        FROM `tabVE Sales Invoice` si
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = si.drive_file
        ORDER BY si.creation DESC
        LIMIT 200
    """, as_dict=True)

    # Also pull Sales Orders into the sales bucket
    so_rows = frappe.db.sql("""
        SELECT so.name, so.so_number, so.so_date, so.client_name,
               so.total_amount, so.status, so.confidence_score, so.drive_file,
               df.web_view_link, df.file_name, df.direction, df.party_name as df_party
        FROM `tabVE Sales Order` so
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = so.drive_file
        ORDER BY so.creation DESC
        LIMIT 200
    """, as_dict=True)

    sales_invoices = []
    for r in si_rows:
        sales_invoices.append({
            "name": r["name"],
            "invoice_number": r.get("invoice_number") or r.get("file_name") or r["name"],
            "invoice_date": r.get("invoice_date") or "",
            "client_name": r.get("client_name") or r.get("df_party") or "—",
            "total_amount": r.get("total_amount") or 0,
            "cgst": r.get("cgst") or 0,
            "sgst": r.get("sgst") or 0,
            "igst": r.get("igst") or 0,
            "total_tax": r.get("total_tax") or 0,
            "payment_status": r.get("payment_status") or "Pending",
            "confidence_score": r.get("confidence_score"),
            "web_view_link": r.get("web_view_link"),
            "file_name": r.get("file_name") or r["name"],
            "direction": r.get("direction"),
            "doc_type": "SalesInvoice",
        })
    for r in so_rows:
        sales_invoices.append({
            "name": r["name"],
            "invoice_number": r.get("so_number") or r.get("file_name") or r["name"],
            "invoice_date": r.get("so_date") or "",
            "client_name": r.get("client_name") or r.get("df_party") or "—",
            "total_amount": r.get("total_amount") or 0,
            "cgst": 0, "sgst": 0, "igst": 0, "total_tax": 0,
            "payment_status": r.get("status") or "Open",
            "confidence_score": r.get("confidence_score"),
            "web_view_link": r.get("web_view_link"),
            "file_name": r.get("file_name") or r["name"],
            "direction": r.get("direction"),
            "doc_type": "SalesOrder",
        })

    # --- Quotations (VE Quotation) ---
    qt_rows = frappe.db.sql("""
        SELECT qt.name, qt.quote_number, qt.quote_date, qt.client_name,
               qt.total_value, qt.status, qt.confidence_score, qt.drive_file,
               df.web_view_link, df.file_name, df.party_name as df_party
        FROM `tabVE Quotation` qt
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = qt.drive_file
        ORDER BY qt.creation DESC
        LIMIT 200
    """, as_dict=True)

    quotations = [{
        "name": r["name"],
        "quote_number": r.get("quote_number") or r.get("file_name") or r["name"],
        "quote_date": r.get("quote_date") or "",
        "client_name": r.get("client_name") or r.get("df_party") or "—",
        "total_value": r.get("total_value") or 0,
        "final_value": r.get("total_value") or 0,
        "status": r.get("status") or "Draft",
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in qt_rows]

    # --- Purchase Invoices (VE Purchase Invoice) ---
    pi_rows = frappe.db.sql("""
        SELECT pi.name, pi.invoice_number, pi.invoice_date, pi.vendor_name,
               pi.total_amount, pi.cgst, pi.sgst, pi.igst, pi.total_tax,
               pi.tds_amount, pi.payment_status, pi.confidence_score, pi.drive_file,
               df.web_view_link, df.file_name, df.direction, df.party_name as df_party
        FROM `tabVE Purchase Invoice` pi
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = pi.drive_file
        ORDER BY pi.creation DESC
        LIMIT 200
    """, as_dict=True)

    purchase_invoices = [{
        "name": r["name"],
        "invoice_number": r.get("invoice_number") or r.get("file_name") or r["name"],
        "invoice_date": r.get("invoice_date") or "",
        "vendor_name": r.get("vendor_name") or r.get("df_party") or "—",
        "total_amount": r.get("total_amount") or 0,
        "cgst": r.get("cgst") or 0,
        "sgst": r.get("sgst") or 0,
        "igst": r.get("igst") or 0,
        "total_tax": r.get("total_tax") or 0,
        "tds_amount": r.get("tds_amount") or 0,
        "payment_status": r.get("payment_status") or "Pending",
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
        "direction": r.get("direction"),
    } for r in pi_rows]

    # --- Purchase Orders (VE Purchase Order) ---
    po_rows = frappe.db.sql("""
        SELECT po.name, po.po_number, po.po_date, po.vendor_name,
               po.total_value, po.status, po.confidence_score, po.drive_file,
               df.web_view_link, df.file_name, df.party_name as df_party
        FROM `tabVE Purchase Order` po
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = po.drive_file
        ORDER BY po.creation DESC
        LIMIT 200
    """, as_dict=True)

    purchase_orders = [{
        "name": r["name"],
        "po_number": r.get("po_number") or r.get("file_name") or r["name"],
        "po_date": r.get("po_date") or "",
        "vendor_name": r.get("vendor_name") or r.get("df_party") or "—",
        "total_value": r.get("total_value") or 0,
        "status": r.get("status") or "Open",
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in po_rows]

    # --- GRNs (VE GRN) ---
    grn_rows = frappe.db.sql("""
        SELECT grn.name, grn.grn_number, grn.grn_date, grn.vendor_name,
               grn.total_value, grn.po_reference, grn.drive_file,
               df.web_view_link, df.file_name, df.party_name as df_party
        FROM `tabVE GRN` grn
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = grn.drive_file
        ORDER BY grn.creation DESC
        LIMIT 100
    """, as_dict=True)

    grns = [{
        "name": r["name"],
        "grn_number": r.get("grn_number") or r.get("file_name") or r["name"],
        "grn_date": r.get("grn_date") or "",
        "vendor_name": r.get("vendor_name") or r.get("df_party") or "—",
        "total_value": r.get("total_value") or 0,
        "po_reference": r.get("po_reference") or "",
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in grn_rows]

    # --- Financial Reports (VE Financial Report) ---
    fr_rows = frappe.db.sql("""
        SELECT fr.name, fr.report_type, fr.period, fr.total_revenue,
               fr.total_expenses, fr.net_profit,
               fr.confidence_score, fr.drive_file,
               df.web_view_link, df.file_name, df.doc_date
        FROM `tabVE Financial Report` fr
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = fr.drive_file
        ORDER BY fr.creation DESC
        LIMIT 100
    """, as_dict=True)

    financial_reports = [{
        "name": r["name"],
        "report_type": r.get("report_type") or "Report",
        "period": r.get("period") or "",
        "from_date": r.get("doc_date") or "",
        "total_revenue": r.get("total_revenue") or 0,
        "total_expenses": r.get("total_expenses") or 0,
        "net_profit": r.get("net_profit") or 0,
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in fr_rows]

    # --- Salary Records (VE Salary Record) ---
    sal_rows = frappe.db.sql("""
        SELECT sal.name, sal.employee_name, sal.salary_month,
               sal.basic_salary, sal.allowances, sal.total_deductions, sal.net_salary,
               sal.confidence_score, sal.drive_file,
               df.web_view_link, df.file_name
        FROM `tabVE Salary Record` sal
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = sal.drive_file
        ORDER BY sal.creation DESC
        LIMIT 100
    """, as_dict=True)

    salary_records = [{
        "name": r["name"],
        "employee_name": r.get("employee_name") or "—",
        "month_year": r.get("salary_month") or "",
        "basic_salary": r.get("basic_salary") or 0,
        "gross_salary": (r.get("basic_salary") or 0) + (r.get("allowances") or 0),
        "total_deductions": r.get("total_deductions") or 0,
        "net_salary": r.get("net_salary") or 0,
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in sal_rows]

    # --- Payment Records (VE Payment Record) ---
    pr_rows = frappe.db.sql("""
        SELECT pr.name, pr.payment_number, pr.payment_date, pr.amount,
               pr.party_name, pr.payment_type, pr.reference_doc,
               pr.confidence_score, pr.drive_file,
               df.web_view_link, df.file_name, df.party_name as df_party
        FROM `tabVE Payment Record` pr
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = pr.drive_file
        ORDER BY pr.creation DESC
        LIMIT 500
    """, as_dict=True)

    payment_records = [{
        "name": r["name"],
        "file_name": r.get("file_name") or r["name"],
        "payment_number": r.get("payment_number") or r.get("file_name") or r["name"],
        "payment_date": r.get("payment_date") or "",
        "amount": r.get("amount") or 0,
        "party_name": r.get("party_name") or r.get("df_party") or "—",
        "payment_type": r.get("payment_type") or "—",
        "reference_doc": r.get("reference_doc") or "",
        "web_view_link": r.get("web_view_link"),
    } for r in pr_rows]

    # Attendance and Receipt Voucher files — Drive file metadata fallback
    attendance_records = []
    receipt_records = []
    df_fallback = frappe.get_all(
        "VE Drive File",
        filters={"doc_type": ["in", ["Attendance", "Receipt"]], "sync_status": ["in", ["Synced", "Pending"]]},
        fields=["name", "file_name", "doc_type", "party_name", "doc_date", "web_view_link"],
        order_by="doc_date desc",
        limit=500,
    )
    for f in df_fallback:
        row = {
            "name": f["name"],
            "file_name": f["file_name"],
            "party_name": f.get("party_name"),
            "web_view_link": f.get("web_view_link"),
        }
        if f["doc_type"] == "Attendance":
            attendance_records.append({**row, "employee_name": f.get("party_name"), "month_year": f.get("doc_date") or ""})
        else:
            receipt_records.append(row)

    # --- Credit Notes (VE Credit Note) ---
    cn_rows = frappe.db.sql("""
        SELECT cn.name, cn.cn_number, cn.cn_date, cn.client_name,
               cn.total_amount, cn.cgst, cn.sgst, cn.igst, cn.status,
               cn.confidence_score, cn.drive_file,
               df.web_view_link, df.file_name, df.party_name as df_party
        FROM `tabVE Credit Note` cn
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = cn.drive_file
        ORDER BY cn.creation DESC
        LIMIT 200
    """, as_dict=True)

    credit_notes = [{
        "name": r["name"],
        "cn_number": r.get("cn_number") or r.get("file_name") or r["name"],
        "cn_date": r.get("cn_date") or "",
        "client_name": r.get("client_name") or r.get("df_party") or "—",
        "total_amount": r.get("total_amount") or 0,
        "cgst": r.get("cgst") or 0,
        "sgst": r.get("sgst") or 0,
        "igst": r.get("igst") or 0,
        "status": r.get("status") or "Pending",
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in cn_rows]

    # --- Debit Notes (VE Debit Note) ---
    dn_rows = frappe.db.sql("""
        SELECT dn.name, dn.dn_number, dn.dn_date, dn.vendor_name,
               dn.total_amount, dn.status, dn.confidence_score, dn.drive_file,
               df.web_view_link, df.file_name, df.party_name as df_party
        FROM `tabVE Debit Note` dn
        LEFT JOIN `tabVE Drive File` df ON df.drive_file_id = dn.drive_file
        ORDER BY dn.creation DESC
        LIMIT 200
    """, as_dict=True)

    debit_notes = [{
        "name": r["name"],
        "dn_number": r.get("dn_number") or r.get("file_name") or r["name"],
        "dn_date": r.get("dn_date") or "",
        "vendor_name": r.get("vendor_name") or r.get("df_party") or "—",
        "total_amount": r.get("total_amount") or 0,
        "status": r.get("status") or "Pending",
        "confidence_score": r.get("confidence_score"),
        "web_view_link": r.get("web_view_link"),
        "file_name": r.get("file_name") or r["name"],
    } for r in dn_rows]

    # --- Financial Totals ---
    total_sales_invoiced = sum(r.get("total_amount") or 0 for r in si_rows)
    total_order_book = sum(r.get("total_amount") or 0 for r in so_rows)
    total_purchases = sum(r.get("total_amount") or 0 for r in pi_rows)
    total_po_value = sum(r.get("total_value") or 0 for r in po_rows)
    total_quoted = sum(r.get("total_value") or 0 for r in qt_rows)
    total_payroll = sum(r.get("net_salary") or 0 for r in sal_rows)
    open_pos = sum(1 for r in po_rows if (r.get("status") or "Open") == "Open")
    open_quotations = sum(1 for r in qt_rows if (r.get("status") or "Draft") in ("Draft", "Sent"))

    totals = {
        "total_sales": total_sales_invoiced + total_order_book,
        "total_invoiced": total_sales_invoiced,
        "total_order_book": total_order_book,
        "total_purchases": total_purchases + total_po_value,
        "total_quoted": total_quoted,
        "total_payroll": total_payroll,
        "gross_margin": (total_sales_invoiced + total_order_book) - (total_purchases + total_po_value),
        "total_receivables": total_sales_invoiced,
        "total_payables": total_purchases,
        "overdue_invoices": 0,
        "pending_pos": open_pos,
        "open_quotations": open_quotations,
    }

    return {
        "sales_invoices": sales_invoices,
        "quotations": quotations,
        "credit_notes": credit_notes,
        "purchase_invoices": purchase_invoices,
        "purchase_orders": purchase_orders,
        "debit_notes": debit_notes,
        "grns": grns,
        "financial_reports": financial_reports,
        "salary_records": salary_records,
        "attendance_records": attendance_records,
        "payment_records": payment_records,
        "receipt_records": receipt_records,
        "totals": totals,
    }


@frappe.whitelist(methods=["POST"])
def process_file(drive_file_name, force=0):
    """
    Process a VE Drive File: parse filename metadata then AI-extract financial content.
    force=1 re-extracts even if a VE structured record already exists.
    Folder-based doc_type always takes priority over filename-based parsing.
    """
    from hr_client.drive_sync.parser import (
        parse_filename, folder_path_to_module,
        folder_path_to_doc_type, folder_path_to_direction,
    )
    from hr_client.drive_sync.extractor import extract_and_save

    try:
        doc = frappe.get_doc("VE Drive File", drive_file_name)
    except frappe.DoesNotExistError:
        return {"success": False, "reason": "File not found"}

    force = frappe.utils.cint(force)

    # Step 1: Update metadata — folder classification takes priority over filename parsing
    parsed = parse_filename(doc.file_name)
    folder_doc_type = folder_path_to_doc_type(doc.folder_path or "")
    folder_direction = folder_path_to_direction(doc.folder_path or "")

    doc.doc_type = folder_doc_type or parsed.get("doc_type") or doc.doc_type or ""
    doc.party_name = parsed.get("party") or doc.party_name or ""
    doc.doc_date = parsed.get("date") or doc.doc_date
    doc.direction = folder_direction or parsed.get("direction", "Unknown")
    doc.naming_valid = 1 if (parsed.get("date") and doc.doc_type) else 0
    if doc.folder_path:
        doc.module = folder_path_to_module(doc.folder_path)
    doc.sync_status = "Synced"
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Step 2: AI content extraction into VE structured DocType
    if not doc.doc_type:
        return {"success": True, "skipped": True, "reason": "Unknown doc type — not classifiable"}

    result = extract_and_save(doc)
    return result


@frappe.whitelist(methods=["POST"])
def process_all_files(limit=100, force=0):
    """Re-run filename + folder parsing for all VE Drive File records."""
    from hr_client.drive_sync.parser import (
        parse_filename, folder_path_to_module,
        folder_path_to_doc_type, folder_path_to_direction,
    )

    limit = min(frappe.utils.cint(limit) or 100, 500)
    files = frappe.get_all(
        "VE Drive File",
        fields=["name", "file_name", "folder_path"],
        limit=limit,
    )

    processed = 0
    for f in files:
        try:
            doc = frappe.get_doc("VE Drive File", f["name"])
            parsed = parse_filename(doc.file_name)
            folder_doc_type = folder_path_to_doc_type(doc.folder_path or "")
            folder_direction = folder_path_to_direction(doc.folder_path or "")

            doc.doc_type = folder_doc_type or parsed.get("doc_type") or ""
            doc.party_name = parsed.get("party") or ""
            doc.doc_date = parsed.get("date")
            doc.direction = folder_direction or parsed.get("direction", "Unknown")
            doc.naming_valid = 1 if (parsed.get("date") and doc.doc_type) else 0
            if doc.folder_path:
                doc.module = folder_path_to_module(doc.folder_path)
            doc.sync_status = "Synced"
            doc.save(ignore_permissions=True)
            processed += 1
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"process_all_files: {f['name']}")

    frappe.db.commit()
    return {"success": True, "total": len(files), "processed": processed}


@frappe.whitelist(methods=["POST"])
def auto_link_documents():
    """Stub — document linking not yet implemented for VE Drive File."""
    return {"success": True, "links_created": 0}


@frappe.whitelist(methods=["POST"])
def update_payment_status(doctype, docname, status):
    """Stub — payment status not yet stored on VE Drive File."""
    return {"success": True}


@frappe.whitelist(methods=["POST"])
def update_doc_status(doctype, docname, status):
    """Stub — doc status not yet stored on VE Drive File."""
    return {"success": True}


@frappe.whitelist()
def get_extractable_files(limit=50):
    """
    Return VE Drive Files that have a classifiable doc_type but no AI-extracted VE record yet.
    Also returns total_pending count (across all such files).
    """
    from hr_client.drive_sync.extractor import _DOC_TYPE_CONFIG

    known_types = list(_DOC_TYPE_CONFIG.keys())
    if not known_types:
        return {"files": [], "total_pending": 0}

    placeholders = ", ".join(["%s"] * len(known_types))
    batch_limit = frappe.utils.cint(limit) or 200

    # Single SQL query: fetch pending files by excluding those already extracted in any VE DocType.
    # Using NOT IN with UNION subquery is accurate and avoids Python-side set math.
    all_rows = frappe.db.sql(
        f"""
        SELECT name, file_name, doc_type, module, drive_file_id, web_view_link, sync_status
        FROM `tabVE Drive File`
        WHERE doc_type IN ({placeholders})
          AND sync_status != 'Error'
          AND drive_file_id IS NOT NULL
          AND drive_file_id != ''
          AND drive_file_id NOT IN (
              SELECT drive_file FROM `tabVE Sales Invoice`     WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Purchase Invoice`  WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Purchase Order`    WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Quotation`         WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Sales Order`       WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE GRN`               WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Financial Report`  WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Salary Record`     WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Credit Note`       WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Debit Note`        WHERE drive_file IS NOT NULL AND drive_file != ''
              UNION
              SELECT drive_file FROM `tabVE Payment Record`    WHERE drive_file IS NOT NULL AND drive_file != ''
          )
        ORDER BY last_synced DESC
        """,
        known_types,
        as_dict=True,
    )

    total_pending = len(all_rows)
    batch = all_rows[:batch_limit]

    return {"files": batch, "total_pending": total_pending}


# ---------------------------------------------------------------------------
# Background extraction
# ---------------------------------------------------------------------------

_NOT_IN_UNION = """
    SELECT drive_file FROM `tabVE Sales Invoice`    WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Purchase Invoice` WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Purchase Order`   WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Quotation`        WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Sales Order`      WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE GRN`              WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Financial Report` WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Salary Record`    WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Credit Note`      WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Debit Note`       WHERE drive_file IS NOT NULL AND drive_file != ''
    UNION SELECT drive_file FROM `tabVE Payment Record`   WHERE drive_file IS NOT NULL AND drive_file != ''
"""


@frappe.whitelist(methods=["POST"])
def start_background_extraction():
    """
    Enqueue a long-running background job that processes all pending VE Drive Files.
    Safe to call multiple times — will return 'already_running' if a job is active.
    The job self-re-enqueues in 50-file batches until all files are extracted.
    """
    if frappe.cache().get_value("ve_extraction_active"):
        from hr_client.drive_sync.extractor import _DOC_TYPE_CONFIG
        known_types = list(_DOC_TYPE_CONFIG.keys())
        placeholders = ", ".join(["%s"] * len(known_types))
        result = frappe.db.sql(
            f"SELECT COUNT(*) as cnt FROM `tabVE Drive File` "
            f"WHERE doc_type IN ({placeholders}) AND sync_status != 'Error' "
            f"AND drive_file_id IS NOT NULL AND drive_file_id != '' "
            f"AND drive_file_id NOT IN ({_NOT_IN_UNION})",
            known_types, as_dict=True,
        )
        pending = result[0]["cnt"] if result else 0
        return {"status": "already_running", "pending": pending,
                "message": "Background extraction is already running."}

    frappe.cache().set_value("ve_extraction_active", 1, expires_in_sec=3600)
    frappe.enqueue(
        "hr_client.drive_sync.api._extract_batch_worker",
        queue="long",
        timeout=7200,
        is_async=True,
    )
    return {"status": "enqueued", "message": "Background extraction started! ~20 files processed per batch."}


@frappe.whitelist()
def get_extraction_status():
    """Return current background job status and accurate pending file count."""
    from hr_client.drive_sync.extractor import _DOC_TYPE_CONFIG
    known_types = list(_DOC_TYPE_CONFIG.keys())

    job_active = bool(frappe.cache().get_value("ve_extraction_active"))

    if not known_types:
        return {"pending": 0, "job_active": job_active}

    placeholders = ", ".join(["%s"] * len(known_types))
    result = frappe.db.sql(
        f"SELECT COUNT(*) as cnt FROM `tabVE Drive File` "
        f"WHERE doc_type IN ({placeholders}) AND sync_status != 'Error' "
        f"AND drive_file_id IS NOT NULL AND drive_file_id != '' "
        f"AND drive_file_id NOT IN ({_NOT_IN_UNION})",
        known_types, as_dict=True,
    )
    pending = result[0]["cnt"] if result else 0
    return {"pending": pending, "job_active": job_active}


def _extract_batch_worker(site=None, **kwargs):
    """
    Background worker: processes the next 20 pending VE Drive Files.
    Phases: (1) parse + save metadata, (2) parallel download texts,
            (3) sequential LLM extraction with stub records on persistent failure.
    Re-enqueues itself until all files are extracted.
    Batch kept small (20) so each run finishes well within the 7200s RQ timeout.
    """
    BATCH_SIZE = 20
    HEARTBEAT_EVERY = 5    # renew cache TTL every N files to prevent orphan flag

    from hr_client.drive_sync.extractor import (
        _DOC_TYPE_CONFIG, extract_and_save, parallel_download_texts, create_stub_record,
    )
    from hr_client.drive_sync.parser import (
        parse_filename, folder_path_to_module,
        folder_path_to_doc_type, folder_path_to_direction,
    )

    def _heartbeat():
        frappe.cache().set_value("ve_extraction_active", 1, expires_in_sec=3600)

    try:
        known_types = list(_DOC_TYPE_CONFIG.keys())
        if not known_types:
            frappe.cache().delete_key("ve_extraction_active")
            return

        placeholders = ", ".join(["%s"] * len(known_types))
        rows = frappe.db.sql(
            f"SELECT name, file_name, folder_path, doc_type, drive_file_id, mime_type "
            f"FROM `tabVE Drive File` "
            f"WHERE doc_type IN ({placeholders}) "
            f"AND sync_status != 'Error' "
            f"AND drive_file_id IS NOT NULL AND drive_file_id != '' "
            f"AND drive_file_id NOT IN ({_NOT_IN_UNION}) "
            f"ORDER BY last_synced ASC LIMIT %s",  # ASC: process oldest first for variety
            known_types + [BATCH_SIZE],
            as_dict=True,
        )

        if not rows:
            frappe.cache().delete_key("ve_extraction_active")
            frappe.log_error("All files processed!", "VE Extraction Done")
            return

        # ── Phase 1: parse + save all VE Drive File metadata, single commit ──
        docs = []
        for row in rows:
            try:
                doc = frappe.get_doc("VE Drive File", row["name"])
                parsed = parse_filename(doc.file_name)
                folder_doc_type = folder_path_to_doc_type(doc.folder_path or "")
                folder_direction = folder_path_to_direction(doc.folder_path or "")
                doc.doc_type = folder_doc_type or parsed.get("doc_type") or doc.doc_type or ""
                doc.party_name = parsed.get("party") or doc.party_name or ""
                doc.doc_date = parsed.get("date") or doc.doc_date
                doc.direction = folder_direction or parsed.get("direction", "Unknown")
                doc.naming_valid = 1 if (parsed.get("date") and doc.doc_type) else 0
                if doc.folder_path:
                    doc.module = folder_path_to_module(doc.folder_path)
                doc.sync_status = "Synced"
                doc.save(ignore_permissions=True)
                docs.append(doc)
            except Exception:
                frappe.log_error(frappe.get_traceback(), f"VE Extraction parse: {row.get('name')}")
        frappe.db.commit()

        # ── Phase 2: parallel download texts (non-blocking, 30s socket timeout) ──
        creds_info = frappe.conf.get("ve_drive_service_account")
        text_cache = {}
        if creds_info:
            try:
                text_cache = parallel_download_texts(rows, creds_info)
            except Exception:
                frappe.log_error(frappe.get_traceback(), "VE Extraction: parallel download failed")

        # ── Phase 3: sequential LLM extraction ────────────────────────────
        success, skip, fail, stub = 0, 0, 0, 0
        for i, doc in enumerate(docs):
            # Heartbeat: renew cache TTL so orphan detection works
            if i % HEARTBEAT_EVERY == 0:
                _heartbeat()

            try:
                if not doc.doc_type:
                    skip += 1
                    continue

                # Use cached text; if this file wasn't cached but others were → use ""
                # (means download failed → falls back to filename in extract_and_save)
                prefetched = text_cache.get(doc.name)
                if prefetched is None and len(text_cache) > 0:
                    prefetched = ""

                result = extract_and_save(
                    doc,
                    prefetched_text=prefetched,
                    create_stub_on_fail=True,  # prevents infinite re-processing
                )
                if result.get("skipped"):
                    skip += 1
                elif result.get("success") is not False:
                    success += 1
                else:
                    # LLM failed — stub was created by extract_and_save
                    stub += 1

            except Exception:
                fail += 1
                frappe.log_error(frappe.get_traceback(), f"VE Extraction LLM: {doc.name}")
                # Create stub so this file doesn't block future batches
                try:
                    from hr_client.drive_sync.extractor import _DOC_TYPE_CONFIG as _DTC
                    if doc.doc_type in _DTC:
                        target_dt = _DTC[doc.doc_type][0]
                        create_stub_record(target_dt, doc.drive_file_id)
                        stub += 1
                except Exception:
                    pass

        frappe.log_error(
            f"Batch done: {success} extracted, {skip} skipped, {stub} stubbed, {fail} errors. Re-enqueueing…",
            "VE Extraction Progress",
        )

        frappe.enqueue(
            "hr_client.drive_sync.api._extract_batch_worker",
            queue="long",
            timeout=7200,
            is_async=True,
        )

    except Exception:
        frappe.cache().delete_key("ve_extraction_active")
        frappe.log_error(frappe.get_traceback(), "VE Extraction Batch Worker Failed")
        raise
