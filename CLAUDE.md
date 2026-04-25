# ClientERP — Master Context
_Last updated: 2026-04-19_

## INSTRUCTIONS FOR CLAUDE (READ FIRST)
You are working on a custom ERPNext v15 + Frappe HRMS system.
At the end of EVERY session you MUST:
1. Move completed tasks to "What's been built" with ✅
2. Update "In progress" with what you left off at
3. Update "What's next" with remaining tasks
4. Add new decisions to "Decisions made"
5. Add new guardrails to "DO NOT DO"
Do this automatically without being asked.

## Project
Full ERP system for a client built on ERPNext v15 + Frappe HRMS.
Starting with HR module — Forms Integration first.
Will expand to full ERP over time.

## Stack
- ERPNext v15 + Frappe HRMS
- Custom app: hr_client (extends HRMS, never modifies core)
- React + Vite + Tailwind + shadcn/ui (frontend)
- Jibble API (attendance sync)
- WSL2 local → Linux server production

## Site & Commands
- Site: hrms.localhost
- Bench: ~/frappe-bench/
- Custom app: ~/frappe-bench/apps/hr_client/
- Frontend: ~/hr-frontend/
- Start bench: cd ~/frappe-bench && bench start
- Clear cache: bench --site hrms.localhost clear-cache
- Migrate: bench --site hrms.localhost migrate
- Console: bench --site hrms.localhost console
- Restart: bench --site hrms.localhost migrate && bench --site hrms.localhost clear-cache

## ERPNext Rules (CRITICAL)
- NEVER modify files in apps/frappe/ or apps/erpnext/ or apps/hrms/
- ALWAYS extend via hr_client custom app only
- ALWAYS use Custom Fields for extending existing DocTypes
- ALWAYS run bench migrate after any DocType change
- ALWAYS run bench clear-cache after any change
- ALWAYS whitelist API methods with @frappe.whitelist()
- NEVER hardcode site name — use frappe.local.site
- ALWAYS handle frappe.exceptions properly in API methods

## Account 1 — BACKEND (this instance)
Owns: ~/frappe-bench/apps/hr_client/
- DocTypes, APIs, hooks, Jibble sync
- Writes API-Contract section below
- NEVER touches ~/hr-frontend/

## Account 2 — FRONTEND (other instance)
Owns: ~/hr-frontend/
- React components, forms, UI
- Reads API-Contract section only
- NEVER touches ~/frappe-bench/apps/hr_client/

## Modules to build (in order)
1. Forms Integration (MS Forms → ERPNext) ← START HERE
2. Recruitment
3. Employee Lifecycle
4. Performance Management
5. Attendance & Leave (Jibble)
6. Expense Management

## Current Sprint
_Sprint 1 — Recruitment Module Backend | Started: 2026-04-20_

### Goal
Build the Recruitment module backend: DocType, custom fields, and all 11 API endpoints. Frontend builds against mock data in parallel.

### Backend — COMPLETED ✅
- ✅ `Job Opening Interview Round` child DocType created and migrated (`hr_client/hr_client/hr_client/doctype/`)
- ✅ 5 Custom Fields on Job Applicant + Job Opening (fixtures in `hr_client/fixtures/custom_field.json`)
- ✅ `hooks.py` updated: `allow_cors`, `fixtures`, `doc_events` for 3 DocTypes
- ✅ `hr_client/api/recruitment.py` — all 11 endpoints + 4 doc_event handlers
- ✅ Migrate + clear-cache run successfully
- ✅ All endpoints tested via bench console — working correctly

### IMPORTANT: DocType path convention (learned during build)
DocTypes MUST live in `hr_client/hr_client/hr_client/doctype/<name>/` — NOT `hr_client/hr_client/doctype/`.
Frappe resolves the module folder by importing `hr_client.hr_client` and uses that as the base path.

### Frontend — IN PROGRESS
- [ ] F-R1: Route + folder structure
- [ ] F-R2: TypeScript types
- [ ] F-R3: Mock data
- [ ] F-R4: useRecruitment hooks
- [ ] F-R5: JobOpeningsSidebar
- [ ] F-R6: KanbanBoard + KanbanColumn + CandidateCard
- [ ] F-R7: CandidateDetailDrawer
- [ ] F-R8: Modals (CreateJobOpening, AddCandidate, ScheduleInterview, SendOffer, RejectCandidate)
- [ ] F-R9: Wire to real API

### AI Job Description Generator — COMPLETED ✅
- ✅ F-JD1: `JDGenerateInput`, `JDGenerateResult`, `JDSection`, `JDFormDetails` added to `types.ts`
- ✅ F-JD2: `mockGenerateJD()` async function in `mockData.ts` — 3.5s simulated delay, realistic 7-section JD, role-title detection via regex
- ✅ F-JD3: `useGenerateJD`, `useSaveJD`, `useExportJDPdf` hooks in `useRecruitment.ts`; `useExportJDPdf` uses dynamic `import()` so jspdf/html2canvas are code-split
- ✅ F-JD4 + F-JD5: `AIJobDescriptionGenerator.tsx` — replaces `CreateJobOpeningModal` as the "+ New Job Opening" entry point; 3-step flow: Input → Loading → Review
- ✅ F-JD6: `react-markdown` used in `JDSectionBlock` for section preview rendering
- ✅ Installed: `jspdf`, `html2canvas`, `react-markdown`

### Employee Lifecycle Module — PLANNED
**Backend tasks (Account 1) — see EMPLOYEE-LIFECYCLE-PLAN.md Section 3 for full specs:**
- [ ] B-EL1: Add 4 Custom Fields to Employee (onboarding_stage, documents_checklist, it_setup_checklist, resignation_letter) + migrate
- [ ] B-EL2: Create `Employee Exit` DocType in `hr_client/hr_client/hr_client/doctype/employee_exit/` + migrate
- [ ] B-EL3: Create `employee_welcome` Email Template fixture + update hooks.py fixtures list + migrate
- [ ] B-EL4: Create `hr_client/hr_client/api/employee_lifecycle.py` — all 9 endpoints
- [ ] B-EL5: Test all endpoints via bench console / curl
- [ ] B-EL6: Update CLAUDE.md API Contract to LIVE status

**Frontend tasks (Account 2):**
- [ ] F-EL1: `src/pages/employees/types.ts` — OnboardingStage, DocStatus, DocumentsChecklist, ITSetupChecklist, EmployeeListItem, EmployeeDetail, EmployeeExitRecord
- [ ] F-EL2: `src/pages/employees/mockData.ts` — realistic mock employees across all stages
- [ ] F-EL3: `src/pages/employees/hooks/useEmployeeLifecycle.ts` — 9 hooks
- [ ] F-EL4: `EmployeeCard.tsx`, `OnboardingTracker.tsx`, `DocumentChecklist.tsx`, `ITSetupChecklist.tsx`
- [ ] F-EL5: `EmployeesPage.tsx` + route `/employees` — 3 tabs (Onboarding/Active/Exiting)
- [ ] F-EL6: `OnboardingDrawer.tsx` — right sheet with stepper + checklists
- [ ] F-EL7: `ExitModal.tsx` + `ExitInterviewForm.tsx`
- [ ] F-EL8: `EmployeeDirectory.tsx` + route `/employees/directory`
- [ ] F-EL9: Wire to real API (VITE_USE_MOCK=false)

### Old sprint (Forms Integration) — deferred
Forms Integration planning complete. Backend tasks (Form Template + Form Submission DocTypes + forms API) not yet started. Will resume after Recruitment.

---

### BACKEND tasks (Account 1)
All files go inside `hr_client/hr_client/`. Run `bench migrate && bench clear-cache` after every DocType change.

**B1 — Form Template DocType**
File: `hr_client/doctype/form_template/`
Fields:
- `form_name` Data, required
- `form_type` Select: Leave Application | Personal Details Update | Onboarding | Custom
- `ms_forms_id` Data (MS Forms form ID — used to match incoming webhooks)
- `fields_schema` JSON (array of field defs, see schema format in API Contract)
- `is_active` Check, default 1

**B2 — Form Submission DocType**
File: `hr_client/doctype/form_submission/`
Fields:
- `form_template` Link → Form Template, required
- `submitted_by` Data (email from MS Forms payload)
- `employee` Link → Employee (resolved post-intake, nullable)
- `submission_data` JSON (raw MS Forms response dict)
- `status` Select: Pending | Processed | Failed, default Pending
- `submitted_at` Datetime
- `processed_at` Datetime (nullable)
- `error_log` Text (nullable)

**B3 — API module**
File: `hr_client/api/forms.py`
Implement all 5 endpoints from the API Contract section.
Each must have `@frappe.whitelist()`. `submit_form` allows_guest=True (webhook from MS Forms/Power Automate).
Handle `frappe.exceptions.DoesNotExistError` and return `{"error": "..."}` with HTTP 404 where applicable.

**B4 — CORS + auth config**
In `hooks.py` add `allow_cors = "*"` (or restrict to frontend origin in prod).
Confirm session-cookie auth works for React fetch calls on same site.

**B5 — Seed a test Form Template**
Via bench console or fixture, create one Form Template (type: Leave Application) so frontend has data to render immediately.

---

### FRONTEND tasks (Account 2)
All files go inside `~/hr-frontend/`. Use MSW or hardcoded mock JSON matching the API Contract to build UI before backend is ready. Switch to real API calls once B3 is done.

**F1 — Project scaffold**
Vite + React + TypeScript + Tailwind + shadcn/ui. Confirm `npm run dev` works.
Axios or fetch wrapper in `src/lib/api.ts` — base URL from `VITE_API_BASE` env var.

**F2 — App shell / layout**
Odoo-style left sidebar with nav items: Dashboard, Forms, Submissions, Settings.
Top bar with user avatar. Main content area with router outlet.
Use shadcn `Sheet` for mobile sidebar. No Frappe desk — pure React SPA.

**F3 — Form Templates list page**
Route: `/forms`
Calls `GET get_form_templates`. Shows table: Form Name, Type, Active, action buttons.
Empty state when no templates exist.

**F4 — Form renderer**
Route: `/forms/:name/submit`
Calls `GET get_form_template`, reads `fields_schema`, renders each field dynamically:
- `Data` → `<Input>`
- `Select` → `<Select>` (shadcn)
- `Check` → `<Checkbox>`
- `Date` → `<DatePicker>`
On submit, calls `POST submit_form`. Show success toast with submission ID.

**F5 — Submissions list page**
Route: `/submissions`
Calls `GET get_submissions`. Table: ID, Form, Submitted By, Status (badge), Date.
Filter bar: by form_template and status. Pagination.

**F6 — Submission detail page**
Route: `/submissions/:name`
Calls `GET get_submission`. Shows all fields, raw `submission_data` in a collapsible JSON viewer, status badge, linked employee chip.

---

### Parallel contract — how to not block each other
1. API Contract below is frozen. Neither side changes it without updating this file.
2. Frontend mocks all responses locally until B3 ships. Mock shape must match contract exactly.
3. Backend runs on `hrms.localhost:8000`. Frontend dev server proxies `/api` to it via Vite config.
4. Backend signals "B3 done" by updating "What's been built" below.
5. Frontend signals "F1 done" by updating "What's been built" below.

---

### Definition of Done (Sprint 1)
- [ ] A test Form Template exists in ERPNext
- [ ] MS Forms / curl POST to `submit_form` creates a Form Submission record
- [ ] React `/forms` page lists templates (real API, not mock)
- [ ] React `/forms/:name/submit` renders and submits the form
- [ ] React `/submissions` lists real submissions with status filter
- [ ] React `/submissions/:name` shows detail with raw JSON

---

## What's been built
✅ **Recruitment Backend (2026-04-20)**
- `Job Opening Interview Round` child DocType (in `hr_client/hr_client/hr_client/doctype/`)
- 5 Custom Fields on Job Applicant (`custom_pipeline_stage`, `custom_current_interview_round`, `custom_rejection_reason`, `custom_internal_notes`) and Job Opening (`custom_interview_rounds`)
- `hr_client/api/recruitment.py` — 11 whitelisted endpoints + 4 doc_event handlers
- `hooks.py` — CORS, fixtures, doc_events
- All tested and working via bench console

✅ **Frontend Scaffold + Recruitment UI (2026-04-20)**
- Vite 5 + React + TypeScript + Tailwind CSS v3 + shadcn/ui (base-ui)
- `src/lib/api.ts` — Axios wrapper, `VITE_API_BASE` env var, `withCredentials`
- `src/lib/utils.ts` — `cn()` helper
- `src/lib/dateUtils.ts` — `formatDistanceToNow`, `formatDate`
- `src/components/layout/Sidebar.tsx` — Odoo-style dark sidebar, 6 nav items
- `src/components/layout/TopBar.tsx` — avatar + logout dropdown
- `src/components/layout/Layout.tsx` — shell with mobile Sheet sidebar
- `src/pages/Login.tsx` — login form connecting to Frappe `/api/method/login`
- `src/pages/Dashboard.tsx` — placeholder
- `src/pages/recruitment/types.ts` — TypeScript types for all shapes
- `src/pages/recruitment/mockData.ts` — realistic mock for all 6 pipeline stages (11 candidates)
- `src/pages/recruitment/hooks/useRecruitment.ts` — React Query hooks (VITE_USE_MOCK flag)
- `src/pages/recruitment/components/KanbanBoard.tsx`
- `src/pages/recruitment/components/KanbanColumn.tsx` — stage-color-coded columns
- `src/pages/recruitment/components/CandidateCard.tsx` — star rating, source, days-ago
- `src/pages/recruitment/components/JobOpeningsSidebar.tsx` — left panel, closed section collapsible
- `src/pages/recruitment/components/CandidateDetailDrawer.tsx` — right Sheet, 4 tabs (Overview/Interviews/Offer/Notes)
- `src/pages/recruitment/components/AddCandidateModal.tsx`
- `src/pages/recruitment/components/CreateJobOpeningModal.tsx` — with interview rounds builder
- `src/pages/recruitment/components/ScheduleInterviewModal.tsx`
- `src/pages/recruitment/components/RejectCandidateModal.tsx`
- `src/pages/recruitment/RecruitmentPage.tsx` — routes `/recruitment` and `/recruitment/:jobOpening`
- `src/App.tsx` — BrowserRouter + React Query provider + all routes
- `npm run build` passes clean (TypeScript + Vite)
- Currently running with `VITE_USE_MOCK=true` — switch to `false` when backend is live

✅ **Bug fixes (2026-04-20)**
- **Bug 1:** Deduplicated `allOpenings` array in `JobOpeningsSidebar` (mock returns all items for every status query, causing duplicates); added unique keys `${job.name}-${index}`.
- **Bug 2/3:** Removed `Button` component from `render={}` prop in both `dialog.tsx` and `sheet.tsx` close buttons — replaced with plain styled `DialogPrimitive.Close` to avoid React ref forwarding warnings.
- **Bug 4:** Added `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to `BrowserRouter` in `App.tsx`.

✅ **UI fixes (2026-04-20)**
- **Issue 1 (Dashboard):** Built full dashboard — greeting header, 4 stat cards, Recent Activity feed, Quick Actions panel. File: `src/pages/Dashboard.tsx`.
- **Issue 2 (Drawer):** Replaced fixed Sheet with an inline `absolute` panel inside a `relative` parent in `RecruitmentPage.tsx`. Drawer slides in from right of the kanban area only — sidebar is never covered. Dark overlay (`bg-black/40`) scoped to content area. File: `src/pages/recruitment/components/CandidateDetailDrawer.tsx`, `src/pages/recruitment/RecruitmentPage.tsx`.
- **Issue 3 (Modal):** Changed `DialogOverlay` from `bg-black/10` to `bg-black/50`; changed `DialogContent` popup from `bg-popover` to explicit `bg-white shadow-xl`. File: `src/components/ui/dialog.tsx`.
- **Issue 4 (Sidebar):** Removed `hidden md:flex` wrapper — sidebar now always rendered. Mobile hamburger + Sheet only shown on `lg:hidden`. File: `src/components/layout/Layout.tsx`.

✅ **UI fixes round 2 (2026-04-20)**
- **Issue 1 (Vertical line):** `CandidateDetailDrawer` now conditionally mounted (`{selectedCandidate && ...}`) — no always-present `border-l` DOM node. File: `src/pages/recruitment/RecruitmentPage.tsx`.
- **Issue 2 (Card fill):** Dashboard stat/activity/actions cards now use `bg-white shadow-md ring-0 border-0` — bypasses broken `bg-card` CSS variable. File: `src/pages/Dashboard.tsx`.
- **Issue 3 (Floating X):** Sheet-based mobile sidebar removed from Layout — replaced with single collapsible sidebar pattern, eliminating stray SheetTrigger from DOM.
- **Issue 4 (Sidebar toggle):** Layout has `useState(true)` for `sidebarOpen`; `Sidebar` accepts `open` prop and transitions `w-56`↔`w-0` with `duration-300`; TopBar hamburger calls `onToggleSidebar`. Files: `src/components/layout/Layout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/TopBar.tsx`.
- **Issue 5 (Design depth):** Active sidebar nav uses `bg-blue-600 text-white`; TopBar has `shadow-sm border-gray-200`.

✅ **Auth flow + Login redesign (2026-04-20)**
- `src/api/auth.ts` — `loginUser`, `logoutUser`, `getCurrentUser`, `storeUser`, `clearUser`; mock-aware (`VITE_USE_MOCK`); user persisted to `localStorage`.
- `src/context/AuthContext.tsx` — `AuthProvider` with `user`, `isLoggedIn`, `isLoading`, `login()`, `logout()`; logout uses `window.location.replace("/login")` (not React Router `navigate`) to avoid race condition where `PublicOnlyRoute` still sees old `isLoggedIn=true` and bounces user back.
- `src/components/auth/ProtectedRoute.tsx` — `ProtectedRoute` (spinner while loading, redirect to `/login` if not auth) and `PublicOnlyRoute` (spinner while loading, redirect to `/` if already logged in).
- `src/pages/Login.tsx` — split-screen redesign: left `bg-slate-900` panel with logo + "Welcome back" + 3 feature bullets; right `bg-white` with labeled email/password fields, show/hide password toggle, blue Sign In button with inline spinner, red error message.
- `src/components/layout/TopBar.tsx` — shows user initials (up to 2 letters) in `bg-blue-600` avatar; dropdown shows full_name + email + separator + "Sign Out" that triggers logout.
- `src/App.tsx` — `AuthProvider` wraps all routes inside `BrowserRouter`; protected routes use `ProtectedRoute`, `/login` uses `PublicOnlyRoute`; catch-all `path="*"` inside protected layout redirects unknown URLs to `/`; no raw Frappe JSON ever shown.

**Key gotcha logged:** Never use `navigate("/login")` immediately after `setUser(null)` in the same tick — `PublicOnlyRoute` reads stale `isLoggedIn=true` and bounces the user back, causing an infinite redirect. Use `window.location.replace("/login")` for logout redirects.

✅ **AI Job Description Generator (2026-04-20)**
- `src/pages/recruitment/components/AIJobDescriptionGenerator.tsx` — 3-step flow: Input (textarea + gradient Generate button) → Loading (animated dark gradient with cycling messages) → Review (split 60/40 panel: JD preview with per-section inline edit + job details form)
- `JDSectionBlock` — each section has hover Edit pencil, inline textarea with auto-resize, Save/Cancel check/X buttons; content rendered via `react-markdown`
- Bottom action bar: Download PDF (pure jsPDF, no html2canvas), Copy Share Link (clipboard API + sonner toast), Save & Create Opening (purple-blue gradient button)
- `mockGenerateJD()` in `mockData.ts` — 3.5s async mock, regex title extraction, 7-section JD
- 3 new hooks: `useGenerateJD`, `useSaveJD`, `useExportJDPdf`
- New types: `JDSection`, `JDGenerateInput`, `JDGenerateResult`, `JDFormDetails`, `GeminiJDRaw`
- `AIJobDescriptionGenerator` replaces `CreateJobOpeningModal` as `+ New Job Opening` entry point in `RecruitmentPage.tsx`
- "Fill manually" link skips to old `CreateJobOpeningModal`; error state auto-shows fallback
- Installed: `jspdf`, `html2canvas`, `react-markdown`
- TypeScript clean, production build passes

✅ **AI JD Generator — OpenAI + Professional PDF (2026-04-20)**
- `callOpenAI()` — `fetch` to `gpt-4o-mini` using `VITE_OPENAI_API_KEY`; `response_format: json_object` forces clean JSON (no fence-stripping needed); ~3s, ~$0.0002/call
- Switched from Gemini (free tier quota exhausted) to OpenAI gpt-4o-mini
- `generatePDF()` — pure jsPDF layout: dark navy header + job title + metadata; blue accent line; per-section blue left-border accent; two-column layout for Responsibilities/Qualifications and Nice-to-Have/What-We-Offer; paginated footer
- `buildPdfData()` — merges edited section content back to arrays for PDF; `sectionToArray()` strips markdown bullet prefixes
- Loading screen: 5 messages cycling every 2s; spinning purple→blue SVG gradient ring
- Error handling: `toast.error()` with actual error message (8s duration) + auto-return to input
- API key never logged; `.env` in `.gitignore`; old exposed key revoked immediately
- TypeScript clean, production build passes

## In progress
AI JD Generator UI complete but ON HOLD — AI provider undecided (Gemini free tier exhausted, OpenAI no credits, Groq not yet set up). Two fallback options ready when resumed: Option A (skip AI, go straight to manual review+PDF form) or Option B (revert to original CreateJobOpeningModal). See "ON HOLD" section below.

## What's next
- **Employee Lifecycle module** — backend B-EL1–B-EL6 + frontend F-EL1–F-EL9 (see EMPLOYEE-LIFECYCLE-PLAN.md)
- Wire frontend to real recruitment API (`VITE_USE_MOCK=false`, set `VITE_API_BASE=http://hrms.localhost:8000`)
- Forms Integration backend (B1–B5) + frontend (F1–F6)
- Test full Login → Dashboard → Logout flow against real ERPNext
- Resume AI JD Generator once AI provider is decided (see ON HOLD below)

## ON HOLD — AI Job Description Generator
**Status:** UI fully built and working. Blocked on AI provider.

**Problem:** All free-tier AI APIs exhausted or uncredentialed:
- Gemini `gemini-2.0-flash` / `gemini-2.0-flash-lite` → 429 free tier quota = 0
- OpenAI `gpt-4o-mini` → 429 insufficient_quota (no billing on account)
- Groq → not yet set up

**To resume, pick one:**
1. **Groq (free)** — sign up at console.groq.com, get API key, add `VITE_GROQ_API_KEY=gsk_...` to `.env`. Code change: 3 lines (URL + model + key name). Model: `llama-3.3-70b-versatile`.
2. **OpenAI (paid)** — add $5 credits at platform.openai.com/settings/billing. No code change needed, just restore `VITE_OPENAI_API_KEY`.
3. **No AI (Option A)** — make Generate button skip AI and open blank review panel; HR fills sections manually + downloads PDF. Full PDF feature retained.
4. **No AI (Option B)** — revert to original `CreateJobOpeningModal` (simple form, no PDF). One-line swap in `RecruitmentPage.tsx`.

**Current code state:** `AIJobDescriptionGenerator.tsx` calls `callOpenAI()` targeting `gpt-4o-mini`. Switching to Groq = change URL to `https://api.groq.com/openai/v1/chat/completions`, model to `llama-3.3-70b-versatile`, key to `import.meta.env.VITE_GROQ_API_KEY`.

## API Contract

### Recruitment Endpoints (LIVE — tested 2026-04-20)
Base: `/api/method/hr_client.api.recruitment.<endpoint>`
Auth: session cookie, HR Manager or System Manager role required on all.

| Method | Endpoint | Params | Notes |
|---|---|---|---|
| GET | `get_job_openings` | `status` (opt, default "Open") | Returns list + per-stage counts |
| GET | `get_pipeline` | `job_opening` (req) | Returns all 6 stages with candidates |
| GET | `get_candidate` | `name` (req) | Full detail + interviews + offer |
| POST | `create_job_opening` | `job_title`, `designation`, `department`, `description`, `interview_rounds` (JSON arr) | |
| POST | `add_candidate` | `job_opening`, `applicant_name`, `email_id`, `phone_number`, `source`, `cover_letter`, `resume_link` | `source` must match Job Applicant Source record |
| POST | `move_candidate` | `applicant`, `stage` | Blocks `Hired` and `Offer Sent` (system-only) |
| POST | `reject_candidate` | `applicant`, `rejection_reason` | Sets HRMS status=Rejected too |
| POST | `schedule_interview` | `job_applicant`, `interview_round`, `scheduled_on`, `from_time`, `to_time` | Auto-moves candidate to Interview stage |
| POST | `send_offer` | `job_applicant`, `offer_date`, `designation`, `company` | Auto-moves candidate to Offer Sent |
| POST | `update_offer_status` | `offer`, `status` (Accepted/Rejected) | Creates Employee on Accept |
| POST | `update_candidate_notes` | `applicant`, `notes` | Internal HR notes only |
| GET | `get_interview_rounds` | — | All Interview Round masters |
| GET | `get_applicant_sources` | — | All Job Applicant Source records |

**Key gotcha:** `source` field on Job Applicant is a Link → `Job Applicant Source` (master data). Pass name of existing record or omit.
**Key gotcha:** DocType files must go in `hr_client/hr_client/hr_client/doctype/`, not `hr_client/hr_client/doctype/`.

### AI Job Description Generator Endpoints (PLANNED — not yet built)
See BACKEND-SPRINT-1.md for full implementation spec.
Requires: `pip install anthropic` in bench env; `bench set-config anthropic_api_key "..."` on site.
Requires: Custom Field `Job Opening-custom_job_description_md` (Long Text) on Job Opening.

| Method | Endpoint | Params | Notes |
|---|---|---|---|
| POST | `generate_job_description` | `rough_description` (req), `job_title` (req), `department` (opt) | Calls Claude API, returns markdown JD. Does NOT save — frontend previews first. |
| POST | `save_job_description` | `job_opening` (req), `job_description_md` (req) | Saves approved markdown to `custom_job_description_md` field on Job Opening. |
| GET | `export_jd_pdf` | `job_opening` (req) | Converts stored markdown to PDF, saves to `/files/`, returns `pdf_url`. |

**`generate_job_description` response:**
```json
{
  "message": {
    "success": true,
    "job_description_md": "## Senior Backend Engineer\n\n### About the Company\n..."
  }
}
```

**`save_job_description` response:**
```json
{ "message": { "success": true } }
```

**`export_jd_pdf` response:**
```json
{ "message": { "success": true, "pdf_url": "/files/jd_HR-OPN-2024-0001.pdf" } }
```

### Employee Lifecycle Endpoints (PLANNED — not yet built)
See EMPLOYEE-LIFECYCLE-PLAN.md for full implementation spec.
New file: `hr_client/hr_client/api/employee_lifecycle.py`
Requires: 4 Custom Fields on Employee + new `Employee Exit` DocType + `employee_welcome` Email Template fixture.

| Method | Endpoint | Params | Notes |
|---|---|---|---|
| GET | `get_employees` | `status` (opt), `onboarding_stage` (opt), `page` (opt), `page_length` (opt) | Employee list with stage badges |
| GET | `get_employee_detail` | `employee_id` (req) | Full profile + parsed checklists + exit summary |
| POST | `create_employee` | `first_name`, `last_name`, `date_of_joining`, `designation`, `department`, `company`, `personal_email`, `cell_number`, `job_applicant` (opt) | Sets Offer Accepted stage automatically |
| POST | `update_onboarding_stage` | `employee_id` (req), `stage` (req), `checklist_data` (opt JSON) | Validates mandatory docs; triggers welcome email on First Day |
| GET | `get_onboarding_checklist` | `employee_id` (req) | Both checklists + mandatory_docs_complete flag |
| POST | `submit_resignation` | `employee_id` (req), `resignation_date` (req), `last_working_day` (opt), `resignation_letter_url` (opt) | Creates Employee Exit record |
| POST | `submit_exit_interview` | `employee_id` (req), `exit_reason`, `would_recommend`, `enjoyed_most`, `improvement_suggestions`, `management_feedback` | Sets exit status=Interview Done; Employee status=Left |
| GET | `get_exit_details` | `employee_id` (req) | Employee Exit record or null |
| POST | `send_welcome_email` | `employee_id` (req) | Sends via Email Template `employee_welcome` |

**Key gotchas:**
- `custom_documents_checklist` and `custom_it_setup_checklist` stored as JSON strings — always `json.loads()` before reading.
- Employee `status = "Left"` set only when `last_working_day ≤ today`, not on resignation submission.
- Resignation letter file uploaded separately via `/api/method/upload_file` — endpoint receives the returned `file_url`.
- Welcome email uses `frappe.render_template()` on both `subject` AND `response` — omitting it on subject leaves Jinja vars literal.

**New DocType:** `Employee Exit` — fields: employee, resignation_date, last_working_day, resignation_letter (Attach), exit_reason (Select), would_recommend (Select), enjoyed_most/improvement_suggestions/management_feedback (Long Text), status (Pending/Interview Done/Cleared/Settled), final_settlement_status (Pending/Done).

### Forms Integration Endpoints (PLANNED — not yet built)
See "## Current Sprint → Forms Integration" above for spec.

### Field Schema Format (used inside `fields_schema` JSON column)
```json
[
  {
    "fieldname": "employee_name",
    "label": "Employee Name",
    "fieldtype": "Data",
    "required": true
  },
  {
    "fieldname": "department",
    "label": "Department",
    "fieldtype": "Select",
    "options": ["HR", "IT", "Finance"],
    "required": false
  },
  {
    "fieldname": "start_date",
    "label": "Start Date",
    "fieldtype": "Date",
    "required": true
  },
  {
    "fieldname": "is_confirmed",
    "label": "Confirmed",
    "fieldtype": "Check",
    "required": false
  }
]
```
Supported fieldtypes: `Data`, `Select`, `Check`, `Date`, `Int`, `Text`.

---

### POST `/api/method/hr_client.api.forms.submit_form`
**Auth:** Guest (allow_guest=True — called by MS Forms via Power Automate)
**Body (JSON):**
```json
{
  "form_id": "FORM-TEMPLATE-NAME",
  "data": { "employee_name": "John", "department": "HR" },
  "submitted_by": "john@company.com"
}
```
**Response 200:**
```json
{ "message": { "success": true, "submission_id": "FORM-SUB-0001" } }
```
**Response 404:**
```json
{ "message": { "error": "Form template not found" } }
```

---

### GET `/api/method/hr_client.api.forms.get_form_templates`
**Auth:** Session (logged-in user)
**Params:** none
**Response 200:**
```json
{
  "message": {
    "templates": [
      {
        "name": "FORM-TMPL-0001",
        "form_name": "Leave Application",
        "form_type": "Leave Application",
        "is_active": 1
      }
    ]
  }
}
```

---

### GET `/api/method/hr_client.api.forms.get_form_template`
**Auth:** Session
**Params:** `name=FORM-TMPL-0001`
**Response 200:**
```json
{
  "message": {
    "name": "FORM-TMPL-0001",
    "form_name": "Leave Application",
    "form_type": "Leave Application",
    "is_active": 1,
    "fields_schema": [ /* array of field defs as above */ ]
  }
}
```
**Response 404:**
```json
{ "message": { "error": "Form template not found" } }
```

---

### GET `/api/method/hr_client.api.forms.get_submissions`
**Auth:** Session
**Params (all optional):** `form_template=FORM-TMPL-0001`, `status=Pending`, `page=1`, `page_length=20`
**Response 200:**
```json
{
  "message": {
    "submissions": [
      {
        "name": "FORM-SUB-0001",
        "form_template": "FORM-TMPL-0001",
        "form_name": "Leave Application",
        "submitted_by": "john@company.com",
        "employee": "EMP-0001",
        "status": "Pending",
        "submitted_at": "2026-04-20 10:30:00"
      }
    ],
    "total": 42,
    "page": 1,
    "page_length": 20
  }
}
```

---

### GET `/api/method/hr_client.api.forms.get_submission`
**Auth:** Session
**Params:** `name=FORM-SUB-0001`
**Response 200:**
```json
{
  "message": {
    "name": "FORM-SUB-0001",
    "form_template": "FORM-TMPL-0001",
    "form_name": "Leave Application",
    "submitted_by": "john@company.com",
    "employee": "EMP-0001",
    "submission_data": { "employee_name": "John", "department": "HR" },
    "status": "Pending",
    "submitted_at": "2026-04-20 10:30:00",
    "processed_at": null,
    "error_log": null
  }
}
```
**Response 404:**
```json
{ "message": { "error": "Submission not found" } }
```

## Decisions made
- Using shadcn/ui for all form components
- Odoo-style left sidebar
- No Frappe desk in production — pure React
- Extend HRMS via hr_client, never modify core

## DO NOT DO
- DO NOT modify core frappe/erpnext/hrms files
- DO NOT create endpoints without @frappe.whitelist()
- DO NOT run migrate without cache clear after
- DO NOT store Jibble API key in code — use site_config
- DO NOT call API endpoints not listed in API Contract
- DO NOT push directly to main branch
- DO NOT call `self.save()` inside a `validate()` hook — causes infinite recursion
- DO NOT use `frappe.get_doc()` when you only need one field — use `frappe.db.get_value()` instead
- DO NOT catch bare `Exception` and silently swallow it — always re-raise or log
- DO NOT return raw HTTP responses from whitelisted methods — return dict/list only
- DO NOT use `frappe.db.sql()` raw queries when ORM methods exist — SQL bypasses permission checks
- DO NOT forget `super().validate()` in controller validate() — skips parent class validation
- DO NOT write fixtures that duplicate existing Custom Fields — check DB first
- DO NOT use `db_set()` to update fields that need hooks/notifications to fire — use `save()` instead
- DO NOT add `allow_guest=True` to endpoints that read or write sensitive HR data
- DO NOT use naming_series without adding the `naming_series` fieldtype field to the DocType
- DO NOT place DocType folders in `hr_client/hr_client/doctype/` — they MUST be in `hr_client/hr_client/hr_client/doctype/` (inside the module subfolder) or Frappe will silently skip them during migrate
- DO NOT pass a `source` string to Job Applicant without first confirming it exists in `Job Applicant Source` master — it's a Link field, not free text
- DO NOT call `navigate("/login")` immediately after `setUser(null)` in the same event tick — `PublicOnlyRoute` reads stale `isLoggedIn=true` and bounces the user back to `/`, causing an infinite redirect; use `window.location.replace("/login")` for logout redirects instead
- DO NOT log, print, or expose `VITE_OPENAI_API_KEY` or any env secret — read via `import.meta.env.VITE_*` only, use only in Authorization headers, never in `console.*` or visible UI. AI provider is OpenAI gpt-4o-mini (Gemini free tier exhausted)

---

## ERPNext Rules & Limitations (CRITICAL)
_Sourced from frappe v15 / erpnext / hrms source code. Read before writing a single line._

### DocType JSON Structure

Every DocType lives in `my_app/my_app/doctype/<doctype_name>/` as two files:
- `<doctype_name>.json` — schema definition
- `<doctype_name>.py` — Python controller class

**Mandatory JSON keys:**
```json
{
  "doctype": "DocType",
  "name": "My DocType",
  "fields": [...],
  "permissions": [...]
}
```

**All valid fieldtypes:**
```
Autocomplete, Attach, Attach Image, Barcode, Button, Check, Code, Color,
Column Break, Currency, Data, Date, Datetime, Duration, Dynamic Link,
Float, Fold, Geolocation, Heading, HTML, HTML Editor, Icon, Image, Int,
JSON, Link, Long Text, Markdown Editor, Password, Percent, Phone,
Read Only, Rating, Section Break, Select, Signature, Small Text,
Tab Break, Table, Table MultiSelect, Text, Text Editor, Time
```

**Key field attributes:**
| Attribute | Values | Effect |
|---|---|---|
| `reqd` | 0/1 | Mandatory field |
| `unique` | 0/1 | DB-level uniqueness |
| `in_list_view` | 0/1 | Show in list view columns |
| `read_only` | 0/1 | Non-editable |
| `allow_on_submit` | 0/1 | Editable after submit |
| `no_copy` | 0/1 | Excluded when duplicating |
| `fetch_from` | `"link_field.fieldname"` | Auto-fills from linked doc |
| `options` | DocType name or `\n`-separated | Link target or Select choices |
| `default` | string | Default value |
| `depends_on` | JS expression | Conditional visibility |
| `insert_after` | fieldname | Position in form layout |

**autoname patterns:**
```
"field:fieldname"           → use field value as name
"naming_series:"            → use naming_series widget
"hash"                      → 10-char hash
"autoincrement"             → integer auto-increment
"HR-SUB-.YYYY.-.MM.-.####" → prefix + year + month + padded counter
```
Naming series format: prefix segments separated by `.`, `#` = digit padding. Counter stored in `tabSeries` table.

**Child tables:**
- Requires a separate DocType JSON with `"istable": 1` and `"permissions": []`
- Parent references child via `"fieldtype": "Table", "options": "Child DocType Name"`
- Child rows have: `parent`, `parenttype`, `parentfield`, `idx` (1-based)

---

### Controller Hooks — Full List & Order

```python
from frappe.model.document import Document

class MyDocType(Document):
    # --- Insert flow ---
    def before_validate(self): ...   # Before validate, on every save
    def validate(self): ...          # Main validation — raise here to block save
    def before_insert(self): ...     # Before first save only
    def after_insert(self): ...      # After first save only

    # --- Save (update) flow ---
    def before_save(self): ...       # Before insert OR update
    def on_update(self): ...         # After insert OR update

    # --- Submit flow ---
    def before_submit(self): ...
    def on_submit(self): ...         # docstatus = 1

    # --- Cancel flow ---
    def before_cancel(self): ...
    def on_cancel(self): ...         # docstatus = 2

    # --- Delete flow ---
    def before_trash(self): ...
    def on_trash(self): ...

    # --- Special ---
    def on_change(self): ...         # After any field changes (not saved)
    def has_permission(self): ...    # Custom permission check
```

**Critical rules:**
- Call `super().validate()` if your class inherits from anything other than `Document`
- Raise `frappe.throw()` inside `validate()` to block save with a user-visible error
- Never call `self.save()` inside `validate()`, `before_save()`, or `on_update()` — infinite loop
- `self.db_set(field, value)` updates DB directly, skips all hooks; use only for status fields after submit
- `self.flags.ignore_permissions = True` disables permission checks for that document instance

**Accessing linked document values:**
```python
# Cheap: single field, no doc instantiation
employee_name = frappe.db.get_value("Employee", self.employee, "employee_name")

# Full doc (costs more, loads all fields + children)
emp_doc = frappe.get_doc("Employee", self.employee)
```

**Child table manipulation:**
```python
# Read
for row in self.get("items"):
    print(row.item_code, row.qty, row.idx)

# Add
self.append("items", {"item_code": "X", "qty": 5})

# Remove (by reference)
self.remove(row)

# Saving parent auto-saves all children
self.save()
```

---

### Whitelisted API Methods — Rules

```python
import frappe

@frappe.whitelist()
def session_only_endpoint(param1, param2=None):
    """Requires logged-in session. Params from query string or JSON body."""
    frappe.has_permission("MyDocType", throw=True)
    return {"result": frappe.db.get_list("MyDocType", ...)}

@frappe.whitelist(allow_guest=True)
def public_webhook(form_id, data):
    """No auth required. Use ONLY for webhooks from external services."""
    pass

@frappe.whitelist(methods=["POST"])
def create_only(name):
    """Restricted to POST requests only."""
    pass
```

**Parameter rules:**
- All params come in as **strings** from query string — cast explicitly (`int()`, `json.loads()`, etc.)
- JSON body params come in pre-parsed if `Content-Type: application/json`
- `frappe.form_dict` holds all merged params (query + body)
- List/dict params from JSON body arrive as Python objects; from query string arrive as JSON strings

**Return value wrapping:**
```
Your return value    →  HTTP response body
{"key": "val"}       →  {"message": {"key": "val"}, "exc": null}
"string"             →  {"message": "string"}
None                 →  {"message": null}
```

**Setting custom status codes:**
```python
frappe.response.http_status_code = 404
frappe.response["message"] = {"error": "Not found"}
return  # Do NOT return a value when setting response manually
```

**Auth check pattern (use in every non-guest endpoint):**
```python
@frappe.whitelist()
def get_submission(name):
    frappe.has_permission("Form Submission", ptype="read", throw=True)
    doc = frappe.get_doc("Form Submission", name)
    doc.check_permission("read")
    return doc.as_dict()
```

---

### Custom Fields vs New DocTypes

| Scenario | Use |
|---|---|
| Adding fields to Employee, Leave Application, etc. | **Custom Field** (never touch core) |
| Entirely new entity (Form Template, Form Submission) | **New DocType** in hr_client |
| Changing field properties (label, reqd, etc.) | **Property Setter** |

**Fixtures approach (recommended — ships with app):**

1. Create `hr_client/fixtures/custom_field.json`:
```json
[
  {
    "doctype": "Custom Field",
    "name": "Employee-custom_jibble_id",
    "dt": "Employee",
    "fieldname": "custom_jibble_id",
    "fieldtype": "Data",
    "label": "Jibble Employee ID",
    "insert_after": "employee_name"
  }
]
```

2. Register in `hooks.py`:
```python
fixtures = [
    {"dt": "Custom Field", "filters": [["name", "like", "%-custom_%"]]}
]
```

3. Export: `bench --site hrms.localhost export-fixtures`
4. Import: runs automatically on `bench migrate`

**Custom Field naming convention:** `DocType-fieldname` (e.g., `"Employee-custom_jibble_id"`)

---

### Permission System

**Standard HRMS roles (use these in DocType permissions):**
- `System Manager` — full access
- `HR Manager` — read/write/submit all HR documents
- `HR User` — limited read/write
- `Employee` — read own records only

**DocType permission entry format (in JSON):**
```json
"permissions": [
  {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "submit": 1, "cancel": 1},
  {"role": "HR User", "read": 1, "write": 1, "create": 1},
  {"role": "Employee", "read": 1, "if_owner": 1}
]
```

**`if_owner: 1`** — user can only read/write their own records.

**Row-level filtering (get_permission_query_conditions):**
```python
# In my_module.py
def get_permission_query_conditions(user):
    if "HR Manager" in frappe.get_roles(user):
        return ""  # No filter, see all
    emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
    return f"`tabForm Submission`.employee = {frappe.db.escape(emp)}"

# In hooks.py
permission_query_conditions = {
    "Form Submission": "hr_client.api.forms.get_permission_query_conditions"
}
```

**Document-level check (has_permission):**
```python
# In my_module.py
def has_permission(doc, ptype, user):
    if "HR Manager" in frappe.get_roles(user):
        return True
    return doc.submitted_by == frappe.session.user

# In hooks.py
has_permission = {
    "Form Submission": "hr_client.api.forms.has_permission"
}
```

---

### Exception Handling

**Key exception classes (from `frappe.exceptions`):**
```python
frappe.ValidationError        # HTTP 417 — default, use for bad input
frappe.PermissionError        # HTTP 403 — access denied
frappe.DoesNotExistError      # HTTP 404 — document not found
frappe.AuthenticationError    # HTTP 401 — not logged in
frappe.DuplicateEntryError    # HTTP 409 — unique constraint violated
frappe.LinkValidationError    # HTTP 417 — broken Link field
frappe.UniqueValidationError  # HTTP 417 — unique field conflict
frappe.UpdateAfterSubmitError # HTTP 417 — tried to edit submitted doc
frappe.DocumentLockedError    # HTTP 417 — doc locked by another user
```

**`frappe.get_doc()` raises `DoesNotExistError` — never returns None:**
```python
try:
    doc = frappe.get_doc("Form Template", name)
except frappe.DoesNotExistError:
    frappe.response.http_status_code = 404
    return {"error": "Form template not found"}
```

**`frappe.db.get_value()` returns None — never raises:**
```python
value = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
if not value:
    frappe.throw("No employee record found for current user")
```

---

### hooks.py — Important Patterns

```python
# Hooking into existing DocType events (extend without modifying core)
doc_events = {
    "Employee": {
        "after_insert": "hr_client.overrides.employee.after_insert",
        "on_update":    "hr_client.overrides.employee.on_update",
    },
    "Leave Application": {
        "on_submit": "hr_client.api.forms.sync_leave_to_submission",
    },
}

# Override a core whitelisted method
override_whitelisted_methods = {
    "hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on":
        "hr_client.overrides.leave.get_leave_balance_on"
}

# Scheduled background jobs
scheduler_events = {
    "daily": ["hr_client.api.jibble.sync_attendance"],
    "cron": {
        "0 9 * * 1-5": ["hr_client.api.jibble.morning_sync"],  # 9am weekdays
    },
}

# Fixtures to sync on migrate
fixtures = [
    {"dt": "Custom Field", "filters": [["name", "like", "%-custom_%"]]}
]

# CORS (needed for React frontend on different port)
allow_cors = "*"
```

**doc_events handler signature:**
```python
def after_insert(doc, method=None):
    """doc = the document being saved, method = event name string"""
    pass
```

---

### Migration & Patches

**`bench migrate` runs in this order:**
1. Pre-model-sync patches (`patches.txt` → `[pre_model_sync]` section)
2. Sync all DocType schemas (creates/alters DB tables)
3. Post-model-sync patches (`patches.txt` → `[post_model_sync]` section)
4. Sync scheduled jobs
5. Sync fixtures (Custom Fields, Property Setters)
6. Clear cache

**Always run after migrate:**
```bash
bench --site hrms.localhost migrate && bench --site hrms.localhost clear-cache
```

**Writing a patch** (`hr_client/patches/v1_0/my_patch.py`):
```python
import frappe

def execute():
    # Safe to use frappe.db here — schema is already synced (post_model_sync)
    frappe.db.sql("UPDATE `tabForm Submission` SET status = 'Pending' WHERE status IS NULL")
    frappe.db.commit()
```

Register in `patches.txt`:
```
[post_model_sync]
hr_client.patches.v1_0.my_patch
```

**Patch rules:**
- Each patch runs exactly once (tracked in `tabPatch Log`)
- Pre-model-sync patches run BEFORE schema changes — do not reference new columns
- Post-model-sync patches run AFTER schema is ready — safe to use new columns
- Never remove a patch from patches.txt — add new ones instead

---

### Extending HRMS Without Touching Core

**Pattern 1 — New DocType (safest):**
Create entirely new DocTypes in `hr_client/doctype/`. Nothing touches core.

**Pattern 2 — Override doctype class:**
```python
# hooks.py
override_doctype_class = {
    "Employee": "hr_client.overrides.employee.CustomEmployee"
}

# hr_client/overrides/employee.py
from hrms.hr.doctype.employee.employee import Employee

class CustomEmployee(Employee):
    def validate(self):
        super().validate()  # ALWAYS call super first
        self.validate_custom_fields()

    def validate_custom_fields(self):
        if self.custom_jibble_id and not self.custom_jibble_id.isdigit():
            frappe.throw("Jibble ID must be numeric")
```

**Pattern 3 — doc_events hook (least invasive):**
```python
# hooks.py
doc_events = {
    "Employee": {
        "after_insert": "hr_client.overrides.employee.set_jibble_defaults"
    }
}

# No override of the class — just a standalone function
def set_jibble_defaults(doc, method=None):
    if not doc.custom_jibble_id:
        doc.db_set("custom_jibble_id", generate_jibble_id(doc))
```

**Pattern 4 — Custom Fields via fixtures:**
Add fields to existing DocTypes without any Python — just JSON + `bench migrate`.

**Rule of thumb:** Use Pattern 4 first, Pattern 3 second, Pattern 2 last. Never Pattern 0 (editing core files).

---

## Frappe Best Practices

### Code Organization
```
hr_client/hr_client/
  doctype/
    form_template/         ← one folder per DocType
      form_template.json
      form_template.py
    form_submission/
      form_submission.json
      form_submission.py
  api/
    forms.py               ← whitelisted endpoints grouped by domain
    jibble.py
  overrides/
    employee.py            ← doc_events handlers and class overrides
  fixtures/
    custom_field.json      ← Custom Fields shipped with app
  patches/
    v1_0/
      initial_setup.py
  hooks.py
  patches.txt
```

### Always Do
- `super().validate()` first in every controller that inherits from non-Document
- `frappe.has_permission(doctype, throw=True)` at the top of every whitelisted endpoint
- Return `doc.as_dict()` not `doc` from whitelisted methods (prevents serialization issues)
- Use `frappe.db.get_value()` for single-field lookups, `frappe.get_doc()` only when you need the full document
- Use `frappe.get_all()` for list queries with filters — it respects permissions
- Use `frappe.db.escape()` around any user-supplied string in raw SQL
- Add `try/except frappe.DoesNotExistError` around every `frappe.get_doc()` call in API methods
- Cast string params explicitly in whitelisted methods: `page = int(frappe.form_dict.get("page", 1))`
- Log with `frappe.log_error(frappe.get_traceback(), "Context Title")` for background job failures
- Commit with `frappe.db.commit()` after mutations in scheduler jobs (not needed in request context)

### Never Do
- Never call `frappe.db.sql()` with unsanitized user input — always use `frappe.db.escape()`
- Never call `self.save()` inside `validate()` or `before_save()`
- Never `import frappe` inside a function body — import at module top
- Never assume `frappe.session.user` in `allow_guest=True` endpoints — it will be `"Guest"`
- Never use bare `except:` — always catch specific exceptions
- Never commit inside a validate hook — Frappe manages transactions per request
- Never store secrets in code or DocType defaults — use `frappe.conf` (site_config.json)
