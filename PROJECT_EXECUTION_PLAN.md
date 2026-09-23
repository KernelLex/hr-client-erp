# Project Execution Module — Improved Spec

_An upgrade of the owner's founding brief `new materials for erp/projects idea.txt`.
The brief describes, in prose, how an interior project runs from enquiry to handover.
This document turns that into a structured, gated lifecycle the ERP can actually run,
track and analyse. The brief = intent; this is the implementation we own._

> Scope boundary: **Quotation** (measurement → BOQ → cost sheet → quotation → sales
> order) is already built + live. This module begins **the moment a quotation is
> accepted** and runs the delivery of the job.

---

## 1. What the brief says (condensed)

- Trading quotes: approve/reject/modify → order confirmation → pay + supply → close.
- Project quotes: enquiry → finishes/options chosen → 2D design → initial quote →
  material requirement sheet (estimation + quotation side-by-side, quote = estimate +
  variable markup) → negotiate (5–10%) → advance → 10% for 3D design → production
  drawings + bill of quantity → VOQ + vendor selection → confirm → execute.
- Site: materials dispatched → carpenter team → coordinate w/ carpenter + customer →
  note discrepancies → install → on-site alterations → appliances after install.
- Handover: final 5–10% after handover → customer signs handover form → collect
  balance → close. Capture feedback + photos.
- Ops: daily schedule of PMs + carpenters is planned and analysed; **work cards** give
  clear assignments, updated as done. A **Project Operations Manager** owns the plan.
- Three interlinked companies (trading / interior / manufacturing).

## 2. Improvements we add (beyond the brief)

1. **Formal stage gates** with entry/exit criteria + % complete, so a project can't
   silently skip a step and every stage change is logged (who/when).
2. **Payment milestones as first-class data** (not just a print line): each milestone
   has %, amount (from contract value), due trigger, and received/pending status →
   drives a live "collected vs outstanding" figure.
3. **Variation orders** — the brief has no concept of mid-project scope change, which
   is the #1 cause of interior-project disputes. We add a variation that adjusts
   contract value + re-opens the relevant milestone.
4. **Snag / defect list** at installation + a **site log** (discrepancy / alteration /
   snag) with resolved-status, so on-site issues are tracked to closure.
5. **Handover checklist + sign-off** and structured **feedback + photos** capture.
6. **Work cards + daily schedule** as a schedulable, analysable board (assignee, date,
   stage, status) so the Project Operations Manager's plan is real data, not a sheet.
7. **Company-aware** so trading / interior / manufacturing jobs are scoped per company
   and can hand off to each other (intercompany, ties to the multi-company build).

## 3. Lifecycle stages (the gate model)

| # | Stage | Enters when | Exit criteria | Key payment |
|---|-------|-------------|---------------|-------------|
| 1 | **Design** | Quotation accepted | 2D concept approved by customer | 10% booking advance |
| 2 | **Detailing (3D)** | Booking advance received | 3D + final finishes signed off | 10% design advance |
| 3 | **Production Planning** | 3D approved | Production drawings + BOQ + Material Requirement Sheet frozen | — |
| 4 | **Procurement** | MRS frozen | VOQ raised, vendors selected, POs placed | 40% order confirmation |
| 5 | **Manufacturing & Dispatch** | POs placed | Goods produced + dispatched to site | 40% before dispatch |
| 6 | **Installation** | Materials at site | Carpentry done, snags cleared, alterations done | — |
| 7 | **Appliances & Finishing** | Installation done | Appliances fitted, final finishing done | — |
| 8 | **Handover** | Finishing done | Handover form signed | final 5–10% balance |
| 9 | **Closed** | Balance collected | Feedback + photos captured | — |

Trading jobs use a short path: **Confirmed → Supplied → Closed** (payment terms per the
quote; often 100% advance or advance + balance-before-dispatch).

## 4. Data model (this build)

- **Vera Project** (parent) — the job. Links the accepted Quotation / Sales Order +
  Opportunity + Customer + Company. Holds: project_type (Trading/Interior), stage,
  status, site address, project manager + ops manager, start/target dates,
  contract_value, advance_received, % complete, and children:
  - **Vera Project Payment Milestone** — stage, label, percent, amount, trigger,
    status (Pending/Due/Invoiced/Received), received_amount, received_on.
  - **Vera Project Stage Log** — stage, entered_on, completed_on, by, notes (audit).
  - **Vera Project Site Log** — date, type (Discrepancy/Alteration/Snag), description,
    raised_by, status (Open/Resolved), resolved_on.
- **Vera Project Work Card** (own doctype, so it's schedulable/queryable) — project,
  title, stage, assigned_to, scheduled_date, priority, status (To Do/In Progress/
  Done/Blocked), instructions, completed_on, update_notes.

Payment-milestone defaults are seeded from the standard 10/40/40/10 template
(configurable) the moment a project is created from an accepted quotation, with amounts
derived from contract_value; the template is overridable per project (some jobs are
50/40/10 or 100% advance, per the brief).

## 5. Key flows

- **Create project from an accepted Quotation/Sales Order** → copies customer, company,
  value; seeds payment milestones + the stage log at Design.
- **Advance stage** → validates the exit criteria are met (or PM override w/ reason),
  stamps the stage log, recomputes % complete, and flips the milestone tied to the new
  stage to "Due".
- **Record payment** against a milestone → updates advance_received + outstanding.
- **Raise a variation** → adds/deducts contract_value, logs it, re-derives milestone
  amounts on the unpaid milestones.
- **Work cards** → PM/ops manager creates cards per stage + day; carpenter marks them
  Done; a schedule view shows the board by date + assignee for daily analysis.
- **Handover** → checklist complete + form signed → collect balance → Closed + capture
  feedback rating + photos.

## 6. Build order

1. ✅ Spec (this file).
2. ✅ `Vera Project` + 3 child tables + `Vera Project Work Card` doctypes. **LIVE.**
3. ✅ `hr_client/api/project_execution.py` — create-from-quotation, get/list, advance
   stage, record payment, variation, work-card CRUD, schedule query. **LIVE.**
4. ✅ Frontend: Project Delivery list + detail (stage tracker, payment milestones,
   site log, work cards) + Work Schedule board. **LIVE.**
5. ✅ Deploy (migrate) + verify — DONE 2026-09-23 (8 tables, E2E passed).
6. ✅ **PHASE 2 — PROCUREMENT (LIVE 2026-09-23, commit `63d0865`):** `Vera Material
   Requirement` (+line) + `Vera Procurement PO` (+line) + `project_procurement.py` —
   `build_requirement` aggregates the project's latest BOQ (carcass/shutter/finish/
   edge-band + **hardware-package expansion** into component items, est cost from
   Vendor Cost→MRP, full BOQ-line traceability) → vendor assignment → VOQ grouping →
   `generate_pos` (one PO per vendor, **intercompany-flagged** when vendor is a sibling
   Company). Frontend `/projects/:name/procurement`.

**PHASE 3+ (not built):** VOQ vendor auto-suggest (standard vendor per material);
PO → goods-receipt → site inventory; 3D/production-drawing attachments; material/
finish est-rate from a per-SFT finish-price master.

Owner-configurable inputs (build admin toggles as we go): payment-template presets,
work-card templates per stage, standard finishes price-per-SFT (ties to the SFT pricing
already in the quotation engine).
