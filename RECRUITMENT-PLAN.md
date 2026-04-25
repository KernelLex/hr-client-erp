# Recruitment Module — Technical Plan
_Last updated: 2026-04-20 | Status: Ready to build_

> **Read BUILDER-BRIEFING.md first** if you haven't — it covers all Frappe rules.
> This document is recruitment-specific. Start here after reading that.

---

## 1. Research Summary — What Already Exists in HRMS

HRMS ships these DocTypes we will **reuse, not recreate**:

| DocType | Purpose | Key Fields |
|---|---|---|
| **Job Opening** | A job vacancy posted internally | job_title, designation, department, status (Open/Closed), description, salary range |
| **Job Applicant** | A candidate applying to a Job Opening | applicant_name, email_id, job_title (→ Job Opening), status (Open/Replied/Rejected/Hold/Accepted), applicant_rating, resume_attachment |
| **Interview Round** | Master: defines a named round (e.g. "Technical Round 1") | round_name, interview_type, interviewers, expected_skill_set |
| **Interview** | Actual scheduled interview for a specific applicant | job_applicant, interview_round, scheduled_on, from_time, to_time, status (Pending/Under Review/Cleared/Rejected), average_rating |
| **Interview Feedback** | Interviewer's feedback + rating per Interview | interview, interviewer, result (Cleared/Rejected), skill_assessment, feedback |
| **Job Offer** | Formal offer sent to an applicant | job_applicant, offer_date, designation, status (Awaiting Response/Accepted/Rejected) |

**Existing whitelisted methods we can call from our API (no reimplementation needed):**
- `hrms.hr.doctype.job_applicant.job_applicant.get_interview_details(job_applicant)` — all interviews with ratings
- `hrms.hr.doctype.interview.interview.get_interviewers(interview_round)` — interviewers list
- `hrms.hr.doctype.interview.interview.get_feedback(interview)` — interview feedback
- `hrms.hr.doctype.job_offer.job_offer.make_employee(source_name)` — creates Employee from accepted offer

**Gap analysis — what HRMS does NOT have:**
1. No Kanban pipeline stage tracking on Job Applicant — it has `status` (HRMS internal) but not our 6-stage pipeline
2. No way to define which Interview Rounds belong to a Job Opening in sequence
3. No denormalized "current round" field for fast Kanban display
4. No internal notes / rejection reason fields
5. No single API that returns all applicants grouped by stage for a job

---

## 2. What We Build

### A. Custom Fields on existing DocTypes (fixtures — no core changes)

#### On Job Applicant (4 custom fields)

| Custom Field Name | fieldtype | options / notes |
|---|---|---|
| `Job Applicant-custom_pipeline_stage` | Select | `Application Received\nScreening\nInterview\nOffer Sent\nHired\nRejected` — default: `Application Received`, insert_after: `status` |
| `Job Applicant-custom_current_interview_round` | Link | → Interview Round, insert_after: `custom_pipeline_stage` |
| `Job Applicant-custom_rejection_reason` | Small Text | insert_after: `custom_current_interview_round`, depends_on: `eval:doc.custom_pipeline_stage=="Rejected"` |
| `Job Applicant-custom_internal_notes` | Text | Label: "Internal HR Notes", insert_after: `custom_rejection_reason` |

#### On Job Opening (1 custom field)

| Custom Field Name | fieldtype | options / notes |
|---|---|---|
| `Job Opening-custom_interview_rounds` | Table | → `Job Opening Interview Round` child DocType, insert_after: `description`, label: "Interview Round Sequence" |

### B. New DocType — `Job Opening Interview Round` (child table)

Defines the ordered list of Interview Rounds that apply to a specific Job Opening.

**File:** `hr_client/hr_client/doctype/job_opening_interview_round/`

Fields:
| fieldname | fieldtype | options | reqd | notes |
|---|---|---|---|---|
| `sequence` | Int | | 1 | Display order (1, 2, 3…) |
| `interview_round` | Link | Interview Round | 1 | |
| `round_name` | Data | | 0 | fetch_from: `interview_round.round_name`, read_only |
| `is_required` | Check | | 0 | default: 1 |

istable: 1, permissions: []

### C. New API module — `hr_client/api/recruitment.py`

11 whitelisted endpoints (full spec in Section 4).

### D. doc_events hooks — auto-manage pipeline stage

Registered in `hooks.py`, handles automatic stage transitions:
- **Job Applicant after_insert** → set `custom_pipeline_stage = "Application Received"`
- **Interview after_insert** → if applicant stage is `Application Received` or `Screening`, move to `Interview`; set `custom_current_interview_round`
- **Job Offer after_insert** → move applicant to `Offer Sent`
- **Job Offer on_update** (status → Accepted) → move applicant to `Hired`
- **Job Offer on_update** (status → Rejected) → move applicant to `Rejected`

---

## 3. Pipeline Stage Logic

Our Kanban has 6 columns. Each column = one value of `custom_pipeline_stage` on Job Applicant.

```
┌──────────────────┬───────────┬───────────┬────────────┬────────┬──────────┐
│ Application      │ Screening │ Interview │ Offer Sent │ Hired  │ Rejected │
│ Received         │           │           │            │        │          │
├──────────────────┼───────────┼───────────┼────────────┼────────┼──────────┤
│ [Card]           │ [Card]    │ [Card]    │ [Card]     │ [Card] │ [Card]   │
│ [Card]           │           │ [Card]    │            │        │          │
└──────────────────┴───────────┴───────────┴────────────┴────────┴──────────┘
```

**Stage transitions:**

| From | To | Trigger | Who |
|---|---|---|---|
| — | Application Received | Job Applicant created | Auto (after_insert) |
| Application Received | Screening | HR clicks "Move to Screening" or drags | Manual (move_candidate API) |
| Screening | Interview | First Interview scheduled | Auto (Interview after_insert hook) |
| Any | Interview | Interview scheduled | Auto |
| Interview | Offer Sent | Job Offer created | Auto (Job Offer after_insert hook) |
| Offer Sent | Hired | Job Offer status → Accepted | Auto (Job Offer on_update hook) |
| Offer Sent | Rejected | Job Offer status → Rejected | Auto |
| Any non-terminal | Rejected | HR clicks "Reject" | Manual (reject_candidate API) |
| Rejected | Screening | HR reinstates | Manual (move_candidate API) |

**Terminal stages:** `Hired` and `Rejected` — no auto-transitions out of these.
**HRMS `status` field** is kept in sync separately by HRMS itself — do not fight it.

---

## 4. API Endpoints — Full Specification

All in `hr_client/api/recruitment.py`. All require session auth (HR Manager role).
URL pattern: `/api/method/hr_client.api.recruitment.<function_name>`

---

### `get_job_openings`
```
GET /api/method/hr_client.api.recruitment.get_job_openings
Params: status (optional, default "Open")
```
```json
{
  "message": {
    "job_openings": [
      {
        "name": "HR-OPN-2024-0001",
        "job_title": "Senior Backend Engineer",
        "designation": "Software Engineer",
        "department": "Engineering",
        "status": "Open",
        "posted_on": "2024-04-01 10:00:00",
        "applicant_counts": {
          "Application Received": 3,
          "Screening": 2,
          "Interview": 1,
          "Offer Sent": 0,
          "Hired": 0,
          "Rejected": 1,
          "total": 7
        }
      }
    ]
  }
}
```

---

### `get_pipeline`
```
GET /api/method/hr_client.api.recruitment.get_pipeline
Params: job_opening (required — name of Job Opening)
```
```json
{
  "message": {
    "job_opening": {
      "name": "HR-OPN-2024-0001",
      "job_title": "Senior Backend Engineer",
      "designation": "Software Engineer",
      "department": "Engineering",
      "status": "Open",
      "interview_rounds": [
        {"sequence": 1, "interview_round": "HR Screen", "round_name": "HR Screen", "is_required": 1},
        {"sequence": 2, "interview_round": "Technical Round 1", "round_name": "Technical Round 1", "is_required": 1}
      ]
    },
    "stages": [
      {
        "stage": "Application Received",
        "applicants": [
          {
            "name": "HR-APP-2024-00001",
            "applicant_name": "Jane Smith",
            "email_id": "jane@example.com",
            "phone_number": "+91 9876543210",
            "applicant_rating": 3.5,
            "custom_pipeline_stage": "Application Received",
            "custom_current_interview_round": null,
            "custom_current_interview_round_name": null,
            "resume_attachment": "/files/jane_resume.pdf",
            "resume_link": "",
            "source": "LinkedIn",
            "creation": "2024-04-01 10:00:00"
          }
        ]
      },
      {"stage": "Screening", "applicants": []},
      {"stage": "Interview", "applicants": []},
      {"stage": "Offer Sent", "applicants": []},
      {"stage": "Hired", "applicants": []},
      {"stage": "Rejected", "applicants": []}
    ]
  }
}
```
**Note:** Always return all 6 stages even if empty. Frontend renders all 6 columns.

---

### `get_candidate`
```
GET /api/method/hr_client.api.recruitment.get_candidate
Params: name (required — Job Applicant name)
```
```json
{
  "message": {
    "applicant": {
      "name": "HR-APP-2024-00001",
      "applicant_name": "Jane Smith",
      "email_id": "jane@example.com",
      "phone_number": "+91 9876543210",
      "job_title": "HR-OPN-2024-0001",
      "job_title_display": "Senior Backend Engineer",
      "designation": "Software Engineer",
      "status": "Open",
      "custom_pipeline_stage": "Interview",
      "custom_current_interview_round": "Technical Round 1",
      "custom_rejection_reason": null,
      "custom_internal_notes": "Strong Python background",
      "applicant_rating": 4,
      "source": "LinkedIn",
      "cover_letter": "I am excited to apply...",
      "resume_attachment": "/files/jane_resume.pdf",
      "resume_link": "https://linkedin.com/in/jane",
      "creation": "2024-04-01 10:00:00"
    },
    "interviews": [
      {
        "name": "HR-INT-2024-0001",
        "interview_round": "HR Screen",
        "round_name": "HR Screen",
        "scheduled_on": "2024-04-05",
        "from_time": "10:00:00",
        "to_time": "11:00:00",
        "status": "Cleared",
        "average_rating": 4.0,
        "interview_summary": "Strong communicator"
      }
    ],
    "offer": null
  }
}
```
`offer` is `null` if no Job Offer exists, otherwise:
```json
"offer": {
  "name": "HR-OFF-2024-00001",
  "status": "Awaiting Response",
  "offer_date": "2024-04-10",
  "designation": "Software Engineer"
}
```

---

### `create_job_opening`
```
POST /api/method/hr_client.api.recruitment.create_job_opening
Body (JSON):
{
  "job_title": "Senior Backend Engineer",
  "designation": "Software Engineer",
  "department": "Engineering",
  "description": "We are looking for...",
  "employment_type": "Full-time",
  "location": "Bangalore",
  "lower_range": 800000,
  "upper_range": 1200000,
  "interview_rounds": [
    {"sequence": 1, "interview_round": "HR Screen", "is_required": 1},
    {"sequence": 2, "interview_round": "Technical Round 1", "is_required": 1}
  ]
}
```
```json
{
  "message": {
    "success": true,
    "job_opening": {
      "name": "HR-OPN-2024-0002",
      "job_title": "Senior Backend Engineer",
      "status": "Open"
    }
  }
}
```

---

### `add_candidate`
```
POST /api/method/hr_client.api.recruitment.add_candidate
Body (JSON):
{
  "job_opening": "HR-OPN-2024-0001",
  "applicant_name": "John Doe",
  "email_id": "john@example.com",
  "phone_number": "+91 9000000000",
  "source": "LinkedIn",
  "cover_letter": "...",
  "resume_link": "https://linkedin.com/in/john",
  "applicant_rating": 3
}
```
```json
{
  "message": {
    "success": true,
    "applicant": {
      "name": "HR-APP-2024-00002",
      "applicant_name": "John Doe",
      "custom_pipeline_stage": "Application Received"
    }
  }
}
```
**Note:** `resume_attachment` is handled via Frappe file upload separately — not in this endpoint.

---

### `move_candidate`
```
POST /api/method/hr_client.api.recruitment.move_candidate
Body (JSON):
{
  "applicant": "HR-APP-2024-00001",
  "stage": "Screening"
}
```
Valid stage values: `Application Received`, `Screening`, `Interview`, `Offer Sent`, `Hired`, `Rejected`
```json
{
  "message": {
    "success": true,
    "applicant": {
      "name": "HR-APP-2024-00001",
      "custom_pipeline_stage": "Screening"
    }
  }
}
```
**Backend validation:** Block moves to `Hired` directly from `move_candidate` — only Job Offer acceptance triggers Hired. Block moves to `Offer Sent` — only send_offer triggers that.

---

### `reject_candidate`
```
POST /api/method/hr_client.api.recruitment.reject_candidate
Body (JSON):
{
  "applicant": "HR-APP-2024-00001",
  "rejection_reason": "Does not meet technical requirements"
}
```
```json
{
  "message": {
    "success": true
  }
}
```
Sets `custom_pipeline_stage = "Rejected"`, `custom_rejection_reason`, and HRMS `status = "Rejected"`.

---

### `schedule_interview`
```
POST /api/method/hr_client.api.recruitment.schedule_interview
Body (JSON):
{
  "job_applicant": "HR-APP-2024-00001",
  "interview_round": "Technical Round 1",
  "scheduled_on": "2024-04-15",
  "from_time": "14:00:00",
  "to_time": "15:00:00"
}
```
```json
{
  "message": {
    "success": true,
    "interview": {
      "name": "HR-INT-2024-0002",
      "interview_round": "Technical Round 1",
      "scheduled_on": "2024-04-15",
      "status": "Pending"
    }
  }
}
```
**Note:** This creates an Interview doc. The `doc_events` hook on Interview will auto-update applicant's `custom_pipeline_stage` to `Interview` and set `custom_current_interview_round`.

---

### `send_offer`
```
POST /api/method/hr_client.api.recruitment.send_offer
Body (JSON):
{
  "job_applicant": "HR-APP-2024-00001",
  "offer_date": "2024-04-20",
  "designation": "Software Engineer",
  "company": "My Company"
}
```
```json
{
  "message": {
    "success": true,
    "offer": {
      "name": "HR-OFF-2024-00001",
      "status": "Awaiting Response",
      "offer_date": "2024-04-20"
    }
  }
}
```
Creates a Job Offer. The `doc_events` hook on Job Offer after_insert auto-moves applicant to `Offer Sent`.

---

### `update_offer_status`
```
POST /api/method/hr_client.api.recruitment.update_offer_status
Body (JSON):
{
  "offer": "HR-OFF-2024-00001",
  "status": "Accepted"
}
```
Valid status values: `Accepted`, `Rejected`
```json
{
  "message": {
    "success": true,
    "employee": "EMP-00001"
  }
}
```
`employee` is populated only when status = `Accepted` (auto-creates Employee via `make_employee`). The `doc_events` hook auto-moves applicant to `Hired` or `Rejected`.

---

### `get_interview_rounds`
```
GET /api/method/hr_client.api.recruitment.get_interview_rounds
Params: none
```
```json
{
  "message": {
    "rounds": [
      {"name": "HR Screen", "round_name": "HR Screen"},
      {"name": "Technical Round 1", "round_name": "Technical Round 1"},
      {"name": "Culture Fit", "round_name": "Culture Fit"}
    ]
  }
}
```

---

### `update_candidate_notes`
```
POST /api/method/hr_client.api.recruitment.update_candidate_notes
Body (JSON):
{
  "applicant": "HR-APP-2024-00001",
  "notes": "Candidate requested 2 weeks notice period."
}
```
```json
{
  "message": { "success": true }
}
```

---

## 5. Backend — Step-by-Step Build Order

Do these **in order**. Each step depends on the previous.

### B-R1: Create child DocType `Job Opening Interview Round`

**Directory:** `hr_client/hr_client/doctype/job_opening_interview_round/`

Create 2 files:

**`__init__.py`** — empty file

**`job_opening_interview_round.json`:**
```json
{
  "doctype": "DocType",
  "name": "Job Opening Interview Round",
  "module": "HR Client",
  "istable": 1,
  "editable_grid": 1,
  "fields": [
    {
      "fieldname": "sequence",
      "fieldtype": "Int",
      "label": "Sequence",
      "reqd": 1,
      "in_list_view": 1,
      "columns": 1
    },
    {
      "fieldname": "interview_round",
      "fieldtype": "Link",
      "label": "Interview Round",
      "options": "Interview Round",
      "reqd": 1,
      "in_list_view": 1,
      "columns": 4
    },
    {
      "fieldname": "round_name",
      "fieldtype": "Data",
      "label": "Round Name",
      "fetch_from": "interview_round.round_name",
      "read_only": 1,
      "in_list_view": 1,
      "columns": 3
    },
    {
      "fieldname": "is_required",
      "fieldtype": "Check",
      "label": "Required",
      "default": "1",
      "in_list_view": 1,
      "columns": 1
    }
  ],
  "permissions": []
}
```

**`job_opening_interview_round.py`:**
```python
import frappe
from frappe.model.document import Document

class JobOpeningInterviewRound(Document):
    pass
```

---

### B-R2: Create fixtures for Custom Fields

**File:** `hr_client/hr_client/fixtures/custom_field.json`

```json
[
  {
    "doctype": "Custom Field",
    "name": "Job Applicant-custom_pipeline_stage",
    "dt": "Job Applicant",
    "fieldname": "custom_pipeline_stage",
    "fieldtype": "Select",
    "label": "Pipeline Stage",
    "options": "Application Received\nScreening\nInterview\nOffer Sent\nHired\nRejected",
    "default": "Application Received",
    "insert_after": "status",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "reqd": 0
  },
  {
    "doctype": "Custom Field",
    "name": "Job Applicant-custom_current_interview_round",
    "dt": "Job Applicant",
    "fieldname": "custom_current_interview_round",
    "fieldtype": "Link",
    "label": "Current Interview Round",
    "options": "Interview Round",
    "insert_after": "custom_pipeline_stage",
    "read_only": 1
  },
  {
    "doctype": "Custom Field",
    "name": "Job Applicant-custom_rejection_reason",
    "dt": "Job Applicant",
    "fieldname": "custom_rejection_reason",
    "fieldtype": "Small Text",
    "label": "Rejection Reason",
    "insert_after": "custom_current_interview_round",
    "depends_on": "eval:doc.custom_pipeline_stage==\"Rejected\""
  },
  {
    "doctype": "Custom Field",
    "name": "Job Applicant-custom_internal_notes",
    "dt": "Job Applicant",
    "fieldname": "custom_internal_notes",
    "fieldtype": "Text",
    "label": "Internal HR Notes",
    "insert_after": "custom_rejection_reason"
  },
  {
    "doctype": "Custom Field",
    "name": "Job Opening-custom_interview_rounds",
    "dt": "Job Opening",
    "fieldname": "custom_interview_rounds",
    "fieldtype": "Table",
    "label": "Interview Round Sequence",
    "options": "Job Opening Interview Round",
    "insert_after": "description"
  }
]
```

---

### B-R3: Register fixtures and CORS in hooks.py

Add to `hr_client/hr_client/hooks.py`:

```python
# CORS for React frontend
allow_cors = "*"

# Fixtures — custom fields we own
fixtures = [
    {
        "dt": "Custom Field",
        "filters": [["name", "in", [
            "Job Applicant-custom_pipeline_stage",
            "Job Applicant-custom_current_interview_round",
            "Job Applicant-custom_rejection_reason",
            "Job Applicant-custom_internal_notes",
            "Job Opening-custom_interview_rounds"
        ]]]
    }
]

# Auto-manage pipeline stage on existing DocType events
doc_events = {
    "Job Applicant": {
        "after_insert": "hr_client.api.recruitment.on_applicant_insert",
    },
    "Interview": {
        "after_insert": "hr_client.api.recruitment.on_interview_insert",
    },
    "Job Offer": {
        "after_insert": "hr_client.api.recruitment.on_offer_insert",
        "on_update":    "hr_client.api.recruitment.on_offer_update",
    },
}
```

---

### B-R4: Run migrate

```bash
cd ~/frappe-bench
bench --site hrms.localhost migrate && bench --site hrms.localhost clear-cache
```

Verify:
- `tabJob Opening Interview Round` table exists in DB
- Custom Fields appear in Job Applicant and Job Opening in Frappe desk
- No migration errors

---

### B-R5: Create `hr_client/hr_client/api/recruitment.py`

Create the file with all 11 endpoints plus the 4 doc_event handlers. Full implementation:

```python
import frappe
import json
from frappe import _
from frappe.utils import now

# ─── CONSTANTS ───────────────────────────────────────────────────────────────

PIPELINE_STAGES = [
    "Application Received",
    "Screening",
    "Interview",
    "Offer Sent",
    "Hired",
    "Rejected",
]

# Stages that can only be set by automated hooks, not by move_candidate
SYSTEM_ONLY_STAGES = {"Offer Sent", "Hired"}

# ─── DOC EVENT HANDLERS ──────────────────────────────────────────────────────

def on_applicant_insert(doc, method=None):
    """Set initial pipeline stage when Job Applicant is created."""
    doc.db_set("custom_pipeline_stage", "Application Received", update_modified=False)


def on_interview_insert(doc, method=None):
    """Move applicant to Interview stage when a new Interview is scheduled."""
    if not doc.job_applicant:
        return
    current_stage = frappe.db.get_value(
        "Job Applicant", doc.job_applicant, "custom_pipeline_stage"
    )
    if current_stage not in ("Hired", "Rejected", "Offer Sent", "Interview"):
        frappe.db.set_value(
            "Job Applicant",
            doc.job_applicant,
            {
                "custom_pipeline_stage": "Interview",
                "custom_current_interview_round": doc.interview_round,
            },
        )


def on_offer_insert(doc, method=None):
    """Move applicant to Offer Sent when a Job Offer is created."""
    if not doc.job_applicant:
        return
    frappe.db.set_value(
        "Job Applicant",
        doc.job_applicant,
        "custom_pipeline_stage",
        "Offer Sent",
    )


def on_offer_update(doc, method=None):
    """Move applicant to Hired or Rejected based on Job Offer status change."""
    if not doc.job_applicant:
        return
    if doc.status == "Accepted":
        frappe.db.set_value(
            "Job Applicant", doc.job_applicant, "custom_pipeline_stage", "Hired"
        )
        # Also update HRMS status
        frappe.db.set_value("Job Applicant", doc.job_applicant, "status", "Accepted")
    elif doc.status == "Rejected":
        frappe.db.set_value(
            "Job Applicant", doc.job_applicant, "custom_pipeline_stage", "Rejected"
        )
        frappe.db.set_value("Job Applicant", doc.job_applicant, "status", "Rejected")


# ─── API ENDPOINTS ───────────────────────────────────────────────────────────

@frappe.whitelist()
def get_job_openings(status=None):
    _require_hr_role()
    filters = {}
    if status:
        filters["status"] = status
    else:
        filters["status"] = "Open"

    openings = frappe.get_all(
        "Job Opening",
        filters=filters,
        fields=["name", "job_title", "designation", "department", "status", "posted_on", "closes_on"],
        order_by="posted_on desc",
    )

    for opening in openings:
        counts = {}
        for stage in PIPELINE_STAGES:
            counts[stage] = frappe.db.count(
                "Job Applicant",
                {"job_title": opening["name"], "custom_pipeline_stage": stage},
            )
        counts["total"] = sum(counts.values())
        opening["applicant_counts"] = counts

    return {"job_openings": openings}


@frappe.whitelist()
def get_pipeline(job_opening):
    _require_hr_role()

    try:
        jo = frappe.get_doc("Job Opening", job_opening)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Job Opening not found"}

    rounds = [
        {
            "sequence": r.sequence,
            "interview_round": r.interview_round,
            "round_name": r.round_name,
            "is_required": r.is_required,
        }
        for r in sorted(jo.get("custom_interview_rounds") or [], key=lambda x: x.sequence or 0)
    ]

    applicant_fields = [
        "name", "applicant_name", "email_id", "phone_number",
        "applicant_rating", "custom_pipeline_stage",
        "custom_current_interview_round", "resume_attachment", "resume_link",
        "source", "creation",
    ]

    stages = []
    for stage in PIPELINE_STAGES:
        applicants = frappe.get_all(
            "Job Applicant",
            filters={"job_title": job_opening, "custom_pipeline_stage": stage},
            fields=applicant_fields,
            order_by="creation asc",
        )
        for a in applicants:
            if a.get("custom_current_interview_round"):
                a["custom_current_interview_round_name"] = frappe.db.get_value(
                    "Interview Round", a["custom_current_interview_round"], "round_name"
                )
            else:
                a["custom_current_interview_round_name"] = None
        stages.append({"stage": stage, "applicants": applicants})

    return {
        "job_opening": {
            "name": jo.name,
            "job_title": jo.job_title,
            "designation": jo.designation,
            "department": jo.department,
            "status": jo.status,
            "interview_rounds": rounds,
        },
        "stages": stages,
    }


@frappe.whitelist()
def get_candidate(name):
    _require_hr_role()

    try:
        doc = frappe.get_doc("Job Applicant", name)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Applicant not found"}

    job_title_display = frappe.db.get_value("Job Opening", doc.job_title, "job_title") if doc.job_title else None

    interviews = frappe.get_all(
        "Interview",
        filters={"job_applicant": name},
        fields=[
            "name", "interview_round", "scheduled_on", "from_time",
            "to_time", "status", "average_rating", "interview_summary",
        ],
        order_by="scheduled_on asc",
    )
    for iv in interviews:
        iv["round_name"] = frappe.db.get_value(
            "Interview Round", iv["interview_round"], "round_name"
        ) if iv.get("interview_round") else None

    offer = frappe.db.get_value(
        "Job Offer",
        {"job_applicant": name},
        ["name", "status", "offer_date", "designation"],
        as_dict=True,
    )

    return {
        "applicant": {
            "name": doc.name,
            "applicant_name": doc.applicant_name,
            "email_id": doc.email_id,
            "phone_number": doc.phone_number,
            "job_title": doc.job_title,
            "job_title_display": job_title_display,
            "designation": doc.designation,
            "status": doc.status,
            "custom_pipeline_stage": doc.custom_pipeline_stage,
            "custom_current_interview_round": doc.custom_current_interview_round,
            "custom_rejection_reason": doc.custom_rejection_reason,
            "custom_internal_notes": doc.custom_internal_notes,
            "applicant_rating": doc.applicant_rating,
            "source": doc.source,
            "cover_letter": doc.cover_letter,
            "resume_attachment": doc.resume_attachment,
            "resume_link": doc.resume_link,
            "creation": str(doc.creation),
        },
        "interviews": interviews,
        "offer": offer,
    }


@frappe.whitelist(methods=["POST"])
def create_job_opening(job_title, designation, department=None, description=None,
                        employment_type=None, location=None, lower_range=None,
                        upper_range=None, interview_rounds=None):
    _require_hr_role()

    doc = frappe.new_doc("Job Opening")
    doc.job_title = job_title
    doc.designation = designation
    doc.department = department
    doc.description = description
    doc.employment_type = employment_type
    doc.location = location
    doc.status = "Open"
    doc.company = frappe.defaults.get_user_default("Company")

    if lower_range:
        doc.lower_range = float(lower_range)
    if upper_range:
        doc.upper_range = float(upper_range)

    if interview_rounds:
        rounds = interview_rounds if isinstance(interview_rounds, list) else json.loads(interview_rounds)
        for r in rounds:
            doc.append("custom_interview_rounds", {
                "sequence": r.get("sequence"),
                "interview_round": r.get("interview_round"),
                "is_required": r.get("is_required", 1),
            })

    doc.insert(ignore_permissions=False)
    frappe.db.commit()

    return {
        "success": True,
        "job_opening": {
            "name": doc.name,
            "job_title": doc.job_title,
            "status": doc.status,
        },
    }


@frappe.whitelist(methods=["POST"])
def add_candidate(job_opening, applicant_name, email_id, phone_number=None,
                   source=None, cover_letter=None, resume_link=None, applicant_rating=None):
    _require_hr_role()

    jo = frappe.db.get_value("Job Opening", job_opening, ["name", "status", "designation"], as_dict=True)
    if not jo:
        frappe.response.http_status_code = 404
        return {"error": "Job Opening not found"}
    if jo.status == "Closed":
        frappe.response.http_status_code = 400
        return {"error": "Job Opening is closed"}

    doc = frappe.new_doc("Job Applicant")
    doc.applicant_name = applicant_name
    doc.email_id = email_id
    doc.phone_number = phone_number
    doc.job_title = job_opening
    doc.source = source
    doc.cover_letter = cover_letter
    doc.resume_link = resume_link
    doc.status = "Open"
    if applicant_rating:
        doc.applicant_rating = float(applicant_rating)

    doc.insert(ignore_permissions=False)
    # on_applicant_insert hook fires here and sets custom_pipeline_stage
    frappe.db.commit()

    return {
        "success": True,
        "applicant": {
            "name": doc.name,
            "applicant_name": doc.applicant_name,
            "custom_pipeline_stage": "Application Received",
        },
    }


@frappe.whitelist(methods=["POST"])
def move_candidate(applicant, stage):
    _require_hr_role()

    if stage not in PIPELINE_STAGES:
        frappe.response.http_status_code = 400
        return {"error": f"Invalid stage. Must be one of: {', '.join(PIPELINE_STAGES)}"}

    if stage in SYSTEM_ONLY_STAGES:
        frappe.response.http_status_code = 400
        return {"error": f"Stage '{stage}' is set automatically by the system"}

    doc = frappe.db.get_value("Job Applicant", applicant, "name")
    if not doc:
        frappe.response.http_status_code = 404
        return {"error": "Applicant not found"}

    frappe.db.set_value("Job Applicant", applicant, "custom_pipeline_stage", stage)
    frappe.db.commit()

    return {
        "success": True,
        "applicant": {"name": applicant, "custom_pipeline_stage": stage},
    }


@frappe.whitelist(methods=["POST"])
def reject_candidate(applicant, rejection_reason=None):
    _require_hr_role()

    doc = frappe.db.get_value("Job Applicant", applicant, "name")
    if not doc:
        frappe.response.http_status_code = 404
        return {"error": "Applicant not found"}

    frappe.db.set_value(
        "Job Applicant",
        applicant,
        {
            "custom_pipeline_stage": "Rejected",
            "custom_rejection_reason": rejection_reason or "",
            "status": "Rejected",
        },
    )
    frappe.db.commit()

    return {"success": True}


@frappe.whitelist(methods=["POST"])
def schedule_interview(job_applicant, interview_round, scheduled_on, from_time, to_time):
    _require_hr_role()

    if not frappe.db.exists("Job Applicant", job_applicant):
        frappe.response.http_status_code = 404
        return {"error": "Applicant not found"}

    if not frappe.db.exists("Interview Round", interview_round):
        frappe.response.http_status_code = 404
        return {"error": "Interview Round not found"}

    doc = frappe.new_doc("Interview")
    doc.job_applicant = job_applicant
    doc.interview_round = interview_round
    doc.scheduled_on = scheduled_on
    doc.from_time = from_time
    doc.to_time = to_time
    doc.status = "Pending"
    doc.insert(ignore_permissions=False)
    # on_interview_insert hook fires here — updates applicant stage
    frappe.db.commit()

    return {
        "success": True,
        "interview": {
            "name": doc.name,
            "interview_round": doc.interview_round,
            "scheduled_on": str(doc.scheduled_on),
            "status": doc.status,
        },
    }


@frappe.whitelist(methods=["POST"])
def send_offer(job_applicant, offer_date, designation, company):
    _require_hr_role()

    if not frappe.db.exists("Job Applicant", job_applicant):
        frappe.response.http_status_code = 404
        return {"error": "Applicant not found"}

    existing = frappe.db.get_value("Job Offer", {"job_applicant": job_applicant}, "name")
    if existing:
        frappe.response.http_status_code = 400
        return {"error": f"A Job Offer already exists: {existing}"}

    doc = frappe.new_doc("Job Offer")
    doc.job_applicant = job_applicant
    doc.offer_date = offer_date
    doc.designation = designation
    doc.company = company
    doc.status = "Awaiting Response"
    doc.insert(ignore_permissions=False)
    # on_offer_insert hook fires here — updates applicant stage to Offer Sent
    frappe.db.commit()

    return {
        "success": True,
        "offer": {
            "name": doc.name,
            "status": doc.status,
            "offer_date": str(doc.offer_date),
        },
    }


@frappe.whitelist(methods=["POST"])
def update_offer_status(offer, status):
    _require_hr_role()

    if status not in ("Accepted", "Rejected"):
        frappe.response.http_status_code = 400
        return {"error": "Status must be Accepted or Rejected"}

    try:
        doc = frappe.get_doc("Job Offer", offer)
    except frappe.DoesNotExistError:
        frappe.response.http_status_code = 404
        return {"error": "Job Offer not found"}

    doc.status = status
    doc.save(ignore_permissions=False)
    # on_offer_update hook fires — updates applicant to Hired or Rejected
    frappe.db.commit()

    employee_name = None
    if status == "Accepted":
        try:
            from hrms.hr.doctype.job_offer.job_offer import make_employee
            emp = make_employee(offer)
            emp.insert(ignore_permissions=True)
            frappe.db.commit()
            employee_name = emp.name
        except Exception:
            frappe.log_error(frappe.get_traceback(), "make_employee failed")

    return {"success": True, "employee": employee_name}


@frappe.whitelist()
def get_interview_rounds():
    _require_hr_role()
    rounds = frappe.get_all(
        "Interview Round",
        fields=["name", "round_name"],
        order_by="round_name asc",
    )
    return {"rounds": rounds}


@frappe.whitelist(methods=["POST"])
def update_candidate_notes(applicant, notes):
    _require_hr_role()

    if not frappe.db.exists("Job Applicant", applicant):
        frappe.response.http_status_code = 404
        return {"error": "Applicant not found"}

    frappe.db.set_value("Job Applicant", applicant, "custom_internal_notes", notes)
    frappe.db.commit()
    return {"success": True}


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _require_hr_role():
    allowed = {"HR Manager", "System Manager"}
    user_roles = set(frappe.get_roles())
    if not allowed.intersection(user_roles):
        frappe.throw(_("Only HR Manager can access recruitment features"), frappe.PermissionError)
```

---

### B-R6: Verify with curl

After restarting bench (`bench start`), test each endpoint:

```bash
# Get session cookie first (login via browser to hrms.localhost:8000)
# Then test:

curl "http://hrms.localhost:8000/api/method/hr_client.api.recruitment.get_job_openings" \
  -H "Cookie: sid=YOUR_SESSION_ID"

curl "http://hrms.localhost:8000/api/method/hr_client.api.recruitment.get_interview_rounds" \
  -H "Cookie: sid=YOUR_SESSION_ID"

curl -X POST "http://hrms.localhost:8000/api/method/hr_client.api.recruitment.create_job_opening" \
  -H "Cookie: sid=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"job_title":"Test Role","designation":"Manager","interview_rounds":[]}'
```

---

## 6. Frontend — Step-by-Step Build Order

Do these **in order**. Steps F-R1 through F-R4 can use mock data.
Wire to real API at F-R9 once B-R6 is complete.

### F-R1: Route and folder structure

Create this folder structure inside `~/hr-frontend/src/`:
```
src/
  pages/
    recruitment/
      RecruitmentPage.tsx         ← Main page, wraps layout
      components/
        JobOpeningsSidebar.tsx    ← Left panel: list of job openings
        CreateJobOpeningModal.tsx ← Modal: new job opening form
        KanbanBoard.tsx           ← Main Kanban grid
        KanbanColumn.tsx          ← One column per stage (x6)
        CandidateCard.tsx         ← Card within a column
        CandidateDetailDrawer.tsx ← Right drawer: full candidate view
        AddCandidateModal.tsx     ← Modal: add new candidate
        ScheduleInterviewModal.tsx← Modal: schedule interview
        SendOfferModal.tsx        ← Modal: send job offer
        RejectCandidateModal.tsx  ← Modal: reject with reason
      hooks/
        useRecruitment.ts         ← Data fetching + mutations (React Query)
      types.ts                    ← TypeScript types for all shapes
      mockData.ts                 ← Mock responses matching API contract
```

Add route in `App.tsx`:
```tsx
<Route path="/recruitment" element={<RecruitmentPage />} />
<Route path="/recruitment/:jobOpening" element={<RecruitmentPage />} />
```

Add "Recruitment" entry to sidebar nav.

---

### F-R2: TypeScript types (`types.ts`)

```typescript
export type PipelineStage =
  | "Application Received"
  | "Screening"
  | "Interview"
  | "Offer Sent"
  | "Hired"
  | "Rejected";

export const PIPELINE_STAGES: PipelineStage[] = [
  "Application Received", "Screening", "Interview",
  "Offer Sent", "Hired", "Rejected",
];

export interface JobOpeningListItem {
  name: string;
  job_title: string;
  designation: string;
  department: string;
  status: "Open" | "Closed";
  posted_on: string;
  applicant_counts: Record<PipelineStage | "total", number>;
}

export interface InterviewRoundConfig {
  sequence: number;
  interview_round: string;
  round_name: string;
  is_required: 0 | 1;
}

export interface JobOpeningDetail {
  name: string;
  job_title: string;
  designation: string;
  department: string;
  status: "Open" | "Closed";
  interview_rounds: InterviewRoundConfig[];
}

export interface CandidateCard {
  name: string;
  applicant_name: string;
  email_id: string;
  phone_number?: string;
  applicant_rating?: number;
  custom_pipeline_stage: PipelineStage;
  custom_current_interview_round?: string;
  custom_current_interview_round_name?: string;
  resume_attachment?: string;
  resume_link?: string;
  source?: string;
  creation: string;
}

export interface PipelineStageData {
  stage: PipelineStage;
  applicants: CandidateCard[];
}

export interface PipelineData {
  job_opening: JobOpeningDetail;
  stages: PipelineStageData[];
}

export interface Interview {
  name: string;
  interview_round: string;
  round_name?: string;
  scheduled_on: string;
  from_time: string;
  to_time: string;
  status: "Pending" | "Under Review" | "Cleared" | "Rejected";
  average_rating?: number;
  interview_summary?: string;
}

export interface Offer {
  name: string;
  status: "Awaiting Response" | "Accepted" | "Rejected";
  offer_date: string;
  designation: string;
}

export interface CandidateDetail {
  applicant: {
    name: string;
    applicant_name: string;
    email_id: string;
    phone_number?: string;
    job_title: string;
    job_title_display: string;
    designation: string;
    status: string;
    custom_pipeline_stage: PipelineStage;
    custom_current_interview_round?: string;
    custom_rejection_reason?: string;
    custom_internal_notes?: string;
    applicant_rating?: number;
    source?: string;
    cover_letter?: string;
    resume_attachment?: string;
    resume_link?: string;
    creation: string;
  };
  interviews: Interview[];
  offer: Offer | null;
}
```

---

### F-R3: Mock data (`mockData.ts`)

Define mock responses matching API shapes exactly. Frontend uses these until backend is ready:

```typescript
import { JobOpeningListItem, PipelineData, PIPELINE_STAGES } from "./types";

export const mockJobOpenings: JobOpeningListItem[] = [
  {
    name: "HR-OPN-2024-0001",
    job_title: "Senior Backend Engineer",
    designation: "Software Engineer",
    department: "Engineering",
    status: "Open",
    posted_on: "2024-04-01 10:00:00",
    applicant_counts: {
      "Application Received": 3,
      "Screening": 2,
      "Interview": 1,
      "Offer Sent": 1,
      "Hired": 0,
      "Rejected": 2,
      "total": 9,
    },
  },
];

export const mockPipeline: PipelineData = {
  job_opening: {
    name: "HR-OPN-2024-0001",
    job_title: "Senior Backend Engineer",
    designation: "Software Engineer",
    department: "Engineering",
    status: "Open",
    interview_rounds: [
      { sequence: 1, interview_round: "HR Screen", round_name: "HR Screen", is_required: 1 },
      { sequence: 2, interview_round: "Technical Round 1", round_name: "Technical Round 1", is_required: 1 },
    ],
  },
  stages: PIPELINE_STAGES.map((stage) => ({
    stage,
    applicants: stage === "Application Received" ? [
      {
        name: "HR-APP-2024-00001",
        applicant_name: "Jane Smith",
        email_id: "jane@example.com",
        applicant_rating: 4,
        custom_pipeline_stage: "Application Received",
        creation: "2024-04-01 10:00:00",
      },
    ] : [],
  })),
};
```

---

### F-R4: Data fetching hook (`useRecruitment.ts`)

Use React Query (or SWR) against `VITE_API_BASE`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api"; // your axios/fetch wrapper
import { mockJobOpenings, mockPipeline } from "./mockData";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export function useJobOpenings(status = "Open") {
  return useQuery({
    queryKey: ["job_openings", status],
    queryFn: async () => {
      if (USE_MOCK) return { job_openings: mockJobOpenings };
      const res = await api.get("/api/method/hr_client.api.recruitment.get_job_openings", { params: { status } });
      return res.data.message;
    },
  });
}

export function usePipeline(jobOpening: string | null) {
  return useQuery({
    queryKey: ["pipeline", jobOpening],
    queryFn: async () => {
      if (!jobOpening) return null;
      if (USE_MOCK) return mockPipeline;
      const res = await api.get("/api/method/hr_client.api.recruitment.get_pipeline", { params: { job_opening: jobOpening } });
      return res.data.message;
    },
    enabled: !!jobOpening,
  });
}

export function useCandidate(name: string | null) {
  return useQuery({
    queryKey: ["candidate", name],
    queryFn: async () => {
      if (!name) return null;
      const res = await api.get("/api/method/hr_client.api.recruitment.get_candidate", { params: { name } });
      return res.data.message;
    },
    enabled: !!name,
  });
}

export function useMoveCandidateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, stage }: { applicant: string; stage: string }) => {
      const res = await api.post("/api/method/hr_client.api.recruitment.move_candidate", { applicant, stage });
      return res.data.message;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });
}

// Add similar hooks for: addCandidate, createJobOpening, scheduleInterview,
// sendOffer, updateOfferStatus, rejectCandidate, updateCandidateNotes
```

---

### F-R5: `JobOpeningsSidebar` component

```tsx
// Odoo-style left panel — list of job openings
// Props: selectedJobOpening, onSelect
// Shows: job title, department, total applicant count badge
// Bottom: "+ New Job Opening" button → opens CreateJobOpeningModal
// Width: ~280px, fixed, scrollable list
```

Key UI details:
- Active item highlighted with primary color left border
- Each item: title (bold), department + designation (muted), total applicants badge (top-right)
- Count breakdown shown on hover as tooltip: "3 received, 2 screening, 1 interview..."
- Closed jobs shown in a collapsed "Closed" section at bottom

---

### F-R6: `KanbanBoard` + `KanbanColumn` + `CandidateCard`

**KanbanBoard:**
- Horizontal scrollable flex container
- 6 columns, fixed width each (280px)
- Header: job title + "+ Add Candidate" button
- Loading skeleton: 3 ghost cards per column while fetching

**KanbanColumn:**
```tsx
// Props: stage, applicants, onCardClick
// Header: stage name (bold) + count badge
// Stage color coding:
//   Application Received → gray
//   Screening            → blue
//   Interview            → purple
//   Offer Sent           → orange
//   Hired                → green
//   Rejected             → red
// Body: scrollable list of CandidateCards
// Footer: "+ Add" quick button (opens AddCandidateModal pre-filtered to this stage)
```

**CandidateCard:**
```tsx
// Props: candidate, onClick
// Shows:
//   - Applicant name (bold)
//   - Email (muted, truncated)
//   - Star rating (if set) — use shadcn or custom 5-star
//   - Current interview round chip (if in Interview stage)
//   - Resume link icon (if resume_link set)
//   - Days since applied (e.g. "5 days ago")
// Click → opens CandidateDetailDrawer
// No drag-and-drop in v1 — use "Move to" button inside drawer
```

---

### F-R7: `CandidateDetailDrawer`

Right-side sheet (shadcn `Sheet`, side="right", width 480px).

**Tabs:**
1. **Overview** — name, email, phone, source, rating, cover letter, resume link/download
2. **Interviews** — list of scheduled interviews with status badges, "+ Schedule Interview" button
3. **Offer** — show existing offer or "Send Offer" button
4. **Notes** — editable textarea for `custom_internal_notes`, auto-saves on blur

**Header actions:**
- Stage badge (current stage, colored)
- "Move to →" dropdown (shows valid next stages)
- "Reject" button (red, opens RejectCandidateModal)

**Stage move rules in UI:**
- Show all stages except `Offer Sent` (system-only) and `Hired` (system-only) in the "Move to" dropdown
- `Offer Sent` auto-appears when offer is sent via the Offer tab
- `Hired` auto-appears when offer is accepted via the Offer tab

---

### F-R8: Remaining modals

**`CreateJobOpeningModal`:**
Fields: Job Title (req), Designation (req, shadcn Combobox → fetch designations), Department, Description (textarea), Employment Type, Location, Salary Range (from/to + currency). Plus: Interview Rounds table — add/remove rows with sequence + round name selector.

**`AddCandidateModal`:**
Fields: Name (req), Email (req), Phone, Source (Select: LinkedIn/Referral/Job Portal/Direct/Other), Cover Letter (textarea), Resume Link, Rating (star selector). Job Opening is pre-filled from context.

**`ScheduleInterviewModal`:**
Fields: Interview Round (Select from job opening's rounds), Date, From Time, To Time. Shows interviewer list from selected round (read-only, from `get_interview_rounds`).

**`SendOfferModal`:**
Fields: Offer Date (req), Designation (pre-filled), Company (pre-filled from defaults). Simple — Job Offer terms handled in Frappe desk for now.

**`RejectCandidateModal`:**
Fields: Rejection Reason (textarea, required). Confirm button.

---

### F-R9: Switch from mock to real API

1. Set `VITE_USE_MOCK=false` in `.env`
2. Set `VITE_API_BASE=http://hrms.localhost:8000` in `.env`
3. Add Vite proxy in `vite.config.ts`:
```typescript
server: {
  proxy: {
    "/api": {
      target: "http://hrms.localhost:8000",
      changeOrigin: true,
      secure: false,
    },
    "/files": {
      target: "http://hrms.localhost:8000",
      changeOrigin: true,
    },
  },
}
```
4. Test each endpoint manually through the UI
5. Fix any CORS / session cookie issues (ensure `allow_cors = "*"` in hooks.py)

---

## 7. React Component Tree (Summary)

```
/recruitment/:jobOpening?
└── RecruitmentPage
    ├── JobOpeningsSidebar
    │   ├── JobOpeningItem (×N)
    │   └── CreateJobOpeningModal (conditional)
    └── RecruitmentMain
        ├── RecruitmentHeader (job title, stats strip)
        │   └── AddCandidateModal (conditional)
        ├── KanbanBoard
        │   └── KanbanColumn (×6)
        │       └── CandidateCard (×N)
        ├── CandidateDetailDrawer (conditional, right sheet)
        │   ├── OverviewTab
        │   ├── InterviewsTab
        │   │   └── ScheduleInterviewModal (conditional)
        │   ├── OfferTab
        │   │   └── SendOfferModal (conditional)
        │   └── NotesTab
        └── RejectCandidateModal (conditional)
```

**State management:** URL drives selected job opening (`/recruitment/HR-OPN-2024-0001`). Selected candidate lives in React state (not URL). All server state via React Query. No Redux.

---

## 8. ERPNext Gotchas Specific to This Module

### 1. Job Applicant `email_id` must be unique per Job Opening
HRMS validates this. If you try to insert a duplicate email for the same job opening, you'll get `frappe.DuplicateEntryError`. Catch it and return a clear error message to the frontend.

### 2. Job Opening `status` = "Open" is required for new applicants
HRMS's `job_applicant.py` validates that the linked Job Opening is Open. If you `add_candidate` to a closed Job Opening, HRMS throws ValidationError before our code runs. Always check this in `add_candidate` before calling `insert()`.

### 3. Interview `docstatus` starts at 0 (Draft)
Interviews are submittable in HRMS. We create them as drafts (docstatus=0). We do NOT submit them in our API — that's done by interviewers in the Frappe desk after giving feedback. Status field (Pending/Cleared/Rejected) is separate from docstatus.

### 4. Job Offer IS submittable — be careful
Job Offer is a submittable DocType (docstatus goes 0→1→2). We create it as a draft. The `status` field (`Awaiting Response`/`Accepted`/`Rejected`) has `allow_on_submit=1` so it can change after submission. In `update_offer_status`, we call `doc.save()` not `doc.submit()` — we update the status field on the draft. `make_employee` works on draft offers too.

### 5. `custom_pipeline_stage` vs HRMS `status` — keep them separate
Do NOT try to map our pipeline stages to HRMS statuses. HRMS's `status` field on Job Applicant (Open/Replied/Rejected/Hold/Accepted) is used internally by HRMS for email tracking and metrics. Our `custom_pipeline_stage` is our Kanban concern. Only sync them when: rejecting (`status→Rejected`) and hiring (`status→Accepted`). Otherwise, let them be independent.

### 6. `frappe.db.set_value` vs `doc.db_set`
When updating multiple fields atomically:
```python
# Good — single SQL UPDATE with multiple fields
frappe.db.set_value("Job Applicant", name, {"custom_pipeline_stage": "Rejected", "status": "Rejected"})

# Also good but one doc at a time
doc.db_set("custom_pipeline_stage", "Rejected")
```
Never do: `doc = frappe.get_doc(...); doc.custom_pipeline_stage = ...; doc.save()` in doc_events — causes recursive save issues.

### 7. Custom Fields are NOT available as `doc.fieldname` until after `bench migrate`
If you access `doc.custom_pipeline_stage` before running `bench migrate` (which creates the custom field), Frappe returns `None` silently — no error. Always migrate before testing.

### 8. `frappe.get_all` vs `frappe.db.get_list`
Use `frappe.get_all` — it respects DocType permissions. `frappe.db.get_list` bypasses them. Since we're building HR-only views, either works, but `get_all` is the correct pattern.

### 9. Vite dev server and Frappe session cookies
The Frappe session cookie (`sid`) is set on `hrms.localhost` domain. For Vite dev server to send it, both must be on the same domain. Use `hrms.localhost:5173` for Vite dev and proxy `/api` to `:8000`. Do NOT use `localhost:5173` (different domain = cookies not sent).

### 10. `make_employee` creates a draft Employee
The `hrms.hr.doctype.job_offer.job_offer.make_employee` function returns an Employee Document object but does NOT insert it. You must call `emp.insert()` yourself. The Employee starts as a draft — HR must review and submit it separately.

---

## 9. Definition of Done — Recruitment Module

- [ ] `Job Opening Interview Round` child DocType created and migrated
- [ ] All 5 Custom Fields on Job Applicant and Job Opening visible in Frappe desk
- [ ] All 11 API endpoints return correct responses (tested with curl)
- [ ] doc_events auto-transition pipeline stage correctly (test: create Interview → applicant moves to Interview)
- [ ] React: Job openings list appears in sidebar
- [ ] React: Kanban shows all 6 columns for selected job opening
- [ ] React: Candidate cards appear in correct columns
- [ ] React: CandidateDetailDrawer opens and shows all tabs
- [ ] React: Can add new candidate → appears in "Application Received" column
- [ ] React: Can create new job opening
- [ ] React: Can schedule interview → card moves to Interview column
- [ ] React: Can send offer → card moves to Offer Sent
- [ ] React: Can accept/reject offer → card moves to Hired/Rejected
- [ ] React: Can manually move card via "Move to" dropdown
- [ ] React: Can reject candidate with reason
- [ ] React: Internal notes save on blur
