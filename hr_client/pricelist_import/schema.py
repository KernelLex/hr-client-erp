"""Normalized vendor-pricelist schema + vendor registry.

Phase 1 of the Quotation-module build. Every vendor PDF in the
"new materials for erp" drop is reduced to a stream of PriceRow records with a
single canonical shape, so downstream Item Master / Price List loading is
vendor-agnostic.

All source facts (GST treatment, effective date, parser class, text vs scanned)
come from the six-agent analysis reports in /home/vera/erp-analysis/.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, asdict
from typing import Optional

# The extracted resource folder lives outside the repo; override with env var.
SOURCE_DIR = os.environ.get("PRICELIST_SRC", "/home/vera/new materials for erp")

CANONICAL_FIELDS = [
    "vendor",          # registry key, e.g. "hafele"
    "brand",           # marketing brand shown to customer
    "item_code",       # vendor article/SKU code; synthesized if the vendor gives none
    "code_synthesized",  # True when item_code was generated, not printed
    "description",
    "size",
    "finish",
    "colour",
    "uom",             # SET / PC / NOS ...
    "pack_qty",        # MOQ / box / SPU packing unit
    "mrp",             # numeric INR, tax treatment per gst_inclusive
    "currency",        # always INR here
    "gst_inclusive",   # True if mrp already includes GST (EBCO, Luxury)
    "hsn",             # only Hettich prints HSN; else None
    "price_valid_from",  # ISO date string
    "source_file",
    "source_page",     # 1-based
    "raw_line",        # provenance for audit
]


@dataclass
class PriceRow:
    vendor: str
    description: str
    mrp: Optional[float]
    item_code: str = ""
    code_synthesized: bool = False
    brand: str = ""
    size: str = ""
    finish: str = ""
    colour: str = ""
    uom: str = ""
    pack_qty: str = ""
    currency: str = "INR"
    gst_inclusive: bool = False
    hsn: str = ""
    price_valid_from: str = ""
    source_file: str = ""
    source_page: int = 0
    raw_line: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class Vendor:
    key: str
    brand: str
    filename: str            # relative to SOURCE_DIR
    parser: str              # module name under parsers/, or "" if not yet built
    gst_inclusive: bool = False
    valid_from: str = ""     # ISO date
    text_extractable: bool = True   # False => needs OCR / source feed
    note: str = ""

    @property
    def path(self) -> str:
        return os.path.join(SOURCE_DIR, self.filename)


# Registry — order roughly by ingestion priority (clean text vendors first).
VENDORS: dict[str, Vendor] = {v.key: v for v in [
    Vendor("hafele", "Häfele", "Pricelist -2026/HAFELE PRICELIST_MRP revision Eff 1st Feb 2026 (1).pdf",
           parser="hafele", valid_from="2026-02-01", note="~2.8k SKUs, cleanest tabular"),
    Vendor("tataria", "Tataria", "Tataria Price List 01-09-2026.pdf",
           parser="tataria", valid_from="2026-09-01", note="~1.2k SKUs, 7-col table, MRP as Rs.NNNN/-"),
    Vendor("ebco", "EBCO", "Pricelist -2026/EBCO MRP dt. 27th January 2025.pdf",
           parser="ebco", gst_inclusive=True, valid_from="2025-01-27",
           note="~910 SKUs captured (positional MRP), GST-INCLUSIVE per SPU pack, verify still current"),
    Vendor("hettich", "Hettich", "Pricelist -2026/Hettich Price List February 2026.pdf",
           parser="hettich", valid_from="2026-02-01",
           note="~2.5k SKUs, ONLY vendor with HSN, column-shredded text"),
    Vendor("kesseboehmer", "Kesseböhmer", "Pricelist -2026/New pricelist_kesseboehmer.pdf",
           parser="kesseboehmer", valid_from="2026-05-01",
           note="BOM-set pricing; MRP is in the text layer as bare integers (no rupee/comma, "
                "so earlier scans missed it) — coordinate parser anchors BOM Article to its "
                "aligned MRP. 261 sellable sets, child components not separately priced."),
    # --- registered but parser pending (Phase 1 continuation) ---
    Vendor("bosch", "Bosch", "Bosch_BI_Pricelist_BI_Distribution.pdf",
           parser="vision", text_extractable=False,
           note="brochure, text exploded to single chars -> vision-extracted (render.py + vision_ingest.py)"),
    Vendor("siemens", "Siemens", "Pricelist -2026/Siemens Price list (4).pdf",
           parser="vision", text_extractable=False, valid_from="2026-09-01",
           note="brochure, freestanding 2026-08-01 / built-in 2026-09-01 split -> vision-extracted"),
    Vendor("reginox", "Reginox", "Pricelist -2026/Reginox Price List 2026 September.pdf",
           parser="vision", text_extractable=False, valid_from="2026-09-01",
           note="sinks, NO article codes -> synthesized codes, vision-extracted"),
    Vendor("luxury", "ASKO/Falmec", "Pricelist -2026/Luxury Appliances Pricelist Retailer Version May 2026 (1).pdf",
           parser="luxury", gst_inclusive=True, valid_from="2026-05-20",
           note="ASKO/Falmec brochure, label-anchored bands, Häfele article namespace, GST-incl"),
    Vendor("ksf", "KSF", "Pricelist -2026/KSF Price List_2026.pdf",
           parser="ksf", note="sinks & faucets, Häfele article namespace, colour variants"),
    Vendor("blum", "Blum", "Pricelist -2026/Blum India Pricelist 2025 V7.pdf",
           parser="", text_extractable=False,
           note="322MB, ~80% scanned -> request Blum source Excel, do NOT OCR blind"),
]}
