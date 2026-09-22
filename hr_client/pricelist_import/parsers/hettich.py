"""Hettich parser — coordinate archetype.

Hettich's text reading-order is column-shredded, so naive line parsing fails.
We use word (x,y) positions: band words into rows by y, bucket into columns by x
(boundaries read off the header row), and anchor a record on any band that has
an article code AND a parseable MRP. Wrapped description lines below an anchor
are folded in until the next anchor.
"""

from __future__ import annotations

import re

import pymupdf

from ..schema import PriceRow, Vendor
from .base import parse_price
from .coord import band_words

# x-column boundaries (points), from the header row at ~x: Article 168 / SAP 214
# / Description 256-435 / Qty 437 / Unit 460 / PU 483 / MRP 505 / HSN 543.
COLS = [("article", 150, 212), ("sap", 212, 256), ("desc", 256, 435),
        ("qty", 435, 459), ("unit", 459, 482), ("pu", 482, 503),
        ("mrp", 503, 541), ("hsn", 541, 999)]
ARTICLE_RE = re.compile(r"^[0-9A-Z][0-9A-Z.\-/]{2,}$")


def parse(v: Vendor) -> list[PriceRow]:
    rows: list[PriceRow] = []
    doc = pymupdf.open(v.path)
    for pno in range(len(doc)):
        cur: PriceRow | None = None
        for _, cols in band_words(doc[pno].get_text("words"), COLS):
            article = " ".join(cols["article"]).strip()
            mrp = parse_price(" ".join(cols["mrp"]))
            is_anchor = bool(ARTICLE_RE.match(article)) and mrp is not None
            if is_anchor:
                cur = PriceRow(
                    vendor=v.key, brand=v.brand, item_code=article,
                    description=" ".join(cols["desc"]).strip(), mrp=mrp,
                    uom=" ".join(cols["unit"]).strip(),
                    pack_qty=" ".join(cols["pu"]).strip(),
                    hsn=" ".join(cols["hsn"]).strip(),
                    gst_inclusive=v.gst_inclusive, price_valid_from=v.valid_from,
                    source_file=v.filename, source_page=pno + 1, raw_line=article,
                )
                rows.append(cur)
            elif cur is not None and cols["desc"] and not article:
                cur.description = (cur.description + " " + " ".join(cols["desc"])).strip()
    doc.close()
    return rows
