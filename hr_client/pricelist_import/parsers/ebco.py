"""EBCO parser — coordinate archetype, GST-inclusive.

EBCO's table WIDTH varies page to page (MRP lands anywhere from x~280 to x~480),
so fixed columns miss most rows. Instead we band words by row, find the ITEM-CODE
token, then take the RIGHTMOST pure-number token as MRP and the next one left as
the SPU pack size. MRP is printed per SPU pack (e.g. '389 /81pc' => Rs389/81pcs).
"""

from __future__ import annotations

import re

import pymupdf

from ..schema import PriceRow, Vendor
from .base import parse_price
from .coord import band_words

# One coarse column just to locate the code; MRP/SPU are found positionally.
COLS = [("all", 0, 9999)]
CODE_RE = re.compile(r"^[A-Z]{1,5}\d?-?[0-9A-Z.]+$")
# finish/material tokens that pass the loose code test but are NOT product codes
NOT_CODE = {"SS304", "SS202", "MS", "ZW", "CL", "IV", "BL", "SSS", "AB", "CP"}


def _is_code(s: str) -> bool:
    return (bool(CODE_RE.match(s)) and s not in NOT_CODE
            and any(c.isdigit() for c in s) and any(c.isalpha() for c in s))


def _pure_number(t: str) -> bool:
    return parse_price(t) is not None and "pc" not in t.lower() and "/" not in t


def parse(v: Vendor) -> list[PriceRow]:
    rows: list[PriceRow] = []
    doc = pymupdf.open(v.path)
    for pno in range(len(doc)):
        # regroup raw words per row via the shared bander (single catch-all col
        # discarded — we work off word x-order instead)
        words = sorted(doc[pno].get_text("words"), key=lambda w: (round(w[1]), w[0]))
        # rebuild y-bands of the raw word tuples
        bands, cur, cy = [], [], None
        for w in words:
            if cy is None or abs(w[1] - cy) <= 5:
                cur.append(w); cy = w[1] if cy is None else cy
            else:
                bands.append(cur); cur, cy = [w], w[1]
        if cur:
            bands.append(cur)

        for band in bands:
            band.sort(key=lambda w: w[0])
            code_w = next((w for w in band if _is_code(w[4])), None)
            if not code_w:
                continue
            # numbers to the right of the code, left-to-right
            nums = [w for w in band if w[0] > code_w[2] and _pure_number(w[4])]
            if not nums:
                continue
            mrp = parse_price(nums[-1][4])           # rightmost = MRP
            spu = nums[-2][4] if len(nums) >= 2 else ""
            # item name sits LEFT of the code (x>90 skips the SR-No column);
            # size/finish sit between the code and the first number
            desc_words = [w for w in band
                          if (90 < w[0] < code_w[0]) or (code_w[2] < w[0] < nums[0][0])]
            desc = " ".join(w[4] for w in sorted(desc_words, key=lambda w: w[0])).strip()
            rows.append(PriceRow(
                vendor=v.key, brand=v.brand, item_code=code_w[4], description=desc,
                pack_qty=spu, mrp=mrp, gst_inclusive=v.gst_inclusive,
                price_valid_from=v.valid_from, source_file=v.filename,
                source_page=pno + 1, raw_line=f"{code_w[4]} MRP {mrp} /SPU {spu}",
            ))
    doc.close()
    return rows
