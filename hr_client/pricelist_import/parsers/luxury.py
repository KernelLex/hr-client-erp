"""Luxury Appliances (ASKO / Falmec) parser — label-anchored brochure bands.

The PDF is a brochure but its text IS extractable: each product band emits the
labels grouped as ``Model×k`` then ``Article×k`` then ``MRP×k``, with each value
on the line immediately after its label. Article and MRP appear in the same band
order, so they pair by index; Model may be short (some rows omit it) and is
best-effort only. Uses the Häfele ``NNN.NN.NNN`` article namespace (dedupe
against Häfele/KSF on load). MRP is GST-inclusive (v.gst_inclusive).
"""

from __future__ import annotations

import re

from ..schema import PriceRow, Vendor
from .base import page_files, parse_price

ARTICLE = re.compile(r"^\d{3}\.\d{2}\.\d{3}$")
# Section headers that give the product family / finish colour context.
HEADER = re.compile(r"(RANGE|SERIES|COLLECTION)\b", re.I)
COLOUR = re.compile(r"PEARL (?:GREY|BLACK)|GRAPHITE|STAINLESS|WHITE|BLACK|ANTHRACITE", re.I)


def _flush(band, collection, v, page, rows):
    models, articles, mrps = band["model"], band["article"], band["mrp"]
    for j, (code, mrp) in enumerate(zip(articles, mrps)):
        if code is None or mrp is None:
            continue
        model = models[j] if j < len(models) else ""
        colour = ""
        cm = COLOUR.search(collection)
        if cm:
            colour = cm.group(0).title()
        desc = " ".join(x for x in (collection, model) if x).strip()
        rows.append(PriceRow(
            vendor=v.key, brand=v.brand, item_code=code,
            description=desc or model or collection, colour=colour, mrp=mrp,
            gst_inclusive=v.gst_inclusive, price_valid_from=v.valid_from,
            source_file=v.filename, source_page=page,
            raw_line=f"{model} | {code} | {mrp}",
        ))


def parse(v: Vendor) -> list[PriceRow]:
    rows: list[PriceRow] = []
    for pf in page_files(v.key):
        page = int(re.search(r"p(\d+)\.txt$", pf).group(1))
        with open(pf) as fh:
            lines = [ln.rstrip("\n").strip() for ln in fh]
        collection = ""
        band = {"model": [], "article": [], "mrp": []}

        def new_band():
            return {"model": [], "article": [], "mrp": []}

        i = 0
        while i < len(lines):
            s = lines[i]
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if s in ("Model", "Article", "MRP"):
                # A new band starts when a Model/Article follows collected MRPs.
                if s in ("Model", "Article") and band["mrp"]:
                    _flush(band, collection, v, page, rows)
                    band = new_band()
                if s == "Model":
                    band["model"].append(nxt if nxt not in ("Article", "MRP", "Model") else "")
                elif s == "Article":
                    band["article"].append(nxt if ARTICLE.match(nxt) else None)
                else:  # MRP
                    band["mrp"].append(parse_price(nxt))
                i += 2
                continue
            if HEADER.search(s) and s.isupper() and len(s) <= 60:
                collection = s
            i += 1
        if band["mrp"]:
            _flush(band, collection, v, page, rows)
    return rows
