"""Tataria parser — block layout with sibling inheritance.

A full record is  code / desc-lines / size / finish-lines / '₹NNNN/-' / 'N Set'.
Sibling rows under the same product repeat only  code / size / price / pack  and
inherit description + finish from the preceding full row.
"""

from __future__ import annotations

import re

from ..schema import PriceRow, Vendor
from .base import iter_lines, parse_price

CODE = re.compile(r"^[A-Z]{1,4}-[0-9][0-9A-Z.]*$")
PRICE = re.compile(r"^₹\s?\d[\d,]*\s?/-$")
PACK = re.compile(r"^\d+\s?(Set|Pc|Pcs|Pair|Nos|Pkt|Box)s?$", re.I)
SIZE = re.compile(r"^\(?\d+(?:\.\d+)?\s?mm\b", re.I)
HEADER = {"PRODUCT", "CODE", "DESCRIPTION", "SIZE", "FINISH", "M.R.P.",
          "BOX", "PACK", "BOX/", "M.R.P"}


def _skip(s: str) -> bool:
    return (s in HEADER or s.startswith("www.") or "www.tataria" in s
            or s.startswith("Set Consist") or bool(re.match(r"^\d+\s?\|", s)))


def parse(v: Vendor) -> list[PriceRow]:
    rows: list[PriceRow] = []
    code = ""
    middle: list[str] = []
    last_desc = ""

    for page, line in iter_lines(v.key):
        s = line.strip()
        if _skip(s):
            continue
        if PRICE.match(s):
            if not code:
                continue
            size = next((m for m in middle if SIZE.match(m)), "")
            desc_parts = [m for m in middle if not SIZE.match(m)]
            desc = " ".join(desc_parts).strip()
            if not desc:                       # sibling row -> inherit
                desc = last_desc
            else:
                last_desc = desc
            rows.append(PriceRow(
                vendor=v.key, brand=v.brand, item_code=code, description=desc,
                size=size, mrp=parse_price(s), gst_inclusive=v.gst_inclusive,
                price_valid_from=v.valid_from, source_file=v.filename,
                source_page=page, raw_line=f"{code} | {s}",
            ))
            middle = []
            continue
        if PACK.match(s):
            if rows:
                rows[-1].pack_qty = s
            continue
        if CODE.match(s):
            code = s
            middle = []
            continue
        middle.append(s)
    return rows
