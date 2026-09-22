"""KSF (sinks & faucets) parser — line triplets: colour / article / MRP.

Uses the Häfele NNN.NN.NNN article namespace (dedupe against Häfele/Luxury on
load). Model + collection headers above each block become the description.
"""

from __future__ import annotations

import re

from ..schema import PriceRow, Vendor
from .base import iter_lines, parse_price

ARTICLE = re.compile(r"^\d{3}\.\d{2}\.\d{3}$")
NOISE = {"Colour / Finish", "Article No:", "Article No", "MRP (INR)", "MRP",
         "Colour", "Finish", "Colour/Finish"}


def _is_model(s: str) -> bool:
    return s.isupper() and len(s) <= 24 and any(c.isalpha() for c in s)


def parse(v: Vendor) -> list[PriceRow]:
    lines = [(p, ln.strip()) for p, ln in iter_lines(v.key)]
    rows: list[PriceRow] = []
    model, collection = "", ""
    for i, (page, s) in enumerate(lines):
        if ARTICLE.match(s):
            colour = lines[i - 1][1] if i > 0 else ""
            if colour in NOISE:
                colour = ""
            mrp = parse_price(lines[i + 1][1]) if i + 1 < len(lines) else None
            if mrp is None:
                continue
            desc = " ".join(x for x in (model, collection) if x).strip()
            rows.append(PriceRow(
                vendor=v.key, brand=v.brand, item_code=s, description=desc,
                colour=colour, mrp=mrp, gst_inclusive=v.gst_inclusive,
                price_valid_from=v.valid_from, source_file=v.filename,
                source_page=page, raw_line=f"{colour} | {s}",
            ))
        elif s.endswith("Collection") or s.endswith("Sink") or s.endswith("Sinks"):
            collection = s
        elif _is_model(s) and s not in NOISE and "SINK" not in s:
            model = s
    return rows
