"""Stage 1: dump raw per-page text from each vendor PDF into data/raw/<vendor>/.

Kept separate from parsing so the heavy PDFs (Blum is 322 MB) are opened once.
Also emits a manifest recording page count and how many pages carry extractable
text vs are scanned images — the signal that decides OCR need.
"""

from __future__ import annotations

import json
import os

import pymupdf  # noqa: import name for modern PyMuPDF

from .schema import VENDORS, Vendor

HERE = os.path.dirname(__file__)
RAW_DIR = os.path.join(HERE, "data", "raw")


def extract_vendor(v: Vendor) -> dict:
    """Write one text file per page and return a manifest entry."""
    out_dir = os.path.join(RAW_DIR, v.key)
    os.makedirs(out_dir, exist_ok=True)
    if not os.path.exists(v.path):
        return {"vendor": v.key, "error": f"source missing: {v.path}"}

    doc = pymupdf.open(v.path)
    pages, text_pages, image_pages = len(doc), 0, 0
    for i in range(pages):
        text = doc[i].get_text("text")
        if len(text.strip()) >= 40:      # real content, not just a page number
            text_pages += 1
        else:
            image_pages += 1
        with open(os.path.join(out_dir, f"p{i + 1:04d}.txt"), "w") as fh:
            fh.write(text)
    doc.close()

    return {
        "vendor": v.key,
        "brand": v.brand,
        "file": v.filename,
        "pages": pages,
        "text_pages": text_pages,
        "image_pages": image_pages,
        "pct_text": round(100 * text_pages / pages, 1) if pages else 0,
        "gst_inclusive": v.gst_inclusive,
        "valid_from": v.valid_from,
        "parser": v.parser or None,
    }


def run(only: list[str] | None = None) -> list[dict]:
    os.makedirs(RAW_DIR, exist_ok=True)
    manifest = []
    for key, v in VENDORS.items():
        if only and key not in only:
            continue
        if not v.text_extractable:
            manifest.append({"vendor": key, "skipped": "needs OCR / source feed",
                             "file": v.filename})
            continue
        print(f"[extract] {key} ...", flush=True)
        manifest.append(extract_vendor(v))
    with open(os.path.join(RAW_DIR, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    return manifest


if __name__ == "__main__":
    import sys
    for row in run(sys.argv[1:] or None):
        print(json.dumps(row))
