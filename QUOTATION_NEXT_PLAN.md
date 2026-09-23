# Quotation Module — NEXT PLAN (what's left)

_Resume file. Last updated 2026-09-23. Branch `feature/quotation-module`, repo `/home/vera/vera-erp/hr-client-erp`._

> **How to resume:** read this file first, then the memory note `project-quotation-module.md`
> (full milestone log M1–M34), then `HANDOFF_MULTICOMPANY.md` + `CLAUDE.md` for base context.
> The owner's spec source of truth is `/home/vera/new materials for erp/refernces/` — revisit it
> before building; the folder = intent, we own the implementation.

---

## 0. Current status (done + LIVE at veraenterprises.in)

Quotation Studio backend + frontend is complete for the **create → cost → approve → quote →
print → convert** flow, verified end-to-end on prod (12/12 E2E). Shipped M22–M34 this session:

- Production frontend restored (monorepo `hr-client-erp/hr-frontend/` is the canonical prod app) + Pre-Quote page
- Editable cost sheet with 13-component line costing; commercial concessions + negotiated total
- Commercial-approval matrix wired into submit/approve; internal print shows routing + concessions
- Customer print made spec-complete: letterhead, section subtotals, CGST/SGST, amount-in-words,
  payment schedule, delivery/validity/warranty, inclusions/exclusions, coded T&C
- Document Link Bar (chain nav) + revision comparison
- Math regression test `hr_client/tests/verify_quotation_math.py` (9/9)

**M35 (2026-09-23, commit `eafa35b`) — configurable payment schedule (§28) built, NOT yet deployed
(schema change → pending `bench migrate` authorization).** See §1.D.

Everything below is **NOT yet built** (except §1.D which is built, pending deploy).

---

## 1. Remaining work — prioritized

### A. Project Control Screen (spec UI §5) — HIGH VALUE, larger build
A single screen that ties a customer project together. Needs a **new doctype** (e.g. `Vera Project`)
or reuse `Vera CRM Opportunity` as the anchor.
- Header: project name, customer, opportunity, site address, architect, designer, salesperson,
  PM, status, estimated value, confirmed value, target completion.
- Summary cards: Measurement / BOQ / Cost Sheet / Quotation (latest rev + status + value),
  Sales Order (confirmed value), Payment (received/outstanding), Project Margin (mgmt only).
- Action buttons (enable only when prerequisites exist): Create Measurement / BOQ / Cost Sheet /
  Quotation / Material Selection, Upload Drawing, Create Variation, View Activity.
- Backend: an aggregator endpoint returning the latest revision + status of each chain doc for a
  project/opportunity (reuse `get_document_chain` logic).

### B. Measurement product-type templates (spec UI §8–§10, PRD §10–§13, "Measurement & BOQ Masters by Product Type")
- Product-type-specific measurement UIs (Kitchen: base/wall/tall unit dims, site conditions,
  services, obstructions; Wardrobe: hinged/sliding, loft, internals).
- `Measurement Template` master driving which fields show per Product Group/Category.
- Photo capture per area (§11).
- Calc formulas per pricing method already exist (RFT/SFT/SQM/UNIT/LS) — verify against §12.

### C. Master-data build-out (PRD §5–§26) — data + dropdowns
The 29 taxonomy masters exist (M5). Still needed as **operational masters with the fields the
BOQ/costing consume**, plus seed data and wiring into BOQ config dropdowns:
- Core Material, Thickness, Carcass/Internal Finish, Shutter/External Finish, Edge Band, Glass,
  Aluminium Finish (PRD §14–§21).
- Kitchen Unit Master + Wardrobe Unit Master (standard units with default dims + pricing) (§22–§23).
- Hardware structure + Hardware Packages A/B/C (Standard/Premium/Luxury) (§24–§25).
- Pricing Methods master already has a page; confirm coverage (§26).
- Wire these as the dropdown sources in the BOQ line editor (currently free-text fields).

### D. Configurable payment schedule (spec print §28) — ✅ DONE (M35, commit eafa35b, NOT yet deployed)
~~Currently derived on the print from a fixed template.~~ BUILT: `Vera Quotation Payment Stage`
child table (stage + percent) on Vera Sales Quotation + `save_payment_schedule` endpoint (empty
clears the override) + editable Payment Schedule grid in the quotation editor + `get_quotation_print`
reads stored rows when set, else falls back to the standard 10/40/40/10 template — amount always
derived from the grand total at render time. **Schema change → needs `bench migrate` on deploy**
(deploy sequence in §2). Code-complete + committed on `feature/quotation-module`; tsc clean.

### E. Print refinements (spec print format) — medium, mostly optional toggles
- Cover page for large project quotes (§5).
- "BOQ Without Price" format toggle (§46) — technical format already omits price; add explicit option.
- Alternate options (§23) + Optional items not in grand total (§24).
- Customer selection status table (§34), Assumptions section (§33).
- Item/finish/appliance images from masters (§63–§64).
- PDF auto file-naming `VE_QTN_..._Customer.pdf` (§77) + email subject (§78).
- IGST vs CGST/SGST by **place of supply** (§68) — currently defaults to intra-state CGST/SGST split.
- Print-setting toggles (§2/§26): show/hide images, dimensions, rates, discount, brand, model.

### F. Vendor pricelists — P1 tail (owner data)
- **Blum** (322 MB, ~80% scanned) — request source Excel; do NOT blind-OCR.
- **Kesseböhmer** — BOM sets, MRP not in extractable text; needs vision + BOM disentangling OR
  owner price file. Currently 6,651 SKUs loaded from 9 vendors ("Vendor MRP" price list).

### G. Owner-data blockers
- **Dealer / cost prices** — catalogs are MRP-only; costing purchase_rate is unknown until owner
  supplies. Do NOT invent cost. (selling_rate = MRP; purchase_rate blank.)
- Confirm the Company record (Vera Enterprises) has address + GSTIN populated so the print
  letterhead (M30) shows full details.

### H. Phase-7 intercompany (see `project-multicompany` memory)
- `supplying_company` on BOQ lines → internal PO to the sibling company on Sales Order confirm.
- Seed ~6 `Intercompany Ledger Map` rows; call `intercompany.tag_intercompany()` post-import.

### I. Project execution lifecycle (owner "projects idea.txt") — whole new phase
Beyond quotation: 3D/2D design stage + 10% advance, material requirement sheet, VOQ + vendor
selection, production drawings, dispatch → site → carpenter coordination, installation, alterations,
handover form + final payment, feedback/photos. Plus PM/carpenter **work cards** + daily schedule
analysis. This is a large operations module — scope separately.

---

## 2. Deploy & resume mechanics (this box IS the server)

- Server: hostname `vera`, `192.168.1.16`, bench user `frappe` at `/home/frappe/frappe-bench`,
  site `vera.local`, supervisor-managed (`frappe-bench-web:`, `frappe-bench-workers:`).
- Public: `veraenterprises.in` via Cloudflare Tunnel → nginx serves `/var/www/hr-frontend`.
- Sudo: password `vera`; use `SUDO_ASKPASS=/tmp/askpass.sh` (a script that echoes `vera`) + `sudo -A`.
- **Deploys are by RSYNC, not git** (server app repo is an ancient no-remote copy). Doctype path on
  server is TRIPLE-nested: `apps/hr_client/hr_client/hr_client/doctype/`. Backend api path:
  `apps/hr_client/hr_client/api/`.
- **Backend deploy:** rsync changed `.py`/doctype → server → `bench --site vera.local migrate`
  (only if schema changed) → `sudo -A supervisorctl restart frappe-bench-web: frappe-bench-workers:`.
  Pure-`.py` change still needs the restart (workers cache modules); a schema change needs migrate.
- **Frontend deploy:** `cd hr-frontend && npm run build` → `rsync -a --delete dist/ → /var/www/hr-frontend`
  → `chown -R www-data`. (If `dist` is root-owned from a prior deploy, `sudo rm -rf dist` first.)
- **Verify:** `curl -s -o /dev/null -w '%{http_code}' http://localhost/` (expect 200) + grep the live
  bundle in `/var/www/hr-frontend/assets/*.js` for new strings.
- **Prod ops (migrate / DB read / DB-writing E2E) are safety-classifier gated** — need explicit user
  authorization each session (a plain "continue" does not clear them). Owner authorized on 2026-09-23.
- **E2E test pattern:** `env/bin/python` script with `frappe.init(site="vera.local",
  sites_path=".../sites")` + `frappe.connect()` + `frappe.set_user("Administrator")` +
  `frappe.form_dict["company"]="Vera Enterprises"`; call the api functions in chain; masters autoname
  `field:code` (set `code`); clean up in a `finally` + `frappe.db.commit()`. See M26/E2E in memory.

---

## 3. Key files

- Backend: `hr_client/api/quotation.py`, `cost_sheet.py`, `boq.py`, `measurement.py`,
  `sales_order.py`, `commercial_approval.py`, `quotation_terms.py`, `prequote.py`,
  `quotation_print.py` (Frappe Jinja print formats).
- Doctypes: `hr_client/hr_client/doctype/vera_*` (quotation, boq, cost_sheet, measurement,
  sales_order, + 29 taxonomy masters + inclusion/exclusion child tables).
- Frontend: `hr-frontend/src/pages/quotation/*` (editors, list pages, print page, components/),
  `hr-frontend/src/pages/prequote/*`, sidebar `components/layout/Sidebar.tsx`, routes `App.tsx`.
- Tests: `hr_client/tests/verify_quotation_math.py` (+ other `verify_*`).

---

## 4. Suggested order when resuming

1. **D** (configurable payment schedule) + finish **E** print toggles — quick, high polish, no owner data.
2. **C** master-data + BOQ dropdown wiring — makes the BOQ/costing genuinely usable (needs some owner input on standard units/packages).
3. **A** Project Control Screen — the unifying management view.
4. **B** measurement templates.
5. **F/G** owner data (Blum/Kesseböhmer, dealer prices) whenever the owner supplies it.
6. **H** intercompany, then **I** execution lifecycle as a separate phase.
