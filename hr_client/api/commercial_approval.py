"""Commercial approval engine (spec: "Quotation Approval Matrix & Commercial
Control Rules"). Given a quotation's commercial metrics, determine the highest
approval level required across every dimension (spec §98: highest level wins),
list the triggered exceptions, and flag hard blocks.

Implementation note (owner allows a better impl than the spec sketch): band
dimensions (discount / value / FOC / waivers / price-override) are DATA-DRIVEN
via the `Vera Commercial Approval Rule` master so management can retune them
without code (spec insists thresholds stay configurable). GP and advance are
COMPUTED against each quote's own target/minimum/standard rather than static
bands, because those references vary per quotation. `evaluate()` accepts an
injected `rules` list so the logic is unit-testable without a bench.
"""

from __future__ import annotations

import frappe

# spec §4 — ordered approval levels; index = rank (higher = more authority).
LEVELS = [
    "L0 Sales Executive", "L1 Sales Manager", "L2 Commercial Manager",
    "L3 CFO", "L4 Director", "L5 Managing Director",
]
_RANK = {lvl: i for i, lvl in enumerate(LEVELS)}


def _rank(level: str) -> int:
    return _RANK.get(level, 0)


def role_of(level: str) -> str:
    return level.split(" ", 1)[1] if " " in level else level


# ── default rule set (spec §7/§9/§18/§22/§38/§40) ─────────────────────────────
# (code, dimension, product_category, from, to, level, severity)
_DEFAULT_RULES = [
    # Discount — generic ladder (§7), used when the quote's category is unknown
    ("DISC-GEN-0", "Discount", "", 0, 3, "L0 Sales Executive", "Information"),
    ("DISC-GEN-1", "Discount", "", 3, 5, "L1 Sales Manager", "Approval Required"),
    ("DISC-GEN-2", "Discount", "", 5, 8, "L2 Commercial Manager", "Approval Required"),
    ("DISC-GEN-3", "Discount", "", 8, 10, "L3 CFO", "Approval Required"),
    ("DISC-GEN-4", "Discount", "", 10, 0, "L4 Director", "Approval Required"),
    # Discount — per category (§9)
    ("DISC-HW-0", "Discount", "Hardware", 0, 3, "L0 Sales Executive", "Information"),
    ("DISC-HW-1", "Discount", "Hardware", 3, 6, "L1 Sales Manager", "Approval Required"),
    ("DISC-HW-3", "Discount", "Hardware", 6, 10, "L3 CFO", "Approval Required"),
    ("DISC-HW-4", "Discount", "Hardware", 10, 0, "L4 Director", "Approval Required"),
    ("DISC-APP-0", "Discount", "Appliances", 0, 2, "L0 Sales Executive", "Information"),
    ("DISC-APP-1", "Discount", "Appliances", 2, 5, "L1 Sales Manager", "Approval Required"),
    ("DISC-APP-3", "Discount", "Appliances", 5, 8, "L3 CFO", "Approval Required"),
    ("DISC-APP-4", "Discount", "Appliances", 8, 0, "L4 Director", "Approval Required"),
    ("DISC-MOD-0", "Discount", "Modular", 0, 2, "L0 Sales Executive", "Information"),
    ("DISC-MOD-1", "Discount", "Modular", 2, 5, "L1 Sales Manager", "Approval Required"),
    ("DISC-MOD-3", "Discount", "Modular", 5, 8, "L3 CFO", "Approval Required"),
    ("DISC-MOD-4", "Discount", "Modular", 8, 0, "L4 Director", "Approval Required"),
    ("DISC-STN-0", "Discount", "Stone", 0, 2, "L0 Sales Executive", "Information"),
    ("DISC-STN-1", "Discount", "Stone", 2, 5, "L1 Sales Manager", "Approval Required"),
    ("DISC-STN-3", "Discount", "Stone", 5, 8, "L3 CFO", "Approval Required"),
    ("DISC-STN-4", "Discount", "Stone", 8, 0, "L4 Director", "Approval Required"),
    ("DISC-SRV-1", "Discount", "Services", 0, 3, "L1 Sales Manager", "Approval Required"),
    ("DISC-SRV-3", "Discount", "Services", 3, 5, "L3 CFO", "Approval Required"),
    ("DISC-SRV-4", "Discount", "Services", 5, 0, "L4 Director", "Approval Required"),
    # Quotation value (§22)
    ("VAL-0", "Quotation Value", "", 0, 200000, "L0 Sales Executive", "Information"),
    ("VAL-1", "Quotation Value", "", 200000, 1000000, "L1 Sales Manager", "Approval Required"),
    ("VAL-3a", "Quotation Value", "", 1000000, 2500000, "L3 CFO", "Approval Required"),
    ("VAL-3b", "Quotation Value", "", 2500000, 5000000, "L3 CFO", "Approval Required"),
    ("VAL-4", "Quotation Value", "", 5000000, 0, "L4 Director", "Approval Required"),
    # FOC selling value (§38)
    ("FOC-1", "FOC", "", 0, 5000, "L1 Sales Manager", "Approval Required"),
    ("FOC-3", "FOC", "", 5000, 25000, "L3 CFO", "Approval Required"),
    ("FOC-4", "FOC", "", 25000, 0, "L4 Director", "Approval Required"),
    # Installation waiver (§40)
    ("INSW-1", "Installation Waiver", "", 0, 10000, "L1 Sales Manager", "Approval Required"),
    ("INSW-3", "Installation Waiver", "", 10000, 50000, "L3 CFO", "Approval Required"),
    ("INSW-4", "Installation Waiver", "", 50000, 0, "L4 Director", "Approval Required"),
    # Transport waiver (§41 — mirrors installation)
    ("TRNW-1", "Transport Waiver", "", 0, 10000, "L1 Sales Manager", "Approval Required"),
    ("TRNW-3", "Transport Waiver", "", 10000, 50000, "L3 CFO", "Approval Required"),
    ("TRNW-4", "Transport Waiver", "", 50000, 0, "L4 Director", "Approval Required"),
    # Price override below approved rate (§18)
    ("OVR-0", "Price Override", "", 0, 2, "L0 Sales Executive", "Information"),
    ("OVR-1", "Price Override", "", 2, 5, "L1 Sales Manager", "Approval Required"),
    ("OVR-3", "Price Override", "", 5, 8, "L3 CFO", "Approval Required"),
    ("OVR-4", "Price Override", "", 8, 0, "L4 Director", "Approval Required"),
]


def seed_default_rules() -> dict:
    """Insert the default matrix (idempotent by rule_code). Management edits the
    rows afterwards; re-running never overwrites existing rows."""
    made = 0
    for code, dim, cat, lo, hi, level, sev in _DEFAULT_RULES:
        if frappe.db.exists("Vera Commercial Approval Rule", code):
            continue
        doc = frappe.new_doc("Vera Commercial Approval Rule")
        doc.update({
            "rule_code": code, "rule_name": code.replace("-", " "),
            "dimension": dim, "product_category": cat,
            "from_amount": lo, "to_amount": hi,
            "required_level": level, "severity": sev, "active": 1,
        })
        doc.insert(ignore_permissions=True)
        made += 1
    frappe.db.commit()
    return {"inserted": made, "total_defaults": len(_DEFAULT_RULES)}


# ── evaluation ────────────────────────────────────────────────────────────────
def _band(rules, dimension, amount, category=None):
    cands = [r for r in rules if r["dimension"] == dimension]
    cat = [r for r in cands if (r.get("product_category") or "") == (category or "")]
    pool = cat if cat else [r for r in cands if not (r.get("product_category") or "")]
    for r in sorted(pool, key=lambda x: x.get("from_amount") or 0):
        lo = r.get("from_amount") or 0
        hi = r.get("to_amount") or 0
        hi = hi if hi > 0 else float("inf")
        if lo <= amount < hi:
            return r
    return None


def evaluate(metrics: dict, rules=None) -> dict:
    """metrics keys (all optional, default 0): discount_pct, categories (list),
    value, gp_pct, target_gp, min_gp, advance_pct, standard_advance, min_advance,
    foc, installation_waiver, transport_waiver, price_override_pct, cost, selling.
    Returns {required_level, required_authority, rank, hard_block, exceptions[]}.
    """
    if rules is None:
        rules = _load_rules()
    m = metrics
    exc = []

    def add(dim, detail, level, severity="Approval Required", code=None):
        exc.append({"dimension": dim, "detail": detail, "required_level": level,
                    "severity": severity, "rule_code": code})

    # Discount (only if a discount was given) — worst across the quote's categories
    disc = float(m.get("discount_pct") or 0)
    if disc > 0:
        cats = m.get("categories") or [None]
        for cat in cats:
            r = _band(rules, "Discount", disc, cat)
            if r and _rank(r["required_level"]) > 0:
                add("Discount", f"{disc:.1f}% discount"
                    + (f" ({cat})" if cat else ""), r["required_level"], r["severity"], r["rule_code"])

    # Quotation value
    val = float(m.get("value") or 0)
    r = _band(rules, "Quotation Value", val)
    if r and _rank(r["required_level"]) > 0:
        add("Quotation Value", f"Value ₹{val:,.0f}", r["required_level"], r["severity"], r["rule_code"])

    # Amount-band exceptions that only apply when > 0
    for key, dim, label in [
        ("foc", "FOC", "FOC"), ("installation_waiver", "Installation Waiver", "Installation waiver"),
        ("transport_waiver", "Transport Waiver", "Transport waiver"),
        ("price_override_pct", "Price Override", "Price override"),
    ]:
        amt = float(m.get(key) or 0)
        if amt > 0:
            r = _band(rules, dim, amt)
            if r:
                unit = "%" if key == "price_override_pct" else "₹"
                shown = f"{amt:.1f}%" if unit == "%" else f"₹{amt:,.0f}"
                add(dim, f"{label} {shown}", r["required_level"], r["severity"], r["rule_code"])

    # Gross profit (computed vs this quote's target/minimum) — spec §12/§13/§83
    gp = float(m.get("gp_pct") or 0)
    target = float(m.get("target_gp") or 30)
    minimum = float(m.get("min_gp") or 22)
    cost = float(m.get("cost") or 0)
    selling = float(m.get("selling") or val)
    if gp < 0 or (cost > 0 and selling > 0 and selling < cost):
        add("Gross Profit", f"Negative margin (GP {gp:.1f}%) — below cost",
            "L4 Director", "Hard Block")
    elif gp < minimum - 3:
        add("Gross Profit", f"GP {gp:.1f}% is >3pp below minimum {minimum:.0f}%", "L4 Director")
    elif gp < minimum:
        add("Gross Profit", f"GP {gp:.1f}% below minimum {minimum:.0f}%", "L3 CFO")
    elif gp < target:
        add("Gross Profit", f"GP {gp:.1f}% below target {target:.0f}%", "L1 Sales Manager", "Warning")

    # Advance (computed vs standard/minimum) — spec §26/§27
    if "advance_pct" in m and m.get("advance_pct") is not None:
        adv = float(m.get("advance_pct") or 0)
        std = float(m.get("standard_advance") or 50)
        minadv = float(m.get("min_advance") or 30)
        if adv <= 0:
            add("Advance", "Zero advance requested", "L4 Director")
        elif adv < minadv:
            add("Advance", f"Advance {adv:.0f}% below minimum {minadv:.0f}%", "L3 CFO")
        elif adv < std:
            add("Advance", f"Advance {adv:.0f}% below standard {std:.0f}%", "L1 Sales Manager", "Warning")

    # Aggregate — highest level wins (§98); hard block if any
    if exc:
        top = max(exc, key=lambda e: _rank(e["required_level"]))
        required_level = top["required_level"]
    else:
        required_level = LEVELS[0]
    hard_block = any(e["severity"] == "Hard Block" for e in exc)
    return {
        "required_level": required_level,
        "required_authority": role_of(required_level),
        "rank": _rank(required_level),
        "hard_block": hard_block,
        "exceptions": exc,
    }


def _load_rules():
    return frappe.get_all(
        "Vera Commercial Approval Rule", filters={"active": 1},
        fields=["rule_code", "dimension", "product_category", "from_amount",
                "to_amount", "required_level", "severity"], limit_page_length=0)


def _metrics_from_quotation(doc) -> dict:
    def num(field, default=0.0):
        return float(getattr(doc, field, None) or default)
    value = num("grand_total") or num("net_before_gst") or num("gross_total")
    return {
        "discount_pct": num("discount_percent"),
        "value": value,
        "gp_pct": num("gp_percent"),
        "target_gp": num("target_gp_percent", 30),
        "min_gp": num("min_gp_percent", 22),
        "advance_pct": num("advance_received"),
        "foc": num("foc_value"),
        "installation_waiver": num("installation_waiver"),
        "transport_waiver": num("transport_waiver"),
        "price_override_pct": num("price_override_percent"),
        "cost": num("cost_basis"),
        "selling": value,
    }


@frappe.whitelist()
def evaluate_quotation(quotation: str, write: int = 0) -> dict:
    """Evaluate a Vera Sales Quotation and return the approval decision. With
    write=1, persist required_authority + triggered_rules onto the quotation."""
    doc = frappe.get_doc("Vera Sales Quotation", quotation)
    result = evaluate(_metrics_from_quotation(doc))
    if int(write or 0):
        summary = "; ".join(e["detail"] for e in result["exceptions"]) or "No exceptions"
        doc.db_set("required_authority", result["required_authority"])
        doc.db_set("triggered_rules", summary)
        frappe.db.commit()
    return result
