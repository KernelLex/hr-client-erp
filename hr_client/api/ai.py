import frappe
import json
from hr_client.utils.llm import (
    is_ollama_running,
    get_available_models,
    ask_llm,
    ask_llm_json,
    build_context,
    VERA_SYSTEM_PROMPT,
)

_VE_DOCTYPES = [
    "VE Sales Invoice", "VE Purchase Invoice", "VE Purchase Order", "VE Quotation",
    "VE Credit Note", "VE Debit Note", "VE Financial Report", "VE Salary Record",
    "VE Stock Record", "VE Sales Order", "VE GRN", "VE Payment Record",
    "VE Attendance Record",
]

_SKIP_FIELDS = frozenset([
    "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype",
    "original_extracted", "extraction_confidence", "items_json", "raw_data_json",
    "records_json", "earnings_json", "deductions_json",
    # verification metadata — not extracted business fields
    "verification_status", "confidence_score", "verified_by", "verified_on",
    "extraction_attempts", "manual_review_required", "last_extraction_at",
    "extraction_method", "drive_file", "extraction_history", "correction_notes",
])

# Map generic original_extracted field names → doctype-specific structured field names
_ORIG_TO_STRUCT = {
    "VE Sales Invoice":    {"party_name": "client_name", "date": "invoice_date", "document_number": "invoice_number", "amount": "total_amount"},
    "VE Purchase Invoice": {"party_name": "vendor_name", "date": "invoice_date", "document_number": "invoice_number", "amount": "total_amount"},
    "VE Purchase Order":   {"party_name": "vendor_name", "date": "po_date",      "document_number": "po_number",      "amount": "total_value"},
    "VE Quotation":        {"party_name": "client_name", "date": "quote_date",   "document_number": "quote_number",   "amount": "total_value"},
    "VE Sales Order":      {"party_name": "client_name", "date": "so_date",      "document_number": "so_number",      "amount": "total_amount"},
    "VE GRN":              {"party_name": "vendor_name", "date": "grn_date",     "document_number": "grn_number",     "amount": "total_value"},
    "VE Payment Record":   {"party_name": "party_name",  "date": "payment_date", "document_number": "payment_number", "amount": "amount"},
    "VE Salary Record":    {"party_name": "employee_name","date": "salary_month","document_number": "name",           "amount": "net_salary"},
    "VE Attendance Record":{"party_name": "employee_name","date": "period",      "document_number": "name",           "amount": "present_days"},
    "VE Financial Report": {"party_name": "party_name",  "date": "period",       "document_number": "name",           "amount": "net_profit"},
    "VE Credit Note":      {"party_name": "client_name", "date": "cn_date",      "document_number": "cn_number",      "amount": "total_amount"},
    "VE Debit Note":       {"party_name": "vendor_name", "date": "dn_date",      "document_number": "dn_number",      "amount": "total_amount"},
}

_ORIG_SKIP = frozenset([
    "drive_file", "extraction_method", "verification_status", "confidence_score",
    "extraction_attempts",
])


def _build_rich_context() -> str:
    """Build an accurate LLM context using SQL aggregates + selective recent records."""
    parts = []
    try:
        row = frappe.db.sql("""
            SELECT
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Invoice`) + (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Order`) as total_sales,
                (SELECT COUNT(*) FROM `tabVE Sales Invoice`) + (SELECT COUNT(*) FROM `tabVE Sales Order`) as si_count,
                (SELECT COUNT(*) FROM `tabVE Sales Invoice` WHERE payment_status = 'Overdue') as overdue_count,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Invoice` WHERE payment_status = 'Overdue') as overdue_amt,
                (SELECT COUNT(*) FROM `tabVE Sales Invoice` WHERE payment_status = 'Pending') as pending_count,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Invoice` WHERE payment_status = 'Pending') as pending_amt,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Purchase Invoice`) as total_purchases,
                (SELECT COUNT(*) FROM `tabVE Purchase Invoice`) as pi_count,
                (SELECT COUNT(*) FROM `tabVE Purchase Order` WHERE status = 'Open' OR status IS NULL) as open_pos,
                (SELECT COALESCE(SUM(total_value), 0) FROM `tabVE Purchase Order`) as total_po_value,
                (SELECT COUNT(*) FROM `tabVE Quotation` WHERE status IN ('Draft', 'Sent') OR status IS NULL) as open_quotes,
                (SELECT COALESCE(SUM(total_value), 0) FROM `tabVE Quotation`) as total_quoted,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Order`) as total_order_book,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Credit Note`) as total_credit_notes,
                (SELECT COALESCE(SUM(amount), 0) FROM `tabVE Payment Record`) as total_payments
        """, as_dict=True)
        d = dict(row[0]) if row else {}
        parts.append("=== VERA ENTERPRISES — BUSINESS SNAPSHOT ===")
        parts.append(f"Sales Revenue: ₹{float(d.get('total_sales', 0)):,.0f} across {int(d.get('si_count', 0))} invoices")
        parts.append(f"  Overdue: {int(d.get('overdue_count', 0))} invoices totalling ₹{float(d.get('overdue_amt', 0)):,.0f}")
        parts.append(f"  Pending: {int(d.get('pending_count', 0))} invoices totalling ₹{float(d.get('pending_amt', 0)):,.0f}")
        parts.append(f"Purchase Spend: ₹{float(d.get('total_purchases', 0)):,.0f} across {int(d.get('pi_count', 0))} invoices")
        parts.append(f"Open POs: {int(d.get('open_pos', 0))} orders (total PO value ₹{float(d.get('total_po_value', 0)):,.0f})")
        parts.append(f"Quotations: {int(d.get('open_quotes', 0))} open (pipeline ₹{float(d.get('total_quoted', 0)):,.0f})")
        parts.append(f"Sales Order Book: ₹{float(d.get('total_order_book', 0)):,.0f}")
        parts.append(f"Credit Notes Issued: ₹{float(d.get('total_credit_notes', 0)):,.0f}")
        parts.append(f"Payments Recorded: ₹{float(d.get('total_payments', 0)):,.0f}")
    except Exception as e:
        frappe.log_error(str(e)[:300], "AI: _build_rich_context aggregates")

    # Top clients by revenue
    try:
        top_clients = frappe.db.sql("""
            SELECT client_name, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total
            FROM `tabVE Sales Invoice`
            WHERE client_name IS NOT NULL AND client_name != ''
            GROUP BY client_name ORDER BY total DESC LIMIT 5
        """, as_dict=True)
        if top_clients:
            parts.append("\n=== TOP 5 CLIENTS BY REVENUE ===")
            for c in top_clients:
                parts.append(f"- {c['client_name']}: ₹{float(c['total']):,.0f} ({int(c['cnt'])} invoices)")
    except Exception:
        pass

    # Overdue invoices detail
    try:
        overdue = frappe.db.get_all(
            "VE Sales Invoice",
            filters={"payment_status": "Overdue"},
            fields=["invoice_number", "client_name", "total_amount", "due_date"],
            order_by="total_amount desc", limit=5
        )
        if overdue:
            parts.append("\n=== OVERDUE INVOICES (Top 5 by amount) ===")
            for inv in overdue:
                parts.append(f"- {inv.get('invoice_number','N/A')} | {inv.get('client_name','N/A')} | ₹{float(inv.get('total_amount',0)):,.0f} | Due: {inv.get('due_date','N/A')}")
    except Exception:
        pass

    return "\n".join(parts)


def _orig_fallback(record, key, default=""):
    """Get a value from original_extracted JSON when structured field is empty."""
    try:
        orig = json.loads(record.get("original_extracted") or "{}")
        val = orig.get(key)
        return str(val) if val not in (None, "") else default
    except Exception:
        return default


def _require_admin():
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Not permitted", frappe.PermissionError)


def _get_structured_data():
    """Pull all structured VE DocType data for AI context."""
    result = {}
    try:
        result["sales_invoices"] = frappe.db.get_all(
            "VE Sales Invoice", fields=["*"], order_by="invoice_date desc", limit=100
        )
        result["quotations"] = frappe.db.get_all(
            "VE Quotation", fields=["*"], order_by="quote_date desc", limit=50
        )
        result["purchase_invoices"] = frappe.db.get_all(
            "VE Purchase Invoice", fields=["*"], order_by="invoice_date desc", limit=100
        )
        result["purchase_orders"] = frappe.db.get_all(
            "VE Purchase Order", fields=["*"], order_by="po_date desc", limit=50
        )
        result["grns"] = frappe.db.get_all(
            "VE GRN", fields=["*"], order_by="grn_date desc", limit=30
        )
        result["financial_reports"] = frappe.db.get_all(
            "VE Financial Report", fields=["*"], order_by="creation desc", limit=20
        )
        result["payment_records"] = frappe.db.get_all(
            "VE Payment Record", fields=["*"], order_by="payment_date desc", limit=50
        )
        result["salary_records"] = frappe.db.get_all(
            "VE Salary Record", fields=["*"], order_by="creation desc", limit=30
        )
        result["attendance_records"] = frappe.db.get_all(
            "VE Attendance Record", fields=["*"], order_by="creation desc", limit=10
        )
    except Exception as e:
        frappe.log_error(str(e)[:500], "AI: get_structured_data")
    return result


def _get_structured_for_file(drive_file_name: str) -> dict:
    """Get structured record linked to a specific VE Drive File (by docname)."""
    # VE structured DocTypes store the Google Drive file ID in drive_file — resolve it first
    drive_file_id = frappe.db.get_value("VE Drive File", drive_file_name, "drive_file_id")
    if not drive_file_id:
        return {}
    doctypes = [
        "VE Sales Invoice", "VE Purchase Invoice", "VE Purchase Order",
        "VE Quotation", "VE GRN", "VE Financial Report", "VE Salary Record",
        "VE Attendance Record", "VE Payment Record",
    ]
    for dt in doctypes:
        rec = frappe.db.get_value(dt, {"drive_file": drive_file_id}, "*", as_dict=True)
        if rec:
            return {"doctype": dt, "record": rec}
    return {}


@frappe.whitelist()
def check_ai_status():
    running = is_ollama_running()
    models = get_available_models() if running else []
    return {
        "ollama_running": running,
        "models": models,
        "active_model": models[0] if models else None,
        "ready": running and bool(models),
    }


@frappe.whitelist()
def analyse_document(drive_file_name):
    """Analyse a single drive file and return AI insights."""
    if not is_ollama_running():
        return {"success": False, "reason": "Ollama not running"}

    drive_file = frappe.get_doc("VE Drive File", drive_file_name)
    linked = _get_structured_for_file(drive_file_name)

    context_lines = [
        f"File: {drive_file.file_name}",
        f"Module: {drive_file.module}",
        f"Doc Type: {drive_file.doc_type}",
        f"Party: {drive_file.party_name or 'Unknown'}",
        f"Date: {drive_file.doc_date}",
        f"Sync Status: {drive_file.sync_status}",
    ]

    if linked:
        rec = linked["record"]
        context_lines.append(f"\nExtracted Data ({linked['doctype']}):")
        for k, v in rec.items():
            if v and k not in ("name", "creation", "modified", "owner", "modified_by",
                               "docstatus", "idx", "items_json", "raw_data_json",
                               "earnings_json", "deductions_json", "records_json"):
                context_lines.append(f"  {k}: {v}")

    prompt = (
        "Analyse this business document and provide:\n"
        "1. A one-line summary\n"
        "2. Key figures (amounts, dates, parties)\n"
        "3. Any risks or action items\n"
        "4. Suggested next steps\n\n"
        + "\n".join(context_lines)
    )

    analysis = ask_llm(prompt, system=VERA_SYSTEM_PROMPT, temperature=0.3)
    return {"success": True, "analysis": analysis, "linked": linked}


@frappe.whitelist()
def analyse_selected(doc_names_json):
    """Analyse multiple selected drive files."""
    if not is_ollama_running():
        return {"success": False, "reason": "Ollama not running"}

    doc_names = json.loads(doc_names_json) if isinstance(doc_names_json, str) else doc_names_json
    if not doc_names:
        return {"success": False, "reason": "No documents selected"}

    summaries = []
    for name in doc_names[:10]:
        try:
            df = frappe.get_doc("VE Drive File", name)
            linked = _get_structured_for_file(name)
            rec = linked.get("record", {})
            amount = (
                rec.get("total_amount") or rec.get("total_value") or
                rec.get("net_salary") or rec.get("amount") or 0
            )
            summaries.append(
                f"- {df.file_name} ({df.doc_type}, {df.party_name or 'N/A'}): "
                f"₹{float(amount or 0):,.0f}, status={df.sync_status}"
            )
        except Exception:
            pass

    prompt = (
        f"Analyse these {len(summaries)} business documents together:\n"
        + "\n".join(summaries)
        + "\n\nProvide:\n"
        "1. Common patterns or themes\n"
        "2. Total value across documents\n"
        "3. Key risks or anomalies\n"
        "4. Recommended actions"
    )

    analysis = ask_llm(prompt, system=VERA_SYSTEM_PROMPT, temperature=0.3)
    return {"success": True, "analysis": analysis, "count": len(summaries)}


@frappe.whitelist()
def get_business_snapshot():
    """Quick aggregate snapshot for AI Insights page — no LLM required."""
    _require_admin()
    try:
        row = frappe.db.sql("""
            SELECT
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Invoice`) + (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Order`) as total_sales,
                (SELECT COUNT(*) FROM `tabVE Sales Invoice`) + (SELECT COUNT(*) FROM `tabVE Sales Order`) as si_count,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Purchase Invoice`) as total_purchases,
                (SELECT COUNT(*) FROM `tabVE Purchase Invoice`) as pi_count,
                (SELECT COUNT(*) FROM `tabVE Purchase Order` WHERE status = 'Open' OR status IS NULL) as open_pos,
                (SELECT COALESCE(SUM(total_value), 0) FROM `tabVE Purchase Order` WHERE status = 'Open' OR status IS NULL) as open_po_value,
                (SELECT COUNT(*) FROM `tabVE Quotation` WHERE status IN ('Draft', 'Sent') OR status IS NULL) as open_quotations,
                (SELECT COALESCE(SUM(total_value), 0) FROM `tabVE Quotation` WHERE status IN ('Draft', 'Sent') OR status IS NULL) as open_quotation_value,
                (SELECT COUNT(*) FROM `tabVE Sales Invoice` WHERE payment_status = 'Overdue') as overdue_invoices,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Invoice` WHERE payment_status = 'Overdue') as overdue_amount,
                (SELECT COUNT(*) FROM `tabVE Sales Invoice` WHERE payment_status = 'Pending') as pending_invoices,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Invoice` WHERE payment_status = 'Pending') as pending_amount,
                (SELECT COALESCE(SUM(total_amount), 0) FROM `tabVE Sales Order`) as total_order_book
        """, as_dict=True)
        d = dict(row[0]) if row else {}
        return {
            "success": True,
            "total_sales": float(d.get("total_sales") or 0),
            "si_count": int(d.get("si_count") or 0),
            "total_purchases": float(d.get("total_purchases") or 0),
            "pi_count": int(d.get("pi_count") or 0),
            "open_pos": int(d.get("open_pos") or 0),
            "open_po_value": float(d.get("open_po_value") or 0),
            "open_quotations": int(d.get("open_quotations") or 0),
            "open_quotation_value": float(d.get("open_quotation_value") or 0),
            "overdue_invoices": int(d.get("overdue_invoices") or 0),
            "overdue_amount": float(d.get("overdue_amount") or 0),
            "pending_invoices": int(d.get("pending_invoices") or 0),
            "pending_amount": float(d.get("pending_amount") or 0),
            "total_order_book": float(d.get("total_order_book") or 0),
        }
    except Exception as e:
        frappe.log_error(str(e)[:300], "AI: get_business_snapshot")
        return {"success": False}


@frappe.whitelist()
def get_dashboard_insights():
    """Generate AI health score and key insights for the business dashboard."""
    if not is_ollama_running():
        return {
            "success": False,
            "reason": "Ollama not running",
            "health_score": None,
            "insights": [],
            "alerts": [],
        }

    context = _build_rich_context()

    prompt = (
        "Based on this business data for Vera Enterprises (Indian SME), provide a JSON response with:\n"
        "- health_score: integer 0-100 (overall financial health)\n"
        "- health_label: 'Excellent'|'Good'|'Fair'|'Poor'\n"
        "- insights: array of 3-5 key insight strings (be specific with numbers from the data)\n"
        "- alerts: array of urgent action items (overdue payments, high risks, anomalies)\n"
        "- recommendations: array of 2-3 strategic recommendations\n\n"
        f"Business Data:\n{context}"
    )

    result = ask_llm_json(prompt, system=VERA_SYSTEM_PROMPT)
    if not result:
        return {"success": False, "reason": "LLM did not return valid JSON"}

    result["success"] = True
    return result


@frappe.whitelist()
def compare_periods(period1, period2):
    """Compare two periods using direct DB queries for accuracy."""
    if not is_ollama_running():
        return {"success": False, "reason": "Ollama not running"}

    def _get_period_stats(period):
        try:
            s = frappe.db.sql(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM `tabVE Sales Invoice` WHERE invoice_date LIKE %s",
                (f"{period}%",), as_dict=True,
            )
            p = frappe.db.sql(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM `tabVE Purchase Invoice` WHERE invoice_date LIKE %s",
                (f"{period}%",), as_dict=True,
            )
            return {
                "sales": float(s[0]["total"]), "sales_count": int(s[0]["cnt"]),
                "purchases": float(p[0]["total"]), "purchase_count": int(p[0]["cnt"]),
            }
        except Exception:
            return {"sales": 0.0, "sales_count": 0, "purchases": 0.0, "purchase_count": 0}

    d1 = _get_period_stats(period1)
    d2 = _get_period_stats(period2)

    revenue_chg = ((d2["sales"] - d1["sales"]) / d1["sales"] * 100) if d1["sales"] > 0 else 0.0
    expense_chg = ((d2["purchases"] - d1["purchases"]) / d1["purchases"] * 100) if d1["purchases"] > 0 else 0.0

    context = (
        f"Period 1 ({period1}): Sales ₹{d1['sales']:,.0f} ({d1['sales_count']} invoices), "
        f"Purchases ₹{d1['purchases']:,.0f} ({d1['purchase_count']} invoices)\n"
        f"Period 2 ({period2}): Sales ₹{d2['sales']:,.0f} ({d2['sales_count']} invoices), "
        f"Purchases ₹{d2['purchases']:,.0f} ({d2['purchase_count']} invoices)\n"
        f"Revenue change: {revenue_chg:+.1f}%, Purchase change: {expense_chg:+.1f}%"
    )

    prompt = (
        f"Compare business performance for Vera Enterprises between {period1} and {period2}.\n{context}\n\n"
        "Return JSON with:\n"
        "- summary: one paragraph comparison (2-3 sentences, mention specific numbers)\n"
        "- revenue_change_pct: number\n"
        "- expense_change_pct: number\n"
        "- trend: 'improving'|'declining'|'stable'\n"
        "- key_differences: array of 2-3 key insight strings\n"
        "- recommendation: one actionable recommendation string"
    )

    result = ask_llm_json(prompt, system=VERA_SYSTEM_PROMPT)
    if not result:
        trend = "improving" if revenue_chg > 5 else "declining" if revenue_chg < -5 else "stable"
        result = {
            "summary": f"Sales {'increased' if revenue_chg >= 0 else 'decreased'} by {abs(revenue_chg):.1f}% in {period2} compared to {period1}.",
            "trend": trend,
            "key_differences": [context],
            "recommendation": "Review individual records in the Business Dashboard for more detail.",
        }

    result.update({
        "success": True,
        "period1": period1,
        "period2": period2,
        "revenue_change_pct": round(revenue_chg, 1),
        "expense_change_pct": round(expense_chg, 1),
        "period1_data": {"sales": d1["sales"], "purchases": d1["purchases"], "count": d1["sales_count"] + d1["purchase_count"]},
        "period2_data": {"sales": d2["sales"], "purchases": d2["purchases"], "count": d2["sales_count"] + d2["purchase_count"]},
    })
    return result


@frappe.whitelist()
def chat(message, history_json=None, context_type="general"):
    """Chat with Vera AI. context_type: general|dashboard|file"""
    if not is_ollama_running():
        return {
            "success": False,
            "reply": "Vera AI is offline. Please start Ollama to use AI features.",
        }

    history = []
    if history_json:
        history = json.loads(history_json) if isinstance(history_json, str) else history_json

    data = _get_structured_data()
    context = build_context(data)

    system = VERA_SYSTEM_PROMPT + f"\n\nCurrent Business Context:\n{context}"

    messages_for_llm = []
    for h in history[-8:]:
        messages_for_llm.append({"role": h["role"], "content": h["content"]})
    messages_for_llm.append({"role": "user", "content": message})

    try:
        import requests as _requests
        from hr_client.utils.llm import _pick_model, OLLAMA_BASE
        model = _pick_model()
        api_messages = [{"role": "system", "content": system}] + messages_for_llm
        resp = _requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json={"model": model, "messages": api_messages, "stream": False,
                  "options": {"temperature": 0.4, "num_predict": 512}},
            timeout=60,
        )
        if resp.status_code == 200:
            reply = resp.json().get("message", {}).get("content", "")
            return {"success": True, "reply": reply}
    except Exception as e:
        frappe.log_error(str(e)[:500], "AI Chat Error")

    return {"success": False, "reply": "Failed to get a response. Please try again."}


@frappe.whitelist()
def generate_report(report_type, filters_json=None):
    """Generate a natural language business report."""
    if not is_ollama_running():
        return {"success": False, "reason": "Ollama not running"}

    filters = {}
    if filters_json:
        filters = json.loads(filters_json) if isinstance(filters_json, str) else filters_json

    context = _build_rich_context()

    report_prompts = {
        "executive_summary": "Write a concise executive summary of current business performance for Vera Enterprises.",
        "cash_flow": "Analyse cash flow for Vera Enterprises: receivables vs payables, overdue amounts, payment timing risks.",
        "sales_analysis": "Analyse sales performance: top clients by revenue, payment status breakdown, overdue risks, quotation pipeline.",
        "vendor_analysis": "Analyse vendor relationships: top vendors, purchase patterns, open POs, outstanding payment obligations.",
        "risk_report": "Identify key financial risks: overdue payments, client concentration, pending obligations, recommended mitigations.",
    }

    base_prompt = report_prompts.get(report_type, f"Generate a {report_type} report for Vera Enterprises.")
    prompt = (
        f"{base_prompt}\n\nBusiness Data:\n{context}\n\n"
        "Format as a professional business report with clear sections. Use ₹ for Indian Rupees. "
        "Be specific — reference actual numbers from the data provided."
    )

    report = ask_llm(prompt, system=VERA_SYSTEM_PROMPT, temperature=0.3, max_tokens=2048)
    return {"success": True, "report_type": report_type, "report": report}


@frappe.whitelist()
def get_ai_health():
    """Comprehensive AI and system health check for the admin dashboard widget."""
    import time
    import requests as _req
    from hr_client.utils.llm import is_ollama_running, get_available_models, OLLAMA_BASE

    health = {
        "ollama": {"status": "offline", "model": None, "response_time_ms": None, "models_available": [], "error": None},
        "extraction": {"total_files": 0, "processed": 0, "pending": 0, "failed": 0, "success_rate": 0},
        "drive_sync": {"last_sync": None, "last_sync_status": None, "files_found": 0, "sync_health": "unknown", "hours_ago": None},
        "data_quality": {"total_structured": 0, "with_amounts": 0, "with_parties": 0, "quality_score": 0},
        "overall_score": 0,
        "overall_label": "Unknown",
        "overall_color": "gray",
    }

    # ── Ollama check ──────────────────────────────────────────────────────────
    if is_ollama_running():
        models = get_available_models()
        health["ollama"]["models_available"] = models
        if models:
            model = models[0]
            health["ollama"]["model"] = model
            start = time.time()
            try:
                resp = _req.post(
                    f"{OLLAMA_BASE}/api/chat",
                    json={"model": model, "messages": [{"role": "user", "content": "OK"}],
                          "stream": False, "options": {"num_predict": 3}},
                    timeout=30,
                )
                elapsed = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    health["ollama"]["response_time_ms"] = elapsed
                    health["ollama"]["status"] = "healthy"
            except Exception as e:
                health["ollama"]["status"] = "error"
                health["ollama"]["error"] = str(e)[:100]
        else:
            health["ollama"]["status"] = "online_no_model"
    
    # ── Extraction stats — count VE structured records vs total Drive files ───
    try:
        total = frappe.db.count("VE Drive File")
        # Count how many Drive files have a corresponding structured VE record
        processed = frappe.db.sql("""
            SELECT COUNT(DISTINCT drive_file_id) FROM `tabVE Drive File` df
            WHERE EXISTS (
                SELECT 1 FROM `tabVE Sales Invoice`    WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Sales Order`      WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Purchase Invoice` WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Purchase Order`   WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Quotation`        WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE GRN`              WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Financial Report` WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Salary Record`    WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Receipt`          WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Payment Record`   WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Credit Note`      WHERE drive_file = df.drive_file_id
                UNION ALL
                SELECT 1 FROM `tabVE Debit Note`       WHERE drive_file = df.drive_file_id
            )
        """)[0][0]
        pending = total - processed
        health["extraction"].update({
            "total_files": total, "processed": processed, "pending": pending,
            "failed": 0,
            "success_rate": round(processed / total * 100) if total > 0 else 0,
        })
    except Exception:
        pass

    # ── Drive sync ────────────────────────────────────────────────────────────
    try:
        last_sync = frappe.db.sql(
            "SELECT sync_time, sync_status, files_found FROM `tabVE Drive Sync Log` ORDER BY creation DESC LIMIT 1",
            as_dict=True,
        )
        if last_sync:
            ls = last_sync[0]
            from frappe.utils import now_datetime, time_diff_in_hours
            hours_ago = round(time_diff_in_hours(now_datetime(), ls["sync_time"]), 1) if ls.get("sync_time") else None
            health["drive_sync"].update({
                "last_sync": str(ls.get("sync_time", "")),
                "last_sync_status": ls.get("sync_status", ""),
                "files_found": ls.get("files_found", 0),
                "hours_ago": hours_ago,
                "sync_health": "good" if hours_ago is not None and hours_ago < 1 else ("ok" if hours_ago is not None and hours_ago < 3 else "stale"),
            })
    except Exception:
        pass

    # ── Data quality ──────────────────────────────────────────────────────────
    doctypes_checks = [
        ("VE Sales Invoice", "total_amount", "client_name"),
        ("VE Purchase Invoice", "total_amount", "vendor_name"),
        ("VE Purchase Order", "total_value", "vendor_name"),
        ("VE Quotation", "total_value", "client_name"),
        ("VE Financial Report", "net_profit", None),
        ("VE Sales Order", "total_amount", "client_name"),
        ("VE Credit Note", "total_amount", "client_name"),
        ("VE Debit Note", "total_amount", "vendor_name"),
        ("VE Stock Record", "total_value", None),
    ]
    total_structured = 0
    with_amounts = 0
    with_parties = 0
    for dt, amt_field, party_field in doctypes_checks:
        try:
            count = frappe.db.count(dt)
            total_structured += count
            if amt_field:
                with_amounts += frappe.db.sql(
                    f"SELECT COUNT(*) FROM `tab{dt}` WHERE `{amt_field}` > 0"
                )[0][0]
            if party_field:
                with_parties += frappe.db.sql(
                    f"SELECT COUNT(*) FROM `tab{dt}` WHERE `{party_field}` != '' AND `{party_field}` IS NOT NULL"
                )[0][0]
        except Exception:
            continue
    health["data_quality"].update({
        "total_structured": total_structured,
        "with_amounts": with_amounts,
        "with_parties": with_parties,
        "quality_score": round(with_amounts / total_structured * 100) if total_structured > 0 else 0,
    })

    # ── Overall score (average of 4 components, each 0-100) ───────────────────
    ollama_score = (
        100 if health["ollama"]["status"] == "healthy" and (health["ollama"]["response_time_ms"] or 9999) < 2000
        else 70 if health["ollama"]["status"] == "healthy"
        else 50 if health["ollama"]["status"] in ("online", "online_no_model")
        else 0
    )
    sync_score = {"good": 100, "ok": 70, "stale": 30, "unknown": 0}.get(health["drive_sync"]["sync_health"], 0)
    overall = round((ollama_score + health["extraction"]["success_rate"] + sync_score + health["data_quality"]["quality_score"]) / 4)
    health["overall_score"] = overall
    if overall >= 85:
        health["overall_label"], health["overall_color"] = "Excellent", "green"
    elif overall >= 70:
        health["overall_label"], health["overall_color"] = "Good", "blue"
    elif overall >= 50:
        health["overall_label"], health["overall_color"] = "Fair", "yellow"
    else:
        health["overall_label"], health["overall_color"] = "Poor", "red"

    return health


# ── Verification System ──────────────────────────────────────────────────────

@frappe.whitelist()
def get_verification_queue(status="Unverified", doctype=None):
    """Return all records needing verification, sorted by confidence ascending."""
    _require_admin()
    targets = [doctype] if doctype else _VE_DOCTYPES
    all_records = []
    for dt in targets:
        try:
            filters = {}
            if status and status != "All":
                filters["verification_status"] = status
            records = frappe.db.get_all(
                dt,
                filters=filters,
                fields=["name", "verification_status", "confidence_score",
                        "drive_file", "extraction_method", "verified_by", "verified_on"],
                order_by="confidence_score asc",
            )
            for r in records:
                score = r.get("confidence_score") or 0
                r["doctype"] = dt
                r["priority"] = "high" if score < 40 else "medium" if score < 70 else "low"
            all_records.extend(records)
        except Exception as e:
            frappe.log_error(str(e)[:300], f"verify_queue: {dt}")
    all_records.sort(key=lambda x: x.get("confidence_score") or 0)
    return {
        "success": True,
        "total": len(all_records),
        "records": all_records,
        "summary": {
            "high_priority": sum(1 for r in all_records if r["priority"] == "high"),
            "medium_priority": sum(1 for r in all_records if r["priority"] == "medium"),
            "low_priority": sum(1 for r in all_records if r["priority"] == "low"),
        },
    }


@frappe.whitelist()
def get_verification_detail(doctype, docname):
    """Full record detail for verification — extracted data + source text side by side."""
    _require_admin()
    record = frappe.get_doc(doctype, docname)
    record_dict = record.as_dict()

    field_confidence = {}
    if record_dict.get("extraction_confidence"):
        try:
            field_confidence = json.loads(record_dict["extraction_confidence"])
        except Exception:
            pass

    original = {}
    if record_dict.get("original_extracted"):
        try:
            original = json.loads(record_dict["original_extracted"])
        except Exception:
            pass

    source_content = ""
    drive_file = None
    if record_dict.get("drive_file"):
        try:
            # drive_file stores the Google Drive file ID; look up by drive_file_id field
            df = frappe.db.get_value(
                "VE Drive File",
                {"drive_file_id": record_dict["drive_file"]},
                ["file_name", "doc_type", "drive_file_id", "mime_type",
                 "web_view_link", "doc_date"],
                as_dict=True,
            )
            if df:
                drive_file = {
                    "file_name": df.get("file_name", ""),
                    "doc_type": df.get("doc_type", ""),
                    "drive_file_id": df.get("drive_file_id", ""),
                    "file_extension": (df.get("mime_type") or "").split("/")[-1],
                    "drive_view_link": df.get("web_view_link", ""),
                    "uploaded_by_name": "",
                    "file_date": str(df.get("doc_date") or ""),
                }
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "get_verification_detail: drive_file lookup")

    # Build field mapping: generic orig keys → doctype-specific struct field names
    dt_map = _ORIG_TO_STRUCT.get(doctype, {})

    seen_fields = set()
    field_comparison = []

    def _add_field(field, current_val, orig_val, confidence):
        seen_fields.add(field)
        field_comparison.append({
            "field": field,
            "label": field.replace("_", " ").title(),
            "current_value": current_val,
            "original_value": orig_val,
            "confidence": confidence,
            "was_changed": str(orig_val) != str(current_val) if orig_val is not None and current_val not in (None, "") else False,
            "confidence_label": "High" if confidence >= 70 else "Medium" if confidence >= 40 else "Low",
            "confidence_color": "green" if confidence >= 70 else "yellow" if confidence >= 40 else "red",
        })

    # 1. Surface original_extracted fields — map generic names to struct field names
    for orig_key, orig_val in original.items():
        if orig_key in _ORIG_SKIP or orig_val in (None, ""):
            continue
        struct_field = dt_map.get(orig_key, orig_key)  # map to structured field if known
        if struct_field in _SKIP_FIELDS or struct_field in seen_fields:
            continue
        struct_val = record_dict.get(struct_field)
        display_val = struct_val if struct_val not in (None, "") else orig_val
        confidence = field_confidence.get(orig_key, field_confidence.get(struct_field, 50))
        _add_field(struct_field, display_val, orig_val, confidence)

    # 2. Add any remaining structured fields with values not already shown
    for field, value in record_dict.items():
        if field in _SKIP_FIELDS or field in seen_fields or value is None or value == "":
            continue
        confidence = field_confidence.get(field, 50)
        _add_field(field, value, original.get(field), confidence)

    field_comparison.sort(key=lambda x: x["confidence"])

    return {
        "success": True,
        "record": record_dict,
        "doctype": doctype,
        "docname": docname,
        "field_comparison": field_comparison,
        "field_confidence": field_confidence,
        "original_extraction": original,
        "source_content": "",
        "drive_file": drive_file,
        "overall_confidence": record_dict.get("confidence_score", 0),
        "verification_status": record_dict.get("verification_status", "Unverified"),
    }


@frappe.whitelist()
def verify_record(doctype, docname, corrections=None, status="Verified"):
    """Mark a record verified. Optionally apply field corrections."""
    _require_admin()
    doc = frappe.get_doc(doctype, docname)

    if corrections:
        if isinstance(corrections, str):
            try:
                corrections = json.loads(corrections)
            except Exception:
                corrections = {}
        correction_log = []
        for field, new_value in (corrections or {}).items():
            old_value = doc.get(field)
            if str(old_value) != str(new_value):
                setattr(doc, field, new_value)
                correction_log.append(f"{field}: '{old_value}' → '{new_value}'")
        if correction_log:
            doc.correction_notes = (
                f"Corrections by {frappe.session.user}:\n" + "\n".join(correction_log)
            )
            status = "Corrected"

    doc.verification_status = status
    doc.verified_by = frappe.session.user
    doc.verified_on = frappe.utils.now()
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "status": status,
            "message": f"Record {status.lower()} by {frappe.session.user}"}


@frappe.whitelist()
def reextract_document(doc_name, force=True):
    """Re-run AI content extraction on a VE Drive File."""
    _require_admin()
    from hr_client.drive_sync.extractor import extract_and_save
    from hr_client.drive_sync.parser import parse_filename, folder_path_to_module

    try:
        file_doc = frappe.get_doc("VE Drive File", doc_name)
    except frappe.DoesNotExistError:
        return {"success": False, "reason": "Drive file not found"}

    # Re-parse filename to keep metadata fresh
    parsed = parse_filename(file_doc.file_name)
    file_doc.doc_type = parsed.get("doc_type") or file_doc.doc_type
    file_doc.party_name = parsed.get("party") or file_doc.party_name
    file_doc.doc_date = parsed.get("date") or file_doc.doc_date
    file_doc.direction = parsed.get("direction", "Unknown")
    file_doc.naming_valid = 1 if parsed.get("naming_valid") else 0
    file_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return extract_and_save(file_doc)


@frappe.whitelist()
def get_accuracy_stats():
    """Overall extraction accuracy by DocType."""
    _require_admin()
    total_records = 0
    verified = corrected = needs_review = unverified = 0
    total_confidence = confidence_count = 0
    by_doctype = []

    for dt in _VE_DOCTYPES:
        try:
            records = frappe.db.get_all(dt, fields=["verification_status", "confidence_score"])
            if not records:
                continue
            dt_v = sum(1 for r in records if r.get("verification_status") == "Verified")
            dt_c = sum(1 for r in records if r.get("verification_status") == "Corrected")
            scores = [r["confidence_score"] for r in records if r.get("confidence_score")]
            dt_avg = round(sum(scores) / len(scores)) if scores else 0
            by_doctype.append({
                "doctype": dt, "total": len(records), "verified": dt_v, "corrected": dt_c,
                "unverified": len(records) - dt_v - dt_c, "avg_confidence": dt_avg,
                "verification_rate": round((dt_v + dt_c) / len(records) * 100) if records else 0,
            })
            total_records += len(records)
            verified += dt_v
            corrected += dt_c
            needs_review += sum(1 for r in records if r.get("verification_status") == "Needs Review")
            unverified += len(records) - dt_v - dt_c
            total_confidence += sum(scores)
            confidence_count += len(scores)
        except Exception:
            continue

    avg_confidence = round(total_confidence / confidence_count) if confidence_count else 0
    ver_rate = round((verified + corrected) / total_records * 100) if total_records else 0
    label, color = (
        ("Excellent", "green") if avg_confidence >= 80 else
        ("Good", "blue") if avg_confidence >= 65 else
        ("Fair", "yellow") if avg_confidence >= 50 else
        ("Needs Improvement", "red")
    )
    return {
        "success": True,
        "summary": {
            "total_records": total_records, "verified": verified, "corrected": corrected,
            "needs_review": needs_review, "unverified": unverified,
            "avg_confidence": avg_confidence, "verification_rate": ver_rate,
            "accuracy_label": label, "accuracy_color": color,
        },
        "by_doctype": sorted(by_doctype, key=lambda x: x["avg_confidence"]),
    }


@frappe.whitelist()
def ai_crosscheck(doctype, docname, source_content):
    """Use Ollama to cross-check extracted data against source document text."""
    _require_admin()
    if not is_ollama_running():
        return {"success": False, "error": "Vera AI offline — run: ollama serve"}

    record = frappe.get_doc(doctype, docname)
    record_dict = record.as_dict()
    skip_cf = _SKIP_FIELDS | {"verification_status", "confidence_score", "verified_by",
                               "verified_on", "correction_notes", "drive_file",
                               "uploaded_by", "extraction_method"}
    check_fields = {k: v for k, v in record_dict.items()
                    if k not in skip_cf and v is not None and v != ""}

    prompt = f"""You are verifying data extracted from a business document.

SOURCE DOCUMENT TEXT:
{str(source_content)[:4000]}

EXTRACTED DATA TO VERIFY:
{json.dumps(check_fields, indent=2, default=str)}

For each extracted field verify if it matches the source document.

Return this exact JSON:
{{
  "field_results": [
    {{"field": "field_name", "label": "Field Label", "extracted_value": "X",
      "source_value": "Y", "is_correct": true, "confidence": 90, "note": ""}}
  ],
  "correct_count": 0,
  "total_checked": 0,
  "accuracy_pct": 0,
  "critical_errors": [],
  "overall_assessment": ""
}}

Be precise. Use exact values from source text. Return ONLY valid JSON."""

    result = ask_llm_json(prompt, temperature=0.05)
    if not result:
        return {"success": False, "error": "AI check failed or returned invalid JSON"}

    corrections = {
        fr["field"]: fr["source_value"]
        for fr in result.get("field_results", [])
        if not fr.get("is_correct") and fr.get("source_value") is not None
    }
    result["suggested_corrections"] = corrections
    result["has_corrections"] = len(corrections) > 0
    return {"success": True, "crosscheck": result}


@frappe.whitelist()
def apply_ai_corrections(doctype, docname, corrections):
    """Apply AI-suggested corrections and mark as Corrected."""
    _require_admin()
    if isinstance(corrections, str):
        try:
            corrections = json.loads(corrections)
        except Exception:
            return {"success": False, "error": "Invalid corrections format"}
    return verify_record(doctype=doctype, docname=docname,
                         corrections=corrections, status="Corrected")


# ── Smart Verification ────────────────────────────────────────────────────────

_AUTO_VERIFY_DOCTYPES = [
    "VE Sales Invoice", "VE Purchase Invoice", "VE Purchase Order", "VE Quotation",
    "VE Credit Note", "VE Debit Note", "VE Financial Report", "VE Salary Record",
    "VE Stock Record", "VE Sales Order", "VE GRN", "VE Payment Record",
]


@frappe.whitelist()
def auto_verify_all(threshold=75):
    """
    Auto-verify records where confidence >= threshold.
    Records below threshold are flagged as Needs Review for human attention.
    Never touches already Verified or Corrected records.
    """
    _require_admin()
    threshold = int(threshold)

    auto_verified = 0
    needs_review_count = 0
    review_list = []

    for dt in _AUTO_VERIFY_DOCTYPES:
        try:
            records = frappe.db.get_all(
                dt,
                filters={"verification_status": ["in", ["Unverified", ""]]},
                fields=["name", "confidence_score", "drive_file"],
            )
            for r in records:
                score = int(r.get("confidence_score") or 0)
                if score >= threshold:
                    frappe.db.set_value(dt, r["name"], {
                        "verification_status": "Verified",
                        "verified_by": "Vera AI (auto)",
                        "verified_on": frappe.utils.now(),
                        "correction_notes": f"Auto-verified: confidence {score}% >= {threshold}%",
                    })
                    auto_verified += 1
                else:
                    frappe.db.set_value(dt, r["name"], {"verification_status": "Needs Review"})
                    needs_review_count += 1
                    review_list.append({
                        "doctype": dt,
                        "docname": r["name"],
                        "confidence": score,
                        "drive_file": r.get("drive_file", ""),
                        "priority": "critical" if score < 30 else "high" if score < 50 else "medium",
                    })
        except Exception as e:
            frappe.log_error(str(e), f"Auto verify: {dt}")

    frappe.db.commit()
    review_list.sort(key=lambda x: x["confidence"])

    return {
        "success": True,
        "auto_verified": auto_verified,
        "needs_review": needs_review_count,
        "review_queue": review_list,
        "message": f"✅ {auto_verified} auto-verified, ⚠ {needs_review_count} need your review",
    }


@frappe.whitelist()
def get_review_queue():
    """
    Return all Needs Review records with problem fields and source text pre-loaded.
    Sorted lowest confidence first so most urgent records appear first.
    """
    _require_admin()
    queue = []

    for dt in _AUTO_VERIFY_DOCTYPES:
        try:
            records = frappe.db.get_all(
                dt,
                filters={"verification_status": "Needs Review"},
                fields=["*"],
            )
            for r in records:
                field_confidence = {}
                if r.get("extraction_confidence"):
                    try:
                        field_confidence = json.loads(r["extraction_confidence"])
                    except Exception:
                        pass

                problem_fields = []
                for field, conf in field_confidence.items():
                    if conf < 50 and field not in _SKIP_FIELDS and r.get(field) is not None and r.get(field) != "":
                        problem_fields.append({
                            "field": field,
                            "label": field.replace("_", " ").title(),
                            "value": r.get(field),
                            "confidence": conf,
                        })
                problem_fields.sort(key=lambda x: x["confidence"])

                drive_file_info = {}
                if r.get("drive_file"):
                    try:
                        df = frappe.db.get_value(
                            "VE Drive File",
                            {"drive_file_id": r["drive_file"]},
                            ["file_name", "doc_type", "drive_file_id", "mime_type", "web_view_link"],
                            as_dict=True,
                        )
                        if df:
                            drive_file_info = {
                                "file_name": df.get("file_name", ""),
                                "doc_type": df.get("doc_type", ""),
                                "drive_file_id": df.get("drive_file_id", ""),
                                "drive_view_link": df.get("web_view_link", ""),
                            }
                    except Exception:
                        pass

                safe_fields = {
                    k: v for k, v in r.items()
                    if k not in _SKIP_FIELDS and v is not None and v != ""
                }

                score = int(r.get("confidence_score") or 0)
                queue.append({
                    "doctype": dt,
                    "docname": r["name"],
                    "confidence": score,
                    "extraction_method": r.get("extraction_method", ""),
                    "problem_fields": problem_fields,
                    "all_fields": safe_fields,
                    "drive_file": drive_file_info,
                    "priority": "critical" if score < 30 else "high" if score < 50 else "medium",
                })
        except Exception as e:
            frappe.log_error(str(e), f"Review queue: {dt}")

    queue.sort(key=lambda x: x["confidence"])
    return {"success": True, "total": len(queue), "queue": queue}


@frappe.whitelist()
def quick_action(doctype, docname, action, corrections=None):
    """
    Single endpoint for all swipe review actions.
    action: approve | reject | correct | skip
    Reject automatically triggers background re-extraction.
    """
    _require_admin()

    if action == "approve":
        frappe.db.set_value(doctype, docname, {
            "verification_status": "Verified",
            "verified_by": frappe.session.user,
            "verified_on": frappe.utils.now(),
        })

    elif action == "reject":
        frappe.db.set_value(doctype, docname, {
            "verification_status": "Needs Review",
            "correction_notes": f"Rejected by {frappe.session.user} — re-extraction needed",
        })
        drive_file_id = frappe.db.get_value(doctype, docname, "drive_file")
        if drive_file_id:
            # Look up VE Drive File by drive_file_id
            df_name = frappe.db.get_value("VE Drive File", {"drive_file_id": drive_file_id}, "name")
            if df_name:
                frappe.enqueue(
                    "hr_client.drive_sync.api.process_file",
                    drive_file_name=df_name,
                    force=1,
                    queue="short",
                )

    elif action == "correct":
        if corrections:
            if isinstance(corrections, str):
                corrections = json.loads(corrections)
            doc = frappe.get_doc(doctype, docname)
            correction_log = []
            for field, new_val in corrections.items():
                old_val = doc.get(field)
                if str(old_val) != str(new_val):
                    setattr(doc, field, new_val)
                    correction_log.append(f"{field}: '{old_val}' → '{new_val}'")
            doc.verification_status = "Corrected"
            doc.verified_by = frappe.session.user
            doc.verified_on = frappe.utils.now()
            doc.correction_notes = "Quick corrections:\n" + "\n".join(correction_log)
            doc.save(ignore_permissions=True)

    elif action == "skip":
        pass  # No state change — user returns to this record later

    frappe.db.commit()
    return {"success": True, "action": action, "doctype": doctype, "docname": docname}


# ── New Verification Endpoints (Session 6) ────────────────────────────────────

@frappe.whitelist()
def reset_auto_verified():
    """
    Reset all AI-auto-verified records back to Unverified.
    Only resets records where verified_by = 'Vera AI (auto)' — never touches human-verified.
    """
    _require_admin()
    total_reset = 0
    for dt in _AUTO_VERIFY_DOCTYPES:
        try:
            table = f"tab{dt}"
            frappe.db.sql(f"""
                UPDATE `{table}`
                SET verification_status = 'Unverified',
                    verified_by = NULL,
                    verified_on = NULL
                WHERE verified_by = 'Vera AI (auto)'
            """)
            count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
            total_reset += count
        except Exception as e:
            frappe.log_error(str(e), f"Reset auto verified: {dt}")
    frappe.db.commit()
    return {"success": True, "reset": total_reset, "message": f"Reset {total_reset} AI-verified records to Unverified"}


@frappe.whitelist()
def get_all_extracted_records(status=None, doctype=None):
    """
    Return ALL extracted records across all VE DocTypes, normalized with:
    - party: client_name || vendor_name || employee_name || party_name
    - amount: total_amount || total_value || net_salary || amount
    - date: invoice_date || po_date || cn_date || dn_date || record_date || so_date || quote_date || payment_date
    Plus full stats breakdown.
    """
    _require_admin()

    # Field mappings per DocType for normalization
    _DATE_FIELDS = {
        "VE Sales Invoice": "invoice_date",
        "VE Purchase Invoice": "invoice_date",
        "VE Purchase Order": "po_date",
        "VE Quotation": "quote_date",
        "VE Credit Note": "cn_date",
        "VE Debit Note": "dn_date",
        "VE Financial Report": "period",
        "VE Salary Record": "salary_month",
        "VE Stock Record": "record_date",
        "VE Sales Order": "so_date",
        "VE GRN": "grn_date",
        "VE Payment Record": "payment_date",
    }
    _PARTY_FIELDS = {
        "VE Sales Invoice": "client_name",
        "VE Purchase Invoice": "vendor_name",
        "VE Purchase Order": "vendor_name",
        "VE Quotation": "client_name",
        "VE Credit Note": "client_name",
        "VE Debit Note": "vendor_name",
        "VE Financial Report": "party_name",
        "VE Salary Record": "employee_name",
        "VE Stock Record": "party_name",
        "VE Sales Order": "client_name",
        "VE GRN": "vendor_name",
        "VE Payment Record": "party_name",
    }
    _AMOUNT_FIELDS = {
        "VE Sales Invoice": "total_amount",
        "VE Purchase Invoice": "total_amount",
        "VE Purchase Order": "total_value",
        "VE Quotation": "total_value",
        "VE Credit Note": "total_amount",
        "VE Debit Note": "total_amount",
        "VE Financial Report": "net_profit",
        "VE Salary Record": "net_salary",
        "VE Stock Record": "total_value",
        "VE Sales Order": "total_amount",
        "VE GRN": "total_value",
        "VE Payment Record": "amount",
    }

    target_doctypes = [doctype] if doctype else _AUTO_VERIFY_DOCTYPES
    all_records = []
    stats = {
        "total": 0, "verified": 0, "corrected": 0,
        "needs_review": 0, "unverified": 0, "manual_required": 0,
        "avg_confidence": 0,
    }
    confidence_sum = 0

    for dt in target_doctypes:
        if dt not in _AUTO_VERIFY_DOCTYPES:
            continue
        try:
            filters = {}
            if status:
                filters["verification_status"] = status

            records = frappe.db.get_all(
                dt,
                filters=filters,
                fields=[
                    "name", "verification_status", "confidence_score",
                    "verified_by", "verified_on", "drive_file",
                    "extraction_method", "manual_review_required",
                    "extraction_attempts", "last_extraction_at",
                    "original_extracted",
                    _DATE_FIELDS.get(dt, "name"),
                    _PARTY_FIELDS.get(dt, "name"),
                    _AMOUNT_FIELDS.get(dt, "name"),
                ],
                order_by="modified desc",
            )
            for r in records:
                vs = r.get("verification_status") or "Unverified"
                score = int(r.get("confidence_score") or 0)
                stats["total"] += 1
                confidence_sum += score
                if vs == "Verified":
                    stats["verified"] += 1
                elif vs == "Corrected":
                    stats["corrected"] += 1
                elif vs == "Needs Review":
                    stats["needs_review"] += 1
                else:
                    stats["unverified"] += 1
                if r.get("manual_review_required"):
                    stats["manual_required"] += 1

                priority = "high" if r.get("manual_review_required") else (
                    "high" if vs == "Needs Review" else
                    "medium" if vs == "Unverified" and score < 60 else "low"
                )

                all_records.append({
                    "doctype": dt,
                    "docname": r["name"],
                    "verification_status": vs,
                    "confidence_score": score,
                    "verified_by": r.get("verified_by"),
                    "verified_on": str(r.get("verified_on") or ""),
                    "drive_file": r.get("drive_file"),
                    "extraction_method": r.get("extraction_method", ""),
                    "manual_review_required": bool(r.get("manual_review_required")),
                    "extraction_attempts": int(r.get("extraction_attempts") or 0),
                    "last_extraction_at": str(r.get("last_extraction_at") or ""),
                    "party": r.get(_PARTY_FIELDS.get(dt, "name")) or _orig_fallback(r, "party_name"),
                    "amount": float(r.get(_AMOUNT_FIELDS.get(dt, "name")) or 0) or float(_orig_fallback(r, "amount") or 0),
                    "date": str(r.get(_DATE_FIELDS.get(dt, "name")) or "") or _orig_fallback(r, "date"),
                    "priority": priority,
                })
        except Exception as e:
            frappe.log_error(str(e), f"Get all extracted: {dt}")

    if stats["total"]:
        stats["avg_confidence"] = round(confidence_sum / stats["total"])

    # Sort: manual_required first → needs_review → unverified → verified
    priority_order = {"high": 0, "medium": 1, "low": 2}
    all_records.sort(key=lambda x: (priority_order.get(x["priority"], 9), -x["confidence_score"]))

    return {
        "success": True,
        "total": stats["total"],
        "records": all_records,
        "stats": stats,
    }
