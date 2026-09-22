"""Render vendor PDF pages to PNG images for vision-based extraction.

Used for the vendors where text extraction fails (brochure layouts whose text
is graphically exploded, and Blum's scanned pages). A vision model reads the
rendered page and infers model/code + MRP directly from the image.
"""

from __future__ import annotations

import os

import pymupdf

from .schema import VENDORS, Vendor

HERE = os.path.dirname(__file__)
IMG_DIR = os.path.join(HERE, "data", "images")


def render_vendor(v: Vendor, dpi: int = 170, pages: list[int] | None = None) -> list[str]:
    out_dir = os.path.join(IMG_DIR, v.key)
    os.makedirs(out_dir, exist_ok=True)
    doc = pymupdf.open(v.path)
    written = []
    for i in range(len(doc)):
        if pages and (i + 1) not in pages:
            continue
        path = os.path.join(out_dir, f"p{i + 1:04d}.png")
        doc[i].get_pixmap(dpi=dpi).save(path)
        written.append(path)
    doc.close()
    return written


if __name__ == "__main__":
    import sys
    key = sys.argv[1]
    pgs = [int(x) for x in sys.argv[2:]] or None
    for p in render_vendor(VENDORS[key], pages=pgs):
        print(p)
