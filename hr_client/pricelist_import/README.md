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

## Parsers built (9 of 11 vendors — every text-extractable layout class)

**Text parsers** — deterministic, reproducible via `run.py`:

| Vendor | Parser | Archetype | Unique SKUs | HSN | Notes |
|--------|--------|-----------|------------:|:---:|-------|
| Häfele | `hafele` | line-ordered blocks | 2,801 | — | cleanest |
| Hettich | `hettich` | **coordinate** (word x/y) | 1,460 | ✅ 62 | column-shredded text |
| Tataria | `tataria` | blocks + sibling inheritance | 996 | — | `₹NNNN/-`, inherits desc/finish |
| EBCO | `ebco` | **positional** (rightmost-number MRP) | 912 | — | GST-inclusive; MRP per SPU pack; varying table width |
| KSF | `ksf` | line triplets colour/article/MRP | 161 | — | Häfele `NNN.NN.NNN` namespace |
| Luxury | `luxury` | **label-anchored bands** (Model/Article/MRP) | 79 | — | ASKO/Falmec brochure; GST-inclusive; Häfele namespace |

**Vision-extracted** (`parser="vision"`) — brochure layouts whose PDF text is
graphically exploded to single chars; pages rendered by `render.py`, read by a
vision model, normalized by `vision_ingest.py`. `run.py` folds the committed
`<vendor>.json` back into the combined file + summary:

| Vendor | Unique SKUs | Notes |
|--------|------------:|-------|
| Reginox | 105 | sinks, no printed codes → synthesized `REGINOX-…` codes |
| Bosch | 74 | built-in appliances |
| Siemens | 67 | appliances, freestanding + built-in |

**Total: 6,655 unique SKUs across 9 vendors, 0 null MRP.**
Häfele/KSF/Luxury share the `NNN.NN.NNN` namespace → dedupe on load.

## Parsers still pending (2 vendors — need vision-heavy work or owner source)

- **`kesseboehmer`** — BOM sets (one sellable *Child Article* = several *BOM
  Article* components + Pc/Set) over 88 pages, positional colour grids, and the
  **MRP column is not in the extractable text layer** (no rupee/comma prices
  present at all). Needs vision extraction + BOM disentangling, or the owner's
  source price file. Do **not** infer prices from the dimension numbers.
- **`blum`** — ~80 % scanned (322 MB). Request Blum's source Excel; do **not**
  blind-OCR.

## Images in the drop (analysed, non-pricelist)

The three `.jpeg`s are **not** catalog data: two are Tally financial-summary
screenshots (Vera ₹56.5 Cr sales; Hagan Modular ₹6.1 Cr — multi-company /
dashboard signal) and one is the **Vera Enterprises logo** (serif "V"
wordmark) — the letterhead asset for quotation print formats (Phase 4).

## Not committed

`data/raw/` (large, regenerable) is git-ignored. `data/normalized/` **is**
committed — it is the Phase-1 deliverable.
