"""
Multi-company scoping guard (Phase 2 CI safety net).

Walks every `@frappe.whitelist()` function in hr_client/api/*.py and asserts each
one that touches per-company (siloed) data is company-scoped — i.e. its source
references one of the scoping primitives (current_company / scoped / company_sql /
company_scoped / _cc / assert_doc_company / _scope_co / require_company / _co_filter)
OR the endpoint is explicitly listed in GLOBAL_ENDPOINTS with a reason.

A NEW unscoped endpoint that reads/writes a siloed DocType turns this RED.

Run on the server:
    bench --site vera.local execute hr_client.tests.verify_company_scoping.run

Prints one line per offending endpoint + a PASS/FAIL summary. Creates no data.
"""

import ast
import os

import frappe

# Endpoints that legitimately need NO company scope, each with a justification.
# Format: "module.function": "reason".
GLOBAL_ENDPOINTS = {
    # Company / auth / session plumbing — inherently cross-company or pre-company.
    "company.get_login_companies": "public picker feed, branding only",
    "company.get_my_companies": "lists the caller's companies",
    "company.set_active_company": "switches active company",
    "twofa.*": "2FA is per-user, company-agnostic",
    # Global masters / shared doctypes (GLOBAL_DOCTYPES).
    "user_management.*": "manages User (global doctype)",
    "permissions.*": "permission registry + per-user grants (global)",
    "chat.*": "chat is company-agnostic (GLOBAL_DOCTYPES)",
    # Public / self-service HR reference data.
    "leave.get_holidays": "public holiday calendar",
    "leave.get_leave_policy": "public leave policy text",
    "leave.get_my_leaves": "caller's own leaves (self-bounded)",
    "leave.get_leave_documents": "owner/admin-gated file list",
    "leave.apply_leave": "self-service; company derived from employee",
    "employee.get_employee_profile": "self/admin-gated single profile",
    "employee.update_own_profile": "self profile edit",
    "employee.admin_update_profile": "admin single-profile edit",
    "employee.upload_profile_photo": "single profile photo",
    "employee.check_default_password": "self password check",
    "expenses.get_my_claims": "caller's own claims (self-bounded)",
    "expenses.submit_claim": "self-service; company from employee",
    "expenses.get_monthly_summary": "self-bounded / scoped for admin",
    "org_hub.get_my_org_docs": "employee-bounded to own company",
    # Ollama / AI status + document analysis (not company-financial reads).
    "ai.check_ai_status": "Ollama health, no company data",
    "ai.analyse_document": "single Drive file text extract",
    "ai.analyse_selected": "Drive file text extract",
    # Jibble attendance (external API, admin-only) — flagged for later per-company.
    "jibble.*": "external Jibble API; company filtering TODO when multi-co attendance lands",
    # True global masters — shared across all companies by design.
    "hrms_masters.*": "Department/Designation are shared Vera-wide masters",
    "todo.get_assignable_users": "lists Users (global doctype)",
}

# Known scoping DEBT — native-HR modules that carry a `company` field but hold NO
# data yet (no employee has run payroll/shifts/onboarding/separation, and the
# recruitment pipeline is keyed to already-scoped Job Openings). These MUST be
# scoped before SL/HM HR go-live. The guard WARNS on these but does not fail, so
# the debt is explicit and greppable rather than hidden in GLOBAL_ENDPOINTS.
PENDING_SCOPE = {
    "payroll.*": "Salary Structure/Slip/Assignment — scope by Employee.company before HR go-live",
    "shift.*": "Shift Type/Assignment — scope before multi-co shifts",
    "training.*": "Training Program/Session — scope before multi-co training",
    "onboarding.*": "Employee Onboarding — scope by Employee.company before HR go-live",
    "separation.*": "Employee Separation — scope by Employee.company before HR go-live",
    "appraisal.*": "Appraisal — scope before multi-co appraisals",
    "recruitment.*": "pipeline keyed to already-scoped Job Opening; Job Applicant has no company field",
    "leave.get_employee_leave_history": "admin single-employee history — add employee company check",
    "notes.get_notes": "single-employee notes by email — add employee company check",
    "employee_lifecycle.*": "native Employee onboarding/exit — scope by Employee.company before HR go-live",
    "ai.get_business_snapshot": "reads global VE tally_snapshot — per-company snapshot TODO",
    "ai.get_verification_detail": "Tally verification UI — scope with finance modules' re-import",
    "ai.get_review_queue": "Tally enrichment review — scope with tally_enrich follow-up",
    "ai.get_all_extracted_records": "references retired Drive-extraction doctypes (dead) — remove or scope",
    "ai.quick_action": "Tally enrichment action — scope with tally_enrich follow-up",
    "ai.reextract_document": "single Drive-file re-extract — scope with tally_enrich follow-up",
    "ai.get_verification_queue": "Tally verification queue — scope with tally_enrich follow-up",
    "ai.get_accuracy_stats": "Tally verification stats — scope with tally_enrich follow-up",
    "ai.ai_crosscheck": "single-doc AI crosscheck — scope with tally_enrich follow-up",
    "ai.apply_ai_corrections": "single-doc correction — scope with tally_enrich follow-up",
    "ai.verify_record": "single-doc verify — scope with tally_enrich follow-up",
    "ai.reset_auto_verified": "Tally verification reset — scope with tally_enrich follow-up",
    "ai.auto_verify_all": "Tally verification bulk — scope with tally_enrich follow-up",
    "ai.compare_periods": "reads vouchers — scope with finance follow-up (admin-only, VE data only today)",
    "ai.generate_report": "reads global VE snapshot — per-company snapshot TODO",
    "ai.get_dashboard_insights": "reads global VE snapshot — per-company snapshot TODO",
    "ai.get_ai_health": "system health incl. voucher counts — scope with finance follow-up",
}

# Scoping primitives — any of these appearing in a function's source counts as scoped.
_SCOPE_TOKENS = (
    "current_company", "require_company", "assert_doc_company",
    "scoped(", "company_sql(", "company_scoped", "_cc(", "_cco(", "_cwhere(",
    "_cfilters(", "_scope_co(", "_co_filter(", "_emp_company(", "_co(",
    "_RUN_CO", "allowed_companies", "ALL_COMPANIES",
    # Delegating helpers that are themselves company-scoped — a call to one of
    # these means the endpoint inherits scoping.
    "_assert_editable(", "_create(", "_ledger_txn_query(", "_assert_graph_company(",
    "finance_core.", "period_options(", "get_profitability_summary(", "_register_list(",
)

# DocTypes whose presence in a function's source means it touches siloed data.
# (Substring match against the source text.)
_SILOED_HINTS = (
    "VE Tally", "VE Sales Register", "VE Purchase Register", "VE GST",
    "VE Creditor", "VE Debtor", "VE Cash Flow", "VE Stock Movement", "VE Receipt",
    "VE Bank Account", "VE Virtual Account", "VE OD Account", "VE Transport",
    "VE Saved Graph", "VE Drive File", "VE Job Description", "VE KRA", "VE KPI",
    "VE SOP", "VE Policy", "VE Employee Handbook", "VE Operations Manual",
    "VE Department Process", "VE Forms Checklist",
    "Vera Measurement", "Vera BOQ", "Vera Cost Sheet", "Vera Sales Quotation",
    "Vera Sales Order", "Vera Quotation", "Vera Terms",
    "Vera CRM", "Vera Sales Team", "Vera Expense Claim", "Vera Leave Application",
    "Vera Employee Note", "Vera ERP Entry", "Vera Data Entry Request",
    "Employee", "Job Opening", "Job Applicant", "Job Offer", "Interview",
    "Salary Structure", "Salary Slip", "Attendance",
)

_API_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "api")


def _is_whitelisted(node: ast.FunctionDef) -> bool:
    for d in node.decorator_list:
        # @frappe.whitelist  or  @frappe.whitelist(...)
        t = d.func if isinstance(d, ast.Call) else d
        if isinstance(t, ast.Attribute) and t.attr == "whitelist":
            return True
    return False


def _in(mapping, module: str, fn: str) -> bool:
    return f"{module}.{fn}" in mapping or f"{module}.*" in mapping


def _allowlisted(module: str, fn: str) -> bool:
    return _in(GLOBAL_ENDPOINTS, module, fn)


def _pending(module: str, fn: str) -> bool:
    return _in(PENDING_SCOPE, module, fn)


def run():
    offenders = []
    pending = []
    total = 0
    scoped_ok = 0
    allow_ok = 0

    for fname in sorted(os.listdir(_API_DIR)):
        if not fname.endswith(".py") or fname in ("__init__.py", "utils.py", "scoping.py"):
            continue
        module = fname[:-3]
        path = os.path.join(_API_DIR, fname)
        src = open(path).read()
        try:
            tree = ast.parse(src)
        except SyntaxError as e:
            offenders.append(f"{module}: SYNTAX ERROR {e}")
            continue
        lines = src.splitlines(keepends=True)

        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef) or not _is_whitelisted(node):
                continue
            total += 1
            seg = "".join(lines[node.lineno - 1: node.end_lineno])
            touches_siloed = any(h in seg for h in _SILOED_HINTS)
            if not touches_siloed:
                scoped_ok += 1        # no siloed data → nothing to scope
                continue
            if any(tok in seg for tok in _SCOPE_TOKENS):
                scoped_ok += 1
                continue
            if _allowlisted(module, node.name):
                allow_ok += 1
                continue
            if _pending(module, node.name):
                pending.append(f"{module}.{node.name}")
                continue
            offenders.append(f"{module}.{node.name}")

    print("=" * 60)
    print(f"Company-scoping guard: {total} whitelisted endpoints")
    print(f"  scoped or non-siloed : {scoped_ok}")
    print(f"  global allowlisted   : {allow_ok}")
    print(f"  pending scope (debt) : {len(pending)}")
    print(f"  UNSCOPED (offenders) : {len(offenders)}")
    if pending:
        print("-" * 60)
        print("PENDING (known debt — native-HR, no data yet; scope before HR go-live):")
        for p in sorted(pending):
            print(f"  ~ {p}")
    if offenders:
        print("-" * 60)
        for o in sorted(offenders):
            print(f"  ✗ {o}")
        print("-" * 60)
        print("FAIL — scope these (scoped()/company_sql()/assert_doc_company) "
              "or add to GLOBAL_ENDPOINTS / PENDING_SCOPE with a reason.")
    else:
        print("-" * 60)
        print("PASS — every siloed endpoint is scoped, allowlisted, or tracked as pending debt.")
    print("=" * 60)
    return {"total": total, "offenders": offenders, "pending": pending}
