"""Helper for vision-based extraction agents.

For vendors whose PDFs don't yield text (brochures with graphically-exploded
text, Blum's scanned pages), pages are rendered to PNG (render.py) and read by a
vision model. The model calls save_vision_rows() with the values it reads, and
this normalizes them into the same PriceRow CSV/JSON the text parsers emit — so
downstream Item/Price-List loading stays vendor-agnostic.
"""

from __future__ import annotations

import csv
import json
import os

from .schema import CANONICAL_FIELDS, VENDORS, PriceRow

OUT = os.path.join(os.path.dirname(__file__), "data", "normalized")

# fields a vision agent is allowed to fill; everything else comes from registry
_ALLOWED = {"item_code", "code_synthesized", "description", "size", "finish",
            "colour", "uom", "pack_qty", "mrp", "hsn", "source_page", "raw_line"}


def save_vision_rows(vendor_key: str, rows: list[dict]) -> dict:
    """rows: list of dicts with any of _ALLOWED keys (item_code + mrp required).
    Returns a summary; writes data/normalized/<vendor>.csv and .json.
    """
    v = VENDORS[vendor_key]
    os.makedirs(OUT, exist_ok=True)
    out, seen = [], set()
    for r in rows:
        code = str(r.get("item_code", "")).strip()
        if not code or code in seen:
            continue
        seen.add(code)
        clean = {k: r[k] for k in r if k in _ALLOWED}
        pr = PriceRow(
            vendor=v.key, brand=v.brand, gst_inclusive=v.gst_inclusive,
            price_valid_from=v.valid_from, source_file=v.filename,
            mrp=r.get("mrp"), description=str(r.get("description", "")),
            **{k: val for k, val in clean.items()
               if k not in ("mrp", "description")},
        )
        out.append(pr)

    with open(os.path.join(OUT, f"{vendor_key}.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CANONICAL_FIELDS, extrasaction="ignore")
        w.writeheader()
        for pr in out:
            w.writerow(pr.as_dict())
    with open(os.path.join(OUT, f"{vendor_key}.json"), "w") as fh:
        json.dump([pr.as_dict() for pr in out], fh, indent=1)

    return {"vendor": vendor_key, "unique_skus": len(out),
            "null_mrp": sum(1 for pr in out if pr.mrp is None)}


if __name__ == "__main__":
    # Usage: python3 -m hr_client.pricelist_import.vision_ingest <vendor> <rows.json>
    import sys
    vendor_key, rows_path = sys.argv[1], sys.argv[2]
    with open(rows_path) as fh:
        data = json.load(fh)
    print(json.dumps(save_vision_rows(vendor_key, data)))
