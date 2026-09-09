"""
Tally-vs-ERP data separation — the single source of truth for record *source*
(Phase 2 spec, Section 2). This is the most important rule in the build: every
record belongs to exactly one class, and that class is permanent.

    Class A — TALLY : mirrored from Tally by the sync service. Read-only in the
                      ERP for every role, including Admin. Corrections are made
                      in Tally and re-synced; the ERP never overwrites Tally.
    Class B — ERP   : created inside the ERP by a user. Editable per the
                      permission matrix; voided (never hard-deleted) with reason.

Design note
-----------
Rather than store a `source` column on every DocType (and risk it drifting from
reality), source is *derived* from the DocType: the set of Tally-mirrored
DocTypes is a closed, enumerable list (below). Everything else is ERP-native by
definition — it was created in the ERP. `classify()` is therefore the one place
that decides a record's class, and the badge / read-only / reporting rules all
read from it.

This module is intentionally additive and side-effect free: it defines no hooks
and touches no schema, so it cannot disturb the live nightly Tally import. The
write-guard here (`assert_writable`) is *opt-in* — endpoints call it — until a
global doc_events guard has been tested against the importer on the server.
"""

import frappe

from hr_client.api.utils import require_login

# ── Source constants ─────────────────────────────────────────────────────────
SOURCE_TALLY = "TALLY"
SOURCE_ERP = "ERP"

# Grey pill for Tally, gold pill for ERP — per spec Section 2.1.
_BADGE = {
    SOURCE_TALLY: {"label": "TALLY", "color": "grey"},
    SOURCE_ERP: {"label": "ERP", "color": "gold"},
}

# ── Class A: Tally-mirrored DocTypes ─────────────────────────────────────────
# Populated only by the Tally sync service (accounts_tally_import /
# tally_import_job / tally_transformer). A record in any of these is, by
# definition, Tally-sourced and read-only in the ERP.
#
# Keyed by DocType *display name* (what frappe.get_doc / doctype filters use).
# NOTE: the manually-entered balance DocTypes (VE Bank/OD/Virtual Account
# Balance) and VE Tally Enrichment are ERP-native — they are typed into the ERP,
# not mirrored — and so are deliberately NOT in this set.
TALLY_DOCTYPES = frozenset({
    # Core Tally mirror
    "VE Tally Ledger",
    "VE Tally Voucher",
    "VE Tally Group",
    "VE Tally Stock Item",
    # Tally-fed accounts dashboard registers
    "VE Sales Register Entry",
    "VE Purchase Register Entry",
    "VE GST Ledger Entry",
    "VE Creditor Ledger",
    "VE Creditor Advance",
    "VE Debtor Ledger",
    "VE Debtor Advance",
    "VE Cash Flow Entry",
    "VE Stock Movement Summary",
    "VE Receipt",
})

# Flag the Tally sync service sets around its own writes so the (future) global
# guard and any opt-in `assert_writable` callers let the importer through while
# still rejecting interactive user writes. The importer should wrap its run in:
#     frappe.flags.in_tally_sync = True
_SYNC_FLAG = "in_tally_sync"


# ── Classification ───────────────────────────────────────────────────────────

def classify(doctype: str) -> str:
    """Return SOURCE_TALLY or SOURCE_ERP for a DocType. Everything not in the
    closed Tally set is ERP-native (it was created inside the ERP)."""
    return SOURCE_TALLY if doctype in TALLY_DOCTYPES else SOURCE_ERP


def is_tally_sourced(doctype: str) -> bool:
    return doctype in TALLY_DOCTYPES


def badge(doctype: str) -> dict:
    """UI badge descriptor for a DocType: {source, label, color}. The frontend
    renders a grey pill for TALLY and a gold pill for ERP on every list/detail."""
    source = classify(doctype)
    b = _BADGE[source]
    return {"source": source, "label": b["label"], "color": b["color"]}


# ── Read-only enforcement (spec §2.2) ────────────────────────────────────────

def assert_writable(doctype: str):
    """Reject a write to a Tally-sourced record unless it is the sync service.

    Call this at the top of any user-facing create/update/delete/void endpoint
    that could target a Tally DocType. Tally records are read-only for every
    role including Admin; corrections are made in Tally and re-synced.
    """
    if is_tally_sourced(doctype) and not frappe.flags.get(_SYNC_FLAG):
        frappe.throw(
            f"{doctype} is mirrored from Tally and is read-only in the ERP. "
            f"Make the correction in Tally, then re-sync.",
            frappe.PermissionError,
        )


def guard_tally_write(doc, method=None):
    """doc_events hook (before_save / on_trash) registered on every Tally
    DocType in hooks.py. Blocks any ORM create/update/delete on a Tally-mirrored
    record unless the Tally sync flag is set. The sync service uses raw SQL for
    the core mirror and sets frappe.flags.in_tally_sync for its ORM writes, so
    legitimate syncs pass; interactive user/desk writes are rejected.
    """
    assert_writable(doc.doctype)


# ── Tri-split subtotals for mixed reports (spec §2.2, rule 3) ────────────────

def subtotals(rows, amount_field="amount", doctype_field="doctype"):
    """Given rows that carry a DocType and an amount, return the three subtotals
    a mixed report must show: Tally-only, ERP-only, and Combined.

    Each row may be a dict or an object exposing `doctype_field` and
    `amount_field`. Rows are also tagged with a resolved `source` so the caller
    can render the mandatory Source column without re-classifying.
    """
    def _get(row, key):
        return row.get(key) if isinstance(row, dict) else getattr(row, key, None)

    tally_total = 0.0
    erp_total = 0.0
    for row in rows:
        dt = _get(row, doctype_field)
        amt = frappe.utils.flt(_get(row, amount_field))
        source = classify(dt) if dt else SOURCE_ERP
        if isinstance(row, dict):
            row["source"] = source
        if source == SOURCE_TALLY:
            tally_total += amt
        else:
            erp_total += amt

    return {
        "tally": tally_total,
        "erp": erp_total,
        "combined": tally_total + erp_total,
    }


# ── Whitelisted endpoint for the frontend ────────────────────────────────────

@frappe.whitelist()
def get_source_map():
    """The full source classification the SPA needs to render badges and hide
    write controls on Tally records. Any logged-in user may read it."""
    require_login()
    return {
        "tally_doctypes": sorted(TALLY_DOCTYPES),
        "badges": {
            SOURCE_TALLY: _BADGE[SOURCE_TALLY],
            SOURCE_ERP: _BADGE[SOURCE_ERP],
        },
        "source_tally": SOURCE_TALLY,
        "source_erp": SOURCE_ERP,
    }
