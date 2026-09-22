# Pricelist Import — Quotation Module, Phase 1 (Data Foundation)

Ingests the vendor pricelists from the *"new materials for erp"* drop into one
normalized SKU schema, ready for loading into Item Master + Price Lists.

Source of truth for every vendor fact (GST treatment, effective date, layout
class, text-vs-scanned): the six-agent analysis reports in
`/home/vera/erp-analysis/`.

## Pipeline

```
PDF (source folder)  ──extract.py──▶  data/raw/<vendor>/pNNNN.txt  (+ manifest.json)
data/raw/…           ──parsers/*──▶  PriceRow stream
PriceRow stream      ──run.py────▶  data/normalized/<vendor>.csv / .json
                                     data/normalized/_all_vendors.csv
                                     data/normalized/_summary.json
```

Run from the repo root:

```bash
# stage 1 — dump raw text once (heavy PDFs opened here only)
python3 -m hr_client.pricelist_import.extract            # all text vendors
# stage 2 — parse + write normalized outputs
python3 -m hr_client.pricelist_import.run                # all built parsers
python3 -m hr_client.pricelist_import.run hafele         # one vendor
```

Requires (user-level, already installed on the server):
`pip3 install --user --break-system-packages pymupdf pdfplumber`

`PRICELIST_SRC` env var overrides the source folder
(default `/home/vera/new materials for erp`).

## Normalized schema (`schema.PriceRow`)

`vendor · brand · item_code · code_synthesized · description · size · finish ·
colour · uom · pack_qty · mrp · currency · gst_inclusive · hsn ·
price_valid_from · source_file · source_page · raw_line`

Cross-vendor rules baked in from the analysis:
- **MRP-only** — no vendor prints dealer price / discount %. Cost & discount
  inputs must come separately from the owner (Phase 0 blocker).
- **`gst_inclusive`** is per-vendor (EBCO, Luxury = inclusive; others not).
- **`hsn`** only Hettich prints it (→ carried; others need an HSN master).
- Rupee is normalized from four renderings (`₹`, `` ` ``, `Rs.`, bare, `/-`).
- One row per `item_code` in the written CSV/JSON (first wins); raw multi-row
  counts kept in `_summary.json`.

## Parser archetypes (five built, cover every layout class)

| Vendor | Parser | Archetype | Unique SKUs | HSN | Notes |
|--------|--------|-----------|------------:|:---:|-------|
| Häfele | `hafele` | line-ordered blocks | 2,801 | — | cleanest |
| Hettich | `hettich` | **coordinate** (word x/y) | 1,460 | ✅ 62 | column-shredded text |
| Tataria | `tataria` | blocks + sibling inheritance | 996 | — | `₹NNNN/-`, inherits desc/finish |
| EBCO | `ebco` | **positional** (rightmost-number MRP) | 912 | — | GST-inclusive; MRP per SPU pack; varying table width |
| KSF | `ksf` | line triplets colour/article/MRP | 161 | — | Häfele `NNN.NN.NNN` namespace |

**Total: 6,330 unique SKUs, 0 null MRP.**

## Parsers pending (Phase 1 continuation)

`kesseboehmer` (BOM sets + positional colour grids), `bosch` / `siemens` /
`reginox` / `luxury` (brochure layouts — Bosch's text is exploded to single
chars, Reginox has no codes → synthesize). Häfele/KSF/Luxury share the
`NNN.NN.NNN` namespace → dedupe on load. **`blum` is ~80 % scanned (322 MB)** —
request Blum's source Excel; do **not** blind-OCR.

## Images in the drop (analysed, non-pricelist)

The three `.jpeg`s are **not** catalog data: two are Tally financial-summary
screenshots (Vera ₹56.5 Cr sales; Hagan Modular ₹6.1 Cr — multi-company /
dashboard signal) and one is the **Vera Enterprises logo** (serif "V"
wordmark) — the letterhead asset for quotation print formats (Phase 4).

## Not committed

`data/raw/` (large, regenerable) is git-ignored. `data/normalized/` **is**
committed — it is the Phase-1 deliverable.
