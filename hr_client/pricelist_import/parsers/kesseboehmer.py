"""Kesseböhmer parser — coordinate archetype (BOM-set pricing).

Kesseböhmer's pricelist is a "PRODUCT ARTICLES" table: each sellable set is one
**BOM Article** (leftmost column) priced once, followed by several **Child
Article** component rows. The MRP *is* in the text layer — a bare integer with no
₹/comma (which is why an earlier "look for rupee/comma prices" scan missed it) —
positioned in the right-hand MRP column and vertically aligned with its BOM
Article. So we anchor on the BOM Article code, read the MRP at the same y, and
fold the description-column text of the group (first child spec = the set name)
into the description. Child components are not separately priced here, so only
the BOM set becomes a priced Item.

Columns (x-centre, points): BOM Article ~81 · Child Article ~142 ·
Description ~200-320 · Pc/Set ~336 · MRP ~384.
"""

from __future__ import annotations

import re

import pymupdf

from ..schema import PriceRow, Vendor
from .base import parse_price

_CODE_RE = re.compile(r"\d{10}")
_MRP_RE = re.compile(r"\d{4,6}")


def _cx(w) -> float:
    return (w[0] + w[2]) / 2


def parse(v: Vendor) -> list[PriceRow]:
    rows: list[PriceRow] = []
    doc = pymupdf.open(v.path)
    for pno in range(len(doc)):
        words = doc[pno].get_text("words")
        if not words:
            continue
        # BOM anchors: 10-digit code in the leftmost column.
        boms = sorted((w[1], w[4]) for w in words
                      if _CODE_RE.fullmatch(w[4]) and _cx(w) < 110)
        # MRP tokens: 4-6 digit integers in the right-hand MRP column.
        mrps = [(w[1], w[4]) for w in words
                if _MRP_RE.fullmatch(w[4]) and 360 < _cx(w) < 420]
        # Description-column words (excludes Pc/Set at ~336 and MRP at ~384).
        descs = sorted((w[1], w[0], w[4]) for w in words if 175 <= _cx(w) < 320)
        if not boms or not mrps:
            continue

        def mrp_at(y: float):
            best = None
            for my, mv in mrps:
                if abs(my - y) <= 6:
                    best = mv
            return best

        anchors = [(y, code, mrp_at(y)) for y, code in boms]
        anchors = [(y, code, m) for (y, code, m) in anchors if m is not None]
        for i, (y, code, m) in enumerate(anchors):
            y_next = anchors[i + 1][0] if i + 1 < len(anchors) else y + 130
            desc = " ".join(t for (dy, dx, t) in descs
                            if y - 12 <= dy < y_next - 6).strip()
            price = parse_price(m)
            if price is None or price <= 0:
                continue
            rows.append(PriceRow(
                vendor=v.key, brand=v.brand, item_code=code,
                description=desc or "Kesseböhmer set", mrp=price,
                gst_inclusive=v.gst_inclusive, price_valid_from=v.valid_from,
                source_file=v.filename, source_page=pno + 1, raw_line=code,
            ))
    doc.close()
    return rows
