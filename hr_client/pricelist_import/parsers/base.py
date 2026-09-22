"""Shared parsing helpers for vendor pricelist parsers."""

from __future__ import annotations

import glob
import os
import re

RAW_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "raw")

# Rupee rendered four ways across vendors (₹, `, Rs., bare) + Tataria's "/-" suffix.
_PRICE_RE = re.compile(r"[₹`]|Rs\.?|/-|,|\s")


def parse_price(token: str) -> float | None:
    """'₹ 3,375' | '₹3850/-' | ' 2,680 ' | 'Rs. 1200' -> float; None if not a price."""
    if token is None:
        return None
    cleaned = _PRICE_RE.sub("", token)
    if not cleaned or not re.fullmatch(r"\d+(\.\d+)?", cleaned):
        return None
    return float(cleaned)


def looks_like_price(line: str) -> bool:
    s = line.strip()
    return bool(s) and (s[0] in "₹`" or s.startswith("Rs") or s.endswith("/-")) \
        and parse_price(s) is not None


def page_files(vendor: str) -> list[str]:
    return sorted(glob.glob(os.path.join(RAW_DIR, vendor, "p*.txt")))


def iter_lines(vendor: str):
    """Yield (page_no, line) across a vendor's cached raw text, blanks dropped."""
    for pf in page_files(vendor):
        page_no = int(re.search(r"p(\d+)\.txt$", pf).group(1))
        with open(pf) as fh:
            for line in fh:
                line = line.rstrip("\n")
                if line.strip():
                    yield page_no, line
