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

- **M35 (`eafa35b`) — configurable payment schedule (§28). ✅ DEPLOYED LIVE 2026-09-23** (bench migrate
  clean, child table live, site 200). See §1.D.
- **M36 (`b21bf8d`) — print-setting toggles + PDF auto file-naming (§2/§26/§77).** Frontend-only, built,
  committed, **NOT yet deployed** (prod-deploy classifier gate — needs authorization). See §1.E.
- **M37 (`2fc0ed8`) — Project Control Screen (§5) core.** Backend aggregator + 2 React pages, **no
  schema**, built, committed, **NOT yet deployed** (same gate). See §1.A.

- **M38 (`f4a9460`) — Project Control next-stage action buttons (§5).** LIVE.
- **M39 (`11e932f`) — BOQ line spec dropdowns from masters (§4.3/§4.7, item C core).** LIVE.
- **M40 (`af10e03`) — Assumptions section (§33).** Built. SCHEMA.
- **M41 (`8a1b5f3`) — IGST vs CGST/SGST by place of supply (§68).** Built. SCHEMA.
- **M42 (`55e4d6a`) — Optional / alternate line items (§23/§24).** Built. SCHEMA (line field).
- **M43 (`e74f018`) — Project header fields + inline edit (§5).** Built. SCHEMA (opportunity fields).
- **M44 (`246af28`) — Optional cover page on customer print (§5).** Built. code-only.
- **M45 (`5cf8ba3`) — "Hide all prices" print toggle / BOQ without price (§46).** Built. frontend-only.
- **M46 (`a315fef`) — Payment rollup on Project Control (§5).** Built. code-only (uses advance_received).
- **Item J (`c362197`+`a2e25b2`+`130c258`+`562de64`+`e8450ae`) — reclaimed / returned materials
  inventory** (doctypes + reuse matcher + BOQ-editor "reusable stock" panel + one-click return-to-inventory
  + "Waste Avoided" KPI). Built. SCHEMA (`Vera Reclaimed Material` + image child). See §J.
- **M47 (`57dd895`) — Measurement product-type templates (§8–§10, item B).** `Vera Measurement Template`
  + row child doctypes + `measurement_template.py` API + MeasurementEditor wiring. Built. SCHEMA. See §B.
- **M48 — Enriched measurement templates (item B).** Realistic 7-template seed set + `description` on the
  template row child (carried through `apply_template`). Built. SCHEMA (added field to template row child). See §B.
- **M49 — Studio master catalogue seed (item C).** `quotation_masters.seed_studio_masters()` — 87 generic
  rows (materials/finishes/hardware/units, no prices) so the BOQ spec dropdowns work. Data-only. See §C.
- **M50 — Material-reuse feature completed (item J).** `reclaimed.get_reuse_savings()` cost-savings
  dashboard + BOQ-editor one-click Reserve on reuse suggestions + "Reuse impact" panel on Reclaimed page.

**✅ WHOLE BATCH DEPLOYED LIVE + VERIFIED 2026-09-23 (M40–M50 + Item J).** rsync backend (6 API files +
boq.py + 4 new doctype dirs + 3 modified doctype JSONs) → DB backup → `bench migrate` (clean; 4 new tables:
Vera Measurement Template/Row, Vera Reclaimed Material/Image; new columns assumptions/place_of_supply on
quotation, is_optional on line, site_address+ on opportunity) → supervisor restart → seeds
(`quotation_taxonomy.seed_all` idempotent-0, `quotation_masters.seed_studio_masters` = 13/27/20/27,
`measurement_template.seed_default_templates` = 7) → frontend rebuild+rsync → site 200.
VERIFIED live: `get_boq_options` returns 13 materials / 27 finishes / 20 hardware / 27 units / 11 cats /
11 areas; reuse dashboard + templates respond; served bundle has the reuse UI.
⚠ **DISCOVERY:** M39's backend (`boq.get_boq_options`/`_master_names`) was NEVER actually on prod (server
`boq.py` was 47 lines short — the frontend dropdown call had been 404-ing). Deployed boq.py this pass; the
only diff vs repo was exactly the M39 block (no server-only changes clobbered).
GOTCHA logged: the studio masters are **company-scoped on the live server** (mandatory `company` field)
though the repo doctype JSON is company-less → `seed_studio_masters._seed_rows` now sets company when the
field exists (fix commit after M49). Migrate needed for M40/M41/M42/M43 (new fields on
quotation, quotation line, opportunity), Item J (`Vera Reclaimed Material` + child), and M47 (`Vera
Measurement Template` + row child). M44/M45/M46 are code-only. Deploy = rsync changed py + doctype dirs +
migrate + supervisor restart + frontend rebuild/rsync; verify site 200. **Prod deploy is classifier-gated
+ irreversible → needs explicit owner authorization this session before running.**

Everything below is built except where marked NOT yet built (owner-data or large separate phases).

---

## 1. Remaining work — prioritized

### A. Project Control Screen (spec UI §5) — ✅ CORE DONE (M37, commit 2fc0ed8, NOT yet deployed; no schema)
BUILT (anchored on `Vera CRM Opportunity`, no new doctype): `hr_client/api/project_overview.py` —
`get_project_overview(opportunity)` rolls up the latest non-superseded revision + status + value of
each chain doc (Measurement/BOQ/Cost Sheet/Quotation/Sales Order); `list_projects()` returns the
ArchetypePage payload; company-scoped via the kernel. Frontend: `ProjectsPage` (list) +
`ProjectControlPage` (header w/ estimated/quoted/confirmed value + 5 stage rollup cards, jump into
each stage) + routes `/quotation/projects[/:name]` + sidebar "Projects". Read-only aggregation, **no
migrate needed** — deploy = rsync `project_overview.py` + supervisor restart + frontend rebuild/rsync.
REMAINING (later, needs schema/owner design): site address / architect / designer / PM header fields;
Payment received/outstanding card; action buttons to CREATE the next stage from this screen;
Create-Variation / Upload-Drawing / activity feed.

### B. Measurement product-type templates (spec UI §8–§10, PRD §10–§13) — ✅ DONE (M47+M48, NOT deployed; SCHEMA)
BUILT (M47 `57dd895`): `Vera Measurement Template` + `Vera Measurement Template Row` doctypes,
`measurement_template.py` API (`seed_default_templates` / `list_templates` / `apply_template` — seeds a
draft measurement's rows, append or replace), MeasurementEditor "Start from a template" picker.
ENRICHED (M48): realistic 7-template seed set (Kitchen — Standard 8 rows; Wardrobe — Hinged; Wardrobe —
Sliding; TV Unit; Vanity; Crockery/Storage; Study/Office), each row annotated; added `description` field
to the template row child + carried through `apply_template` so a survey starts pre-annotated. Schema →
needs migrate + `seed_default_templates` on deploy. Note: the Measurement Sheet already has structured
`obstructions` + `services` child tables (site conditions handled there).
REMAINING (later): per-area photo capture (§11); verify calc formulas per pricing method
(RFT/SFT/SQM/UNIT/LS) against §12; owner refinement of the seed templates.

### C. Master-data build-out (PRD §5–§26) — data + dropdowns — ✅ SEED DONE (M49, NOT deployed; data-only)
The 29 taxonomy masters exist (M5) and `quotation_taxonomy.seed_all()` seeds ~26 of them. M39 wired the
BOQ line spec dropdowns to masters via `boq.get_boq_options` → `_master_names` (company-safe: only scopes
where the master has a company column — the studio masters don't, so they're global).
GAP FIXED (M49): the four **operational** masters the BOQ dropdowns actually read
(`Vera Quotation Material/Finish/Hardware/Unit`) shipped EMPTY. Added
`quotation_masters.seed_studio_masters()` — a generic industry-standard catalogue (13 core materials,
27 carcass+shutter finishes, 20 hardware items, 27 units) drawn from spec §14-§26 + `initiation.txt`
§IV-§IX, with each unit's default pricing method (§48). **NO prices/brands** — rates are owner data (cost
sheet / price list). Data-only (no schema) → after deploy run
`bench execute hr_client.api.quotation_masters.seed_studio_masters` + `quotation_taxonomy.seed_all`.
REMAINING (later): Edge Band / Glass / Aluminium finish already have taxonomy masters + seed (via
`seed_all`); Hardware Packages A/B/C (Standard/Premium/Luxury) as bundles (§24-§25, needs owner tiers);
owner refinement of the catalogue + real rates.

### D. Configurable payment schedule (spec print §28) — ✅ DONE (M35, commit eafa35b, NOT yet deployed)
~~Currently derived on the print from a fixed template.~~ BUILT: `Vera Quotation Payment Stage`
child table (stage + percent) on Vera Sales Quotation + `save_payment_schedule` endpoint (empty
clears the override) + editable Payment Schedule grid in the quotation editor + `get_quotation_print`
reads stored rows when set, else falls back to the standard 10/40/40/10 template — amount always
derived from the grand total at render time. **Schema change → needs `bench migrate` on deploy**
(deploy sequence in §2). Code-complete + committed on `feature/quotation-module`; tsc clean.

### E. Print refinements (spec print format) — partly done (M36)
- ✅ **DONE (M36, commit b21bf8d, NOT yet deployed; frontend-only):** Print-setting toggles (§2/§26 —
  show/hide dimensions, per-line rates, discount line; Section-Total colSpan recomputes) + PDF auto
  file-naming `VE_QTN_<name>_Rev<nn>_<Format>` via `document.title` (§77).
- Remaining: Cover page for large project quotes (§5). "BOQ Without Price" (§46 — technical already
  omits price; add explicit option). Alternate options (§23) + Optional items not in grand total (§24).
  Customer selection status table (§34), Assumptions section (§33). Item/finish/appliance images
  from masters (§63–§64). Email subject (§78). IGST vs CGST/SGST by **place of supply** (§68 —
  currently intra-state split); needs a place-of-supply/customer-state field (schema).

### F. Vendor pricelists — P1 tail (owner data)
- **Blum** (322 MB, ~80% scanned) — request source Excel; do NOT blind-OCR.
- **Kesseböhmer** — BOM sets, MRP not in extractable text; needs vision + BOM disentangling OR
  owner price file. Currently 6,651 SKUs loaded from 9 vendors ("Vendor MRP" price list).

### G. Owner-data blockers
- **Dealer / cost prices** — catalogs are MRP-only; costing purchase_rate is unknown until owner
  supplies. Do NOT invent cost. (selling_rate = MRP; purchase_rate blank.)
- Confirm the Company record (Vera Enterprises) has address + GSTIN populated so the print
  letterhead (M30) shows full details. **Address FOUND** (2026-09-23, from `Ledger Formate.pdf` in the
  spec folder): _Vera Enterprises — No. 535/3, Ground Floor, 3rd Main, 'A' Block, Rajajinagar 2nd Stage,
  Bengaluru – 560010_ (Schönes Leben = 2nd Floor, same building). GSTIN still needed from owner. To apply:
  set the Company doc's address (prod DB write → needs deploy auth); not yet done.
- **Real quote format reference** (spec folder `Mr. Venkatesh Adiga Quote -20022024.pdf`): area-grouped
  (A/B/C… per room), description = `PRODUCT — <Finish> FINISH  W*D*H` mm, columns `Sr | Item Description |
  Qty | Rates (Rs) | Total (Rs)`; Kitchen shows Internal + External finish lines. Matches current customer
  print (M28-M30); use to validate.

### H. Phase-7 intercompany (see `project-multicompany` memory)
- `supplying_company` on BOQ lines → internal PO to the sibling company on Sales Order confirm.
- Seed ~6 `Intercompany Ledger Map` rows; call `intercompany.tag_intercompany()` post-import.

### J. Reclaimed / returned materials inventory — ✅ COMPLETE & LIVE (M50, deployed 2026-09-23)
User-requested waste-reduction feature. `Vera Reclaimed Material` (+ image child) logs returned/
rejected/surplus stock with full spec (material/finish/colour/thickness/edge, W×H×D, qty, condition,
salvage value), storage location (warehouse/rack/bin), multiple photos, and an Available→Reserved→
Reused→Scrapped lifecycle. `reclaimed.py` reuse matcher scans open BOQ lines and scores material/
finish/thickness + dimension-fit (a piece can be cut down, not up) so a returned piece surfaces the
current jobs it can be reused on, each reservable in a click. Frontend: list + detail (spec form,
image gallery, "Where it can be used" panel). **M50 completed the loop:** `get_reuse_savings()`
cost-savings dashboard (waste avoided = Σ salvage of Reused pieces, reusable-on-hand value, per-material
breakdown, recent reused) surfaced as a "♻ Reuse impact" panel on the Reclaimed list; BOQ editor already
auto-suggests reclaimed stock per line (`suggest_for_boq`) and now each suggestion has a one-click
**Reserve** (reserves the piece for the BOQ's opportunity in place). All LIVE. REMAINING (nice-to-have):
QR/barcode labels, a Storage Location master, mark-reused straight from the BOQ once a line is built.

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
