"""
Company Brain — retrieval-augmented context for the Vera AI assistant.

Ollama models cannot be fine-tuned, so the assistant "learns" the company by
rebuilding a fresh knowledge snapshot from the live database on every question
and feeding it to the model. Any new data — Tally imports, new employees, new
Org Hub documents, new job openings — is reflected automatically on the next
query, with no retraining step.

Two public builders:
  build_company_context(question)  -> full company digest + question-relevant detail
  build_jd_context(designation, department, company) -> role knowledge for JD generation

Admin-only: the context can surface financials and PII, so callers must gate on
an admin check (ai.chat already does via _require_admin).
"""
import frappe
from hr_client.api.utils import COMPANY_NAME

COMPANIES = ["Vera Enterprises", "Schones Leben", "Hagan Modular"]

# Org Hub doctypes and the fields that carry their meaningful text.
# Field lists mirror the Org Hub FIELD_SCHEMA (org_hub.py / OrgHubPage.tsx).
_ORG_SPEC = {
    "VE Job Description":    {"title": "jd_title",      "role": "designation", "body": ["purpose", "responsibilities", "qualifications", "competencies", "reports_to"]},
    "VE KRA":                {"title": "kra_title",     "role": "designation", "body": ["description", "weightage", "measurement_criteria", "target", "frequency"]},
    "VE KPI":                {"title": "kpi_name",      "role": "designation", "body": ["unit", "target_value", "frequency", "data_source"]},
    "VE SOP":                {"title": "sop_title",     "role": "responsible_role", "body": ["sop_code", "purpose", "scope", "procedure"]},
    "VE Policy":             {"title": "policy_name",   "role": "policy_category", "body": ["content"]},
    "VE Employee Handbook":  {"title": "section_title", "role": None,          "body": ["content"]},
    "VE Operations Manual":  {"title": "section_title", "role": "department",  "body": ["content"]},
    "VE Department Process": {"title": "process_name",  "role": "department",  "body": ["trigger_event", "responsible_roles", "tools_used", "steps"]},
    "VE Forms Checklist":    {"title": "form_title",    "role": "department",  "body": ["form_type", "instructions", "items"]},
}

_MAX_CONTEXT_CHARS = 9000   # comfortably inside a 4096-token window
_MAX_RETRIEVED_DOCS = 8


# ──────────────────────────────────────────────────────────────────────────────
# Data loaders (each fails soft — a missing table never breaks the assistant)
# ──────────────────────────────────────────────────────────────────────────────

def _load_tally_snapshot() -> dict:
    import os, json
    path = os.path.join(os.path.dirname(__file__), "..", "tally_snapshot.json")
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def _financial_line() -> str:
    snap = _load_tally_snapshot()
    def c(k, d=0):
        try: return float(snap.get(k, d) or d)
        except Exception: return d
    try:
        from hr_client.api.utils import current_fy_label
        fy = current_fy_label()
    except Exception:
        fy = ""
    gst_net = max(0, c("gst_payable") - c("input_gst_credit"))
    return (
        f"=== {COMPANY_NAME} — FINANCIALS (Tally, FY {fy}) ===\n"
        f"Sales ₹{c('fy_sales'):,.0f} | Purchases ₹{c('fy_purchases'):,.0f} | "
        f"Collections ₹{c('fy_collections'):,.0f}\n"
        f"Debtors ₹{c('sundry_debtors'):,.0f} | Creditors ₹{c('sundry_creditors'):,.0f} | "
        f"Net GST ₹{gst_net:,.0f}\n"
        f"Cash ₹{c('cash_in_hand'):,.0f} | Bank ₹{c('bank_balance'):,.0f} | "
        f"All-time Sales ₹{c('total_sales_alltime'):,.0f}"
    )


def _load_employees() -> list[dict]:
    try:
        rows = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name", "designation", "department", "company", "reports_to"],
            order_by="company asc, department asc",
            ignore_permissions=True,
            limit_page_length=0,
        )
    except Exception:
        return []
    by_id = {r["name"]: r.get("employee_name") for r in rows}
    for r in rows:
        r["manager_name"] = by_id.get(r.get("reports_to"), "")
    return rows


def _load_open_jobs() -> list[dict]:
    try:
        return frappe.get_all(
            "Job Opening",
            filters={"status": "Open"},
            fields=["name", "job_title", "designation", "department"],
            order_by="creation desc",
            ignore_permissions=True,
            limit_page_length=0,
        )
    except Exception:
        return []


def _load_org_docs() -> dict[str, list[dict]]:
    """All Org Hub docs across companies, full fields, for both digest + retrieval."""
    out = {}
    for dt, spec in _ORG_SPEC.items():
        wanted = ["name", "company", spec["title"]] + (["department"] if True else [])
        wanted += [spec["role"]] if spec["role"] else []
        wanted += spec["body"]
        wanted = list(dict.fromkeys(f for f in wanted if f))  # dedupe, keep order
        try:
            meta = frappe.get_meta(dt)
            fields = [f for f in wanted if f == "name" or meta.has_field(f)]
            out[dt] = frappe.get_all(dt, fields=fields, order_by="creation asc",
                                     ignore_permissions=True, limit_page_length=0)
        except Exception:
            out[dt] = []
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Context assembly
# ──────────────────────────────────────────────────────────────────────────────

def _roster_block(emps: list[dict]) -> str:
    if not emps:
        return ""
    lines = ["=== PEOPLE / ORG STRUCTURE (Active Employees) ==="]
    current_co = None
    for e in emps:
        co = e.get("company") or "—"
        if co != current_co:
            lines.append(f"[{co}]")
            current_co = co
        desig = e.get("designation") or "—"
        dept = (e.get("department") or "").replace(" - V", "").replace(" - SL", "").replace(" - HM", "")
        mgr = f" · reports to {e['manager_name']}" if e.get("manager_name") else ""
        lines.append(f"- {e.get('employee_name')}: {desig}, {dept}{mgr}")
    return "\n".join(lines)


def _jobs_block(jobs: list[dict]) -> str:
    if not jobs:
        return "=== OPEN JOB OPENINGS ===\n(none currently open)"
    lines = ["=== OPEN JOB OPENINGS ==="]
    for j in jobs:
        desig = j.get("designation") or j.get("job_title") or "—"
        dept = (j.get("department") or "").replace(" - V", "")
        lines.append(f"- {j.get('job_title')} ({desig}, {dept})")
    return "\n".join(lines)


def _org_inventory_block(org: dict[str, list[dict]]) -> str:
    """Titles-only digest so the bot knows what knowledge exists to draw on."""
    lines = ["=== ORG KNOWLEDGE INDEX (Org Hub) ==="]
    any_docs = False
    for dt, spec in _ORG_SPEC.items():
        docs = org.get(dt, [])
        if not docs:
            continue
        any_docs = True
        label = dt.replace("VE ", "")
        titles = []
        for d in docs[:12]:
            t = str(d.get(spec["title"]) or "").strip()
            role = str(d.get(spec["role"]) or "").strip() if spec["role"] else ""
            titles.append(f"{t} ({role})" if role else t)
        more = f" +{len(docs) - 12} more" if len(docs) > 12 else ""
        lines.append(f"{label} ({len(docs)}): " + "; ".join(t for t in titles if t) + more)
    if not any_docs:
        lines.append("(no Org Hub documents recorded yet)")
    return "\n".join(lines)


def _doc_to_text(dt: str, d: dict) -> str:
    spec = _ORG_SPEC[dt]
    title = str(d.get(spec["title"]) or d.get("name") or "").strip()
    co = str(d.get("company") or "").strip()
    header = f"[{dt.replace('VE ', '')}] {title}" + (f" — {co}" if co else "")
    body = []
    for f in spec["body"]:
        v = str(d.get(f) or "").strip()
        if v:
            body.append(f"  {f.replace('_', ' ')}: {v}")
    return header + ("\n" + "\n".join(body) if body else "")


def _retrieve_relevant(question: str, org: dict[str, list[dict]], emps: list[dict]) -> str:
    """Pull full text of Org Hub docs / people that the question actually mentions."""
    q = (question or "").lower()
    if not q:
        return ""
    hits: list[str] = []

    # Match org docs on title or role keyword appearing in the question.
    for dt, spec in _ORG_SPEC.items():
        for d in org.get(dt, []):
            if len(hits) >= _MAX_RETRIEVED_DOCS:
                break
            title = str(d.get(spec["title"]) or "").strip().lower()
            role = str(d.get(spec["role"]) or "").strip().lower() if spec["role"] else ""
            if (title and title in q) or (role and len(role) > 3 and role in q):
                hits.append(_doc_to_text(dt, d))

    # Match people by name.
    people_hits = []
    for e in emps:
        full = str(e.get("employee_name") or "").lower()
        if full and full in q:
            people_hits.append(
                f"[Person] {e.get('employee_name')}: {e.get('designation')}, "
                f"{e.get('department')}, {e.get('company')}"
                + (f", reports to {e['manager_name']}" if e.get("manager_name") else "")
            )

    parts = []
    if hits:
        parts.append("=== RELEVANT DETAIL ===\n" + "\n\n".join(hits))
    if people_hits:
        parts.append("\n".join(people_hits))
    return "\n\n".join(parts)


def build_company_context(question: str = "") -> str:
    """
    Full company digest rebuilt live from the DB, plus detail relevant to the
    question. This is the assistant's knowledge of the entire company.
    """
    emps = _load_employees()
    jobs = _load_open_jobs()
    org = _load_org_docs()

    blocks = [
        _financial_line(),
        _roster_block(emps),
        _jobs_block(jobs),
        _org_inventory_block(org),
    ]
    retrieved = _retrieve_relevant(question, org, emps)
    if retrieved:
        blocks.append(retrieved)

    text = "\n\n".join(b for b in blocks if b)
    if len(text) > _MAX_CONTEXT_CHARS:
        text = text[:_MAX_CONTEXT_CHARS] + "\n…(context truncated)"
    return text


def build_jd_context(designation: str = "", department: str = "", company: str = "") -> str:
    """
    Role knowledge for job-description generation: any existing Job Description,
    KRAs and KPIs already recorded for this designation, so generated JDs stay
    consistent with how the company actually defines the role.
    """
    designation = (designation or "").strip()
    if not designation:
        return ""
    org = _load_org_docs()
    d_low = designation.lower()

    def _match(dt):
        spec = _ORG_SPEC[dt]
        out = []
        for d in org.get(dt, []):
            role = str(d.get(spec["role"]) or "").strip().lower() if spec["role"] else ""
            if role and role == d_low:
                if not company or str(d.get("company") or "") == company:
                    out.append(_doc_to_text(dt, d))
        return out

    parts = []
    jds = _match("VE Job Description")
    kras = _match("VE KRA")
    kpis = _match("VE KPI")
    if jds:
        parts.append("EXISTING JOB DESCRIPTION(S) FOR THIS ROLE:\n" + "\n\n".join(jds))
    if kras:
        parts.append("KEY RESULT AREAS FOR THIS ROLE:\n" + "\n\n".join(kras))
    if kpis:
        parts.append("KPIs FOR THIS ROLE:\n" + "\n\n".join(kpis))

    text = "\n\n".join(parts)
    if len(text) > _MAX_CONTEXT_CHARS:
        text = text[:_MAX_CONTEXT_CHARS]
    return text
