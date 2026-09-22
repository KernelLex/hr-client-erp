"""Häfele parser — cleanest archetype: line-ordered blocks of
article / description(1-2 lines) / UoM / MRP.
"""

from __future__ import annotations

import re

from ..schema import PriceRow, Vendor
from .base import iter_lines, looks_like_price, parse_price

ARTICLE = re.compile(r"^\d{3}\.\d{2}\.\d{3}$")
SIZE = re.compile(r"\b\d+(?:\.\d+)?\s?mm\b", re.I)
UOM = {"KIT", "PC", "PCS", "SET", "PAIR", "NOS", "PKT", "ROLL", "MTR", "M",
       "EA", "EACH", "PACK", "BAG", "BOX", "PR", "RL"}
HEADER = {"Version", "Image", "Article", "Number", "Description", "UoM", "MRP"}


def parse(v: Vendor) -> list[PriceRow]:
    rows: list[PriceRow] = []
    cur: dict | None = None

    def flush(mrp: float, page: int):
        desc = " ".join(cur["desc"]).strip()
        size_m = SIZE.search(desc)
        rows.append(PriceRow(
            vendor=v.key, brand=v.brand, item_code=cur["code"],
            description=desc, size=size_m.group(0) if size_m else "",
            uom=cur["uom"], mrp=mrp, gst_inclusive=v.gst_inclusive,
            price_valid_from=v.valid_from, source_file=v.filename,
            source_page=page, raw_line=cur["code"],
        ))

    for page, line in iter_lines(v.key):
        s = line.strip()
        if ARTICLE.match(s):
            cur = {"code": s, "desc": [], "uom": "", "page": page}
            continue
        if cur is None:
            continue
        if looks_like_price(line):
            flush(parse_price(line), page)
            cur = None
            continue
        if s in UOM:
            cur["uom"] = s
            continue
        if s in HEADER or s.startswith("HAFELE") or re.match(r"[A-Za-z]{3} 20\d\d", s):
            continue
        cur["desc"].append(s)
    return rows
