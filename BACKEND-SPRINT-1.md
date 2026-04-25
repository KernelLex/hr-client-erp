# Backend Sprint 1 — AI-Powered Job Description Generator
_Created: 2026-04-20 | Status: Planned_

## Goal
Add three endpoints to `hr_client/api/recruitment.py` that let HR generate a professional Job Description document from a rough one-liner, preview it, save it back to the Job Opening, and export it as a PDF.

---

## Prerequisites

### 1. Install Anthropic Python SDK
```bash
cd ~/frappe-bench
./env/bin/pip install anthropic
```

### 2. Store API key in site config (NEVER in code)
```bash
bench --site hrms.localhost set-config anthropic_api_key "sk-ant-..."
```

Access in Python:
```python
api_key = frappe.conf.get("anthropic_api_key")
if not api_key:
    frappe.throw("Anthropic API key not configured. Run: bench set-config anthropic_api_key '...'")
```

### 3. Add Custom Field on Job Opening
Add to `hr_client/fixtures/custom_field.json` (alongside existing entries):

```json
{
  "doctype": "Custom Field",
  "name": "Job Opening-custom_job_description_md",
  "dt": "Job Opening",
  "fieldname": "custom_job_description_md",
  "fieldtype": "Long Text",
  "label": "Job Description (Markdown)",
  "insert_after": "custom_interview_rounds",
  "read_only": 0
}
```

Run after adding:
```bash
bench --site hrms.localhost migrate && bench --site hrms.localhost clear-cache
```

---

## Endpoint 1 — `generate_job_description`

```python
@frappe.whitelist(methods=["POST"])
def generate_job_description(rough_description, job_title, department=None):
    _require_hr_role()

    api_key = frappe.conf.get("anthropic_api_key")
    if not api_key:
        frappe.response.http_status_code = 500
        return {"error": "Anthropic API key not configured on this site"}

    company_name = frappe.defaults.get_user_default("Company") or "Our Company"
    company_desc = _get_company_description(company_name)

    prompt = _build_jd_prompt(
        rough_description=rough_description,
        job_title=job_title,
        department=department or "",
        company_name=company_name,
        company_desc=company_desc,
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        jd_markdown = message.content[0].text
    except Exception:
        frappe.log_error(frappe.get_traceback(), "generate_job_description failed")
        frappe.response.http_status_code = 500
        return {"error": "AI generation failed. Check server logs."}

    return {"success": True, "job_description_md": jd_markdown}


def _get_company_description(company_name):
    """Pull a brief company description from the ERPNext Company doctype."""
    return frappe.db.get_value("Company", company_name, "company_description") or ""


def _build_jd_prompt(rough_description, job_title, department, company_name, company_desc):
    company_context = (
        f"Company description: {company_desc}"
        if company_desc
        else f"Company name: {company_name}"
    )
    dept_context = f"Department: {department}" if department else ""

    return f"""You are an expert HR professional. Generate a complete, professional Job Description document in Markdown format.

Context:
- Job Title: {job_title}
{dept_context}
- {company_context}
- HR's rough notes: "{rough_description}"

Generate a JD with EXACTLY these sections in this order:
1. ## About the Company
2. ## Role Overview
3. ## Key Responsibilities (8-10 bullet points using - )
4. ## Required Qualifications (6-8 bullet points)
5. ## Nice to Have (3-5 bullet points)
6. ## What We Offer (5-7 bullet points covering benefits, culture, growth)
7. ## How to Apply (one short paragraph)

Rules:
- Use professional but approachable tone
- Be specific — avoid generic filler phrases
- Bullet points must start with action verbs for Responsibilities
- Do not include salary figures unless mentioned in the rough notes
- Output ONLY the Markdown document, no preamble or explanation
"""
```

---

## Endpoint 2 — `save_job_description`

```python
@frappe.whitelist(methods=["POST"])
def save_job_description(job_opening, job_description_md):
    _require_hr_role()

    if not frappe.db.exists("Job Opening", job_opening):
        frappe.response.http_status_code = 404
        return {"error": "Job Opening not found"}

    frappe.db.set_value(
        "Job Opening",
        job_opening,
        "custom_job_description_md",
        job_description_md,
    )
    frappe.db.commit()

    return {"success": True}
```

---

## Endpoint 3 — `export_jd_pdf`

```python
@frappe.whitelist()
def export_jd_pdf(job_opening):
    _require_hr_role()

    jd_md = frappe.db.get_value("Job Opening", job_opening, "custom_job_description_md")
    if not jd_md:
        frappe.response.http_status_code = 404
        return {"error": "No job description found. Generate and save one first."}

    job_title = frappe.db.get_value("Job Opening", job_opening, "job_title") or job_opening

    html_content = _markdown_to_html(jd_md, job_title)

    try:
        from frappe.utils.pdf import get_pdf
        pdf_bytes = get_pdf(html_content)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "export_jd_pdf failed")
        frappe.response.http_status_code = 500
        return {"error": "PDF generation failed. Check server logs."}

    filename = f"jd_{job_opening}.pdf"
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": filename,
        "content": pdf_bytes,
        "is_private": 0,
        "attached_to_doctype": "Job Opening",
        "attached_to_name": job_opening,
    })
    file_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "pdf_url": file_doc.file_url}


def _markdown_to_html(markdown_text, job_title):
    """Convert markdown to styled HTML for PDF rendering."""
    try:
        import markdown as md_lib
        body = md_lib.markdown(markdown_text, extensions=["extra"])
    except ImportError:
        # Fallback: wrap in pre if markdown package unavailable
        body = f"<pre>{markdown_text}</pre>"

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; margin: 40px; color: #333; }}
  h1 {{ color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }}
  h2 {{ color: #16213e; margin-top: 24px; }}
  ul {{ padding-left: 20px; }}
  li {{ margin-bottom: 4px; }}
</style>
</head>
<body>
<h1>{job_title}</h1>
{body}
</body>
</html>"""
```

> **Note on `markdown` package:** Frappe ships with `markdown` in its venv. If unavailable, install: `./env/bin/pip install markdown`. The fallback `<pre>` block is a safety net only.

---

## Adding the endpoints to `recruitment.py`

Paste all three functions and their helpers (`_get_company_description`, `_build_jd_prompt`, `_markdown_to_html`) into `hr_client/hr_client/api/recruitment.py` after the existing `update_candidate_notes` endpoint, before the `# ─── HELPERS ───` block.

No changes needed to `hooks.py` — these are pure whitelisted endpoints with no doc_events.

---

## Testing

```bash
# 1. Generate a JD
curl -X POST "http://hrms.localhost:8000/api/method/hr_client.api.recruitment.generate_job_description" \
  -H "Cookie: sid=YOUR_SID" \
  -H "Content-Type: application/json" \
  -d '{"rough_description":"senior python dev, 5 yrs exp, bangalore","job_title":"Senior Python Developer","department":"Engineering"}'

# 2. Save the generated markdown back (replace HR-OPN-0001 and the md)
curl -X POST "http://hrms.localhost:8000/api/method/hr_client.api.recruitment.save_job_description" \
  -H "Cookie: sid=YOUR_SID" \
  -H "Content-Type: application/json" \
  -d '{"job_opening":"HR-OPN-2024-0001","job_description_md":"## Senior Python Developer\n..."}'

# 3. Export to PDF
curl "http://hrms.localhost:8000/api/method/hr_client.api.recruitment.export_jd_pdf?job_opening=HR-OPN-2024-0001" \
  -H "Cookie: sid=YOUR_SID"
```

---

## Definition of Done

- [ ] `anthropic` package installed in bench venv
- [ ] `anthropic_api_key` set in site config (not hardcoded)
- [ ] `custom_job_description_md` Custom Field migrated and visible in Frappe desk
- [ ] `generate_job_description` returns valid markdown with all 7 sections
- [ ] `save_job_description` persists to DB; visible in Frappe desk Job Opening form
- [ ] `export_jd_pdf` returns a `/files/jd_HR-OPN-...pdf` URL; PDF is downloadable
- [ ] All 3 endpoints return correct error responses for invalid inputs
- [ ] `frappe.log_error` called on AI/PDF failures (no bare swallowed exceptions)

---

## Error scenarios to handle

| Scenario | Response |
|---|---|
| `anthropic_api_key` missing from site config | HTTP 500, `{"error": "Anthropic API key not configured..."}` |
| Anthropic API returns non-200 / rate limit | HTTP 500 + `frappe.log_error`, generic error message |
| `job_opening` not found in `save_job_description` | HTTP 404 |
| No `custom_job_description_md` set when exporting | HTTP 404, `{"error": "No job description found..."}` |
| PDF generation fails (missing weasyprint/pdfkit) | HTTP 500 + `frappe.log_error` |
