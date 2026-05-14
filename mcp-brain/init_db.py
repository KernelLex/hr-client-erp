"""Run once to create and seed brain.db from current CLAUDE.md state."""
import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "brain.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          TEXT PRIMARY KEY,
            module      TEXT NOT NULL,
            owner       TEXT NOT NULL CHECK(owner IN ('backend','frontend')),
            title       TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'planned'
                            CHECK(status IN ('planned','in_progress','done','blocked')),
            notes       TEXT,
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS api_endpoints (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            module      TEXT NOT NULL,
            method      TEXT NOT NULL,
            endpoint    TEXT NOT NULL,
            params      TEXT,
            notes       TEXT,
            status      TEXT NOT NULL DEFAULT 'planned'
                            CHECK(status IN ('planned','live','deprecated'))
        );

        CREATE TABLE IF NOT EXISTS decisions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            category    TEXT NOT NULL,
            rule        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            summary     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS blockers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     TEXT,
            description TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open'
                            CHECK(status IN ('open','resolved')),
            created_at  TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()


def seed(conn):
    # ── Tasks ──────────────────────────────────────────────────────────────
    tasks = [
        # Recruitment Frontend
        ("F-R1",  "Recruitment", "frontend", "Route + folder structure",                             "planned"),
        ("F-R2",  "Recruitment", "frontend", "TypeScript types",                                     "planned"),
        ("F-R3",  "Recruitment", "frontend", "Mock data",                                            "planned"),
        ("F-R4",  "Recruitment", "frontend", "useRecruitment hooks",                                 "planned"),
        ("F-R5",  "Recruitment", "frontend", "JobOpeningsSidebar",                                   "planned"),
        ("F-R6",  "Recruitment", "frontend", "KanbanBoard + KanbanColumn + CandidateCard",           "planned"),
        ("F-R7",  "Recruitment", "frontend", "CandidateDetailDrawer",                               "planned"),
        ("F-R8",  "Recruitment", "frontend", "Modals (CreateJobOpening, AddCandidate, ScheduleInterview, SendOffer, RejectCandidate)", "planned"),
        ("F-R9",  "Recruitment", "frontend", "Wire to real API",                                     "planned"),
        # Employee Lifecycle Backend
        ("B-EL1", "EmployeeLifecycle", "backend",  "4 Custom Fields on Employee + migrate",         "planned"),
        ("B-EL2", "EmployeeLifecycle", "backend",  "Employee Exit DocType + migrate",               "planned"),
        ("B-EL3", "EmployeeLifecycle", "backend",  "employee_welcome Email Template fixture + hooks", "planned"),
        ("B-EL4", "EmployeeLifecycle", "backend",  "employee_lifecycle.py — 9 endpoints",           "planned"),
        ("B-EL5", "EmployeeLifecycle", "backend",  "Test all endpoints via bench console / curl",   "planned"),
        ("B-EL6", "EmployeeLifecycle", "backend",  "Update CLAUDE.md API Contract to LIVE",         "planned"),
        # Employee Lifecycle Frontend
        ("F-EL1", "EmployeeLifecycle", "frontend", "types.ts — OnboardingStage, DocStatus, checklists, etc.", "planned"),
        ("F-EL2", "EmployeeLifecycle", "frontend", "mockData.ts — employees across all stages",      "planned"),
        ("F-EL3", "EmployeeLifecycle", "frontend", "useEmployeeLifecycle.ts — 9 hooks",              "planned"),
        ("F-EL4", "EmployeeLifecycle", "frontend", "EmployeeCard, OnboardingTracker, DocumentChecklist, ITSetupChecklist", "planned"),
        ("F-EL5", "EmployeeLifecycle", "frontend", "EmployeesPage + route /employees — 3 tabs",     "planned"),
        ("F-EL6", "EmployeeLifecycle", "frontend", "OnboardingDrawer — right sheet with stepper",   "planned"),
        ("F-EL7", "EmployeeLifecycle", "frontend", "ExitModal + ExitInterviewForm",                 "planned"),
        ("F-EL8", "EmployeeLifecycle", "frontend", "EmployeeDirectory + route /employees/directory","planned"),
        ("F-EL9", "EmployeeLifecycle", "frontend", "Wire to real API (VITE_USE_MOCK=false)",        "planned"),
        # Forms Integration Backend
        ("B-F1",  "FormsIntegration", "backend",  "Form Template DocType",                          "planned"),
        ("B-F2",  "FormsIntegration", "backend",  "Form Submission DocType",                        "planned"),
        ("B-F3",  "FormsIntegration", "backend",  "forms.py — 5 endpoints",                         "planned"),
        ("B-F4",  "FormsIntegration", "backend",  "CORS + auth config in hooks.py",                 "planned"),
        ("B-F5",  "FormsIntegration", "backend",  "Seed test Form Template",                        "planned"),
        # Forms Integration Frontend
        ("F-F1",  "FormsIntegration", "frontend", "Project scaffold (already done via Vite setup)", "done"),
        ("F-F2",  "FormsIntegration", "frontend", "App shell / layout (done)",                      "done"),
        ("F-F3",  "FormsIntegration", "frontend", "Form Templates list page /forms",                "planned"),
        ("F-F4",  "FormsIntegration", "frontend", "Form renderer /forms/:name/submit",              "planned"),
        ("F-F5",  "FormsIntegration", "frontend", "Submissions list page /submissions",             "planned"),
        ("F-F6",  "FormsIntegration", "frontend", "Submission detail page /submissions/:name",      "planned"),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO tasks(id, module, owner, title, status) VALUES (?,?,?,?,?)",
        tasks
    )

    # ── API Endpoints ──────────────────────────────────────────────────────
    recruitment_endpoints = [
        ("Recruitment", "GET",  "get_job_openings",      "status (opt)",                                                               "Returns list + per-stage counts",                         "live"),
        ("Recruitment", "GET",  "get_pipeline",          "job_opening (req)",                                                          "Returns all 6 stages with candidates",                    "live"),
        ("Recruitment", "GET",  "get_candidate",         "name (req)",                                                                 "Full detail + interviews + offer",                        "live"),
        ("Recruitment", "POST", "create_job_opening",    "job_title, designation, department, description, interview_rounds (JSON)",   "",                                                        "live"),
        ("Recruitment", "POST", "add_candidate",         "job_opening, applicant_name, email_id, phone_number, source, cover_letter, resume_link", "source must match Job Applicant Source record", "live"),
        ("Recruitment", "POST", "move_candidate",        "applicant, stage",                                                           "Blocks Hired and Offer Sent (system-only)",               "live"),
        ("Recruitment", "POST", "reject_candidate",      "applicant, rejection_reason",                                               "Sets HRMS status=Rejected too",                           "live"),
        ("Recruitment", "POST", "schedule_interview",    "job_applicant, interview_round, scheduled_on, from_time, to_time",           "Auto-moves candidate to Interview stage",                 "live"),
        ("Recruitment", "POST", "send_offer",            "job_applicant, offer_date, designation, company",                           "Auto-moves candidate to Offer Sent",                      "live"),
        ("Recruitment", "POST", "update_offer_status",   "offer, status (Accepted/Rejected)",                                         "Creates Employee on Accept",                              "live"),
        ("Recruitment", "POST", "update_candidate_notes","applicant, notes",                                                           "Internal HR notes only",                                  "live"),
        ("Recruitment", "GET",  "get_interview_rounds",  "",                                                                           "All Interview Round masters",                             "live"),
        ("Recruitment", "GET",  "get_applicant_sources", "",                                                                           "All Job Applicant Source records",                        "live"),
    ]
    el_endpoints = [
        ("EmployeeLifecycle", "GET",  "get_employees",           "status (opt), onboarding_stage (opt), page, page_length",             "Employee list with stage badges",                           "planned"),
        ("EmployeeLifecycle", "GET",  "get_employee_detail",     "employee_id (req)",                                                    "Full profile + parsed checklists + exit summary",           "planned"),
        ("EmployeeLifecycle", "POST", "create_employee",         "first_name, last_name, date_of_joining, designation, department, company, personal_email, cell_number, job_applicant (opt)", "Sets Offer Accepted stage automatically", "planned"),
        ("EmployeeLifecycle", "POST", "update_onboarding_stage", "employee_id (req), stage (req), checklist_data (opt JSON)",           "Validates mandatory docs; triggers welcome email on First Day","planned"),
        ("EmployeeLifecycle", "GET",  "get_onboarding_checklist","employee_id (req)",                                                    "Both checklists + mandatory_docs_complete flag",            "planned"),
        ("EmployeeLifecycle", "POST", "submit_resignation",      "employee_id, resignation_date, last_working_day, resignation_letter_url", "Creates Employee Exit record",                         "planned"),
        ("EmployeeLifecycle", "POST", "submit_exit_interview",   "employee_id, exit_reason, would_recommend, enjoyed_most, improvement_suggestions, management_feedback", "Sets exit status=Interview Done; Employee status=Left", "planned"),
        ("EmployeeLifecycle", "GET",  "get_exit_details",        "employee_id (req)",                                                    "Employee Exit record or null",                              "planned"),
        ("EmployeeLifecycle", "POST", "send_welcome_email",      "employee_id (req)",                                                    "Sends via Email Template employee_welcome",                 "planned"),
    ]
    forms_endpoints = [
        ("FormsIntegration", "POST", "submit_form",          "form_id, data, submitted_by",                  "allow_guest=True — webhook from MS Forms/Power Automate", "planned"),
        ("FormsIntegration", "GET",  "get_form_templates",   "",                                              "Logged-in session",                                       "planned"),
        ("FormsIntegration", "GET",  "get_form_template",    "name (req)",                                    "Returns fields_schema array",                             "planned"),
        ("FormsIntegration", "GET",  "get_submissions",      "form_template, status, page, page_length",      "All optional filters",                                    "planned"),
        ("FormsIntegration", "GET",  "get_submission",       "name (req)",                                    "Full detail including raw submission_data",                "planned"),
    ]
    all_endpoints = recruitment_endpoints + el_endpoints + forms_endpoints
    conn.executemany(
        "INSERT INTO api_endpoints(module, method, endpoint, params, notes, status) VALUES (?,?,?,?,?,?)",
        all_endpoints
    )

    # ── Decisions ──────────────────────────────────────────────────────────
    decisions = [
        ("shadcn/ui for all form components",        "Chosen for consistency with Tailwind + Radix primitives; avoids MUI overhead."),
        ("Odoo-style left sidebar",                  "Dark sidebar with nav items matching ERP conventions the client knows."),
        ("Pure React SPA — no Frappe desk",          "Frappe desk is too opinionated; we own the full UX."),
        ("Extend HRMS via hr_client, never core",    "Keeps upgradability intact for ERPNext + HRMS upstream versions."),
        ("DocType path must be triple-nested",        "hr_client/hr_client/hr_client/doctype/ — Frappe resolves module folder from hr_client.hr_client import; if placed one level up, migrate silently skips them."),
        ("window.location.replace for logout",       "navigate('/login') after setUser(null) reads stale isLoggedIn=true in PublicOnlyRoute and causes infinite redirect. Must use window.location.replace('/login')."),
        ("AI provider: OpenAI gpt-4o-mini (on hold)","Gemini free tier quota = 0. OpenAI switched to but no credits. Groq not yet set up. JD Generator UI is complete — blocked on provider."),
        ("source field on Job Applicant is a Link",  "Must pass name of existing Job Applicant Source record, not free text."),
    ]
    conn.executemany(
        "INSERT INTO decisions(title, body) VALUES (?,?)",
        decisions
    )

    # ── Rules ─────────────────────────────────────────────────────────────
    rules = [
        ("ERPNext", "NEVER modify files in apps/frappe/ or apps/erpnext/ or apps/hrms/"),
        ("ERPNext", "ALWAYS extend via hr_client custom app only"),
        ("ERPNext", "ALWAYS use Custom Fields for extending existing DocTypes"),
        ("ERPNext", "ALWAYS run bench migrate after any DocType change"),
        ("ERPNext", "ALWAYS run bench clear-cache after any change"),
        ("ERPNext", "ALWAYS whitelist API methods with @frappe.whitelist()"),
        ("ERPNext", "NEVER hardcode site name — use frappe.local.site"),
        ("ERPNext", "ALWAYS handle frappe.exceptions properly in API methods"),
        ("ERPNext", "DocType files MUST live in hr_client/hr_client/hr_client/doctype/<name>/ NOT hr_client/hr_client/doctype/"),
        ("Python",  "NEVER call self.save() inside validate() or before_save() — infinite loop"),
        ("Python",  "NEVER call frappe.get_doc() when you only need one field — use frappe.db.get_value()"),
        ("Python",  "NEVER catch bare Exception and silently swallow it — always re-raise or log"),
        ("Python",  "NEVER return raw HTTP responses from whitelisted methods — return dict/list only"),
        ("Python",  "NEVER use frappe.db.sql() raw queries when ORM methods exist — bypasses permission checks"),
        ("Python",  "NEVER forget super().validate() in controller validate()"),
        ("Python",  "NEVER write fixtures that duplicate existing Custom Fields — check DB first"),
        ("Python",  "NEVER use db_set() for fields that need hooks/notifications to fire — use save()"),
        ("Python",  "NEVER add allow_guest=True to endpoints that read/write sensitive HR data"),
        ("Python",  "NEVER use naming_series without adding the naming_series fieldtype field to the DocType"),
        ("Python",  "NEVER pass source string to Job Applicant without confirming it exists in Job Applicant Source master"),
        ("Python",  "NEVER commit inside a validate hook — Frappe manages transactions per request"),
        ("Frontend","NEVER call navigate('/login') immediately after setUser(null) in the same tick — use window.location.replace('/login') for logout"),
        ("Frontend","NEVER log, print, or expose VITE_OPENAI_API_KEY or any env secret"),
        ("Git",     "DO NOT push directly to main branch"),
        ("Git",     "DO NOT run migrate without cache clear after"),
    ]
    conn.executemany(
        "INSERT INTO rules(category, rule) VALUES (?,?)",
        rules
    )

    # ── Initial session ────────────────────────────────────────────────────
    conn.execute(
        "INSERT INTO sessions(summary) VALUES (?)",
        ("Seeded brain.db from CLAUDE.md state as of 2026-04-26. "
         "Recruitment backend complete (11 endpoints live). "
         "Recruitment frontend UI complete. "
         "AI JD Generator UI complete but ON HOLD (no AI provider credits). "
         "Employee Lifecycle module planned (B-EL1–B-EL6 + F-EL1–F-EL9). "
         "Forms Integration deferred. "
         "Next sprint: Employee Lifecycle backend then frontend.",)
    )

    conn.commit()
    print(f"brain.db seeded at {DB_PATH}")


if __name__ == "__main__":
    conn = get_conn()
    init_schema(conn)
    seed(conn)
    conn.close()
