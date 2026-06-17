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
def get_files(module="All", direction=None, naming_valid=None, page=1, page_length=100):
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
        ],
        order_by="doc_date desc, last_synced desc",
        start=(page - 1) * page_length,
        page_length=page_length,
    )
    return files


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
    "Receipt":         "sales_invoices",
    "SalesOrder":      "sales_invoices",
    "DeliveryNote":    "sales_invoices",
    "Quotation":       "quotations",
    "PurchaseInvoice": "purchase_invoices",
    "PurchaseOrder":   "purchase_orders",
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


@frappe.whitelist()
def get_structured_data():
    """Return VE Drive File records organised by doc_type for the Business Dashboard."""
    files = frappe.get_all(
        "VE Drive File",
        filters={"sync_status": ["in", ["Synced", "Pending"]]},
        fields=[
            "name", "file_name", "doc_type", "party_name", "doc_date",
            "direction", "module", "web_view_link", "naming_valid",
        ],
        order_by="doc_date desc",
        limit=500,
    )

    buckets = {
        "sales_invoices": [],
        "quotations": [],
        "purchase_invoices": [],
        "purchase_orders": [],
        "grns": [],
        "financial_reports": [],
        "salary_records": [],
        "attendance_records": [],
        "payment_records": [],
    }

    for f in files:
        dtype = f.get("doc_type") or ""
        bucket = _DOC_TYPE_TO_BUCKET.get(dtype)
        if not bucket:
            continue

        row = {
            "name": f["name"],
            "file_name": f["file_name"],
            "doc_type": dtype,
            "party_name": f.get("party_name"),
            "doc_date": f.get("doc_date"),
            "direction": f.get("direction"),
            "module": f.get("module"),
            "web_view_link": f.get("web_view_link"),
            "naming_valid": f.get("naming_valid"),
            # Amount fields not yet extracted from file content — show 0
            "total_amount": 0,
            "confidence_score": None,
            "payment_status": "Pending",
            # Alias fields expected by the frontend per doc type
            "invoice_number": f["file_name"],
            "invoice_date": f.get("doc_date"),
            "client_name": f.get("party_name"),
            "vendor_name": f.get("party_name"),
            "po_number": f["file_name"],
            "po_date": f.get("doc_date"),
            "total_value": 0,
            "status": "Open",
            "quote_number": f["file_name"],
            "quote_date": f.get("doc_date"),
            "final_value": 0,
            "grn_number": f["file_name"],
            "grn_date": f.get("doc_date"),
            "report_type": _FINANCIAL_REPORT_TYPE.get(dtype, dtype),
            "from_date": f.get("doc_date") or "",
            "period": "",
            "total_revenue": 0,
            "total_expenses": 0,
            "net_profit": 0,
            "total_assets": 0,
            "total_liabilities": 0,
            "equity": 0,
            "employee_name": f.get("party_name"),
            "month_year": f.get("doc_date") or "",
            "gross_salary": 0,
            "net_salary": 0,
            "total_deductions": 0,
            "pf_amount": 0,
            "tds_amount": 0,
        }
        buckets[bucket].append(row)

    totals = {
        "total_sales": 0,
        "total_purchases": 0,
        "gross_margin": 0,
        "total_receivables": 0,
        "total_payables": 0,
        "overdue_invoices": 0,
        "pending_pos": len(buckets["purchase_orders"]),
        "open_quotations": len(buckets["quotations"]),
    }

    return {**buckets, "totals": totals}


@frappe.whitelist(methods=["POST"])
def process_file(drive_file_name, force=0):
    """Re-run filename parsing for a single VE Drive File record."""
    from hr_client.drive_sync.parser import parse_filename, folder_path_to_module

    try:
        doc = frappe.get_doc("VE Drive File", drive_file_name)
    except frappe.DoesNotExistError:
        return {"success": False, "reason": "File not found"}

    parsed = parse_filename(doc.file_name)
    doc.doc_type = parsed.get("doc_type")
    doc.party_name = parsed.get("party")
    doc.doc_date = parsed.get("date")
    doc.direction = parsed.get("direction", "Unknown")
    doc.naming_valid = 1 if parsed.get("naming_valid") else 0
    if doc.folder_path:
        doc.module = folder_path_to_module(doc.folder_path)
    doc.sync_status = "Synced"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "doc_type": doc.doc_type, "direction": doc.direction}


@frappe.whitelist(methods=["POST"])
def process_all_files(limit=100, force=0):
    """Re-run filename parsing for all VE Drive File records."""
    from hr_client.drive_sync.parser import parse_filename, folder_path_to_module

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
            doc.doc_type = parsed.get("doc_type")
            doc.party_name = parsed.get("party")
            doc.doc_date = parsed.get("date")
            doc.direction = parsed.get("direction", "Unknown")
            doc.naming_valid = 1 if parsed.get("naming_valid") else 0
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
