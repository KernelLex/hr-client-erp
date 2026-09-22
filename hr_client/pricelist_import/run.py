"""Stage 2/3 orchestrator: parse each vendor that has a parser and write
normalized CSV + JSON to data/normalized/, plus a combined file and a summary.

Usage (from repo root):
    python3 -m hr_client.pricelist_import.run              # all parsers
    python3 -m hr_client.pricelist_import.run hafele       # one vendor
    python3 -m hr_client.pricelist_import.extract ...      # (re)build raw text first
"""

from __future__ import annotations

import csv
import importlib
import json
import os

from .schema import CANONICAL_FIELDS, VENDORS, PriceRow

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "data", "normalized")


def _dedupe(rows: list[PriceRow]) -> list[PriceRow]:
    """One row per item_code (first wins) for Item-Master loading."""
    seen, out = set(), []
    for r in rows:
        if r.item_code in seen:
            continue
        seen.add(r.item_code)
        out.append(r)
    return out


def _write_csv(path: str, rows: list[PriceRow]) -> None:
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CANONICAL_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r.as_dict())


def run(only: list[str] | None = None) -> dict:
    os.makedirs(OUT, exist_ok=True)
    summary, combined = [], []
    for key, v in VENDORS.items():
        if only and key not in only:
            continue
        if not v.parser:
            summary.append({"vendor": key, "status": "parser pending", "note": v.note})
            continue
        try:
            mod = importlib.import_module(f".parsers.{v.parser}", __package__)
            rows = mod.parse(v)
        except Exception as exc:  # one bad vendor must not abort the batch
            summary.append({"vendor": key, "status": "error", "error": repr(exc)})
            print(f"[run] {key:12s} ERROR {exc!r}")
            continue
        deduped = _dedupe(rows)
        _write_csv(os.path.join(OUT, f"{key}.csv"), deduped)
        with open(os.path.join(OUT, f"{key}.json"), "w") as fh:
            json.dump([r.as_dict() for r in deduped], fh, indent=1)
        combined.extend(deduped)
        summary.append({
            "vendor": key, "status": "ok", "raw_rows": len(rows),
            "unique_skus": len(deduped),
            "null_mrp": sum(1 for r in deduped if r.mrp is None),
            "with_hsn": sum(1 for r in deduped if r.hsn),
            "gst_inclusive": v.gst_inclusive, "valid_from": v.valid_from,
        })
        print(f"[run] {key:12s} {len(deduped):5d} SKUs")
    if not only:
        _write_csv(os.path.join(OUT, "_all_vendors.csv"), combined)
    with open(os.path.join(OUT, "_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)
    return {"vendors": summary, "total_skus": len(combined)}


if __name__ == "__main__":
    import sys
    res = run(sys.argv[1:] or None)
    print(json.dumps(res, indent=2))
