"""Shared coordinate-based extraction for column-shredded / brochure PDFs.

Vendors whose text reading-order doesn't follow visual rows (Hettich, EBCO, …)
are parsed from word (x, y) positions instead: band words into rows by y, then
bucket each word into a named column by its x0.
"""

from __future__ import annotations

Y_TOL = 5


def band_words(words, cols, y_tol: int = Y_TOL):
    """words: PyMuPDF get_text('words') tuples (x0,y0,x1,y1,text,...).
    cols: list of (name, x_lo, x_hi). Returns [(y, {name: [texts]})] top-to-bottom.
    """
    words = sorted(words, key=lambda w: (round(w[1]), w[0]))
    groups, cur, cur_y = [], [], None
    for w in words:
        if cur_y is None or abs(w[1] - cur_y) <= y_tol:
            cur.append(w)
            if cur_y is None:
                cur_y = w[1]
        else:
            groups.append(cur)
            cur, cur_y = [w], w[1]
    if cur:
        groups.append(cur)

    out = []
    for band in groups:
        bucket = {name: [] for name, _, _ in cols}
        for w in sorted(band, key=lambda w: w[0]):
            x0 = w[0]
            for name, lo, hi in cols:
                if lo <= x0 < hi:
                    bucket[name].append(w[4])
                    break
        out.append((min(w[1] for w in band), bucket))
    return out


def joined(bucket: dict, col: str) -> str:
    return " ".join(bucket.get(col, [])).strip()
