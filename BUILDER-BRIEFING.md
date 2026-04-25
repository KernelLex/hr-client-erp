# BUILDER BRIEFING — hr_client
_Read this before writing any code. Last updated: 2026-04-20_

You are the **Backend Builder** for a custom ERPNext v15 + Frappe HRMS system.
Your workspace is `~/frappe-bench/apps/hr_client/`. You NEVER touch any other app directory.

---

## 1. How the App Is Structured

```
hr_client/hr_client/
  doctype/          ← New DocTypes you create go here (one folder per DocType)
  api/              ← All whitelisted API endpoints (grouped by domain)
  overrides/        ← doc_events handlers & class overrides for core DocTypes
  fixtures/         ← Custom Fields for existing DocTypes (JSON, ships with app)
  patches/          ← One-time data migration scripts
  hooks.py          ← Wires everything together
  patches.txt       ← Patch registry
  modules.txt       ← Module list
```

**After every change:**
```bash
cd ~/frappe-bench
bench --site hrms.localhost migrate && bench --site hrms.localhost clear-cache
```
Never skip this. Never do migrate without cache-clear after.

---

## 2. Creating a New DocType

### Step 1 — Create the folder

**CRITICAL PATH:** DocTypes must live inside the **module subfolder**, not directly under `hr_client/hr_client/`.
Frappe resolves the module folder by importing `hr_client.hr_client` — so all DocTypes go in:

```
hr_client/hr_client/hr_client/doctype/form_template/   ← CORRECT
hr_client/hr_client/doctype/form_template/             ← WRONG (won't be discovered)
```

Full structure:
```
hr_client/hr_client/hr_client/doctype/form_template/
  __init__.py          (empty)
  form_template.json   (schema)
  form_template.py     (controller)
```

Also ensure `hr_client/hr_client/hr_client/doctype/__init__.py` exists (empty file).

### Step 2 — Write the JSON schema
Minimum valid structure:
```json
{
  "doctype": "DocType",
  "name": "Form Template",
  "module": "HR Client",
  "autoname": "naming_series:",
  "fields": [
    {
      "fieldname": "naming_series",
      "fieldtype": "Series",
      "label": "Series",
      "options": "FORM-TMPL-.YYYY.-"
    },
    {
      "fieldname": "form_name",
      "fieldtype": "Data",
      "label": "Form Name",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "form_type",
      "fieldtype": "Select",
      "label": "Form Type",
      "options": "Leave Application\nPersonal Details Update\nOnboarding\nCustom",
      "reqd": 1
    },
    {
      "fieldname": "is_active",
      "fieldtype": "Check",
      "label": "Is Active",
      "default": "1"
    }
  ],
  "permissions": [
    {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
    {"role": "HR User",    "read": 1, "write": 1, "create": 1}
  ],
  "track_changes": 1
}
```

**Valid fieldtypes you'll use most:**
`Data`, `Select`, `Link`, `Int`, `Float`, `Currency`, `Check`, `Date`, `Datetime`,
`Text`, `Long Text`, `JSON`, `Table`, `Attach`, `Section Break`, `Column Break`

**Select options:** newline-separated string in `"options"` field.
**Link options:** `"options": "Employee"` (name of the linked DocType).
**Table options:** `"options": "Child DocType Name"` (the child must have `"istable": 1`).

### Step 3 — Write the controller
```python
# form_template.py
import frappe
from frappe.model.document import Document

class FormTemplate(Document):
    def validate(self):
        self.validate_fields_schema()

    def validate_fields_schema(self):
        if self.fields_schema:
            import json
            try:
                schema = json.loads(self.fields_schema)
                if not isinstance(schema, list):
                    frappe.throw("Fields Schema must be a JSON array")
            except ValueError:
                frappe.throw("Fields Schema must be valid JSON")
```

**Hook execution order (insert):**
`before_validate` → `validate` → `before_insert` → `after_insert`

**Hook execution order (update):**
`before_validate` → `validate` → `before_save` → `on_update`

**Hook execution order (submit):**
`before_submit` → `on_submit`

**Hook execution order (cancel):**
`before_cancel` → `on_cancel`

---

## 3. Child Tables

Child DocType JSON must have `"istable": 1` and `"permissions": []`.

```json
{
  "doctype": "DocType",
  "name": "Form Field Definition",
  "istable": 1,
  "module": "HR Client",
  "fields": [
    {"fieldname": "fieldname", "fieldtype": "Data",   "label": "Field Name", "reqd": 1, "in_list_view": 1},
    {"fieldname": "label",     "fieldtype": "Data",   "label": "Label",      "reqd": 1, "in_list_view": 1},
    {"fieldname": "fieldtype", "fieldtype": "Select", "label": "Type",       "reqd": 1,
      "options": "Data\nSelect\nCheck\nDate\nInt\nText"},
    {"fieldname": "required",  "fieldtype": "Check",  "label": "Required"}
  ],
  "permissions": []
}
```

Reference from parent:
```json
{"fieldname": "form_fields", "fieldtype": "Table", "label": "Form Fields", "options": "Form Field Definition"}
```

Access in controller:
```python
for row in self.get("form_fields"):
    if not row.fieldname:
        frappe.throw(f"Row {row.idx}: Field Name is required")

self.append("form_fields", {"fieldname": "email", "label": "Email", "fieldtype": "Data", "required": 1})
```

---

## 4. Whitelisted API Endpoints

**File:** `hr_client/api/forms.py`

### Template
```python
import frappe
import json
from frappe import _

@frappe.whitelist()
def get_form_template(name):
    """GET /api/method/hr_client.api.forms.get_form_template?name=FORM-TMPL-0001"""
    frappe.has_permission("Form Template", ptype="read", throw=True)

    try:
        doc = frappe.get_doc("Form Template", name)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Form template not found"}

    return {
        "name": doc.name,
        "form_name": doc.form_name,
        "form_type": doc.form_type,
        "is_active": doc.is_active,
        "fields_schema": json.loads(doc.fields_schema or "[]"),
    }


@frappe.whitelist(allow_guest=True)
def submit_form(form_id, data, submitted_by):
    """POST /api/method/hr_client.api.forms.submit_form
    Called by MS Forms via Power Automate — no session auth.
    """
    # data arrives as JSON string from query param, or dict from JSON body
    if isinstance(data, str):
        data = json.loads(data)

    try:
        template = frappe.get_doc("Form Template", form_id)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Form template not found"}

    if not template.is_active:
        frappe.response.http_status_code = 400
        return {"error": "Form template is inactive"}

    submission = frappe.new_doc("Form Submission")
    submission.form_template = form_id
    submission.submitted_by = submitted_by
    submission.submission_data = json.dumps(data)
    submission.submitted_at = frappe.utils.now()
    submission.status = "Pending"
    submission.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"success": True, "submission_id": submission.name}


@frappe.whitelist()
def get_submissions(form_template=None, status=None, page=1, page_length=20):
    """GET /api/method/hr_client.api.forms.get_submissions"""
    frappe.has_permission("Form Submission", ptype="read", throw=True)

    page = int(page)
    page_length = int(page_length)

    filters = {}
    if form_template:
        filters["form_template"] = form_template
    if status:
        filters["status"] = status

    total = frappe.db.count("Form Submission", filters)
    submissions = frappe.get_all(
        "Form Submission",
        filters=filters,
        fields=["name", "form_template", "submitted_by", "employee", "status", "submitted_at"],
        order_by="submitted_at desc",
        limit_start=(page - 1) * page_length,
        limit_page_length=page_length,
    )

    # Enrich with form_name
    for s in submissions:
        s["form_name"] = frappe.db.get_value("Form Template", s["form_template"], "form_name")

    return {"submissions": submissions, "total": total, "page": page, "page_length": page_length}
```

### Parameter rules
- All params arrive as **strings** unless POST body is `Content-Type: application/json`
- Always cast: `page = int(page)`, `data = json.loads(data) if isinstance(data, str) else data`
- `frappe.session.user` is `"Guest"` in `allow_guest=True` endpoints — never trust it for auth

### Return value rules
- Return a plain `dict` or `list` — Frappe wraps it in `{"message": ..., "exc": null}`
- Never `return frappe.response` — just `return {"key": "val"}`
- Set HTTP status: `frappe.response.http_status_code = 404` BEFORE returning

---

## 5. Hooking Into Existing DocTypes

Never edit `apps/hrms/` or `apps/erpnext/`. Use these patterns instead:

### Pattern A — doc_events (least invasive)
```python
# hooks.py
doc_events = {
    "Employee": {
        "after_insert": "hr_client.overrides.employee.on_employee_insert",
    }
}

# hr_client/overrides/employee.py
import frappe

def on_employee_insert(doc, method=None):
    """doc = Employee document, method = "after_insert" """
    if not doc.custom_jibble_id:
        doc.db_set("custom_jibble_id", f"JBL-{doc.name}")
```

### Pattern B — Override class (when you need to change validate/submit logic)
```python
# hooks.py
override_doctype_class = {
    "Employee": "hr_client.overrides.employee.CustomEmployee"
}

# hr_client/overrides/employee.py
from hrms.hr.doctype.employee.employee import Employee
import frappe

class CustomEmployee(Employee):
    def validate(self):
        super().validate()   # ALWAYS call super first
        self.validate_jibble_id()

    def validate_jibble_id(self):
        if self.custom_jibble_id and not self.custom_jibble_id.isdigit():
            frappe.throw("Jibble ID must be numeric")
```

---

## 6. Custom Fields for Existing DocTypes

To add a field to `Employee` (or any existing DocType), **do not touch the DocType JSON**.
Create a fixture instead.

**File:** `hr_client/fixtures/custom_field.json`
```json
[
  {
    "doctype": "Custom Field",
    "name": "Employee-custom_jibble_id",
    "dt": "Employee",
    "fieldname": "custom_jibble_id",
    "fieldtype": "Data",
    "label": "Jibble Employee ID",
    "insert_after": "employee_name",
    "read_only": 0,
    "reqd": 0
  }
]
```

**Register in hooks.py:**
```python
fixtures = [
    {"dt": "Custom Field", "filters": [["name", "like", "%-custom_%"]]}
]
```

Custom Fields are named `"DocType-fieldname"` (e.g., `"Employee-custom_jibble_id"`).
Access them in code like any other field: `self.custom_jibble_id` or `doc.custom_jibble_id`.

---

## 7. Permission System Cheat Sheet

**Standard roles to use in DocType permissions:**
- `System Manager` — full access, always include
- `HR Manager` — full HR access
- `HR User` — create/read/write, no delete
- `Employee` — read own records only (use `"if_owner": 1`)

**Permission entry in DocType JSON:**
```json
"permissions": [
  {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "submit": 1, "cancel": 1},
  {"role": "HR Manager",     "read": 1, "write": 1, "create": 1, "delete": 1},
  {"role": "HR User",        "read": 1, "write": 1, "create": 1},
  {"role": "Employee",       "read": 1, "if_owner": 1}
]
```

**Row-level filter (hooks.py + module function):**
```python
permission_query_conditions = {
    "Form Submission": "hr_client.api.forms.get_permission_query_conditions"
}

# In forms.py:
def get_permission_query_conditions(user):
    if "HR Manager" in frappe.get_roles(user):
        return ""
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not emp:
        return "1=0"  # No employee = see nothing
    return f"`tabForm Submission`.employee = {frappe.db.escape(emp)}"
```

---

## 8. Exception Handling Patterns

```python
# Validate (blocks save, shows red error to user)
frappe.throw(_("Error message"), frappe.ValidationError)
frappe.throw(_("Access denied"), frappe.PermissionError)

# get_doc — always wraps
try:
    doc = frappe.get_doc("Form Template", name)
except frappe.DoesNotExistError:
    frappe.response.http_status_code = 404
    return {"error": "Not found"}

# get_value — returns None, never raises
val = frappe.db.get_value("Employee", {"user_id": user}, "name")
if not val:
    frappe.throw("Employee record not found for this user")

# Background job error logging
try:
    sync_attendance()
except Exception:
    frappe.log_error(frappe.get_traceback(), "Jibble Sync Failed")
```

---

## 9. Database Query Patterns

```python
# Single field — fast, no object overhead
name = frappe.db.get_value("Employee", {"user_id": "user@example.com"}, "name")

# Multiple fields as dict
emp = frappe.db.get_value("Employee", "EMP-0001", ["employee_name", "department"], as_dict=True)

# List of records (respects permissions)
submissions = frappe.get_all(
    "Form Submission",
    filters={"status": "Pending"},
    fields=["name", "submitted_by", "submitted_at"],
    order_by="submitted_at desc",
    limit_start=0,
    limit_page_length=20,
)

# Count
total = frappe.db.count("Form Submission", {"status": "Pending"})

# Raw SQL (last resort, always escape user input)
rows = frappe.db.sql(
    "SELECT name FROM `tabEmployee` WHERE department = %s",
    (department,),
    as_dict=True,
)

# Insert without full doc overhead
frappe.db.set_value("Form Submission", name, "status", "Processed")

# db_set on a loaded document (skips hooks)
doc.db_set("status", "Processed", update_modified=True)
```

---

## 10. Naming Series Pattern

In DocType JSON set `"autoname": "naming_series:"` and add a Series field:
```json
{
  "fieldname": "naming_series",
  "fieldtype": "Series",
  "label": "Series",
  "options": "FORM-TMPL-.YYYY.-\nFORM-TMPL-"
}
```

Format: `PREFIX-.YYYY.-.MM.-.####`
- `.YYYY.` → 4-digit year
- `.MM.` → 2-digit month
- `.####` → zero-padded counter (length = number of `#`)
Counter resets per unique prefix (including year/month if in prefix).

---

## 11. Scheduler / Background Jobs

```python
# hooks.py
scheduler_events = {
    "daily": ["hr_client.api.jibble.sync_attendance_daily"],
    "cron": {
        "0 9 * * 1-5": ["hr_client.api.jibble.morning_sync"],  # 9am Mon-Fri
    },
}

# jibble.py
import frappe

def sync_attendance_daily():
    try:
        # ... do work ...
        frappe.db.commit()   # REQUIRED in scheduler — no automatic commit
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Jibble Daily Sync Failed")
```

**Key:** Always `frappe.db.commit()` in scheduler jobs. In HTTP request context Frappe auto-commits.

---

## 12. Secrets & Configuration

Never store secrets in code. Store in `site_config.json`:
```bash
bench --site hrms.localhost set-config jibble_api_key "your-key-here"
```

Read in code:
```python
api_key = frappe.conf.get("jibble_api_key")
if not api_key:
    frappe.throw("Jibble API key not configured in site_config.json")
```

---

## 13. API Contract Reference

All endpoints are defined in `CLAUDE.md → ## API Contract`.
**Do not build or change endpoints that are not listed there.**
**Do not change the response shape** without updating `CLAUDE.md` first.

Frontend URL pattern:
```
GET  /api/method/hr_client.api.forms.get_form_template?name=FORM-TMPL-0001
POST /api/method/hr_client.api.forms.submit_form
```

---

## 14. Quick Reference — Common Mistakes That Break ERPNext

| Mistake | Consequence | Fix |
|---|---|---|
| `self.save()` inside `validate()` | Infinite recursion, server crash | Never. Use `db_set()` if you need to persist mid-validate |
| Forgot `super().validate()` | Parent validations silently skipped | Always first line in validate |
| `frappe.get_doc()` without try/except in API | Unhandled 500 error | Wrap with `except frappe.DoesNotExistError` |
| Raw SQL with user input | SQL injection | Use `%s` placeholders + `frappe.db.escape()` |
| `allow_guest=True` + trust `frappe.session.user` | Auth bypass | `session.user` is `"Guest"` for guests |
| No `frappe.db.commit()` in scheduler | Changes lost after job | Always commit in scheduled tasks |
| Editing core app files | Overwritten on update | Use doc_events, override_doctype_class, Custom Fields |
| Missing `bench migrate` after DocType change | Old schema in DB, errors | Always migrate + clear-cache |
| Patches referencing columns before schema sync | KeyError in migrate | Use `[post_model_sync]` section in patches.txt |
| Duplicate fixture entries | Migrate failures | Filter fixtures by `name like "%-custom_%"` pattern |
