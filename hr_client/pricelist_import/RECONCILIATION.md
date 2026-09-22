# Quotation Module — Master/DocType Reconciliation (Phase 1 tail)

_Prerequisite the plan demands before building the ~40 masters: map every
blueprint DocType (`/home/vera/erp-analysis/04-design-specs.md` §2–§3) to what
**already exists** in the repo, so we **extend, not duplicate**. Generated
2026-09-22 against the 79 doctypes on branch `feature/quotation-module`._

## Verdict in one line

The Phase-2 "Quotation Studio" already ships the **4-document spine + Sales
Order + CRM + Terms + 6 config masters**, but every one of those masters is a
**simplified** cut, and **~40 blueprint masters + the priced Item/Price-List
layer are entirely absent**. Nothing that carries a **price** exists yet — which
is exactly the home the 6,655 ingested SKUs need.

---

## A. Transaction DocTypes

| Blueprint (§2.1) | Status | Existing doctype(s) | Gap / action |
|---|---|---|---|
| Opportunity | **EXISTS** | `vera_crm_opportunity` | verify field parity; likely OK |
| Project / Project Area | **NET-NEW** | — | no `vera_project`; areas only live as a measurement child |
| Pre-Quote | **NET-NEW** | — | P6 item |
| Measurement Sheet | **PARTIAL** | `vera_measurement_sheet` (+`_row`, `_obstruction`, `_service`) | already has revision chain (`revision`, `supersedes`, `stage`, `status`) + 3 children; gap = dynamic **Attribute (k/v)** child + Area/Detail granularity (today just flat `rows`) |
| Project BOQ | **PARTIAL** | `vera_boq` + `vera_boq_line` | missing Section / **Hardware / Appliance / Stone / Service** child tables; line has core config but no `source_measurement_line_id`, glass/aluminium/edge-band links |
| Cost Sheet | **PARTIAL** | `vera_cost_sheet` + `_line` | line is 6 fields (`area,unit_name,item_code,calc_qty,cost_rate,cost_amount`); blueprint wants full cost breakdown (material/finish/hardware/labour/install/transport/overhead) + GP engine (`target_gp,suggested_selling_price,gp_percent,margin_status`) |
| Quotation | **PARTIAL** | `vera_sales_quotation` + `_line` + `_approval` | line lacks the hidden-internal trace fields (`cost_sheet_line_id,estimated_cost,gross_profit,gp_percent,margin_status`); need Section-Summary / Payment-Schedule / Inclusion / Exclusion / Term children + full tax/total block |
| Sales Order | **PARTIAL** | `vera_sales_order` + `_line` | exists (multi-co Phase 7 added `supplying_company`); verify commercial-baseline lock fields |
| Variation Request | **NET-NEW** | — | P-later |
| Project Material Selection | **NET-NEW** | — | — |
| Project Drawing | **NET-NEW** | — | — |
| Configured Unit | **NET-NEW** | — | advanced/Phase-2 |
| (CRM: Lead/Enquiry/Contact/Follow-up/Approval) | **EXISTS** | `vera_crm_*` | reuse |

## B. Master DocTypes (§3.1, ~40) — grouped by status

**EXISTS but simplified — EXTEND (add rate/hierarchy/effective-date fields):**
| Blueprint master | Existing | Missing vs blueprint |
|---|---|---|
| Unit Type | `vera_quotation_unit` | company/global, effective-from/to, sort |
| Material (Core) | `vera_quotation_material` | **purchase_rate, selling_rate, mrp, gst_rate, hsn, default_supplier, valid_from/until** |
| Finish | `vera_quotation_finish` | brand, collection, substrate, **purchase_rate/selling_rate/rate_uom split**, sample |
| Hardware Item | `vera_quotation_hardware` | 4-level Category→Brand→Series→Item is flattened; no rate, package, qty-rule |
| Pricing Method | `vera_quotation_pricing_method` | looks adequate (`code,method,formula,uom`) |
| Measurement/Spec Template | `vera_quotation_template` (`code,template_name,applies_to,dynamic_fields`) | **unifies** Measurement Template + Specification Template via `applies_to`/`dynamic_fields` — reuse; may need a typed field/components child for richer specs |
| Terms Template (+clause) | `vera_terms_template`, `vera_terms_clause`, `vera_terms_template_clause` | **good coverage — reuse** |

**REUSE NATIVE ERPNext — do NOT build custom:**
`UOM`, `Price List`, `Item` + `Item Price`, `Customer Group`, `Payment Term
Template`, Tax templates, `Supplier`. (Blueprint §9 + cross-agent notes confirm.)

**NET-NEW (absent — must build):** Product Group, Product Category, Component,
Material Thickness (child) / Thickness, Finish Category, Finish Type,
Finish-Material Compatibility, Edge Band, Glass, Aluminium Profile, Hardware
Category / Brand / Series, Hardware Package (+items child), Hardware Quantity
Rule, Appliance Category / Brand / **Appliance**, Stone Type / Brand / **Stone** /
Edge Profile / Fabrication Service, **Sink**, **Faucet**, Specification Template,
Area, Wall/Location, Obstruction Type, Service Point, Edge Application Rule,
Material Consumption Rule, **Wastage**, Cost Type, Cost Source, **Margin (class)**,
Installation Type, Service, Delivery Term, Warranty Template, Inclusion,
Exclusion, BOQ Template, Product Configuration Rule, Mandatory/Validation Rule,
**Commercial Approval Rule**.

---

## C. Where the 6,655 ingested SKUs land (the immediate decision)

The pricelist rows carry `vendor, brand, item_code, description, size, finish,
colour, uom, pack_qty, mrp, gst_inclusive, hsn, price_valid_from`. **Nothing in
the repo stores a price today.** Two candidate homes:

1. **Native ERPNext `Item` + `Item Price`** (recommended for the *purchasable*
   SKUs — hardware, appliances, sinks/faucets, finish-as-item). Map: vendor →
   `Supplier`, mrp → `Item Price` on a **"Vendor MRP"** Price List with
   `valid_from`, hsn → Item, gst_inclusive → per-price-list flag. Gets multi
   price-list + effective-date + Sales-Order/BOM wiring for free (blueprint §9
   says reuse standard Item/Price List). Keeps the config masters (Unit Type,
   Package) referencing Items.
2. **Extend `vera_quotation_material/finish/hardware`** with rate fields and load
   there. Simpler short-term but re-implements what Item Price already does and
   fragments pricing across 3 masters.

**Recommendation: (1).** But it depends on a **still-open P0 blocker** — dealer
price / discount % (catalogs are **MRP-only**; MRP alone can't drive Cost Sheet
`purchase_rate`). Until the owner supplies cost/discount, load MRP into the
"Vendor MRP" list as reference and treat `selling_rate` = MRP, `purchase_rate` =
unknown. **Do not invent cost.**

## D. Recommended build order (unblocked vs P0-gated)

**Can build now (no owner input needed):** the hierarchy/taxonomy masters —
Product Group, Product Category, Component, Thickness, Finish Category/Type, Edge
Band, Glass, Aluminium, Hardware Category/Brand/Series, Appliance Category/Brand,
Stone Type/Brand/Edge Profile, Area, Obstruction Type, Service Point, Installation
Type, Delivery Term, UOM groups (native). These are pure enumerations from §3.

**P0-gated (need owner decisions first):** Margin classes, Wastage defaults,
Commercial Approval Rule thresholds (discount%/GP/value bands), Price List cost
side, dealer/discount data, canonical numbering, multi-brand (VE bills / Schönes
Leben sells) rules. See `project-phase2-spec` + `project-quotation-module` P0.

**Sequence:** taxonomy masters → priced Item/Price-List load (MRP) → extend the 4
core docs' children + trace fields → costing/approval engine (P0-gated) → print
formats → UI port.
