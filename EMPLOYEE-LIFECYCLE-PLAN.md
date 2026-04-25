# Employee Lifecycle Module — Technical Plan
_Created: 2026-04-20 | Status: Ready to build_

> Read CLAUDE.md and BUILDER-BRIEFING.md first.
> This document is lifecycle-specific. Start here after reading those.

---

## SECTION 1 — Existing DocTypes Analysis

### What HRMS / ERPNext already has

#### Employee DocType (`erpnext/setup/doctype/employee/`)
The core Employee record. Already has almost everything we need:

| Field | Type | Notes |
|---|---|---|
| first_name, last_name, employee_name | Data | Full name fields |
| status | Select | Active / Inactive / Suspended / Left |
| date_of_birth, date_of_joining | Date | |
| department, designation, reports_to | Link | |
| company_email, personal_email | Data | |
| cell_number | Data | Mobile |
| emergency_phone_number, person_to_be_contacted, relation | Data | Emergency contact |
| permanent_address, current_address | Small Text | |
| bank_name, bank_ac_no | Data | Bank details |
| education | Table | Educational history |
| resignation_letter_date | Date | Date of resignation letter (not the file) |
| relieving_date | Date | Last working day |
| reason_for_leaving | Small Text | Free text only — no dropdown |
| held_on | Date | "Exit Interview Held On" — just a date stamp |
| feedback | Small Text | Free-form exit feedback only |

**Gaps on Employee:** No onboarding stage tracking, no document checklist, no IT setup checklist, no resignation letter file attachment. No structured exit interview answers.

#### Employee Onboarding DocType (`hrms/hr/doctype/employee_onboarding/`)
Template-based activity checklist. Links to job_applicant and job_offer. Fields: `boarding_status` (Pending/In Process/Completed), `activities` (Table of tasks).

**Why we don't use it:** It is a TEMPLATE-ACTIVITIES system (HR defines task templates, assigns to people). We want a STAGE-BASED system (Offer Accepted → Documents Collected → IT Setup → First Day → Active). Our simpler model fits better as custom fields directly on Employee.

#### Exit Interview DocType (`hrms/hr/doctype/exit_interview/`)
Submittable. Fields: employee, relieving_date, date, interviewers, status (Pending/Scheduled/Completed/Cancelled), employee_status (Employee Retained/Exit Confirmed), interview_summary (Text Editor, free-form).

**Why we don't use it:** (1) Requires `relieving_date` to be set on Employee **before** the doc can be saved — blocks our "resignation submitted" stage where last_working_day isn't known yet. (2) Has a duplicate-prevention validator — only one Exit Interview per employee, which conflicts with us creating it early. (3) No structured questions (reason dropdown, would recommend, etc.) — only a free-text summary. We'd need so many custom fields that creating our own DocType is cleaner.

#### Employee Separation DocType (`hrms/hr/doctype/employee_separation/`)
Activities-based offboarding template (mirrors Employee Onboarding). `boarding_status` (Pending/In Process/Completed). Has `resignation_letter_date` (just a date, not a file).

**Why we don't use it:** Same template-activity model that doesn't fit our stage flow.

#### Full and Final Statement DocType (`hrms/hr/doctype/full_and_final_statement/`)
Financial settlement doc: payables, receivables, assets. Needs separate HR work to set up. We track settlement status in our `Employee Exit` DocType as a simple flag (`final_settlement_status`), and link to Full and Final Statement when it exists.

### Decision Summary

| What we need | Approach |
|---|---|
| Onboarding stages on Employee | **Custom Fields** on Employee (4 fields) |
| Document checklist | **Custom Field** on Employee (JSON) |
| IT setup checklist | **Custom Field** on Employee (JSON) |
| Resignation tracking + exit interview | **New DocType: `Employee Exit`** |
| Welcome email | `frappe.sendmail` + Email Template fixture |

---

## SECTION 2 — Custom Fields & New DocType

### 2A. Custom Fields on Employee (4 fields)

Add to `hr_client/fixtures/custom_field.json`:

```json
{
  "doctype": "Custom Field",
  "name": "Employee-custom_onboarding_stage",
  "dt": "Employee",
  "fieldname": "custom_onboarding_stage",
  "fieldtype": "Select",
  "label": "Onboarding Stage",
  "options": "Offer Accepted\nDocuments Collected\nIT Setup\nFirst Day\nActive",
  "default": "Offer Accepted",
  "insert_after": "status",
  "in_list_view": 1,
  "in_standard_filter": 1
},
{
  "doctype": "Custom Field",
  "name": "Employee-custom_documents_checklist",
  "dt": "Employee",
  "fieldname": "custom_documents_checklist",
  "fieldtype": "JSON",
  "label": "Documents Checklist",
  "insert_after": "custom_onboarding_stage"
},
{
  "doctype": "Custom Field",
  "name": "Employee-custom_it_setup_checklist",
  "dt": "Employee",
  "fieldname": "custom_it_setup_checklist",
  "fieldtype": "JSON",
  "label": "IT Setup Checklist",
  "insert_after": "custom_documents_checklist"
},
{
  "doctype": "Custom Field",
  "name": "Employee-custom_resignation_letter",
  "dt": "Employee",
  "fieldname": "custom_resignation_letter",
  "fieldtype": "Attach",
  "label": "Resignation Letter",
  "insert_after": "resignation_letter_date"
}
```

**Documents checklist JSON schema** (stored in `custom_documents_checklist`):
```json
{
  "offer_letter_signed": "pending",
  "id_proof": "pending",
  "address_proof": "pending",
  "educational_certificates": "pending",
  "bank_details": "pending",
  "pan_card": "pending",
  "aadhaar": "pending"
}
```
Values: `"pending"` | `"received"` | `"waived"`

**Mandatory docs** (cannot advance to IT Setup stage until all are `"received"` or `"waived"`):
`offer_letter_signed`, `id_proof`, `pan_card`, `aadhaar`

**IT setup checklist JSON schema** (stored in `custom_it_setup_checklist`):
```json
{
  "email_created": false,
  "laptop_assigned": false,
  "system_access": false,
  "software_installed": false
}
```

### 2B. New DocType — `Employee Exit`

**Path:** `hr_client/hr_client/hr_client/doctype/employee_exit/`
(Remember: DocType files MUST go inside the `hr_client/hr_client/hr_client/doctype/` path — not `hr_client/hr_client/doctype/`)

**`employee_exit.json`:**
```json
{
  "doctype": "DocType",
  "name": "Employee Exit",
  "module": "HR Client",
  "autoname": "HR-EXIT-.YYYY.-.####",
  "is_submittable": 0,
  "track_changes": 1,
  "fields": [
    {
      "fieldname": "employee",
      "fieldtype": "Link",
      "label": "Employee",
      "options": "Employee",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "employee_name",
      "fieldtype": "Data",
      "label": "Employee Name",
      "fetch_from": "employee.employee_name",
      "read_only": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "department",
      "fieldtype": "Link",
      "label": "Department",
      "options": "Department",
      "fetch_from": "employee.department",
      "read_only": 1
    },
    {
      "fieldname": "designation",
      "fieldtype": "Link",
      "label": "Designation",
      "options": "Designation",
      "fetch_from": "employee.designation",
      "read_only": 1
    },
    {
      "fieldname": "company",
      "fieldtype": "Link",
      "label": "Company",
      "options": "Company"
    },
    {
      "fieldname": "resignation_date",
      "fieldtype": "Date",
      "label": "Resignation Date",
      "reqd": 1
    },
    {
      "fieldname": "last_working_day",
      "fieldtype": "Date",
      "label": "Last Working Day"
    },
    {
      "fieldname": "resignation_letter",
      "fieldtype": "Attach",
      "label": "Resignation Letter"
    },
    {
      "fieldname": "status",
      "fieldtype": "Select",
      "label": "Status",
      "options": "Pending\nInterview Done\nCleared\nSettled",
      "default": "Pending",
      "in_list_view": 1,
      "in_standard_filter": 1
    },
    {
      "fieldname": "final_settlement_status",
      "fieldtype": "Select",
      "label": "Final Settlement",
      "options": "Pending\nDone",
      "default": "Pending"
    },
    {
      "fieldname": "exit_reason",
      "fieldtype": "Select",
      "label": "Reason for Leaving",
      "options": "\nBetter opportunity\nPersonal\nRelocation\nHigher studies\nCompensation\nWork environment\nOther"
    },
    {
      "fieldname": "would_recommend",
      "fieldtype": "Select",
      "label": "Would You Recommend This Company?",
      "options": "\nYes\nNo\nMaybe"
    },
    {
      "fieldname": "enjoyed_most",
      "fieldtype": "Long Text",
      "label": "What did you enjoy most about working here?"
    },
    {
      "fieldname": "improvement_suggestions",
      "fieldtype": "Long Text",
      "label": "What could we improve?"
    },
    {
      "fieldname": "management_feedback",
      "fieldtype": "Long Text",
      "label": "Any feedback for management?"
    }
  ],
  "permissions": [
    {
      "role": "HR Manager",
      "read": 1, "write": 1, "create": 1, "delete": 1
    },
    {
      "role": "HR User",
      "read": 1, "write": 1, "create": 1
    },
    {
      "role": "Employee",
      "read": 1,
      "if_owner": 1
    }
  ]
}
```

**`employee_exit.py`:**
```python
import frappe
from frappe.model.document import Document

class EmployeeExit(Document):
    def validate(self):
        self._sync_employee_relieving_date()

    def _sync_employee_relieving_date(self):
        if self.last_working_day:
            frappe.db.set_value(
                "Employee", self.employee, "relieving_date", self.last_working_day
            )
```

### 2C. Email Template Fixture

Add `hr_client/fixtures/email_template.json`:
```json
[
  {
    "doctype": "Email Template",
    "name": "employee_welcome",
    "subject": "Welcome to {{ company_name }}, {{ employee_name }}!",
    "response": "<p>Dear {{ employee_name }},</p><p>We are thrilled to welcome you to <strong>{{ company_name }}</strong>! Your first day is <strong>{{ date_of_joining }}</strong>.</p><p><strong>On your first day:</strong></p><ul><li>Please report to HR to collect your access card and complete joining formalities.</li><li>Our IT team will help set up your workstation. For IT queries, contact: <a href=\"mailto:{{ it_contact }}\">{{ it_contact }}</a></li><li>Your HR contact for any questions: <a href=\"mailto:{{ hr_contact }}\">{{ hr_contact }}</a></li></ul><p>We are excited to have you on board and look forward to achieving great things together.</p><p>Warm regards,<br>HR Team, {{ company_name }}</p>",
    "use_html": 1
  }
]
```

Register in `hooks.py`:
```python
fixtures = [
    {"dt": "Custom Field", "filters": [["name", "in", [
        "Job Applicant-custom_pipeline_stage",
        "Job Applicant-custom_current_interview_round",
        "Job Applicant-custom_rejection_reason",
        "Job Applicant-custom_internal_notes",
        "Job Opening-custom_interview_rounds",
        "Job Opening-custom_job_description_md",
        "Employee-custom_onboarding_stage",
        "Employee-custom_documents_checklist",
        "Employee-custom_it_setup_checklist",
        "Employee-custom_resignation_letter"
    ]]]},
    {"dt": "Email Template", "filters": [["name", "=", "employee_welcome"]]}
]
```

---

## SECTION 3 — API Endpoints

All in new file: `hr_client/hr_client/api/employee_lifecycle.py`
URL pattern: `/api/method/hr_client.api.employee_lifecycle.<function_name>`

### Checklist defaults (used server-side)
```python
DEFAULT_DOCS_CHECKLIST = {
    "offer_letter_signed": "pending",
    "id_proof": "pending",
    "address_proof": "pending",
    "educational_certificates": "pending",
    "bank_details": "pending",
    "pan_card": "pending",
    "aadhaar": "pending",
}
MANDATORY_DOCS = {"offer_letter_signed", "id_proof", "pan_card", "aadhaar"}

DEFAULT_IT_CHECKLIST = {
    "email_created": False,
    "laptop_assigned": False,
    "system_access": False,
    "software_installed": False,
}

ONBOARDING_STAGES = ["Offer Accepted", "Documents Collected", "IT Setup", "First Day", "Active"]
```

---

### Endpoint 1 — `get_employees`
```
GET /api/method/hr_client.api.employee_lifecycle.get_employees
Params: status (opt), onboarding_stage (opt), page (opt, default 1), page_length (opt, default 20)
```
```json
{
  "message": {
    "employees": [
      {
        "name": "HR-EMP-00001",
        "employee_name": "Jane Smith",
        "designation": "Software Engineer",
        "department": "Engineering",
        "company_email": "jane@company.com",
        "date_of_joining": "2024-05-01",
        "status": "Active",
        "custom_onboarding_stage": "IT Setup",
        "image": null
      }
    ],
    "total": 42,
    "page": 1,
    "page_length": 20
  }
}
```

---

### Endpoint 2 — `get_employee_detail`
```
GET /api/method/hr_client.api.employee_lifecycle.get_employee_detail
Params: employee_id (required)
```
```json
{
  "message": {
    "employee": {
      "name": "HR-EMP-00001",
      "employee_name": "Jane Smith",
      "first_name": "Jane",
      "last_name": "Smith",
      "date_of_birth": "1995-03-15",
      "gender": "Female",
      "date_of_joining": "2024-05-01",
      "department": "Engineering",
      "designation": "Software Engineer",
      "company_email": "jane@company.com",
      "personal_email": "jane@personal.com",
      "cell_number": "+91 9876543210",
      "permanent_address": "123 Main St, Bangalore",
      "bank_name": "HDFC",
      "bank_ac_no": "XXXX1234",
      "status": "Active",
      "custom_onboarding_stage": "IT Setup",
      "documents_checklist": {
        "offer_letter_signed": "received",
        "id_proof": "received",
        "address_proof": "pending",
        "educational_certificates": "pending",
        "bank_details": "received",
        "pan_card": "received",
        "aadhaar": "received"
      },
      "it_setup_checklist": {
        "email_created": true,
        "laptop_assigned": false,
        "system_access": false,
        "software_installed": false
      }
    },
    "exit": null
  }
}
```
`exit` is `null` if no `Employee Exit` record exists, otherwise returns the exit summary.

---

### Endpoint 3 — `create_employee`
```
POST /api/method/hr_client.api.employee_lifecycle.create_employee
Body (JSON):
{
  "first_name": "Jane",
  "last_name": "Smith",
  "date_of_joining": "2024-05-01",
  "designation": "Software Engineer",
  "department": "Engineering",
  "company": "My Company",
  "personal_email": "jane@personal.com",
  "cell_number": "+91 9876543210",
  "job_applicant": "HR-APP-2024-00001"
}
```
- `job_applicant` is optional. If provided, copies applicant details (name, email, phone) onto Employee.
- Sets `custom_onboarding_stage = "Offer Accepted"` automatically.
- Sets default `custom_documents_checklist` and `custom_it_setup_checklist` JSON.
```json
{
  "message": {
    "success": true,
    "employee": {
      "name": "HR-EMP-00001",
      "employee_name": "Jane Smith",
      "custom_onboarding_stage": "Offer Accepted"
    }
  }
}
```

---

### Endpoint 4 — `update_onboarding_stage`
```
POST /api/method/hr_client.api.employee_lifecycle.update_onboarding_stage
Body (JSON):
{
  "employee_id": "HR-EMP-00001",
  "stage": "Documents Collected",
  "checklist_data": {
    "offer_letter_signed": "received",
    "id_proof": "received",
    "pan_card": "received",
    "aadhaar": "received",
    "address_proof": "pending",
    "educational_certificates": "waived",
    "bank_details": "received"
  }
}
```
- `checklist_data` used when stage is `"Documents Collected"` or `"IT Setup"`.
- For `"Documents Collected"` stage: validates that all mandatory docs (`offer_letter_signed`, `id_proof`, `pan_card`, `aadhaar`) are `"received"` or `"waived"`. Returns 400 if not.
- For `"First Day"` stage: auto-triggers `send_welcome_email` (fires in background).
- For `"Active"` stage: updates Employee `status` field to `"Active"`.
```json
{
  "message": {
    "success": true,
    "employee": {
      "name": "HR-EMP-00001",
      "custom_onboarding_stage": "Documents Collected"
    },
    "welcome_email_sent": false
  }
}
```
When stage = "First Day": `"welcome_email_sent": true`.

**Validation error (missing mandatory docs):**
```json
{
  "message": {
    "error": "Cannot advance to Documents Collected: the following mandatory documents are still pending: ID Proof, Aadhaar"
  }
}
```

---

### Endpoint 5 — `get_onboarding_checklist`
```
GET /api/method/hr_client.api.employee_lifecycle.get_onboarding_checklist
Params: employee_id (required)
```
```json
{
  "message": {
    "employee_id": "HR-EMP-00001",
    "onboarding_stage": "Documents Collected",
    "documents_checklist": {
      "offer_letter_signed": "received",
      "id_proof": "received",
      "address_proof": "pending",
      "educational_certificates": "pending",
      "bank_details": "received",
      "pan_card": "received",
      "aadhaar": "received"
    },
    "it_setup_checklist": {
      "email_created": true,
      "laptop_assigned": false,
      "system_access": false,
      "software_installed": false
    },
    "mandatory_docs_complete": true
  }
}
```

---

### Endpoint 6 — `submit_resignation`
```
POST /api/method/hr_client.api.employee_lifecycle.submit_resignation
Body (JSON):
{
  "employee_id": "HR-EMP-00001",
  "resignation_date": "2024-07-01",
  "last_working_day": "2024-07-31",
  "resignation_letter_url": "/files/jane_resignation.pdf"
}
```
- `resignation_letter_url` is optional. Frontend uploads the file first via Frappe's standard file upload endpoint (`/api/method/upload_file`), then passes the returned `file_url` here.
- Creates an `Employee Exit` record (status = "Pending").
- Sets `resignation_letter_date` and `relieving_date` on the Employee DocType (existing core fields).
- Saves `custom_resignation_letter` URL on Employee.
```json
{
  "message": {
    "success": true,
    "exit_record": "HR-EXIT-2024-0001"
  }
}
```
**Error if resignation already submitted:**
```json
{ "message": { "error": "Resignation already on record: HR-EXIT-2024-0001" } }
```

---

### Endpoint 7 — `submit_exit_interview`
```
POST /api/method/hr_client.api.employee_lifecycle.submit_exit_interview
Body (JSON):
{
  "employee_id": "HR-EMP-00001",
  "exit_reason": "Better opportunity",
  "would_recommend": "Yes",
  "enjoyed_most": "The collaborative culture and technical challenges.",
  "improvement_suggestions": "Better work-life balance policies.",
  "management_feedback": "Management was supportive and approachable."
}
```
- Requires an existing `Employee Exit` record for this employee. Returns 404 if not found.
- Sets `exit_reason`, `would_recommend`, `enjoyed_most`, `improvement_suggestions`, `management_feedback`.
- Sets `Employee Exit.status = "Interview Done"`.
- Sets Employee `status = "Left"` if `last_working_day` is today or in the past.
```json
{
  "message": {
    "success": true,
    "employee_status_updated": true
  }
}
```

---

### Endpoint 8 — `get_exit_details`
```
GET /api/method/hr_client.api.employee_lifecycle.get_exit_details
Params: employee_id (required)
```
```json
{
  "message": {
    "exit": {
      "name": "HR-EXIT-2024-0001",
      "employee": "HR-EMP-00001",
      "employee_name": "Jane Smith",
      "department": "Engineering",
      "resignation_date": "2024-07-01",
      "last_working_day": "2024-07-31",
      "resignation_letter": "/files/jane_resignation.pdf",
      "status": "Interview Done",
      "final_settlement_status": "Pending",
      "exit_reason": "Better opportunity",
      "would_recommend": "Yes",
      "enjoyed_most": "...",
      "improvement_suggestions": "...",
      "management_feedback": "..."
    }
  }
}
```
Returns `{"exit": null}` if no exit record exists.

---

### Endpoint 9 — `send_welcome_email`
```
POST /api/method/hr_client.api.employee_lifecycle.send_welcome_email
Body (JSON): { "employee_id": "HR-EMP-00001" }
```
- Fetches employee record.
- Fetches Email Template `employee_welcome`.
- Sends via `frappe.sendmail` to employee's `company_email` or `personal_email`.
- Context: `employee_name`, `company_name`, `date_of_joining`, `it_contact` (from HR Settings or hardcoded fallback), `hr_contact`.
```json
{ "message": { "success": true, "sent_to": "jane@company.com" } }
```

**Python pattern (from HRMS exit_interview.py research):**
```python
template = frappe.get_doc("Email Template", "employee_welcome")
context = {
    "employee_name": employee.employee_name,
    "company_name": frappe.defaults.get_user_default("Company"),
    "date_of_joining": str(employee.date_of_joining),
    "it_contact": "it@company.com",
    "hr_contact": "hr@company.com",
}
frappe.sendmail(
    recipients=email_address,
    subject=frappe.render_template(template.subject, context),
    message=frappe.render_template(template.response, context),
    reference_doctype="Employee",
    reference_name=employee.name,
)
```

---

## SECTION 4 — Welcome Email Template

**Template name:** `employee_welcome` (shipped as fixture)

**Subject:** `Welcome to {{ company_name }}, {{ employee_name }}!`

**Body (HTML):**
```html
<p>Dear {{ employee_name }},</p>

<p>We are thrilled to welcome you to <strong>{{ company_name }}</strong>!</p>
<p>Your joining date is <strong>{{ date_of_joining }}</strong>.</p>

<p><strong>First day checklist:</strong></p>
<ul>
  <li>Report to HR to collect your access card and complete joining formalities.</li>
  <li>Our IT team will set up your workstation and accounts.
      IT contact: <a href="mailto:{{ it_contact }}">{{ it_contact }}</a></li>
  <li>For any HR-related queries:
      <a href="mailto:{{ hr_contact }}">{{ hr_contact }}</a></li>
</ul>

<p>We're excited to have you on board and look forward to doing great work together.</p>

<p>Warm regards,<br>
HR Team, {{ company_name }}</p>
```

**How to create/update the template:**
- Shipped as a fixture in `hr_client/fixtures/email_template.json`
- Runs automatically on `bench migrate`
- Can be edited in Frappe desk: Settings → Email Template → `employee_welcome`

---

## SECTION 5 — Frontend Components

All files in `~/hr-frontend/src/pages/employees/`

### Component Tree
```
/employees
└── EmployeesPage.tsx
    ├── EmployeeCard.tsx (×N)  — grid/list of employees with stage badges
    ├── OnboardingDrawer.tsx   — right sheet, opens when card clicked
    │   ├── OnboardingTracker.tsx   — 4-step visual stepper
    │   ├── DocumentChecklist.tsx  — 7 doc items, mark received/waived
    │   └── ITSetupChecklist.tsx   — 4 IT items, toggle checkboxes
    └── ExitModal.tsx          — resignation + exit interview flow
        └── ExitInterviewForm.tsx
```

### Page: `EmployeesPage.tsx`
Route: `/employees`
- Shows tab bar: **Onboarding** (stage ≠ Active) | **Active** | **Exiting** (has exit record)
- "Add Employee" button → opens create form (or links from recruitment Hired stage)
- Search bar by name / department

### Component: `EmployeeCard.tsx`
- Photo placeholder (initials avatar if no image)
- Employee name, designation, department
- Stage badge colored by stage:
  - Offer Accepted → gray
  - Documents Collected → blue
  - IT Setup → purple
  - First Day → orange
  - Active → green
- Days since joining (or days until joining if future)
- Click → opens `OnboardingDrawer`

### Component: `OnboardingTracker.tsx`
- Horizontal stepper: 4 stages (Offer Accepted → Docs → IT Setup → First Day) + "Active" end state
- Current stage highlighted
- Completed stages show checkmark
- "Advance to next stage" button (validates checklist completeness client-side before calling API)

### Component: `DocumentChecklist.tsx`
- 7 document rows: name, status badge (Pending / Received / Waived)
- Each row has action buttons: "Mark Received" | "Mark Waived" | "Reset"
- Mandatory docs marked with asterisk
- "Mandatory docs incomplete" warning banner when not all required docs are received/waived

### Component: `ITSetupChecklist.tsx`
- 4 checkboxes with labels
- Each toggles via `update_onboarding_stage` API with full IT checklist state
- "All done" → advance to First Day button enabled

### Component: `ExitModal.tsx`
Opens as Dialog. Two screens:
1. **Resignation screen** — resignation date (date picker), last working day (date picker), file upload (resignation letter, optional)
2. **Exit interview screen** — shown after resignation is submitted or when HR wants to fill it in later

### Component: `ExitInterviewForm.tsx`
- Reason for leaving (Select/dropdown)
- Would you recommend this company? (radio: Yes / No / Maybe)
- 3 text areas (enjoyed_most, improvement_suggestions, management_feedback)
- "Submit Exit Interview" button

### Component: `EmployeeDirectory.tsx`
Route: `/employees/directory`
- Shows only `status = Active` employees
- Grid: photo, name, designation, department, email, phone
- Search + filter by department

### Hooks: `useEmployeeLifecycle.ts`
```typescript
export function useEmployees(filters?)         // GET get_employees
export function useEmployeeDetail(id)          // GET get_employee_detail
export function useCreateEmployee()            // POST create_employee (mutation)
export function useUpdateOnboardingStage()     // POST update_onboarding_stage (mutation)
export function useOnboardingChecklist(id)     // GET get_onboarding_checklist
export function useSubmitResignation()         // POST submit_resignation (mutation)
export function useSubmitExitInterview()       // POST submit_exit_interview (mutation)
export function useExitDetails(id)             // GET get_exit_details
export function useSendWelcomeEmail()          // POST send_welcome_email (mutation)
```

### Types: `src/pages/employees/types.ts`
```typescript
export type OnboardingStage =
  | "Offer Accepted"
  | "Documents Collected"
  | "IT Setup"
  | "First Day"
  | "Active";

export type DocStatus = "pending" | "received" | "waived";

export interface DocumentsChecklist {
  offer_letter_signed: DocStatus;
  id_proof: DocStatus;
  address_proof: DocStatus;
  educational_certificates: DocStatus;
  bank_details: DocStatus;
  pan_card: DocStatus;
  aadhaar: DocStatus;
}

export interface ITSetupChecklist {
  email_created: boolean;
  laptop_assigned: boolean;
  system_access: boolean;
  software_installed: boolean;
}

export interface EmployeeListItem {
  name: string;
  employee_name: string;
  designation: string;
  department: string;
  company_email: string;
  date_of_joining: string;
  status: "Active" | "Inactive" | "Suspended" | "Left";
  custom_onboarding_stage: OnboardingStage;
  image: string | null;
}

export interface EmployeeDetail {
  employee: EmployeeListItem & {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    personal_email: string;
    cell_number: string;
    permanent_address: string;
    bank_name: string;
    bank_ac_no: string;
    documents_checklist: DocumentsChecklist;
    it_setup_checklist: ITSetupChecklist;
  };
  exit: EmployeeExitRecord | null;
}

export interface EmployeeExitRecord {
  name: string;
  employee: string;
  employee_name: string;
  department: string;
  resignation_date: string;
  last_working_day: string | null;
  resignation_letter: string | null;
  status: "Pending" | "Interview Done" | "Cleared" | "Settled";
  final_settlement_status: "Pending" | "Done";
  exit_reason: string | null;
  would_recommend: "Yes" | "No" | "Maybe" | null;
  enjoyed_most: string | null;
  improvement_suggestions: string | null;
  management_feedback: string | null;
}
```

---

## SECTION 6 — API Contract (for CLAUDE.md)

### Employee Lifecycle Endpoints (PLANNED — not yet built)
Base: `/api/method/hr_client.api.employee_lifecycle.<endpoint>`
Auth: session cookie, HR Manager or System Manager role required on all.

| Method | Endpoint | Params | Notes |
|---|---|---|---|
| GET | `get_employees` | `status` (opt), `onboarding_stage` (opt), `page` (opt), `page_length` (opt) | Lists employees with stage |
| GET | `get_employee_detail` | `employee_id` (req) | Full profile + checklist + exit summary |
| POST | `create_employee` | `first_name`, `last_name`, `date_of_joining`, `designation`, `department`, `company`, `personal_email`, `cell_number`, `job_applicant` (opt) | Creates employee, sets Offer Accepted stage |
| POST | `update_onboarding_stage` | `employee_id` (req), `stage` (req), `checklist_data` (opt, JSON) | Advances stage; validates mandatory docs; triggers welcome email on First Day |
| GET | `get_onboarding_checklist` | `employee_id` (req) | Returns both checklists |
| POST | `submit_resignation` | `employee_id` (req), `resignation_date` (req), `last_working_day` (opt), `resignation_letter_url` (opt) | Creates Employee Exit record |
| POST | `submit_exit_interview` | `employee_id` (req), `exit_reason`, `would_recommend`, `enjoyed_most`, `improvement_suggestions`, `management_feedback` | Updates Employee Exit; sets status=Interview Done; sets Employee status=Left |
| GET | `get_exit_details` | `employee_id` (req) | Returns Employee Exit record or null |
| POST | `send_welcome_email` | `employee_id` (req) | Sends welcome email via Email Template `employee_welcome` |

---

## Build Order

### Backend (Account 1)
1. **B-EL1** — Add 4 Custom Fields to fixtures + run migrate
2. **B-EL2** — Create `Employee Exit` DocType (`hr_client/hr_client/hr_client/doctype/employee_exit/`) + run migrate
3. **B-EL3** — Create Email Template fixture (`hr_client/fixtures/email_template.json`) + update hooks.py fixtures list + run migrate
4. **B-EL4** — Create `hr_client/hr_client/api/employee_lifecycle.py` — all 9 endpoints
5. **B-EL5** — Test all endpoints via bench console / curl
6. **B-EL6** — Signal frontend: update CLAUDE.md API Contract section

### Frontend (Account 2)
1. **F-EL1** — Create `src/pages/employees/types.ts`
2. **F-EL2** — Create `src/pages/employees/mockData.ts`
3. **F-EL3** — Create `src/pages/employees/hooks/useEmployeeLifecycle.ts`
4. **F-EL4** — Build `EmployeeCard`, `OnboardingTracker`, `DocumentChecklist`, `ITSetupChecklist`
5. **F-EL5** — Build `EmployeesPage` + route `/employees`
6. **F-EL6** — Build `OnboardingDrawer`
7. **F-EL7** — Build `ExitModal` + `ExitInterviewForm`
8. **F-EL8** — Build `EmployeeDirectory` + route `/employees/directory`
9. **F-EL9** — Wire to real API (VITE_USE_MOCK=false)

---

## ERPNext Gotchas Specific to This Module

### 1. Employee naming series
Employee uses `HR-EMP-` naming series. When creating via `frappe.new_doc("Employee")`, always set `naming_series = "HR-EMP-"` before `insert()`. Otherwise ERPNext auto-assigns but may conflict.

### 2. JSON fields require explicit parsing
`custom_documents_checklist` and `custom_it_setup_checklist` are stored as JSON strings in DB. Always:
```python
import json
checklist = json.loads(employee.custom_documents_checklist or "{}")
```
Never assume it's already a dict.

### 3. Employee `status` field is core — handle carefully
`status` on Employee is `Active`/`Inactive`/`Suspended`/`Left`. We set it to `"Left"` in `submit_exit_interview` only if `last_working_day` is today or past. Do NOT set it on resignation submission — the employee is still active until their last day.

### 4. File upload pattern for resignation letter
Frappe's file upload happens via a separate call to `/api/method/upload_file` (POST multipart). The response returns `{ "message": { "file_url": "/files/name.pdf" } }`. Frontend uploads first, then passes `file_url` to `submit_resignation`. Our endpoint does NOT handle binary upload.

### 5. `frappe.render_template` for email subjects
Unlike `template.response` (full HTML body), the `subject` field needs `frappe.render_template()` too:
```python
subject = frappe.render_template(template.subject, context)
message = frappe.render_template(template.response, context)
```
Without this, Jinja vars like `{{ employee_name }}` appear literally in the subject line.

### 6. Email Template fixture — name collision risk
If `employee_welcome` Email Template already exists in DB from a previous run, `bench migrate` will update it (fixtures sync). Be careful: edits made in Frappe desk will be overwritten on next migrate. Document this in DO NOT DO.

---

## Definition of Done

### Backend
- [ ] 4 Custom Fields on Employee visible in Frappe desk after migrate
- [ ] `Employee Exit` DocType table created in DB, visible in Frappe desk
- [ ] `employee_welcome` Email Template exists in Frappe desk
- [ ] All 9 API endpoints respond correctly (tested via curl)
- [ ] `update_onboarding_stage` correctly blocks stage advance when mandatory docs missing
- [ ] Welcome email fires when stage set to "First Day"
- [ ] `submit_exit_interview` correctly sets Employee status to "Left" when last_working_day ≤ today

### Frontend
- [ ] `/employees` route shows employees list with stage badges
- [ ] Onboarding drawer opens and shows 4-step tracker
- [ ] Document checklist updates persist (API call on each toggle)
- [ ] IT Setup checklist toggles work
- [ ] "Advance stage" validates mandatory docs before calling API
- [ ] Exit modal: resignation form submits and creates exit record
- [ ] Exit interview form submits all 5 questions
- [ ] Employee Directory shows only Active employees
